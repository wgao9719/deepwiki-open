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
          console.log('User signed in, redirecting to home')
          router.push('/')
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