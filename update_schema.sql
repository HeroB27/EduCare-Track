-- Update schema to support recent code changes

-- 1. Update clinic_visits table for medical assessment fields
ALTER TABLE public.clinic_visits ADD COLUMN IF NOT EXISTS medical_findings text;
ALTER TABLE public.clinic_visits ADD COLUMN IF NOT EXISTS treatment_given text;
ALTER TABLE public.clinic_visits ADD COLUMN IF NOT EXISTS recommendations text;
ALTER TABLE public.clinic_visits ADD COLUMN IF NOT EXISTS additional_notes text;
ALTER TABLE public.clinic_visits ADD COLUMN IF NOT EXISTS status text; -- For 'in_clinic', 'discharged'

-- 2. Update excuse_letters table for approval workflow
ALTER TABLE public.excuse_letters ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;
ALTER TABLE public.excuse_letters ADD COLUMN IF NOT EXISTS reviewed_by uuid; -- Assuming user IDs are UUIDs
ALTER TABLE public.excuse_letters ADD COLUMN IF NOT EXISTS reviewer_notes text;

-- 3. Update notifications table for deep linking and urgency
-- Note: related_record might already exist as uuid or text. 
-- If it doesn't exist, we add it as text to be flexible, or uuid if strict.
-- Given the code uses UUIDs, uuid is fine, but text avoids type casting issues if mixed.
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS related_record text; 
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS is_urgent boolean DEFAULT false;

-- 4. Update students table if necessary (status tracking)
-- current_status is used in clinic-checkin.js ('in_clinic', 'in_school')
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS current_status text DEFAULT 'in_school';
