-- Migration: Add blocked_slots table for manual schedule locking
CREATE TABLE IF NOT EXISTS public.blocked_slots (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  doctor_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.blocked_slots ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Allow authenticated to read blocked slots" 
ON public.blocked_slots FOR SELECT 
TO authenticated 
USING (true);

CREATE POLICY "Allow doctors to manage their blocked slots" 
ON public.blocked_slots FOR ALL
TO authenticated 
USING (auth.uid() = doctor_id);

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_blocked_slots_time ON public.blocked_slots(start_time, end_time);
