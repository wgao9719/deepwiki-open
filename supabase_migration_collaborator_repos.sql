-- Migration to add collaborator repositories support
-- Add new columns to profiles table for collaborator and organization member repositories

ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS github_collaborator_repos jsonb DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS github_collaborator_repos_updated_at timestamp with time zone;

-- Add comment to describe the new columns
COMMENT ON COLUMN public.profiles.github_collaborator_repos IS 'Repositories where user is a collaborator or organization member';
COMMENT ON COLUMN public.profiles.github_collaborator_repos_updated_at IS 'Last time collaborator repositories were updated'; 