-- Fix for Row-Level Security (RLS) errors in EduCare Track
-- The application uses a custom authentication system (via 'profiles' table) rather than Supabase Auth.
-- Therefore, standard RLS policies checking auth.uid() will fail.
-- These policies allow 'public' (anonymous) access but validate that the 'created_by'/'recorded_by' 
-- field corresponds to a valid user in the 'profiles' table.

-- 1. SCHOOL CALENDAR
ALTER TABLE school_calendar ENABLE ROW LEVEL SECURITY;

-- Allow reading by everyone
DROP POLICY IF EXISTS "Allow public select" ON school_calendar;
CREATE POLICY "Allow public select" ON school_calendar FOR SELECT USING (true);

-- Allow insert/update if the creator exists in profiles
DROP POLICY IF EXISTS "Allow modification for valid profiles" ON school_calendar;
CREATE POLICY "Allow modification for valid profiles" ON school_calendar
FOR ALL -- Covers INSERT, UPDATE, DELETE
TO public
USING (
  created_by IS NOT NULL AND
  EXISTS (SELECT 1 FROM profiles WHERE id = created_by)
)
WITH CHECK (
  created_by IS NOT NULL AND
  EXISTS (SELECT 1 FROM profiles WHERE id = created_by)
);


-- 2. ANNOUNCEMENTS
ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public select" ON announcements;
CREATE POLICY "Allow public select" ON announcements FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow modification for valid profiles" ON announcements;
CREATE POLICY "Allow modification for valid profiles" ON announcements
FOR ALL
TO public
USING (
  created_by IS NOT NULL AND
  EXISTS (SELECT 1 FROM profiles WHERE id = created_by)
)
WITH CHECK (
  created_by IS NOT NULL AND
  EXISTS (SELECT 1 FROM profiles WHERE id = created_by)
);


-- 3. ATTENDANCE
ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public select" ON attendance;
CREATE POLICY "Allow public select" ON attendance FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow modification for valid profiles" ON attendance;
CREATE POLICY "Allow modification for valid profiles" ON attendance
FOR ALL
TO public
USING (
  recorded_by IS NOT NULL AND
  EXISTS (SELECT 1 FROM profiles WHERE id = recorded_by)
)
WITH CHECK (
  recorded_by IS NOT NULL AND
  EXISTS (SELECT 1 FROM profiles WHERE id = recorded_by)
);
