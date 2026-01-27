-- Tabela para Itens de Prescrição Interna (Para a Enfermagem Checar)
CREATE TABLE IF NOT EXISTS public.prescription_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  attendance_id UUID REFERENCES public.attendances(id) ON DELETE CASCADE,
  medicamento TEXT NOT NULL,
  quantidade TEXT,
  posologia TEXT,
  via TEXT, -- Ex: EV, VO, IM
  checked BOOLEAN DEFAULT FALSE, -- O Check da Enfermagem (using 'checked' to match existing code)
  checked_at TIMESTAMPTZ,
  checked_by TEXT,
  diluicao TEXT,
  composicao JSONB, -- Array of additives [{medicamento: string, quantidade: string}]
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabela para Sinais Vitais (Monitoramento na Observação)
CREATE TABLE IF NOT EXISTS public.patient_vitals (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  attendance_id UUID REFERENCES public.attendances(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL, -- Ex: PA, HGT, SpO2
  valor TEXT NOT NULL,
  medido_em TIMESTAMPTZ DEFAULT NOW(),
  medido_por TEXT
);
