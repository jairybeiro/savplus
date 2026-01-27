import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';
import { evolutionClient } from '@/lib/evolution';
import { resolveContext } from '@/lib/resolveContext';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    let clinicId = searchParams.get('clinic_id');
    let doctorId = searchParams.get('doctor_id');

    if (!clinicId || !doctorId) {
        try {
            const context = await resolveContext();
            clinicId = clinicId || context.clinicId;
            doctorId = doctorId || context.doctorId;
        } catch (contextError: any) {
            return NextResponse.json({ error: contextError.message }, { status: 401 });
        }
    }

    const { data: connection, error } = await supabase
        .from('whatsapp_connections')
        .select('*')
        .eq('clinic_id', clinicId)
        .eq('doctor_id', doctorId)
        .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!connection) return NextResponse.json({ status: 'disconnected' });

    // 1. Fetch real status from Evolution API (Source of Truth)
    let realStatus: 'disconnected' | 'connecting' | 'connected' | 'error' | 'expired' = 'disconnected';
    let phoneNumber = connection.phone;

    try {
        // We use the full connection state call to get owner info
        const evoData = await evolutionClient.request(`/instance/connectionState/${encodeURIComponent(connection.instance_name)}`, 'GET');
        const evoInstance = evoData.instance;
        const evoState = evoInstance?.state;

        // V2 compatible phone extraction: ownerJid, owner or phoneNumber
        const rawOwner = evoInstance?.ownerJid || evoInstance?.owner || evoInstance?.phoneNumber || evoInstance?.number;
        const ownerPhone = rawOwner ? rawOwner.split('@')[0].split(':')[0].replace(/\D/g, '') : null;

        if (evoState === 'open') {
            realStatus = 'connected';
            if (ownerPhone) phoneNumber = ownerPhone;
        } else if (evoState === 'connecting' || evoState === 'refused' || evoState === 'pairing') {
            realStatus = 'connecting';
        } else {
            realStatus = 'disconnected';
        }

        // 2. Sync DB with Real State (Idempotent Cache)
        const updateData: any = {
            status: realStatus,
            last_status_sync_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        };

        const statusChanged = realStatus !== connection.status;
        const phoneChanged = realStatus === 'connected' && phoneNumber && phoneNumber !== connection.phone;

        if (statusChanged || phoneChanged) {
            if (realStatus === 'connected') {
                updateData.qr_code = null;
                if (phoneNumber) updateData.phone = phoneNumber;
                if (statusChanged) {
                    console.log(`[WhatsApp Sync] Instance "${connection.instance_name}" changed to CONNECTED.`);
                    updateData.connected_at = new Date().toISOString();
                }
            }

            await supabase
                .from('whatsapp_connections')
                .update(updateData)
                .eq('id', connection.id);
        } else {
            // Just update heartbeat
            await supabase
                .from('whatsapp_connections')
                .update({ last_status_sync_at: new Date().toISOString() })
                .eq('id', connection.id);
        }
    } catch (e: any) {
        console.error(`[WhatsApp Sync] Sync Error for "${connection.instance_name}":`, e.message);
    }

    return NextResponse.json({
        status: realStatus,
        qr_code: realStatus === 'connecting' ? connection.qr_code : null,
        phone: phoneNumber
    });
}
