-- Tabela para Diário de Enfermagem / Evolução
CREATE TABLE IF NOT EXISTS public.nursing_notes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  attendance_id UUID REFERENCES public.attendances(id) ON DELETE CASCADE,
  note TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by TEXT
);

-- Enable RLS (Assuming it needs public access for now as per other tables, but ideally should be protected)
ALTER TABLE public.nursing_notes ENABLE ROW LEVEL SECURITY;

-- Simple policy to allow all actions for now (match existing behavior in simple dev apps)
CREATE POLICY "Allow all for authenticated users" ON public.nursing_notes
    FOR ALL USING (true) WITH CHECK (true);
