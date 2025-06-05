-- Add is_admin field to profiles table
-- This migration adds administrator functionality
-- Run this in Supabase SQL Editor

ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS is_admin boolean DEFAULT false;

-- Update RLS policies to allow admins to view all profiles if needed
-- (Optional: uncomment if you want admins to see all profiles)
-- CREATE POLICY "Admins can view all profiles" ON public.profiles
--   FOR SELECT
--   TO authenticated
--   USING (
--     EXISTS (
--       SELECT 1 FROM public.profiles 
--       WHERE id = auth.uid() AND is_admin = true
--     )
--   );

-- Add index for faster admin queries
CREATE INDEX IF NOT EXISTS idx_profiles_is_admin ON public.profiles(is_admin) WHERE is_admin = true;

-- Set specific users as admins (replace with actual user IDs as needed)
-- Example: UPDATE public.profiles SET is_admin = true WHERE email = 'admin@example.com';

COMMENT ON COLUMN public.profiles.is_admin IS 'Administrator flag - grants full access to all repositories and editing permissions'; 