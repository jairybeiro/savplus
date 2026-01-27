import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';
import { evolutionClient } from '@/lib/evolution';
import { resolveContext } from '@/lib/resolveContext';

export async function POST(request: Request) {
    try {
        let { clinic_id, limit = 25 } = await (request.json().catch(() => ({})));

        if (!clinic_id) {
            try {
                const context = await resolveContext();
                clinic_id = context.clinicId;
            } catch (e) {
                // Silently continue if context cannot be resolved, 
                // it will just fetch notifications for any clinic if not filtered.
            }
        }

        // 1. Fetch pending notifications
        let query = supabase
            .from('notification_queue')
            .select(`
        *,
        appointment:appointments(doctor_id)
      `)
            .eq('status', 'pending')
            .eq('channel', 'whatsapp')
            .lte('scheduled_for', new Date().toISOString())
            .limit(limit);

        if (clinic_id) {
            query = query.eq('clinic_id', clinic_id);
        }

        const { data: notifications, error } = await query;

        if (error) throw error;

        const results = {
            sent: 0,
            failed: 0,
            skipped: 0
        };

        if (!notifications) return NextResponse.json({ results });

        for (const notif of notifications) {
            try {
                const doctorId = (notif as any).appointment?.doctor_id;

                if (!doctorId) {
                    await markFailed(notif.id, 'no_doctor_found', 'No doctor found for appointment');
                    results.failed++;
                    continue;
                }

                // 2. Find active connection for this doctor
                const { data: connection } = await supabase
                    .from('whatsapp_connections')
                    .select('instance_name, status')
                    .eq('clinic_id', notif.clinic_id)
                    .eq('doctor_id', doctorId)
                    .eq('status', 'connected')
                    .maybeSingle();

                if (!connection) {
                    await markFailed(notif.id, 'whatsapp_not_connected', 'No connected WhatsApp instance for this doctor');
                    results.failed++;
                    continue;
                }

                // 3. Construct Message
                const patientName = notif.payload?.patient_name || 'Paciente';
                const startTime = notif.payload?.start_time ? new Date(notif.payload.start_time).toLocaleString('pt-BR') : '';

                let messageText = notif.payload?.message;

                if (!messageText) {
                    if (notif.type === 'confirmation_on_create') {
                        messageText = `Olá ${patientName}, seu agendamento para o dia ${startTime} foi realizado com sucesso!`;
                    } else if (notif.type === 'reminder_24h') {
                        messageText = `Lembrete: Você tem uma consulta amanhã às ${startTime}. Por favor, responda SIM para confirmar.`;
                    } else {
                        messageText = `Olá ${patientName}, temos uma atualização sobre seu agendamento para ${startTime}.`;
                    }
                }

                // 4. Send message via Evolution
                const response = await evolutionClient.sendMessage(
                    connection.instance_name,
                    notif.payload.to,
                    messageText
                );

                // 5. Success update
                await supabase
                    .from('notification_queue')
                    .update({
                        status: 'sent',
                        sent_at: new Date().toISOString(),
                        provider_message_id: response.key?.id || response.messageId,
                        metadata: {
                            ...notif.metadata,
                            provider_response: response,
                            processed_at: new Date().toISOString()
                        }
                    })
                    .eq('id', notif.id);

                results.sent++;

            } catch (err: any) {
                console.error(`Failed to process notification ${notif.id}:`, err);
                await markFailed(notif.id, 'send_error', err.message);
                results.failed++;
            }
        }

        return NextResponse.json({ results });

    } catch (error: any) {
        console.error('Notification Process Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

async function markFailed(id: string, reason_code: string, message: string) {
    await supabase
        .from('notification_queue')
        .update({
            status: 'failed',
            metadata: {
                failure_reason: message,
                failure_code: reason_code,
                failed_at: new Date().toISOString()
            }
        })
        .eq('id', id);
}
