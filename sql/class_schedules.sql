-- Create table for class schedules
CREATE TABLE public.class_schedules (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  class_id text REFERENCES classes(id) ON DELETE CASCADE,
  subject text NOT NULL,
  teacher_id uuid REFERENCES teachers(id),
  schedule_text text, -- Flexible text for "Mon 9-10am" etc.
  day_of_week text, 
  start_time time,
  end_time time,
  created_at timestamptz DEFAULT now()
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.class_schedules ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Allow read access to authenticated users" ON public.class_schedules
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow write access to admins" ON public.class_schedules
  FOR ALL TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );
