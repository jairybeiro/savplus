import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';
import { parseISO, addMinutes, areIntervalsOverlapping } from 'date-fns';
import { NotificationQueueService } from '@/services/NotificationQueueService';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const {
            clinic_id,
            doctor_id,
            patient_id,
            start_time,
            event_type_id,
            requested_duration,
            timezone = 'America/Sao_Paulo',
            source = 'api',
            metadata = {}
        } = body;

        if (!clinic_id || !doctor_id || !patient_id || !start_time) {
            return NextResponse.json({ error: 'clinic_id, doctor_id, patient_id and start_time are required' }, { status: 400 });
        }

        // 1. Determine Duration
        let duration = parseInt(requested_duration || '30');
        let reason = 'Consulta';

        if (event_type_id) {
            const { data: eventType } = await supabase
                .from('event_types')
                .select('duration, title')
                .eq('id', event_type_id)
                .single();
            if (eventType) {
                duration = eventType.duration;
                reason = eventType.title;
            }
        }

        // 2. Calculate End Time
        const start = parseISO(start_time);
        const end = addMinutes(start, duration);

        // 3. Conflict Validation
        const { data: conflicts } = await supabase
            .from('appointments')
            .select('id, start_time, end_time')
            .eq('clinic_id', clinic_id)
            .eq('doctor_id', doctor_id)
            .in('status', ['scheduled', 'confirmed', 'waiting', 'in_progress'])
            .gte('start_time', start.toISOString()) // Basic filtering to reduce processing
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

        // 4. Create Appointment
        const { data, error } = await supabase
            .from('appointments')
            .insert([{
                clinic_id,
                doctor_id,
                patient_id,
                event_type_id,
                start_time: start.toISOString(),
                end_time: end.toISOString(),
                status: 'scheduled',
                timezone,
                source,
                reason,
                metadata
            }])
            .select()
            .single();

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        // 5. [Automation] Lead Promotion: lead -> scheduled
        try {
            const leadId = metadata?.lead_id;

            if (leadId) {
                // Direct promote via ID
                await supabase
                    .from('leads')
                    .update({ status: 'scheduled', updated_at: new Date().toISOString() })
                    .eq('id', leadId)
                    .eq('clinic_id', clinic_id);
            } else {
                // Try to match by phone
                const { data: patient } = await supabase
                    .from('patients')
                    .select('telefone')
                    .eq('id', patient_id)
                    .single();

                if (patient?.telefone) {
                    await supabase
                        .from('leads')
                        .update({ status: 'scheduled', updated_at: new Date().toISOString() })
                        .eq('phone', patient.telefone)
                        .eq('clinic_id', clinic_id);
                }
            }
        } catch (automationError) {
            console.error('Lead promotion failed (silent):', automationError);
            // We don't fail the appointment creation if automation fails
        }

        // 6. [Automation] Enqueue Notifications
        try {
            await NotificationQueueService.enqueueConfirmationOnCreate(data.id);
            await NotificationQueueService.enqueueReminder24h(data.id);
        } catch (notifError) {
            console.error('Notification enqueuing failed (silent):', notifError);
        }

        return NextResponse.json(data, { status: 201 });

    } catch (err) {
        return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }
}
