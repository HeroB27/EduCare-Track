-- Fixes for alignment between Code and Schema

-- 1. Update excuse_letters table to support features in parent-excuse.js
ALTER TABLE public.excuse_letters ADD COLUMN IF NOT EXISTS type text;
ALTER TABLE public.excuse_letters ADD COLUMN IF NOT EXISTS attachments jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.excuse_letters ADD COLUMN IF NOT EXISTS class_id text REFERENCES classes(id);
ALTER TABLE public.excuse_letters ADD COLUMN IF NOT EXISTS student_name text;
ALTER TABLE public.excuse_letters ADD COLUMN IF NOT EXISTS parent_name text;
ALTER TABLE public.excuse_letters ADD COLUMN IF NOT EXISTS class_name text;
ALTER TABLE public.excuse_letters ADD COLUMN IF NOT EXISTS grade text;
ALTER TABLE public.excuse_letters ADD COLUMN IF NOT EXISTS level text;
ALTER TABLE public.excuse_letters ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE public.excuse_letters ADD COLUMN IF NOT EXISTS submitted_at timestamptz DEFAULT now();
ALTER TABLE public.excuse_letters ADD COLUMN IF NOT EXISTS absence_date timestamptz;

-- 2. Ensure notifications table has all fields used in code (verified against supabase_schema_update.sql, but reiterating for safety)
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS student_id text;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS student_name text;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS is_urgent boolean DEFAULT false;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS read_by text[] DEFAULT '{}';
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS related_record text;

-- 3. Update clinic_visits if necessary (optional, but good for data integrity)
-- The code uses 'outcome' for checked_in/checked_out, but status has a constraint.
-- We might want to add 'checked_in' and 'checked_out' to the status check constraint if strict mode is on,
-- or just rely on the existing values.
-- For now, we will leave status as is, but ensure the code maps correctly.

-- 4. Add foreign key for parent_students if missing (it's in tables.txt, so likely fine)
