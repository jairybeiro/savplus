-- Adicionar campos extras para orientações e observações
ALTER TABLE public.attendances ADD COLUMN IF NOT EXISTS orientacoes_medicas TEXT;
ALTER TABLE public.attendances ADD COLUMN IF NOT EXISTS alergias TEXT;
ALTER TABLE public.prescription_items ADD COLUMN IF NOT EXISTS observacao_enfermagem TEXT;
