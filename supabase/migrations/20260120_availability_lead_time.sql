-- Migration: Add availability settings and enforce lead time
CREATE TABLE IF NOT EXISTS public.doctor_availability_settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  doctor_id UUID REFERENCES public.profiles(id) UNIQUE,
  slot_duration_minutes INTEGER DEFAULT 30,
  min_scheduling_notice_hours INTEGER DEFAULT 2,
  working_days JSONB DEFAULT '["mon", "tue", "wed", "thu", "fri"]'::jsonb,
  start_hour TEXT DEFAULT '08:00',
  end_hour TEXT DEFAULT '18:00',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Habilitar RLS
ALTER TABLE public.doctor_availability_settings ENABLE ROW LEVEL SECURITY;

-- Políticas básicas (Select para todos autenticados, Insert/Update apenas o dono)
CREATE POLICY "Allow authenticated to read settings" 
ON public.doctor_availability_settings FOR SELECT 
TO authenticated 
USING (true);

CREATE POLICY "Allow doctors to manage their own settings" 
ON public.doctor_availability_settings FOR ALL
TO authenticated 
USING (auth.uid() = doctor_id);

-- Function to validate appointment lead time
CREATE OR REPLACE FUNCTION public.check_appointment_lead_time()
RETURNS TRIGGER AS $$
DECLARE
    min_notice INTEGER;
BEGIN
    -- Get notice hours for the doctor (default 2 if not set)
    SELECT min_scheduling_notice_hours INTO min_notice
    FROM public.doctor_availability_settings
    WHERE doctor_id = NEW.doctor_id;
    
    IF min_notice IS NULL THEN min_notice := 2; END IF;

    -- Check if start_time is at least min_notice hours from NOW()
    -- Only for new appointments or when start_time changes
    IF (TG_OP = 'INSERT') OR (NEW.start_time <> OLD.start_time) THEN
        IF NEW.start_time < (NOW() + (min_notice || ' hours')::interval) THEN
            RAISE EXCEPTION 'Agendamento deve ser feito com no mínimo %h de antecedência.', min_notice;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to enforce the rule
DROP TRIGGER IF EXISTS validate_appointment_lead_time_trigger ON public.appointments;
CREATE TRIGGER validate_appointment_lead_time_trigger
BEFORE INSERT OR UPDATE ON public.appointments
FOR EACH ROW
EXECUTE FUNCTION public.check_appointment_lead_time();
