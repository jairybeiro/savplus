'use client';

import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConsultationForm } from '@/components/forms/ConsultationForm';
import { Activity, Clock, Users, Stethoscope } from 'lucide-react';
import { ManchesterColor, MANCHESTER_COLORS } from '@/lib/manchester';
import { cn } from '@/lib/utils';
import { formatWaitTime } from '@/lib/time';

type Attendance = {
    id: string;
    created_at: string;
    patient: {
        nome_completo: string;
        cpf: string;
        data_nascimento: string;
    };
    queixa_principal: string;
    discriminador: string;
    classificacao_risco: ManchesterColor;
    sinais_vitais: any;
    status: string;
};

const PRIORITY_MAP: Record<ManchesterColor, number> = {
    vermelho: 1,
    laranja: 2,
    amarelo: 3,
    verde: 4,
    azul: 5,
};

export default function MedicoPage() {
    const [queue, setQueue] = useState<Attendance[]>([]);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<'fila' | 'observacao'>('fila');
    const [tick, setTick] = useState(0);

    useEffect(() => {
        const interval = setInterval(() => setTick(t => t + 1), 60000);
        return () => clearInterval(interval);
    }, []);

    const maskCPF = (cpf: string) => {
        if (!cpf) return '---';
        return cpf.replace(/^(\d{3})\.(\d{3})\.(\d{3})-(\d{2})$/, '$1.***.***-$4');
    };

    const fetchQueue = async () => {
        const statuses = activeTab === 'fila'
            ? ['aguardando_medico', 'aguardando_reavaliacao', 'em_atendimento']
            : ['em_observacao'];

        const { data, error } = await supabase
            .from('attendances')
            .select('*, patient:patients(nome_completo, cpf, data_nascimento)')
            .in('status', statuses);

        if (error) {
            console.error('Error fetching queue:', error);
        } else if (data) {
            const sorted = (data as unknown as Attendance[]).sort((a, b) => {
                const priorityA = PRIORITY_MAP[a.classificacao_risco] || 99;
                const priorityB = PRIORITY_MAP[b.classificacao_risco] || 99;

                if (priorityA !== priorityB) {
                    return priorityA - priorityB;
                }

                return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
            });
            setQueue(sorted);
        }
    };

    useEffect(() => {
        fetchQueue();
    }, [activeTab]);

    useEffect(() => {
        const subscription = supabase
            .channel('public:attendances:medico')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'attendances' }, () => {
                fetchQueue();
            })
            .subscribe();

        return () => { subscription.unsubscribe(); };
    }, [activeTab]); // Resubscribe if tab changes to ensure correct filtering (though status in filter is handled by the fetch)

    const handleSuccess = () => {
        setSelectedId(null);
        fetchQueue();
    };

    const handleCall = async () => {
        if (!selectedId) return;
        const patient = queue.find(a => a.id === selectedId);
        // Don't call if in observation (user request)
        if (patient?.status === 'em_observacao') return;

        try {
            await supabase
                .from('attendances')
                .update({
                    status: 'em_atendimento',
                    updated_at: new Date().toISOString()
                })
                .eq('id', selectedId);
        } catch (err) {
            console.error('Error calling panel:', err);
        }
    };

    const selectedAttendance = queue.find(a => a.id === selectedId);

    return (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 h-[calc(100vh-120px)]">
            {/* Sidebar Queue */}
            <div className="lg:col-span-1 border-r border-slate-200 pr-6 overflow-y-auto flex flex-col gap-4">
                <div className="flex flex-col gap-4">
                    <h2 className="text-xl font-black flex items-center gap-2 text-slate-800">
                        <Users className="h-5 w-5" />
                        Atendimento
                    </h2>

                    <div className="flex bg-slate-100 p-1 rounded-lg">
                        <button
                            onClick={() => { setActiveTab('fila'); setSelectedId(null); }}
                            className={cn(
                                "flex-1 py-1.5 text-[10px] font-black uppercase rounded-md transition-all",
                                activeTab === 'fila' ? "bg-white shadow-sm text-blue-600" : "text-slate-500 hover:text-slate-700"
                            )}
                        >
                            Fila Médica
                        </button>
                        <button
                            onClick={() => { setActiveTab('observacao'); setSelectedId(null); }}
                            className={cn(
                                "flex-1 py-1.5 text-[10px] font-black uppercase rounded-md transition-all",
                                activeTab === 'observacao' ? "bg-white shadow-sm text-orange-600" : "text-slate-500 hover:text-slate-700"
                            )}
                        >
                            Observação
                        </button>
                    </div>
                </div>

                <div className="space-y-3">
                    {queue.length === 0 && (
                        <div className="p-8 text-center bg-slate-50 rounded-xl border-2 border-dashed border-slate-200">
                            <p className="text-sm text-slate-500 font-bold">Nenhum paciente aguardando atendimento médico</p>
                        </div>
                    )}
                    {queue.map((item) => {
                        const isSelected = selectedId === item.id;
                        const isBeingAttended = item.status === 'em_atendimento';
                        return (
                            <Card
                                key={item.id}
                                onClick={() => setSelectedId(item.id)}
                                className={cn(
                                    "cursor-pointer transition-all border-l-4 relative overflow-hidden",
                                    isSelected ? "ring-2 ring-blue-600 bg-blue-50/50" : "hover:shadow-md border-slate-200 bg-white",
                                    isBeingAttended && !isSelected ? "opacity-60 grayscale-[0.5]" : ""
                                )}
                            >
                                <div className={cn("absolute left-0 top-0 bottom-0 w-2", MANCHESTER_COLORS[item.classificacao_risco])} />
                                <div className="p-4 pl-6">
                                    <div className="flex items-center justify-between mb-1">
                                        <div className="font-bold text-slate-800 text-sm truncate max-w-[120px]">
                                            {item.patient?.nome_completo}
                                        </div>
                                        <span className={cn(
                                            "text-[9px] font-black uppercase px-2 py-0.5 rounded-full",
                                            isSelected ? "bg-blue-600 text-white animate-pulse" : "bg-slate-200 text-slate-500"
                                        )}>
                                            {isSelected ? "Em Consulta" : "Aguardando"}
                                        </span>
                                    </div>
                                    <div className="text-[10px] text-slate-500 font-mono">CPF: {maskCPF(item.patient?.cpf)}</div>
                                    <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100">
                                        <div className="flex items-center gap-1 text-[10px] text-slate-400">
                                            <Clock className="w-3 h-3" />
                                            {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </div>
                                        {!isBeingAttended && (
                                            <div className="text-[10px] font-black text-blue-600 uppercase bg-blue-50 px-2 py-0.5 rounded">
                                                {formatWaitTime(item.created_at)}
                                            </div>
                                        )}
                                        {item.status === 'aguardando_reavaliacao' && (
                                            <span className="text-[9px] font-bold text-blue-600 bg-blue-50 px-1.5 rounded border border-blue-100 uppercase">REAVALIAÇÃO</span>
                                        )}
                                    </div>
                                </div>
                            </Card>
                        );
                    })}
                </div>
            </div>

            {/* Main Consultation Area */}
            <div className="lg:col-span-3">
                {selectedId && selectedAttendance ? (
                    <div className="h-full flex flex-col">
                        {/* Professional Safety Header */}
                        <div className="bg-slate-900 p-4 mb-4 rounded-xl flex items-center justify-between shadow-2xl text-white">
                            <div className="flex gap-10 items-center pl-2">
                                <div>
                                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Paciente</p>
                                    <p className="text-2xl font-black leading-none">{selectedAttendance.patient.nome_completo}</p>
                                </div>
                                <div className="border-l border-white/10 pl-8">
                                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Info</p>
                                    <div className="flex items-center gap-4">
                                        <p className="text-lg font-bold leading-none">
                                            {(() => {
                                                const dob = selectedAttendance.patient.data_nascimento;
                                                if (!dob) return '--';
                                                try {
                                                    const birthDate = new Date(dob);
                                                    const today = new Date();
                                                    let age = today.getFullYear() - birthDate.getFullYear();
                                                    const m = today.getMonth() - birthDate.getMonth();
                                                    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) age--;
                                                    return `${age}a`;
                                                } catch { return '--'; }
                                            })()}
                                        </p>
                                        <p className="text-lg font-bold font-mono leading-none text-slate-300">{maskCPF(selectedAttendance.patient.cpf)}</p>
                                    </div>
                                </div>

                                <div className="border-l border-white/10 pl-8 flex gap-6">
                                    {[
                                        { label: 'PA', value: selectedAttendance.sinais_vitais?.pa || '--', unit: 'mmHg' },
                                        { label: 'TEMP', value: selectedAttendance.sinais_vitais?.temp || '--', unit: '°C' },
                                        { label: 'FC', value: selectedAttendance.sinais_vitais?.fc || '--', unit: 'bpm' },
                                        { label: 'SAT', value: selectedAttendance.sinais_vitais?.spo2 || '--', unit: '%' },
                                        { label: 'HGT', value: selectedAttendance.sinais_vitais?.hgt || '--', unit: 'mg/dL' }
                                    ].map((vit) => (
                                        <div key={vit.label}>
                                            <p className="text-[10px] font-black uppercase tracking-widest text-blue-400 mb-1">{vit.label}</p>
                                            <p className="text-lg font-black leading-none font-mono">
                                                {vit.value}<span className="text-[10px] font-bold text-slate-500 ml-0.5">{vit.unit}</span>
                                            </p>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {selectedAttendance.status !== 'em_observacao' && (
                                <Button
                                    onClick={handleCall}
                                    className="bg-blue-600 hover:bg-blue-700 text-white font-black px-6 h-12 rounded-xl shadow-lg flex gap-2 text-sm transition-all active:scale-95"
                                >
                                    <Activity className="w-5 h-5 animate-pulse" />
                                    RECHAMAR
                                </Button>
                            )}
                        </div>

                        <div className="flex-1 overflow-y-auto pt-2">
                            <ConsultationForm
                                attendanceId={selectedId}
                                patientName={selectedAttendance.patient.nome_completo}
                                triageData={{
                                    queixa: selectedAttendance.queixa_principal,
                                    discriminador: selectedAttendance.discriminador,
                                    sinais_vitais: selectedAttendance.sinais_vitais,
                                    classificacao: selectedAttendance.classificacao_risco,
                                    alergias: (selectedAttendance as any).alergias
                                }}
                                onSuccess={handleSuccess}
                                onCancel={() => setSelectedId(null)}
                            />
                        </div>
                    </div>
                ) : (
                    <div className="h-full flex flex-col items-center justify-center text-slate-300 border-4 border-dashed border-slate-100 rounded-3xl">
                        <Stethoscope className="h-32 w-32 mb-6 opacity-10" />
                        <h2 className="text-3xl font-black text-slate-400">Consultório disponível</h2>
                        <p className="text-lg font-medium text-slate-400">Selecione um paciente na fila para iniciar o atendimento.</p>
                    </div>
                )}
            </div>
        </div>
    );
}
