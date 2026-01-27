-- Migration: Refactor appointments for AI-Ready SaaS (Hardening + API Readiness)
-- 1. Create clinics table (foundation for SaaS multitenancy)
CREATE TABLE IF NOT EXISTS public.clinics (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Create event_types table (Standardized Services)
CREATE TABLE IF NOT EXISTS public.event_types (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  clinic_id UUID REFERENCES public.clinics(id) ON DELETE CASCADE,
  doctor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  slug TEXT NOT NULL,
  duration INTEGER NOT NULL DEFAULT 30, -- Duration in minutes
  price DECIMAL(10,2),
  description TEXT,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (clinic_id, slug)
);

-- Enable RLS for event_types
ALTER TABLE public.event_types ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read for active event types" ON public.event_types;
DROP POLICY IF EXISTS "Allow clinic members to manage event types" ON public.event_types;

CREATE POLICY "Allow public read for active event types" 
ON public.event_types FOR SELECT 
TO authenticated 
USING (active = true);

CREATE POLICY "Allow clinic members to manage event types"
ON public.event_types
FOR ALL
TO authenticated
USING (
  doctor_id = auth.uid()
  OR doctor_id IS NULL
);

-- 3. Update appointments table for Hardening (direct clinic_id)
ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS clinic_id UUID REFERENCES public.clinics(id);
ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS event_type_id UUID REFERENCES public.event_types(id);
ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT 'America/Sao_Paulo';
ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual';
ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;
ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'scheduled';
ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS end_time TIMESTAMPTZ;
ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS external_reference_id TEXT;

-- Add Indexes for performance and uniqueness
CREATE UNIQUE INDEX IF NOT EXISTS idx_appointments_external_ref ON public.appointments(external_reference_id) WHERE external_reference_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_event_types_clinic_id ON public.event_types(clinic_id);
CREATE INDEX IF NOT EXISTS idx_appointments_event_type_id ON public.appointments(event_type_id);
CREATE INDEX IF NOT EXISTS idx_appointments_clinic_id ON public.appointments(clinic_id);
CREATE INDEX IF NOT EXISTS idx_appointments_start_time ON public.appointments(start_time);

-- Enable RLS for appointments (Clinic Isolation)
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow users to see their clinic appointments" ON public.appointments;
CREATE POLICY "Allow users to see their clinic appointments"
ON public.appointments FOR SELECT
TO authenticated
USING (true); -- Simplified for now, in real SaaS we would check clinic_id vs user profile

DROP POLICY IF EXISTS "Allow users to manage their clinic appointments" ON public.appointments;
CREATE POLICY "Allow users to manage their clinic appointments"
ON public.appointments FOR ALL
TO authenticated
USING (true);

-- 4. Seed Initial Data
DO $$
DECLARE
    default_clinic_id UUID;
BEGIN
    -- Ensure a default clinic exists for early stage
    INSERT INTO public.clinics (name, slug) 
    VALUES ('Clínica SavCare', 'clinica-savcare')
    ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
    RETURNING id INTO default_clinic_id;

    -- Update legacy appointments to the default clinic
    UPDATE public.appointments SET clinic_id = default_clinic_id WHERE clinic_id IS NULL;

    -- Standard Event Types
    INSERT INTO public.event_types (clinic_id, title, slug, duration, description)
    VALUES 
    (default_clinic_id, 'Consulta Inicial', 'consulta-inicial', 60, 'Atendimento completo para novos pacientes.'),
    (default_clinic_id, 'Retorno', 'retorno', 30, 'Consulta de acompanhamento e revisão de exames.'),
    (default_clinic_id, 'Exame Rápido', 'exame-rapido', 15, 'Procedimentos de triagem ou exames simplificados.')
    ON CONFLICT (clinic_id, slug) DO NOTHING;
END $$;
