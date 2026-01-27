'use client';

import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Ambulance, Clock, AlertTriangle } from 'lucide-react';
import { formatWaitTime } from '@/lib/time';

type NIRPatient = {
    id: string;
    patient: { nome_completo: string; cpf: string; };
    data_solicitacao_vaga: string;
    prioridade_regulacao: string;
    diagnostico: string;
};

export default function NIRPage() {
    const [patients, setPatients] = useState<NIRPatient[]>([]);
    const [transferModal, setTransferModal] = useState<string | null>(null);
    const [tick, setTick] = useState(0);

    useEffect(() => {
        const interval = setInterval(() => setTick(t => t + 1), 60000);
        return () => clearInterval(interval);
    }, []);

    const fetchNIR = async () => {
        const { data } = await supabase
            .from('attendances')
            .select('id, data_solicitacao_vaga, prioridade_regulacao, diagnostico, patient:patients(nome_completo, cpf)')
            .eq('status', 'aguardando_leito')
            .order('data_solicitacao_vaga', { ascending: true });

        if (data) setPatients(data as any);
    };

    useEffect(() => {
        fetchNIR();
        const sub = supabase.channel('nir').on('postgres_changes', { event: '*', schema: 'public', table: 'attendances' }, fetchNIR).subscribe();
        return () => { sub.unsubscribe() };
    }, []);

    const handleTransfer = async (e: React.FormEvent) => {
        e.preventDefault();
        const form = new FormData(e.target as HTMLFormElement);

        await supabase.from('attendances').update({
            status: 'transferido',
            hospital_destino: form.get('hospital'),
            codigo_regulacao: form.get('codigo'),
            meio_transporte: form.get('transporte')
        }).eq('id', transferModal);

        setTransferModal(null);
    };

    const getWaitStatus = (dateStr: string) => {
        const start = new Date(dateStr).getTime();
        const now = new Date().getTime();
        const diffHours = (now - start) / (1000 * 60 * 60);
        const isCritical = diffHours > 24;
        return {
            label: `Aguardando Vaga há ${formatWaitTime(dateStr)}`,
            isCritical
        };
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-2">
                <Ambulance className="h-8 w-8 text-red-600" />
                <h2 className="text-3xl font-bold text-slate-800">NIR - Regulação de Vagas</h2>
            </div>

            <div className="bg-white rounded-lg shadow border overflow-hidden">
                <table className="w-full text-sm text-left">
                    <thead className="bg-slate-100 text-slate-700 font-bold uppercase">
                        <tr>
                            <th className="p-4">Prioridade</th>
                            <th className="p-4">Paciente</th>
                            <th className="p-4">Diagnóstico</th>
                            <th className="p-4">Tempo de Espera</th>
                            <th className="p-4 text-right">Ação</th>
                        </tr>
                    </thead>
                    <tbody>
                        {patients.length === 0 && (
                            <tr><td colSpan={5} className="p-6 text-center text-slate-500">Sem solicitações de vaga pendentes.</td></tr>
                        )}
                        {patients.map(p => {
                            const wait = getWaitStatus(p.data_solicitacao_vaga);
                            return (
                                <tr key={p.id} className="border-b hover:bg-slate-50">
                                    <td className="p-4">
                                        <span className={`px-2 py-1 rounded text-xs font-bold ${p.prioridade_regulacao === '1' ? 'bg-red-100 text-red-700' : 'bg-slate-200'}`}>
                                            PRIORIDADE {p.prioridade_regulacao}
                                        </span>
                                    </td>
                                    <td className="p-4">
                                        <div className="font-bold">{p.patient.nome_completo}</div>
                                        <div className="text-xs text-slate-500">CPF: {p.patient.cpf}</div>
                                    </td>
                                    <td className="p-4 truncate max-w-[200px]">{p.diagnostico}</td>
                                    <td className="p-4">
                                        <div className={`flex items-center gap-2 font-bold ${wait.isCritical ? 'text-red-600 animate-pulse' : 'text-slate-600'}`}>
                                            {wait.isCritical && <AlertTriangle className="h-4 w-4" />}
                                            <Clock className="h-4 w-4" />
                                            {wait.label}
                                        </div>
                                    </td>
                                    <td className="p-4 text-right">
                                        <Button size="sm" onClick={() => setTransferModal(p.id)} className="bg-blue-600 hover:bg-blue-700 text-white">
                                            Registrar Transferência
                                        </Button>
                                    </td>
                                </tr>
                            )
                        })}
                    </tbody>
                </table>
            </div>

            {/* Transfer Modal */}
            {transferModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-white p-6 rounded-lg w-full max-w-md space-y-4">
                        <h3 className="text-xl font-bold">Dados da Transferência</h3>
                        <form onSubmit={handleTransfer} className="space-y-4">
                            <div className="space-y-2">
                                <Label>Hospital de Destino</Label>
                                <Input name="hospital" placeholder="Ex: Hospital do Trabalhador" required />
                            </div>
                            <div className="space-y-2">
                                <Label>Código da Central (CROSS/CARE)</Label>
                                <Input name="codigo" placeholder="Ex: AX-990022" required />
                            </div>
                            <div className="space-y-2">
                                <Label>Meio de Transporte</Label>
                                <select name="transporte" className="w-full border rounded-md p-2" required>
                                    <option>SAMU (USA/UTI)</option>
                                    <option>SAMU (USB/Básica)</option>
                                    <option>Ambulância Sanitária</option>
                                    <option>Meios Próprios</option>
                                </select>
                            </div>
                            <div className="flex justify-end gap-2 pt-2">
                                <Button type="button" variant="ghost" onClick={() => setTransferModal(null)}>Cancelar</Button>
                                <Button type="submit" className="bg-green-600 text-white hover:bg-green-700">Confirmar Saída</Button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
