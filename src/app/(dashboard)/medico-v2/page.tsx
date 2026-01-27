'use client';

import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Users, Clock, Bed, Activity, UserX, RefreshCw, XCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { ManchesterColor, MANCHESTER_COLORS } from '@/lib/manchester';
import { cn } from '@/lib/utils';
import { formatWaitTime } from '@/lib/time';
import { MedicalDashboard } from '@/components/dashboard/MedicalDashboard';

type Attendance = {
    id: string;
    created_at: string;
    updated_at?: string;
    data_solicitacao_vaga?: string;
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

type TabType = 'fila' | 'observacao' | 'nir';

export default function MedicalDashboardV2() {
    const [queue, setQueue] = useState<Attendance[]>([]);
    const [absentList, setAbsentList] = useState<Attendance[]>([]);
    const [showAbsentList, setShowAbsentList] = useState(false);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<TabType>('fila');
    const [tick, setTick] = useState(0);

    useEffect(() => {
        const interval = setInterval(() => setTick(t => t + 1), 60000);
        return () => clearInterval(interval);
    }, []);

    const fetchQueue = async () => {
        let statuses: string[];

        switch (activeTab) {
            case 'fila':
                statuses = ['aguardando_medico', 'aguardando_reavaliacao', 'em_atendimento'];
                break;
            case 'observacao':
                statuses = ['em_observacao'];
                break;
            case 'nir':
                statuses = ['aguardando_leito', 'aguardando_internacao'];
                break;
            default:
                statuses = ['aguardando_medico'];
        }

        const { data, error } = await supabase
            .from('attendances')
            .select('*, patient:patients(nome_completo, cpf, data_nascimento)')
            .in('status', statuses);

        if (data) {
            const sorted = (data as unknown as Attendance[]).sort((a, b) => {
                const priorityA = PRIORITY_MAP[a.classificacao_risco] || 99;
                const priorityB = PRIORITY_MAP[b.classificacao_risco] || 99;
                if (priorityA !== priorityB) return priorityA - priorityB;
                return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
            });
            setQueue(sorted);
        }
    };

    // Fetch absent patients (repescagem)
    const fetchAbsentList = async () => {
        const { data } = await supabase
            .from('attendances')
            .select('*, patient:patients(nome_completo, cpf, data_nascimento)')
            .eq('status', 'ausente')
            .order('updated_at', { ascending: false });

        if (data) {
            setAbsentList(data as unknown as Attendance[]);
        }
    };

    // Recall absent patient (put back in queue)
    const handleRecallAbsent = async (id: string) => {
        await supabase
            .from('attendances')
            .update({
                status: 'em_atendimento',
                updated_at: new Date().toISOString()
            })
            .eq('id', id);
        fetchAbsentList();
        fetchQueue();
    };

    // Cancel absent patient (desistência)
    const handleCancelAbsent = async (id: string) => {
        const { error } = await supabase
            .from('attendances')
            .update({
                status: 'cancelado',
                updated_at: new Date().toISOString()
            })
            .eq('id', id);

        if (error) {
            console.error('Error canceling patient:', error);
            alert('Erro ao cancelar: ' + error.message);
        } else {
            fetchAbsentList();
        }
    };

    useEffect(() => {
        fetchQueue();
        fetchAbsentList();
        const sub = supabase.channel('med-v2').on('postgres_changes', { event: '*', schema: 'public', table: 'attendances' }, () => {
            fetchQueue();
            fetchAbsentList();
        }).subscribe();
        return () => { sub.unsubscribe() };
    }, [activeTab]);

    const handleSelect = (id: string, currentStatus: string) => {
        setSelectedId(id);

        // Optimistic update for visual feedback
        if (currentStatus === 'aguardando_medico' && activeTab === 'fila') {
            setQueue(prev => prev.map(item =>
                item.id === id
                    ? { ...item, status: 'em_atendimento' }
                    : item
            ));
        }
    };

    const handleAction = async (action: string) => {
        if (!selectedId) return;

        // When MedicalDashboard reports success or mark_absent, clear selection and refresh
        if (action === 'success' || action === 'mark_absent') {
            setSelectedId(null);
            fetchQueue();
            fetchAbsentList();
        }
    };

    const getStatusBadge = (item: Attendance) => {
        switch (activeTab) {
            case 'fila':
                return {
                    text: item.status === 'em_atendimento' ? 'Em Consulta' : 'Aguardando',
                    className: item.status === 'em_atendimento'
                        ? "bg-blue-600 text-white"
                        : "bg-slate-100 text-slate-500"
                };
            case 'observacao':
                return {
                    text: 'Em Observação',
                    className: "bg-orange-100 text-orange-700"
                };
            case 'nir':
                return {
                    text: 'Aguard. Leito',
                    className: "bg-red-100 text-red-700"
                };
            default:
                return { text: 'Aguardando', className: "bg-slate-100 text-slate-500" };
        }
    };

    const selectedAttendance = queue.find(q => q.id === selectedId);

    return (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 min-h-[600px] pb-10">

            {/* 1. COMPACT SIDEBAR QUEUE (3 Columns) */}
            <div className="lg:col-span-3 border-r border-slate-200 pr-4 overflow-y-auto flex flex-col gap-4 max-h-[calc(100vh-140px)] lg:sticky lg:top-4">
                <div className="flex bg-slate-100 p-1 rounded-lg shrink-0">
                    <button
                        onClick={() => { setActiveTab('fila'); setSelectedId(null); }}
                        className={cn(
                            "flex-1 py-2 text-[10px] font-black uppercase rounded-md transition-all",
                            activeTab === 'fila' ? "bg-white shadow-sm text-blue-600" : "text-slate-500 hover:text-slate-700"
                        )}
                    >
                        Fila Médica
                    </button>
                    <button
                        onClick={() => { setActiveTab('observacao'); setSelectedId(null); }}
                        className={cn(
                            "flex-1 py-2 text-[10px] font-black uppercase rounded-md transition-all",
                            activeTab === 'observacao' ? "bg-white shadow-sm text-orange-600" : "text-slate-500 hover:text-slate-700"
                        )}
                    >
                        Observação
                    </button>
                    <button
                        onClick={() => { setActiveTab('nir'); setSelectedId(null); }}
                        className={cn(
                            "flex-1 py-2 text-[10px] font-black uppercase rounded-md transition-all",
                            activeTab === 'nir' ? "bg-white shadow-sm text-red-600" : "text-slate-500 hover:text-slate-700"
                        )}
                    >
                        NIR
                    </button>
                </div>

                {queue.length === 0 && (
                    <div className="p-6 text-center bg-slate-50 rounded-xl border-2 border-dashed border-slate-200">
                        <p className="text-sm text-slate-500 font-medium">
                            {activeTab === 'fila' && 'Nenhum paciente aguardando atendimento.'}
                            {activeTab === 'observacao' && 'Nenhum paciente em observação.'}
                            {activeTab === 'nir' && 'Nenhum paciente aguardando leito.'}
                        </p>
                    </div>
                )}

                <div className="space-y-2">
                    {queue.map((item) => {
                        const isSelected = selectedId === item.id;
                        const badge = getStatusBadge(item);
                        const waitTime = activeTab === 'nir' && item.data_solicitacao_vaga
                            ? formatWaitTime(item.data_solicitacao_vaga)
                            : formatWaitTime(item.created_at);

                        return (
                            <Card
                                key={item.id}
                                onClick={() => handleSelect(item.id, item.status)}
                                className={cn(
                                    "cursor-pointer transition-all border-l-4 relative overflow-hidden hover:shadow-md",
                                    isSelected ? "ring-2 ring-blue-600 bg-blue-50/50" : "border-slate-200 bg-white"
                                )}
                            >
                                <div className={cn("absolute left-0 top-0 bottom-0 w-1.5", MANCHESTER_COLORS[item.classificacao_risco])} />
                                <div className="p-3 pl-5">
                                    <div className="flex justify-between items-start mb-1">
                                        <div className="font-bold text-slate-800 text-sm truncate w-32">
                                            {item.patient.nome_completo}
                                        </div>
                                        <div className={cn(
                                            "text-[9px] font-black uppercase px-1.5 py-0.5 rounded",
                                            badge.className
                                        )}>
                                            {badge.text}
                                        </div>
                                    </div>

                                    {/* Queixa Principal */}
                                    {item.queixa_principal && (
                                        <div className="mt-1 text-[10px] font-bold text-red-600 bg-red-50 p-1.5 rounded flex items-center gap-1 truncate">
                                            <Activity className="w-3 h-3 shrink-0" />
                                            <span className="truncate">{item.queixa_principal}</span>
                                        </div>
                                    )}

                                    {/* NIR-specific: Show "Aguardando Leito" badge */}
                                    {activeTab === 'nir' && (
                                        <div className="flex items-center gap-1 mt-1 text-[10px] text-red-600 font-bold">
                                            <Bed className="w-3 h-3" />
                                            Aguardando Vaga
                                        </div>
                                    )}

                                    <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100">
                                        <div className="flex items-center gap-1 text-[10px] text-slate-400">
                                            <Clock className="w-3 h-3" />
                                            {activeTab === 'nir' ? 'Solicit:' : 'Chegada:'} {new Date(activeTab === 'nir' && item.data_solicitacao_vaga ? item.data_solicitacao_vaga : item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </div>
                                        <div className={cn(
                                            "text-[10px] font-black px-1.5 py-0.5 rounded flex items-center gap-1",
                                            activeTab === 'nir' ? "text-red-600 bg-red-50" : "text-blue-600 bg-blue-50"
                                        )}>
                                            <Clock className="w-2.5 h-2.5" />
                                            {activeTab === 'nir' ? 'AGUARD.' : 'ESPERANDO HÁ'} {waitTime.toUpperCase()}
                                        </div>
                                    </div>
                                </div>
                            </Card>
                        );
                    })}
                </div>

                {/* ABSENT PATIENTS (Repescagem) */}
                {absentList.length > 0 && (
                    <div className="mt-4 border-t border-dashed border-amber-300 pt-4">
                        <button
                            onClick={() => setShowAbsentList(!showAbsentList)}
                            className="w-full flex items-center justify-between p-3 bg-amber-50 rounded-lg border border-amber-200 hover:bg-amber-100 transition-colors"
                        >
                            <div className="flex items-center gap-2">
                                <UserX className="w-4 h-4 text-amber-600" />
                                <span className="font-bold text-amber-800 text-sm">
                                    Ausentes ({absentList.length})
                                </span>
                            </div>
                            {showAbsentList ? (
                                <ChevronUp className="w-4 h-4 text-amber-600" />
                            ) : (
                                <ChevronDown className="w-4 h-4 text-amber-600" />
                            )}
                        </button>

                        {showAbsentList && (
                            <div className="mt-2 space-y-2">
                                {absentList.map((item) => {
                                    const absentSince = item.updated_at ? formatWaitTime(item.updated_at) : '--';
                                    return (
                                        <Card key={item.id} className="bg-amber-50/50 border-amber-200 border-l-4 border-l-amber-500">
                                            <div className="p-3">
                                                <div className="flex justify-between items-start mb-2">
                                                    <div className="font-bold text-slate-700 text-sm truncate">
                                                        {item.patient.nome_completo}
                                                    </div>
                                                    <div className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-amber-200 text-amber-800">
                                                        Ausente há {absentSince}
                                                    </div>
                                                </div>
                                                <div className="flex gap-2 mt-2">
                                                    <Button
                                                        size="sm"
                                                        onClick={() => handleRecallAbsent(item.id)}
                                                        className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-[10px] h-7"
                                                    >
                                                        <RefreshCw className="w-3 h-3 mr-1" />
                                                        Chamar Novamente
                                                    </Button>
                                                    <Button
                                                        size="sm"
                                                        variant="destructive"
                                                        onClick={() => handleCancelAbsent(item.id)}
                                                        className="flex-1 text-[10px] h-7"
                                                    >
                                                        <XCircle className="w-3 h-3 mr-1" />
                                                        Desistência
                                                    </Button>
                                                </div>
                                            </div>
                                        </Card>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* 2. MAIN WORKSPACE (9 Columns) */}
            <div className="lg:col-span-9">
                {selectedAttendance ? (
                    <MedicalDashboard
                        attendance={selectedAttendance}
                        onAction={handleAction}
                    />
                ) : (
                    <div className="min-h-[400px] flex flex-col items-center justify-center text-slate-300 border-4 border-dashed border-slate-100 rounded-2xl bg-white shadow-sm">
                        <Users className="h-24 w-24 mb-4 opacity-10" />
                        <h2 className="text-2xl font-black text-slate-400">Nenhum paciente selecionado</h2>
                        <p className="text-sm font-medium text-slate-400 mt-2">Selecione um paciente da fila para iniciar o atendimento</p>
                    </div>
                )}
            </div>
        </div>
    );
}

