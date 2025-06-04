'use client'

import { useAuth } from '@/contexts/AuthContext'
import { usePathname } from 'next/navigation'
import ProtectedRoute from './ProtectedRoute'

interface AppWrapperProps {
  children: React.ReactNode
}

const publicRoutes = ['/login', '/auth/callback']

export default function AppWrapper({ children }: AppWrapperProps) {
  const { loading } = useAuth()
  const pathname = usePathname()

  // Show loading screen while auth is initializing
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Loading...</p>
        </div>
      </div>
    )
  }

  // Check if current route is public
  const isPublicRoute = publicRoutes.includes(pathname)

  if (isPublicRoute) {
    return <>{children}</>
  }

  return (
    <ProtectedRoute>
      {children}
    </ProtectedRoute>
  )
} 