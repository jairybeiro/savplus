import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';
import { evolutionClient } from '@/lib/evolution';
import { resolveContext } from '@/lib/resolveContext';

export async function POST(request: Request) {
    try {
        let { clinic_id, doctor_id } = await request.json();

        if (!clinic_id || !doctor_id) {
            try {
                const context = await resolveContext();
                clinic_id = clinic_id || context.clinicId;
                doctor_id = doctor_id || context.doctorId;
            } catch (contextError: any) {
                return NextResponse.json({ error: contextError.message }, { status: 401 });
            }
        }

        const { data: connection } = await supabase
            .from('whatsapp_connections')
            .select('*')
            .eq('clinic_id', clinic_id)
            .eq('doctor_id', doctor_id)
            .single();

        if (connection) {
            try {
                await evolutionClient.logoutInstance(connection.instance_name);
                await evolutionClient.deleteInstance(connection.instance_name);
            } catch (e) {
                console.error('Evolution logout/delete failed', e);
            }

            await supabase
                .from('whatsapp_connections')
                .update({
                    status: 'disconnected',
                    qr_code: null,
                    instance_id: null,
                    updated_at: new Date().toISOString()
                })
                .eq('id', connection.id);
        }

        return NextResponse.json({ status: 'disconnected' });

    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
