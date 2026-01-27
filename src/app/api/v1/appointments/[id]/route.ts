import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';
import { parseISO, addMinutes, areIntervalsOverlapping } from 'date-fns';
import { NotificationQueueService } from '@/services/NotificationQueueService';

export async function PATCH(
    request: Request,
    { params }: { params: { id: string } }
) {
    try {
        const id = params.id;
        const body = await request.json();
        const { status, start_time, event_type_id, timezone, metadata: newMetadata } = body;

        // 1. Fetch current appointment state
        const { data: current, error: fetchError } = await supabase
            .from('appointments')
            .select('*')
            .eq('id', id)
            .single();

        if (fetchError || !current) {
            return NextResponse.json({ error: 'Appointment not found' }, { status: 404 });
        }

        const updates: any = {};
        let shouldRescheduleNotifs = false;

        // 2. Handle Status Changes
        if (status) {
            updates.status = status;
            if (status === 'cancelled' || status === 'canceled') {
                await NotificationQueueService.cancelPendingNotifications(id);
            }
        }

        // 3. Handle Time or Type Changes (Rescheduling)
        if (start_time || event_type_id) {
            const finalStartTime = start_time || current.start_time;
            const finalEventTypeId = event_type_id || current.event_type_id;

            let duration = 30;
            let reason = current.reason;

            if (finalEventTypeId) {
                const { data: eventType } = await supabase
                    .from('event_types')
                    .select('duration, title')
                    .eq('id', finalEventTypeId)
                    .single();
                if (eventType) {
                    duration = eventType.duration;
                    reason = eventType.title;
                }
            }

            const start = parseISO(finalStartTime);
            const end = addMinutes(start, duration);

            // Check for conflicts
            const { data: conflicts } = await supabase
                .from('appointments')
                .select('id, start_time, end_time')
                .eq('clinic_id', current.clinic_id)
                .eq('doctor_id', current.doctor_id)
                .neq('id', id) // Exclude self
                .in('status', ['scheduled', 'confirmed', 'waiting', 'in_progress'])
                .gte('start_time', start.toISOString())
                .lte('start_time', end.toISOString());

            const hasConflict = conflicts?.some(app =>
                areIntervalsOverlapping(
                    { start, end },
                    { start: parseISO(app.start_time), end: parseISO(app.end_time) },
                    { inclusive: false }
                )
            );

            if (hasConflict) {
                return NextResponse.json({ error: 'Time slot conflict' }, { status: 409 });
            }

            updates.start_time = start.toISOString();
            updates.end_time = end.toISOString();
            updates.event_type_id = finalEventTypeId;
            updates.reason = reason;
            shouldRescheduleNotifs = true;
        }

        if (timezone) updates.timezone = timezone;

        // 4. Merge Metadata
        if (newMetadata) {
            updates.metadata = {
                ...(current.metadata || {}),
                ...newMetadata,
                last_updated_at: new Date().toISOString()
            };
        }

        // 5. Apply Updates
        const { data: updated, error: updateError } = await supabase
            .from('appointments')
            .update(updates)
            .eq('id', id)
            .select()
            .single();

        if (updateError) {
            return NextResponse.json({ error: updateError.message }, { status: 500 });
        }

        // 6. Automation: Reschedule Notifications if needed
        if (shouldRescheduleNotifs && updated.status !== 'cancelled' && updated.status !== 'canceled') {
            try {
                await NotificationQueueService.rescheduleReminder24h(id);
            } catch (e) {
                console.error('Failed to reschedule notifications:', e);
            }
        }

        return NextResponse.json(updated);

    } catch (err: any) {
        return NextResponse.json({ error: err.message || 'Invalid request' }, { status: 400 });
    }
}
