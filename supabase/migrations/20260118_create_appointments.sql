-- 0. Tabela de Perfis (Caso não exista)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID REFERENCES auth.users(id) PRIMARY KEY,
  full_name TEXT,
  email TEXT,
  role TEXT DEFAULT 'doctor',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 1. Tabela de Agendamentos (O Coração do Consultório)
CREATE TABLE IF NOT EXISTS public.appointments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID, -- Para separar tenants nel futuro (RLS)
  patient_id UUID REFERENCES public.patients(id) ON DELETE CASCADE,
  doctor_id UUID REFERENCES public.profiles(id), -- O Médico dono da agenda
  
  start_time TIMESTAMPTZ NOT NULL, -- Data e Hora do agendamento
  end_time TIMESTAMPTZ NOT NULL,   -- Previsão de término
  
  status TEXT DEFAULT 'scheduled', 
  -- Values: 'scheduled' (Agendado), 'confirmed' (Confirmado), 
  -- 'waiting' (Na Recepção), 'in_progress' (Em Atendimento), 
  -- 'finished' (Finalizado), 'canceled' (Cancelado), 'no_show' (Faltou).
  
  reason TEXT, -- Motivo (Ex: "Retorno", "Primeira Consulta")
  notes TEXT,  -- Obs da secretária
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Vincular o Agendamento ao Prontuário Clínico (Histórico)
ALTER TABLE public.attendances ADD COLUMN IF NOT EXISTS appointment_id UUID REFERENCES public.appointments(id);

-- 3. Atualizar Status para suportar Consultório
ALTER TABLE public.attendances DROP CONSTRAINT IF EXISTS attendances_status_check;
