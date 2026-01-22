-- Run this command in your Supabase SQL Editor to add the missing column
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS capabilities JSONB DEFAULT '[]'::jsonb;

-- Optional: If you want to migrate existing assigned_subjects to capabilities (simple migration)
-- This is just an example and might need adjustment based on your data structure
-- UPDATE public.users SET capabilities = jsonb_build_array(jsonb_build_object('subject', unnest(assigned_subjects))) WHERE assigned_subjects IS NOT NULL AND capabilities IS NULL;
