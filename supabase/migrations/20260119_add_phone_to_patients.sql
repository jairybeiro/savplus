-- Adicionar o campo telefone na tabela de pacientes
-- Essencial para confirmação via WhatsApp em flows de consultório
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS telefone TEXT;

-- Comentário para documentação do banco
COMMENT ON COLUMN public.patients.telefone IS 'Número de telefone/WhatsApp do paciente para contato e confirmações.';
