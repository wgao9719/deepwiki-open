# Debug GitHub OAuth Issues

## Step-by-Step Debugging

### 1. Check Your Setup

**Environment Variables** (verify these in your `.env`):
- `NEXT_PUBLIC_SUPABASE_URL=https://lndncrtuhnompakcajsc.supabase.co`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`
- `GITHUB_CLIENT_ID=Iv23liCugXGpA26xv7BD`
- `GITHUB_CLIENT_SECRET=71f5587f1c3a35d511d2b09bfe7fc33ad4f7046d`

### 2. Supabase Dashboard Configuration

1. Go to: https://supabase.com/dashboard/project/lndncrtuhnompakcajsc
2. Navigate to: **Authentication** > **Providers**
3. Click on **GitHub** and verify:
   - ✅ **Enabled** is turned ON
   - ✅ **Client ID**: `Iv23liCugXGpA26xv7BD`
   - ✅ **Client Secret**: `71f5587f1c3a35d511d2b09bfe7fc33ad4f7046d`
   - ✅ **Redirect URL** should be: `https://lndncrtuhnompakcajsc.supabase.co/auth/v1/callback`

4. Navigate to: **Authentication** > **URL Configuration**
   - ✅ **Site URL**: `http://localhost:3000` (for development)
   - ✅ **Redirect URLs**: Add `http://localhost:3000/**`

### 3. GitHub OAuth App Configuration

1. Go to: https://github.com/settings/developers
2. Click on your OAuth app or create a new one
3. Verify these settings:
   - ✅ **Application name**: (your choice)
   - ✅ **Homepage URL**: `http://localhost:3000`
   - ✅ **Authorization callback URL**: `https://lndncrtuhnompakcajsc.supabase.co/auth/v1/callback`
   - ✅ **Client ID matches**: `Iv23liCugXGpA26xv7BD`

### 4. Test the Flow

1. Start your dev server: `npm run dev`
2. Open browser console (F12)
3. Go to: http://localhost:3000/login
4. Click "Continue with GitHub"
5. Check console logs for:
   - "signInWithGitHub function called"
   - "Current origin: http://localhost:3000"
   - "Redirect URL will be: http://localhost:3000/auth/callback"
   - "OAuth redirect should happen now"

### 5. What Should Happen

1. Clicking GitHub button should redirect to GitHub OAuth page
2. After GitHub authorization, you should be redirected to: `https://lndncrtuhnompakcajsc.supabase.co/auth/v1/callback?code=...`
3. Supabase should process the code and redirect to: `http://localhost:3000/auth/callback?code=...`
4. Your callback handler should process and redirect to: `http://localhost:3000/`

### 6. Common Issues

**Issue**: "No authorization code received"
**Possible Causes**:
- GitHub OAuth app callback URL is wrong
- Supabase GitHub provider not enabled
- Client ID/Secret mismatch
- Redirect URLs not configured in Supabase

**Issue**: OAuth redirect doesn't happen
**Possible Causes**:
- Supabase client configuration wrong
- Environment variables not loaded
- CORS issues

### 7. Manual Test

Try this direct URL to test GitHub OAuth:
```
https://lndncrtuhnompakcajsc.supabase.co/auth/v1/authorize?provider=github&redirect_to=http://localhost:3000/auth/callback
```

If this works, the issue is in your client-side code.
If this doesn't work, the issue is in your Supabase/GitHub configuration. 