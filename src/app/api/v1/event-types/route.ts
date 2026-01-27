import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const clinicId = searchParams.get('clinic_id');

    if (!clinicId) {
        return NextResponse.json({ error: 'clinic_id is required' }, { status: 400 });
    }

    const { data, error } = await supabase
        .from('event_types')
        .select('*')
        .eq('clinic_id', clinicId)
        .eq('active', true)
        .order('title');

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
}
