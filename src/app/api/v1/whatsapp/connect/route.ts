import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';
import { evolutionClient } from '@/lib/evolution';
import { resolveContext } from '@/lib/resolveContext';

export async function POST(request: Request) {
    try {
        let { clinic_id, doctor_id, instance_name } = await request.json();

        // 0. Resolve context if missing
        if (!clinic_id || !doctor_id) {
            try {
                const context = await resolveContext();
                clinic_id = clinic_id || context.clinicId;
                doctor_id = doctor_id || context.doctorId;
            } catch (contextError: any) {
                return NextResponse.json({ error: contextError.message }, { status: 401 });
            }
        }

        if (!instance_name) {
            return NextResponse.json({ error: 'Nome da instância é obrigatório' }, { status: 400 });
        }

        // Check if ENVs are configured
        try {
            evolutionClient.checkConfig();
        } catch (configError: any) {
            return NextResponse.json({ error: 'WhatsApp indisponível. Configuração do servidor não encontrada.' }, { status: 500 });
        }

        // 1. Try to Create instance in Evolution
        let instanceId = instance_name;
        let base64Qr = null;

        console.log('Creating Evolution instance:', instance_name);
        try {
            const createRes = await evolutionClient.createInstance(instance_name);
            console.log('Create result:', JSON.stringify(createRes));

            // Map instance ID (V2 uses 'id', V1 uses 'instanceId')
            if (createRes.instance) {
                instanceId = createRes.instance.id || createRes.instance.instanceId || instance_name;
            }

            // V2 often returns QR code directly on creation
            base64Qr = createRes.qrcode?.base64 || createRes.qrcode?.code;
        } catch (e: any) {
            console.log('Instance creation skipped or failed:', e.message);
        }

        // 2. Get QR Code / Connect (Fallback if not returned on creation or already exists)
        if (!base64Qr) {
            console.log('Fetching QR Code via connect endpoint for:', instance_name);
            const qrData = await evolutionClient.connectInstance(instance_name);
            console.log('QR Code result received');
            base64Qr = qrData.base64 || qrData.qrcode?.base64 || qrData.code || qrData.qrcode?.code;
        }

        // Clean base64 string if it contains prefix
        if (base64Qr && typeof base64Qr === 'string' && base64Qr.includes('base64,')) {
            base64Qr = base64Qr.split('base64,')[1];
        }

        // 3. Upsert into database
        console.log('Upserting connection to database...');
        const { data: connection, error: upsertError } = await supabase
            .from('whatsapp_connections')
            .upsert({
                clinic_id,
                doctor_id,
                instance_name,
                instance_id: instanceId,
                status: 'connecting',
                qr_code: base64Qr,
                updated_at: new Date().toISOString()
            }, { onConflict: 'clinic_id,doctor_id' })
            .select()
            .single();

        if (upsertError) {
            console.error('Database Upsert Error:', upsertError);
            throw upsertError;
        }

        console.log('Connection successful, returning to UI');
        return NextResponse.json({
            status: 'connecting',
            qr_code: connection.qr_code
        });

    } catch (error: any) {
        console.error('WhatsApp Connect API Fatal Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
