-- Migration: CRM Minimalist + Notification Queue + Ads Tracking Base
-- 1. Create leads table for interested prospects (CRM)
CREATE TABLE IF NOT EXISTS public.leads (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  clinic_id UUID REFERENCES public.clinics(id) ON DELETE CASCADE NOT NULL,
  name TEXT,
  phone TEXT NOT NULL, -- Key for WhatsApp/Communication
  status TEXT NOT NULL DEFAULT 'new', -- new, engaged, qualified, scheduled, won, lost, recall
  source TEXT, -- meta_ads, google_ads, indication, organic
  last_message_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS for leads
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow clinic members to manage leads" ON public.leads;
CREATE POLICY "Allow clinic members to manage leads"
ON public.leads
FOR ALL
TO authenticated
USING (
  EXISTS (
    -- Simple check for now, assuming authenticated users have access to their clinic's data
    -- In a full multi-tenant setup, we'd join with a user_clinics table or similar
    SELECT 1 FROM public.clinics WHERE id = leads.clinic_id
  )
);

-- Indices for CRM performance
CREATE INDEX IF NOT EXISTS idx_leads_clinic_id ON public.leads(clinic_id);
CREATE INDEX IF NOT EXISTS idx_leads_phone ON public.leads(phone);
CREATE INDEX IF NOT EXISTS idx_leads_status_message ON public.leads(status, last_message_at);

-- 2. Create Notification Queue for Auditable Communications
CREATE TABLE IF NOT EXISTS public.notification_queue (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  clinic_id UUID REFERENCES public.clinics(id) ON DELETE CASCADE NOT NULL,
  appointment_id UUID REFERENCES public.appointments(id) ON DELETE SET NULL,
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  channel TEXT NOT NULL DEFAULT 'whatsapp', -- whatsapp, sms, email
  type TEXT NOT NULL, -- confirmation_on_create, reminder_24h, confirmation_request, recall_6m, birthday
  status TEXT NOT NULL DEFAULT 'pending', -- pending, sent, failed, replied, cancelled
  scheduled_for TIMESTAMPTZ NOT NULL,
  sent_at TIMESTAMPTZ,
  provider_message_id TEXT,
  payload JSONB DEFAULT '{}'::jsonb,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS for notifications
ALTER TABLE public.notification_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow clinic members to view notifications" ON public.notification_queue;
CREATE POLICY "Allow clinic members to view notifications"
ON public.notification_queue
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.clinics WHERE id = notification_queue.clinic_id
  )
);

-- Indices for Queue performance
CREATE INDEX IF NOT EXISTS idx_notif_clinic_id ON public.notification_queue(clinic_id);
CREATE INDEX IF NOT EXISTS idx_notif_status_sched ON public.notification_queue(status, scheduled_for);
CREATE INDEX IF NOT EXISTS idx_notif_appointment_id ON public.notification_queue(appointment_id);
CREATE INDEX IF NOT EXISTS idx_notif_lead_id ON public.notification_queue(lead_id);

-- 3. Utility Function to update Lead Status
CREATE OR REPLACE FUNCTION public.handle_appointment_lead_promotion()
RETURNS TRIGGER AS $$
DECLARE
    associated_phone TEXT;
BEGIN
    -- Try to find a lead based on patient's phone if lead_id isn't in metadata
    -- Note: This is an optional enhancement via trigger V1
    -- We'll primarily handle this in the API for better control, 
    -- but having a trigger safeguards data integrity.
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
