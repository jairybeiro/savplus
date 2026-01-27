import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';
import { NotificationQueueService } from '@/services/NotificationQueueService';
import { startOfDay, endOfDay, parseISO } from 'date-fns';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const {
            clinic_id,
            date_from, // YYYY-MM-DD
            date_to    // YYYY-MM-DD
        } = body;

        if (!clinic_id) {
            return NextResponse.json({ error: 'clinic_id is required' }, { status: 400 });
        }

        // 1. Build Query for Future Appointments
        let query = supabase
            .from('appointments')
            .select('id')
            .eq('clinic_id', clinic_id)
            .in('status', ['scheduled', 'confirmed']);

        if (date_from) {
            query = query.gte('start_time', startOfDay(parseISO(date_from)).toISOString());
        } else {
            query = query.gte('start_time', new Date().toISOString());
        }

        if (date_to) {
            query = query.lte('start_time', endOfDay(parseISO(date_to)).toISOString());
        }

        const { data: appointments, error: fetchError } = await query;

        if (fetchError) {
            return NextResponse.json({ error: fetchError.message }, { status: 500 });
        }

        // 2. Rebuild Queue per Appointment (Idempotent via Service/Upsert)
        const stats = {
            processed: 0,
            errors: 0
        };

        if (appointments && appointments.length > 0) {
            for (const app of appointments) {
                try {
                    // Re-enqueue confirmation (if needed) and reminder
                    await NotificationQueueService.enqueueConfirmationOnCreate(app.id);
                    await NotificationQueueService.enqueueReminder24h(app.id);
                    stats.processed++;
                } catch (err) {
                    console.error(`Error rebuilding queue for app ${app.id}:`, err);
                    stats.errors++;
                }
            }
        }

        return NextResponse.json({
            message: 'Queue rebuild completed',
            stats
        });

    } catch (err: any) {
        return NextResponse.json({ error: err.message || 'Invalid request' }, { status: 400 });
    }
}
