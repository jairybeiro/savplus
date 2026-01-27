-- Add clinical columns to attendances for Office version
ALTER TABLE public.attendances ADD COLUMN IF NOT EXISTS sinais_vitais JSONB;
ALTER TABLE public.attendances ADD COLUMN IF NOT EXISTS prescricao JSONB;
ALTER TABLE public.attendances ADD COLUMN IF NOT EXISTS atestado JSONB;
ALTER TABLE public.attendances ADD COLUMN IF NOT EXISTS exames_solicitados JSONB;
ALTER TABLE public.attendances ADD COLUMN IF NOT EXISTS appointment_id UUID REFERENCES public.appointments(id);

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_attendances_appointment_id ON public.attendances(appointment_id);
CREATE INDEX IF NOT EXISTS idx_attendances_patient_id ON public.attendances(patient_id);
