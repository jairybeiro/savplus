-- Migration: Notification Idempotency and Status Helpers
-- 1. Ensure idempotency (don't duplicate notifications for the same appointment/type)
CREATE UNIQUE INDEX IF NOT EXISTS uq_notification_appointment_type
ON public.notification_queue (appointment_id, type)
WHERE appointment_id IS NOT NULL AND status IN ('pending', 'sent');

-- 2. Index for efficiency on cancellation/lookup
CREATE INDEX IF NOT EXISTS idx_notification_appointment_status
ON public.notification_queue (appointment_id, status);
