import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

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
        
        // Create or update user profile
        const { error: profileError } = await supabase
          .from('profiles')
          .upsert({
            id: data.user.id,
            email: data.user.email || '',
            full_name: data.user.user_metadata?.full_name || data.user.user_metadata?.name || null,
            avatar_url: data.user.user_metadata?.avatar_url || null,
            username: data.user.user_metadata?.user_name || data.user.user_metadata?.preferred_username || null,
            updated_at: new Date().toISOString()
          }, {
            onConflict: 'id'
          })

        if (profileError) {
          console.error('Error creating/updating user profile:', profileError)
        } else {
          console.log('User profile created/updated successfully')
        }
        
        const forwardedHost = request.headers.get('x-forwarded-host') // original origin before load balancer
        const isLocalEnv = process.env.NODE_ENV === 'development'
        
        console.log('Redirecting to:', isLocalEnv ? `${origin}${next}` : forwardedHost ? `https://${forwardedHost}${next}` : `${origin}${next}`)
        
        if (isLocalEnv) {
          // we can be sure that there is no load balancer in between, so no need to watch for X-Forwarded-Host
          return NextResponse.redirect(`${origin}${next}`)
        } else if (forwardedHost) {
          return NextResponse.redirect(`https://${forwardedHost}${next}`)
        } else {
          return NextResponse.redirect(`${origin}${next}`)
        }
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