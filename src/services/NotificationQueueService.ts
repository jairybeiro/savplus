import { supabase } from '@/lib/supabaseClient';
import { addHours, subHours, parseISO, isAfter, format } from 'date-fns';

export class NotificationQueueService {
    /**
     * Enqueues a confirmation message to be sent immediately upon creation.
     */
    static async enqueueConfirmationOnCreate(appointmentId: string) {
        const { data: appointment, error: fetchError } = await supabase
            .from('appointments')
            .select(`
        id, clinic_id, start_time, timezone, reason,
        patient:patients(nome_completo, telefone),
        doctor:profiles(full_name),
        clinic:clinics(name)
      `)
            .eq('id', appointmentId)
            .single();

        if (fetchError || !appointment) {
            console.error('Error fetching appointment for confirmation:', fetchError);
            return;
        }

        const patient = (appointment as any).patient;
        const doctor = (appointment as any).doctor;
        const clinic = (appointment as any).clinic;

        const payload = {
            template: 'confirmation_on_create',
            to: patient?.telefone,
            patient_name: patient?.nome_completo,
            clinic_name: clinic?.name || 'Clínica',
            doctor_name: doctor?.full_name || 'Médico',
            event_title: (appointment as any).reason || 'Consulta',
            start_time: (appointment as any).start_time,
            timezone: (appointment as any).timezone
        };

        await supabase.from('notification_queue').upsert({
            clinic_id: appointment.clinic_id,
            appointment_id: appointment.id,
            type: 'confirmation_on_create',
            status: 'pending',
            scheduled_for: new Date().toISOString(),
            payload
        }, { onConflict: 'appointment_id,type' });
    }

    /**
     * Enqueues a reminder to be sent 24h before the appointment.
     */
    static async enqueueReminder24h(appointmentId: string) {
        const { data: appointment, error: fetchError } = await supabase
            .from('appointments')
            .select('id, clinic_id, start_time, patient:patients(nome_completo)')
            .eq('id', appointmentId)
            .single();

        if (fetchError || !appointment) return;

        const startTime = parseISO(appointment.start_time);
        const scheduledFor = subHours(startTime, 24);

        // Only enqueue if the reminder is in the future
        if (!isAfter(scheduledFor, new Date())) return;

        const payload = {
            template: 'reminder_24h',
            message: `Lembrete: sua consulta está agendada para ${format(startTime, 'dd/MM')} às ${format(startTime, 'HH:mm')}. Para confirmar, responda SIM.`
        };

        await supabase.from('notification_queue').upsert({
            clinic_id: appointment.clinic_id,
            appointment_id: appointment.id,
            type: 'reminder_24h',
            status: 'pending',
            scheduled_for: scheduledFor.toISOString(),
            payload
        }, { onConflict: 'appointment_id,type' });
    }

    /**
     * Cancels all pending notifications for an appointment.
     * Useful when an appointment is cancelled or finished.
     */
    static async cancelPendingNotifications(appointmentId: string) {
        await supabase
            .from('notification_queue')
            .update({ status: 'cancelled', updated_at: new Date().toISOString() })
            .eq('appointment_id', appointmentId)
            .eq('status', 'pending');
    }

    /**
     * Reschedules the 24h reminder. Useful when start_time changes.
     */
    static async rescheduleReminder24h(appointmentId: string) {
        // Simply cancel existing and enqueue new
        await supabase
            .from('notification_queue')
            .update({ status: 'cancelled', updated_at: new Date().toISOString() })
            .eq('appointment_id', appointmentId)
            .eq('type', 'reminder_24h')
            .eq('status', 'pending');

        await this.enqueueReminder24h(appointmentId);
    }
}
