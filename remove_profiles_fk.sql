-- Remove the foreign key constraint linking profiles to auth.users
-- This allows creating dummy profiles without creating corresponding Supabase Auth users
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_id_fkey;

-- Also ensure RLS doesn't block us (redundant if setup_rls.sql was run, but good safety)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to profiles for seeding" ON public.profiles FOR ALL USING (true) WITH CHECK (true);
