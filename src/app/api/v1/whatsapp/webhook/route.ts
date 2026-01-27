import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';

export async function POST(request: Request) {
    try {
        const payload = await request.json();
        console.log('WhatsApp Webhook Payload:', payload);

        const { event, instance, data } = payload;

        if (event === 'connection.update') {
            const status = data.state === 'open' ? 'connected' : 'disconnected';

            await supabase
                .from('whatsapp_connections')
                .update({
                    status,
                    phone: data.number || null,
                    qr_code: status === 'connected' ? null : undefined,
                    updated_at: new Date().toISOString()
                })
                .eq('instance_name', instance);
        }

        return NextResponse.json({ received: true });

    } catch (error: any) {
        console.error('Webhook Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
