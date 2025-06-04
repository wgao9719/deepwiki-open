## 🔐 Add Supabase Authentication with GitHub OAuth

This PR introduces comprehensive authentication functionality to DeepWiki using Supabase and GitHub OAuth.

### Features Added:
- **GitHub OAuth Integration**: Users can now sign in using their GitHub accounts
- **Supabase Authentication**: Full authentication flow with session management
- **Protected Routes**: Components to protect authenticated areas of the application
- **User Profile Management**: Automatic user profile creation and updates
- **Authentication Context**: React context for managing auth state throughout the app
- **User Menu Component**: UI component showing user info and logout functionality

### Files Changed:
- Added authentication callback route: `src/app/auth/callback/route.ts`
- New login page: `src/app/login/page.tsx`
- Authentication context: `src/contexts/AuthContext.tsx`
- Protected route wrapper: `src/components/ProtectedRoute.tsx`
- User menu component: `src/components/UserMenu.tsx`
- App wrapper for auth context: `src/components/AppWrapper.tsx`
- Updated layout with authentication: `src/app/layout.tsx`
- Supabase setup SQL: `supabase_setup.sql`
- Package dependencies updated for Supabase integration

### Setup Required:
- Supabase project configuration
- GitHub OAuth app setup
- Environment variables for API keys
- Database schema setup using provided SQL

This enhancement provides a secure foundation for user authentication and prepares the application for user-specific features and content management.