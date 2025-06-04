import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

const SERVER_BASE_URL = process.env.NEXT_PUBLIC_SERVER_BASE_URL || 'http://localhost:8001';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const error = searchParams.get('error')
  const error_description = searchParams.get('error_description')
  const state = searchParams.get('state')
  
  // Enhanced debugging
  console.log('=== AUTH CALLBACK DEBUG ===')
  console.log('Full URL:', request.url)
  console.log('Origin:', origin)
  console.log('Code:', code ? 'PRESENT' : 'MISSING')
  console.log('Error:', error)
  console.log('Error Description:', error_description)
  console.log('State:', state)
  console.log('All search params:', Object.fromEntries(searchParams.entries()))
  console.log('Request headers:', Object.fromEntries(request.headers.entries()))
  
  // if "next" is in param, use it as the redirect URL
  let next = searchParams.get('next') ?? '/'
  
  if (!next.startsWith('/')) {
    // if "next" is not a relative URL, use the default
    next = '/'
  }

  // Check for OAuth errors first
  if (error) {
    console.error('OAuth error received:', error, error_description)
    return NextResponse.redirect(`${origin}/login?error=oauth_error&message=${encodeURIComponent(error_description || error)}`)
  }

  if (code) {
    try {
      console.log('Attempting to exchange code for session...')
      const supabase = await createServerSupabaseClient()
      
      const { data, error } = await supabase.auth.exchangeCodeForSession(code)
      
      console.log('Exchange result - Error:', error)
      console.log('Exchange result - User:', data?.user?.email || 'No user')
      console.log('Exchange result - Session:', data?.session ? 'PRESENT' : 'MISSING')
      
      if (!error && data.user) {
        console.log('User authenticated successfully:', data.user.email)
        
        // Check if this is a new user by looking for existing profile
        const { data: existingProfile } = await supabase
          .from('profiles')
          .select('id, github_repos_updated_at')
          .eq('id', data.user.id)
          .single()
        
        const isNewUser = !existingProfile;
        
        // Create or update user profile
        const { error: profileError } = await supabase
          .from('profiles')
          .upsert({
            id: data.user.id,
            email: data.user.email || '',
            full_name: data.user.user_metadata?.full_name || data.user.user_metadata?.name || null,
            avatar_url: data.user.user_metadata?.avatar_url || null,
            username: data.user.user_metadata?.user_name || data.user.user_metadata?.preferred_username || null,
            github_username: data.user.user_metadata?.user_name || null,
            updated_at: new Date().toISOString()
          }, {
            onConflict: 'id'
          })

        if (profileError) {
          console.error('Error creating/updating user profile:', profileError)
        } else {
          console.log('User profile created/updated successfully')
        }

        // For new users or users without GitHub repos, trigger background repository fetching
        const shouldFetchRepos = isNewUser || !existingProfile?.github_repos_updated_at;
        
        let githubUsernameForFetch: string | null = null;
        if (data.user?.user_metadata && typeof data.user.user_metadata.user_name === 'string' && data.user.user_metadata.user_name.length > 0) {
            githubUsernameForFetch = data.user.user_metadata.user_name;
        } else {
            console.warn(`GitHub username not found or invalid in user_metadata for user ${data.user?.id}. Repositories will not be fetched automatically on signup/login.`);
            if (data.user?.user_metadata) {
                console.log('User metadata user_name:', data.user.user_metadata.user_name);
            } else {
                console.log('User metadata was not available.');
            }
        }
        
        if (shouldFetchRepos && githubUsernameForFetch) {
          console.log(`Triggering background GitHub repository fetch for ${githubUsernameForFetch} (user ID: ${data.user.id})`);
          
          const queryParams = new URLSearchParams({
            user_id: data.user.id,
            github_username: githubUsernameForFetch
          });

          // Trigger repository fetch in background (don't wait for it)
          fetch(`${SERVER_BASE_URL}/api/user/github-repos/update?${queryParams.toString()}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
          }).catch(err => {
            console.error(`Background GitHub repos fetch trigger failed for user ${data.user.id}, username ${githubUsernameForFetch}:`, err);
          });
        } else if (shouldFetchRepos && !githubUsernameForFetch) {
            console.log(`Skipping GitHub repository fetch for user ${data.user.id}: githubUsernameForFetch is missing or invalid.`);
        }
        
        const forwardedHost = request.headers.get('x-forwarded-host') // original origin before load balancer
        const isLocalEnv = process.env.NODE_ENV === 'development'
        
        console.log('Redirecting to:', isLocalEnv ? `${origin}${next}` : forwardedHost ? `https://${forwardedHost}${next}` : `${origin}${next}`)
        return NextResponse.redirect(isLocalEnv ? `${origin}${next}` : forwardedHost ? `https://${forwardedHost}${next}` : `${origin}${next}`)
      } else {
        console.error('Error exchanging code for session:', error)
        return NextResponse.redirect(`${origin}/login?error=auth_error&message=${encodeURIComponent(error?.message || 'Authentication failed')}`)
      }
    } catch (err) {
      console.error('Unexpected error in auth callback:', err)
      return NextResponse.redirect(`${origin}/login?error=auth_error&message=${encodeURIComponent('Unexpected authentication error')}`)
    }
  }

  // return the user to an error page with instructions
  console.log('No authorization code received - this is the main issue!')
  return NextResponse.redirect(`${origin}/login?error=auth_error&message=${encodeURIComponent('No authorization code received')}`)
} 