-- Corrige a tabela prescription_items adicionando as colunas que podem estar faltando
-- devido ao uso de CREATE TABLE IF NOT EXISTS em migrações anteriores.

ALTER TABLE public.prescription_items 
ADD COLUMN IF NOT EXISTS composicao JSONB;

ALTER TABLE public.prescription_items 
ADD COLUMN IF NOT EXISTS diluicao TEXT;
