-- Migration: Add validation_token and exames_solicitados fields to attendances table
-- This token is used for public document validation via QR code

-- Add the validation_token column
ALTER TABLE attendances 
ADD COLUMN IF NOT EXISTS validation_token VARCHAR(12) UNIQUE;

-- Add the exames_solicitados column for structured exam requests
ALTER TABLE attendances 
ADD COLUMN IF NOT EXISTS exames_solicitados TEXT;

-- Create an index for fast lookups
CREATE INDEX IF NOT EXISTS idx_attendances_validation_token 
ON attendances(validation_token) 
WHERE validation_token IS NOT NULL;

-- Comments for documentation
COMMENT ON COLUMN attendances.validation_token IS 'Short alphanumeric token (10 chars) for public document validation. Generated when printing prescriptions.';
COMMENT ON COLUMN attendances.exames_solicitados IS 'JSON string containing exam request data: {exames: string[], justificativa: string}';
