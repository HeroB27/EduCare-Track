-- Run this command in your Supabase SQL Editor to add the missing column
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS capabilities JSONB DEFAULT '[]'::jsonb;

-- Optional: If you want to migrate existing assigned_subjects to capabilities (simple migration)
-- This is just an example and might need adjustment based on your data structure
-- UPDATE public.users SET capabilities = jsonb_build_array(jsonb_build_object('subject', unnest(assigned_subjects))) WHERE assigned_subjects IS NOT NULL AND capabilities IS NULL;

CREATE TABLE IF NOT EXISTS public.announcements (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  title text,
  message text,
  audience text,
  priority text,
  class_id text,
  class_name text,
  created_by text,
  created_by_name text,
  created_at timestamp with time zone DEFAULT now(),
  is_active boolean DEFAULT true,
  is_urgent boolean DEFAULT false,
  expiry_date date,
  CONSTRAINT announcements_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  target_users text[],
  title text,
  message text,
  type text,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  read_by text[],
  student_id text,
  student_name text,
  related_record uuid,
  is_urgent boolean DEFAULT false,
  CONSTRAINT notifications_pkey PRIMARY KEY (id)
);

ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS target_users text[];
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now();
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS read_by text[];
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS student_id text;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS student_name text;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS related_record uuid;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS is_urgent boolean DEFAULT false;
