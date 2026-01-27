'use client';

import React, { useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { AlertCircle, CheckCircle2 } from 'lucide-react';

const QUEIXAS = [
    "Dor de cabeça intensa",
    "Febre alta (39ºC)",
    "Dor abdominal",
    "Corte no dedo",
    "Falta de ar leve",
    "Dor no peito",
    "Tontura e enjoo",
    "Dor na perna esquerda",
    "Reação alérgica",
    "Mal estar geral",
    "Pressão alta",
    "Vômitos constantes",
    "Dor de garganta",
    "Suspeita de fratura",
    "Ansiedade"
];

const NAMES = [
    "Silva", "Santos", "Oliveira", "Souza", "Rodrigues", "Ferreira", "Alves",
    "Pereira", "Lima", "Gomes", "Costa", "Ribeiro", "Martins", "Carvalho", "Almeida"
];

const FIRST_NAMES = [
    "José", "Maria", "João", "Ana", "Antônio", "Francisca", "Carlos", "Adriana",
    "Paulo", "Juliana", "Pedro", "Marcia", "Lucas", "Fernanda", "Luiz"
];

export default function DebugPage() {
    const [loading, setLoading] = useState(false);
    const [status, setStatus] = useState<{ type: 'success' | 'error', text: string } | null>(null);

    const generateRandomCPF = () => {
        const rnd = (n: number) => Math.floor(Math.random() * n).toString().padStart(3, '0');
        const rnd2 = (n: number) => Math.floor(Math.random() * n).toString().padStart(2, '0');
        return `${rnd(999)}.${rnd(999)}.${rnd(999)}-${rnd2(99)}`;
    };

    // DEBUG CONNECTION
    const checkConnection = () => {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

        console.log('Supabase Connection Check:', {
            url: url ? `${url.substring(0, 10)}...` : 'MISSING',
            key: key ? 'PRESENT (hidden)' : 'MISSING'
        });

        if (!url || !key) return false;
        return true;
    };

    const generatePatients = async () => {
        if (!checkConnection()) {
            setStatus({ type: 'error', text: 'Configuração do Supabase ausente. Verifique seu arquivo .env.local e reinicie o servidor.' });
            return;
        }

        setLoading(true);
        setStatus(null);
        let count = 0;
        let errors: string[] = [];

        try {
            // Test connection first
            const { error: testError } = await supabase.from('patients').select('id').limit(1);
            if (testError && testError.message.includes('fetch')) {
                throw new Error(`Conexão falhou: O Supabase parece estar offline ou a URL no .env.local está incorreta. (${testError.message})`);
            }

            for (let i = 0; i < 15; i++) {
                const firstName = FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)];
                const lastName = NAMES[Math.floor(Math.random() * NAMES.length)];
                const lastName2 = NAMES[Math.floor(Math.random() * NAMES.length)];
                const fullName = `${firstName} ${lastName} ${lastName2}`;

                // Generate cleaner CPF (numbers only sometimes help)
                const cpfRaw = Math.floor(Math.random() * 10000000000).toString().padStart(11, '0');
                const cpf = cpfRaw.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");

                const queixa = QUEIXAS[Math.floor(Math.random() * QUEIXAS.length)];

                // Random birth date between 1950 and 2010
                const year = 1950 + Math.floor(Math.random() * 60);
                const month = String(Math.floor(Math.random() * 12) + 1).padStart(2, '0');
                const day = String(Math.floor(Math.random() * 28) + 1).padStart(2, '0');
                const dob = `${year}-${month}-${day}`;

                // 1. Create Patient
                const { data: patient, error: pError } = await supabase
                    .from('patients')
                    .insert([{
                        nome_completo: fullName,
                        cpf: cpf,
                        data_nascimento: dob,
                        cns: Math.floor(Math.random() * 1000000000000000).toString()
                    }])
                    .select()
                    .single();

                if (pError) {
                    console.error(`Error patient ${i}:`, pError);
                    // Check if table exists error
                    if (pError.message.includes('relation "patients" does not exist')) {
                        errors.push("Tabela 'patients' não encontrada. Verifique o banco.");
                        break;
                    }
                    errors.push(pError.message);
                    continue;
                }

                // 2. Create Attendance
                const { error: aError } = await supabase
                    .from('attendances')
                    .insert([{
                        patient_id: patient.id,
                        status: 'aguardando_triagem',
                        queixa_principal: queixa,
                        created_at: new Date(Date.now() - Math.floor(Math.random() * 10000000)).toISOString()
                    }]);

                if (!aError) count++;
                else {
                    console.error(`Error attendance ${i}:`, aError);
                    errors.push(aError.message);
                }
            }

            if (count > 0) {
                setStatus({ type: 'success', text: `Sucesso! ${count} pacientes gerados na fila de Triagem.` });
            } else {
                const uniqueErrors = Array.from(new Set(errors));
                setStatus({ type: 'error', text: `Falha ao gerar pacientes. Destalhes: ${uniqueErrors.slice(0, 2).join(' | ')}` });
            }
        } catch (e: any) {
            console.error('Debug execution error:', e);
            setStatus({ type: 'error', text: `Erro de execução: ${e.message}` });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
            <Card className="max-w-md w-full">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-slate-800">
                        <AlertCircle className="text-orange-500" />
                        Gerador de Massa de Dados
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <p className="text-sm text-slate-500">
                        Ferramenta para testes. Gera 15 pacientes aleatórios com CPFs fictícios e adiciona na fila "Aguardando Triagem".
                        <br /><br />
                        <strong>Inclui:</strong> Nome, CPF, Data Nasc. e <span className="text-red-600 font-bold">Queixa Principal</span>.
                    </p>

                    {status && (
                        <div className={`p-3 rounded text-sm flex items-center gap-2 ${status.type === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                            {status.type === 'success' && <CheckCircle2 className="w-4 h-4" />}
                            {status.text}
                        </div>
                    )}

                    <Button
                        onClick={generatePatients}
                        disabled={loading}
                        className="w-full bg-slate-800 hover:bg-slate-900 text-white"
                    >
                        {loading ? 'Gerando...' : 'Gerar 15 Pacientes'}
                    </Button>
                </CardContent>
            </Card>
        </div>
    );
}
