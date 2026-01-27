import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';
import {
    format,
    parseISO,
    addMinutes,
    isBefore,
    isAfter,
    isEqual,
    startOfDay,
    endOfDay,
    areIntervalsOverlapping
} from 'date-fns';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const clinicId = searchParams.get('clinic_id');
    const doctorId = searchParams.get('doctor_id');
    const dateStr = searchParams.get('date'); // YYYY-MM-DD
    const eventTypeId = searchParams.get('event_type_id');
    const requestedDuration = searchParams.get('duration');

    if (!clinicId || !doctorId || !dateStr) {
        return NextResponse.json({ error: 'clinic_id, doctor_id and date are required' }, { status: 400 });
    }

    // 1. Determine Duration
    let duration = parseInt(requestedDuration || '30');
    if (eventTypeId) {
        const { data: eventType } = await supabase
            .from('event_types')
            .select('duration')
            .eq('id', eventTypeId)
            .single();
        if (eventType) duration = eventType.duration;
    }

    // 2. Fetch Busy Appointments
    const dayStart = startOfDay(parseISO(dateStr));
    const dayEnd = endOfDay(parseISO(dateStr));

    const { data: busyAppointments, error } = await supabase
        .from('appointments')
        .select('start_time, end_time')
        .eq('clinic_id', clinicId)
        .eq('doctor_id', doctorId)
        .in('status', ['scheduled', 'confirmed', 'waiting', 'in_progress'])
        .gte('start_time', dayStart.toISOString())
        .lte('start_time', dayEnd.toISOString());

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // 3. Define Work Window (08:00 - 18:00)
    const workStart = new Date(dayStart);
    workStart.setHours(8, 0, 0, 0);

    const workEnd = new Date(dayStart);
    workEnd.setHours(18, 0, 0, 0);

    // 4. Calculate Available Slots
    const availableSlots = [];
    let currentSlot = workStart;

    while (isBefore(currentSlot, workEnd)) {
        const slotEnd = addMinutes(currentSlot, duration);

        // Check if entire slot fits within work hours
        if (isAfter(slotEnd, workEnd)) break;

        // Check for overlaps with existing appointments
        const isOccupied = busyAppointments?.some(app => {
            const appStart = parseISO(app.start_time);
            const appEnd = parseISO(app.end_time);

            return areIntervalsOverlapping(
                { start: currentSlot, end: slotEnd },
                { start: appStart, end: appEnd },
                { inclusive: false } // Only overlap if they share more than a point
            );
        });

        if (!isOccupied) {
            availableSlots.push({
                start_time: currentSlot.toISOString(),
                end_time: slotEnd.toISOString(),
                time_display: format(currentSlot, 'HH:mm')
            });
        }

        // Step 15 minutes
        currentSlot = addMinutes(currentSlot, 15);
    }

    return NextResponse.json({
        clinic_id: clinicId,
        doctor_id: doctorId,
        date: dateStr,
        duration,
        available_slots: availableSlots
    });
}
