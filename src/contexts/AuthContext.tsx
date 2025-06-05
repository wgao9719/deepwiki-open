'use client'

import React, { createContext, useContext, useEffect, useState } from 'react'
import { User, Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

interface AuthContextType {
  user: User | null
  session: Session | null
  loading: boolean
  signInWithGitHub: () => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    // Get initial session
    const getInitialSession = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      setSession(session)
      setUser(session?.user ?? null)  
      setLoading(false)
    }

    getInitialSession()

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log('Auth state changed:', event, session?.user?.email)
        setSession(session)
        setUser(session?.user ?? null)
        setLoading(false)

        if (event === 'SIGNED_IN' && session?.user) {
          // Trigger backend pipeline to fetch & store this user's GitHub repos in the background.
          try {
            const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8001'
            const userId = session.user.id
            const githubUsername = (session.user.user_metadata as any)?.user_name || (session.user.user_metadata as any)?.preferred_username

            if (githubUsername) {
              // Fire-and-forget request – backend decides if it needs to do initial or regular fetch
              fetch(
                `${apiBaseUrl}/api/user/github-repos/update?user_id=${encodeURIComponent(userId)}&github_username=${encodeURIComponent(githubUsername)}`,
                {
                  method: 'POST'
                }
              ).catch(err => {
                console.error('Failed to trigger GitHub repo sync:', err)
              })
            } else {
              console.warn('Could not find githubUsername in user metadata, skipping repo sync trigger')
            }
          } catch (err) {
            console.error('Unexpected error while triggering repo sync:', err)
          }

          // Remove automatic redirect here to avoid disrupting users who are already navigating within the app.
          // The login page already handles redirecting authenticated users away.

        } else if (event === 'SIGNED_OUT') {
          console.log('User signed out, redirecting to login')
          router.push('/login')
        }
      }
    )

    return () => {
      subscription.unsubscribe()
    }
  }, [router])

  const signInWithGitHub = async () => {
    console.log('=== GITHUB SIGNIN DEBUG ===')
    console.log('signInWithGitHub function called')
    console.log('Current window location:', window.location.href)
    console.log('Origin:', window.location.origin)
    
    try {
      console.log('Calling supabase.auth.signInWithOAuth...')
      
      const redirectTo = `${window.location.origin}/`
      console.log('Redirect URL:', redirectTo)
      
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'github',
        options: {
          redirectTo: redirectTo
        }
      })
      
      console.log('OAuth call completed')
      console.log('Data:', data)
      console.log('Error:', error)
      
      if (error) {
        console.error('Error signing in with GitHub:', error)
        throw error
      } else {
        console.log('OAuth redirect should happen now')
        console.log('If you see this message, the redirect failed')
      }
    } catch (err) {
      console.error('Unexpected error in signInWithGitHub:', err)
      throw err
    }
  }

  const signOut = async () => {
    console.log('Signing out...')
    const { error } = await supabase.auth.signOut()
    if (error) {
      console.error('Error signing out:', error)
    } else {
      console.log('Sign out successful')
    }
  }

  const value = {
    user,
    session,
    loading,
    signInWithGitHub,
    signOut
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
} 