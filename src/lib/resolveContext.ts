import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Note: In server-side, we might want to use a service role key if we are doing "bootstrap" things,
// but for now we'll use the anon key as configured.
const supabase = createClient(supabaseUrl, supabaseKey);

export interface AppContext {
    clinicId: string;
    doctorId: string;
    profile?: any;
    clinic?: any;
    connection?: any;
}

export async function resolveContext(): Promise<AppContext> {
    try {
        // 1. Check for authenticated user (Future proofing)
        const { data: { user } } = await supabase.auth.getUser();

        let doctorId = user?.id || process.env.DEFAULT_DOCTOR_ID;
        let clinicId = process.env.DEFAULT_CLINIC_ID;

        // 2. If no IDs yet, try to find first available in DB (DEV Fallback)
        if (!doctorId) {
            const { data: profiles } = await supabase
                .from('profiles')
                .select('id')
                .limit(1);

            if (profiles && profiles.length > 0) {
                doctorId = profiles[0].id;
                console.log(`[resolveContext] Using fallback Doctor ID: ${doctorId}`);
            }
        }

        if (!clinicId) {
            const { data: clinics } = await supabase
                .from('clinics')
                .select('id')
                .limit(1);

            if (clinics && clinics.length > 0) {
                clinicId = clinics[0].id;
                console.log(`[resolveContext] Using fallback Clinic ID: ${clinicId}`);
            }
        }

        if (!doctorId || !clinicId) {
            throw new Error('Defina DEFAULT_DOCTOR_ID no servidor para ativar o WhatsApp.');
        }

        // Fetch details to return full context
        // Server-side fetching avoids some RLS issues if we were using service role,
        // but since we use anon, it still respects RLS. 
        // However, we'll return the connection here to avoid the client needing to fetch it.
        const [{ data: profile }, { data: clinic }, { data: connection }] = await Promise.all([
            supabase.from('profiles').select('*').eq('id', doctorId).single(),
            supabase.from('clinics').select('*').eq('id', clinicId).single(),
            supabase.from('whatsapp_connections').select('*').eq('clinic_id', clinicId).eq('doctor_id', doctorId).maybeSingle()
        ]);

        return {
            clinicId,
            doctorId,
            profile,
            clinic,
            connection
        };
    } catch (error: any) {
        console.error('[resolveContext] Error:', error.message);
        throw error;
    }
}
