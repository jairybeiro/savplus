-- Migration: WhatsApp Connections for Evolution API Integration
-- 1. Create whatsapp_connections table
CREATE TABLE IF NOT EXISTS public.whatsapp_connections (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  clinic_id UUID REFERENCES public.clinics(id) ON DELETE CASCADE NOT NULL,
  doctor_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  provider TEXT NOT NULL DEFAULT 'evolution',
  instance_name TEXT NOT NULL,
  instance_id TEXT, -- ID returned by Evolution API
  status TEXT NOT NULL DEFAULT 'disconnected', -- disconnected, connecting, connected, error
  qr_code TEXT, -- base64 or text from Evolution
  phone TEXT, -- paired phone number
  ai_enabled BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (clinic_id, doctor_id)
);

-- Enable RLS
ALTER TABLE public.whatsapp_connections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow clinic members to manage their whatsapp connections" ON public.whatsapp_connections;
CREATE POLICY "Allow clinic members to manage their whatsapp connections"
ON public.whatsapp_connections
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.clinics WHERE id = whatsapp_connections.clinic_id
  )
);

-- Indices for performance
CREATE INDEX IF NOT EXISTS idx_whatsapp_conn_clinic_id ON public.whatsapp_connections(clinic_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_conn_doctor_id ON public.whatsapp_connections(doctor_id);
