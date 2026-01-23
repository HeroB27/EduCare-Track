-- ==============================================================================
-- RUN THIS SCRIPT IN YOUR SUPABASE SQL EDITOR TO FIX PERMISSION ERRORS (401/42501)
-- ==============================================================================

-- 1. Enable Row Level Security (RLS) on all tables to be safe
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teachers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.parents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.parent_students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.excuse_letters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clinic_visits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clinic_staff ENABLE ROW LEVEL SECURITY;

-- 2. Create "Allow All" policies for the data initialization phase
-- WARNING: These policies allow anyone with your Anon Key to read/write these tables.
-- After you finish development/initialization, you should replace these with stricter policies.

-- Helper function to drop policies if they exist (to avoid errors on re-run)
DO $$
BEGIN
    -- Profiles
    DROP POLICY IF EXISTS "Allow public access to profiles" ON public.profiles;
    -- Classes
    DROP POLICY IF EXISTS "Allow public access to classes" ON public.classes;
    -- Teachers
    DROP POLICY IF EXISTS "Allow public access to teachers" ON public.teachers;
    -- Parents
    DROP POLICY IF EXISTS "Allow public access to parents" ON public.parents;
    -- Students
    DROP POLICY IF EXISTS "Allow public access to students" ON public.students;
    -- Parent_Students
    DROP POLICY IF EXISTS "Allow public access to parent_students" ON public.parent_students;
    -- Announcements
    DROP POLICY IF EXISTS "Allow public access to announcements" ON public.announcements;
    -- Attendance
    DROP POLICY IF EXISTS "Allow public access to attendance" ON public.attendance;
    -- Excuse Letters
    DROP POLICY IF EXISTS "Allow public access to excuse_letters" ON public.excuse_letters;
    -- Notifications
    DROP POLICY IF EXISTS "Allow public access to notifications" ON public.notifications;
    -- Clinic Visits
    DROP POLICY IF EXISTS "Allow public access to clinic_visits" ON public.clinic_visits;
    -- System Settings
    DROP POLICY IF EXISTS "Allow public access to system_settings" ON public.system_settings;
    -- Admin Staff
    DROP POLICY IF EXISTS "Allow public access to admin_staff" ON public.admin_staff;
    -- Guards
    DROP POLICY IF EXISTS "Allow public access to guards" ON public.guards;
    -- Clinic Staff
    DROP POLICY IF EXISTS "Allow public access to clinic_staff" ON public.clinic_staff;
END $$;

-- Create the policies
CREATE POLICY "Allow public access to profiles" ON public.profiles FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public access to classes" ON public.classes FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public access to teachers" ON public.teachers FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public access to parents" ON public.parents FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public access to students" ON public.students FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public access to parent_students" ON public.parent_students FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public access to announcements" ON public.announcements FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public access to attendance" ON public.attendance FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public access to excuse_letters" ON public.excuse_letters FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public access to notifications" ON public.notifications FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public access to clinic_visits" ON public.clinic_visits FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public access to system_settings" ON public.system_settings FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public access to admin_staff" ON public.admin_staff FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public access to guards" ON public.guards FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public access to clinic_staff" ON public.clinic_staff FOR ALL USING (true) WITH CHECK (true);

