'use client'

import { useAuth } from '@/contexts/AuthContext'
import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { FaGithub } from 'react-icons/fa'

export default function LoginPage() {
  const { signInWithGitHub, loading, user } = useAuth()
  const [isSigningIn, setIsSigningIn] = useState(false)
  const router = useRouter()
  const searchParams = useSearchParams()
  const error = searchParams.get('error')
  const message = searchParams.get('message')

  useEffect(() => {
    if (user && !loading) {
      router.push('/')
    }
  }, [user, loading, router])

  const handleGitHubSignIn = async () => {
    console.log('GitHub sign-in button clicked')
    setIsSigningIn(true)
    try {
      console.log('Calling signInWithGitHub...')
      await signInWithGitHub()
      console.log('signInWithGitHub completed')
    } catch (error) {
      console.error('Error signing in:', error)
      setIsSigningIn(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  if (user) {
    return null // Will redirect via useEffect
  }

  const getErrorMessage = () => {
    if (message) {
      return decodeURIComponent(message)
    }
    if (error === 'auth_error') {
      return 'Authentication failed. Please try again.'
    }
    return 'An error occurred during sign in.'
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
      <div className="max-w-md w-full space-y-8 p-8">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8 border border-gray-200 dark:border-gray-700">
          <div className="text-center">
            <div className="mx-auto h-12 w-12 bg-blue-600 rounded-xl flex items-center justify-center mb-6">
              <svg
                className="h-8 w-8 text-white"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.746 0 3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
                />
              </svg>
            </div>
            <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
              Welcome to DeepWiki
            </h2>
            <p className="text-gray-600 dark:text-gray-400 mb-8">
              Sign in with your GitHub account to continue
            </p>
          </div>

          {error && (
            <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <p className="text-red-700 dark:text-red-400 text-sm">
                {getErrorMessage()}
              </p>
            </div>
          )}

          <button
            onClick={handleGitHubSignIn}
            disabled={isSigningIn}
            className="w-full flex items-center justify-center px-4 py-3 border border-transparent text-base font-medium rounded-lg text-white bg-gray-900 hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200 dark:bg-gray-700 dark:hover:bg-gray-600"
          >
            {isSigningIn ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-3"></div>
                Signing in...
              </>
            ) : (
              <>
                <FaGithub className="h-5 w-5 mr-3" />
                Continue with GitHub
              </>
            )}
          </button>

          <div className="mt-6 text-center">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              By signing in, you agree to our Terms of Service and Privacy Policy
            </p>
          </div>
        </div>

        <div className="text-center">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Need help? Check our{' '}
            <a href="#" className="text-blue-600 hover:text-blue-500 dark:text-blue-400">
              documentation
            </a>
          </p>
        </div>
      </div>
    </div>
  )
} 