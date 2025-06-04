-- Create profiles table
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  email text,
  full_name text,
  avatar_url text,
  username text,
  github_username text,
  github_repos jsonb DEFAULT '[]'::jsonb,
  github_repos_updated_at timestamp with time zone,
  UNIQUE(email),
  UNIQUE(username)
);

-- Enable RLS for profiles table
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Create policy to allow users to see their own profile
CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT
  USING (auth.uid() = id);

-- Create policy to allow users to update their own profile
CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE
  USING (auth.uid() = id);

-- Create policy to allow users to insert their own profile
CREATE POLICY "Users can insert own profile" ON public.profiles
  FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Create function to handle updated_at timestamp
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for updated_at
CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- Create function to automatically create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, avatar_url, username, github_username)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'avatar_url',
    COALESCE(NEW.raw_user_meta_data->>'user_name', NEW.raw_user_meta_data->>'preferred_username'),
    NEW.raw_user_meta_data->>'user_name'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for new user
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Drop the old Users table if it exists (optional - be careful!)
-- DROP TABLE IF EXISTS public.Users;

-- ==============================
-- STORAGE CONFIGURATION
-- ==============================

-- Create wiki-cache storage bucket (run this in Supabase dashboard SQL editor)
INSERT INTO storage.buckets (id, name, public)
VALUES ('wiki-cache', 'wiki-cache', true)
ON CONFLICT (id) DO NOTHING;

-- Create storage policy to allow public read access to wiki cache files
CREATE POLICY "Public read access for wiki cache" ON storage.objects
  FOR SELECT
  USING (bucket_id = 'wiki-cache');

-- Create storage policy to allow authenticated users to upload wiki cache files
CREATE POLICY "Authenticated upload for wiki cache" ON storage.objects
  FOR INSERT
  WITH CHECK (bucket_id = 'wiki-cache');

-- Create storage policy to allow authenticated users to update wiki cache files
CREATE POLICY "Authenticated update for wiki cache" ON storage.objects
  FOR UPDATE
  USING (bucket_id = 'wiki-cache');

-- Create storage policy to allow authenticated users to delete wiki cache files
CREATE POLICY "Authenticated delete for wiki cache" ON storage.objects
  FOR DELETE
  USING (bucket_id = 'wiki-cache'); 