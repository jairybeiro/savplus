'use client';

import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Pill, RotateCcw, CheckCircle, Syringe, Clock, AlertTriangle, FileText, User, HeartPulse, Activity, Thermometer, Droplet, Wind, Plus, ArrowLeft, X, Search } from 'lucide-react';
import { cn } from '@/lib/utils';

type PrescriptionItem = {
    id: string;
    medicamento: string;
    quantidade: string;
    posologia: string;
    via?: string;
    diluicao?: string;
    composicao?: Array<{ id: string, medicamento: string, quantidade: string }>;
    checked: boolean;
    checked_at?: string;
    checked_by?: string;
};

type VitalSign = {
    id: string;
    tipo: string;
    valor: string;
    medido_em: string;
    medido_por?: string;
};

type NursingNote = {
    id: string;
    attendance_id: string;
    note: string;
    created_at: string;
    created_by?: string;
};

type Attendance = {
    id: string;
    created_at: string;
    patient: { nome_completo: string; cpf: string; data_nascimento: string };
    prescricao: string;
    queixa_principal?: string;
    sinais_vitais?: any; // Triagem original
    classificacao_risco?: string;
    prescricao_estruturada: PrescriptionItem[] | null;
    sinais_vitais_obs: VitalSign[] | null; // Vitals during observation
    nursing_notes: NursingNote[] | null;
    status: string;
    orientacoes_medicas?: string;
    anamnese?: string;
    exame_fisico?: string;
    historico_clinico?: string;
    discriminador?: string;
};

type TabType = 'prescricao' | 'vitals' | 'evolucao';

export default function MedicacaoPage() {
    const [patients, setPatients] = useState<Attendance[]>([]);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [activeTab, setActiveTab] = useState<TabType>('prescricao');
    const [newNote, setNewNote] = useState('');
    const [isVitalsPanelOpen, setIsVitalsPanelOpen] = useState(false);
    const [isNotePanelOpen, setIsNotePanelOpen] = useState(false);

    // Vitals Form State
    const [vitalsForm, setVitalsForm] = useState({
        pa: '',
        fc: '',
        temp: '',
        spo2: '',
        fr: '',
        glicemia: ''
    });

    const fetchPatients = async () => {
        // 1. Fetch Attendances
        const { data: attendanceData } = await supabase
            .from('attendances')
            .select('* , patient:patients(nome_completo, cpf, data_nascimento)')
            .in('status', ['medicacao', 'em_observacao'])
            .order('created_at', { ascending: true });

        if (!attendanceData) return;

        const attendanceIds = attendanceData.map(a => a.id);

        // 2. Fetch Prescription Items
        const { data: itemsData } = await supabase
            .from('prescription_items')
            .select('*')
            .in('attendance_id', attendanceIds);

        // 3. Fetch Vitals (Observation)
        const { data: vitalsData } = await supabase
            .from('patient_vitals')
            .select('*')
            .in('attendance_id', attendanceIds)
            .order('medido_em', { ascending: false });

        // 4. Fetch Nursing Notes
        const { data: notesData } = await supabase
            .from('nursing_notes')
            .select('*')
            .in('attendance_id', attendanceIds)
            .order('created_at', { ascending: true });

        // 5. Merge data
        const merged = attendanceData.map(att => {
            const items = itemsData?.filter(i => i.attendance_id === att.id) || [];
            const vitals = vitalsData?.filter(v => v.attendance_id === att.id) || [];
            const notes = notesData?.filter(n => n.attendance_id === att.id) || [];

            return {
                ...att,
                prescricao_estruturada: items.map(i => ({
                    id: i.id,
                    medicamento: i.medicamento,
                    quantidade: i.quantidade,
                    posologia: i.posologia,
                    via: i.via,
                    diluicao: i.diluicao,
                    composicao: i.composicao,
                    checked: i.checked,
                    checked_at: i.checked_at,
                    checked_by: i.checked_by
                })),
                sinais_vitais_obs: vitals,
                nursing_notes: notes
            };
        });

        setPatients(merged as Attendance[]);
    };

    useEffect(() => {
        fetchPatients();
        const sub1 = supabase.channel('med-att').on('postgres_changes', { event: '*', schema: 'public', table: 'attendances' }, fetchPatients).subscribe();
        const sub2 = supabase.channel('med-items').on('postgres_changes', { event: '*', schema: 'public', table: 'prescription_items' }, fetchPatients).subscribe();
        const sub3 = supabase.channel('med-vitals').on('postgres_changes', { event: '*', schema: 'public', table: 'patient_vitals' }, fetchPatients).subscribe();
        const sub4 = supabase.channel('med-notes').on('postgres_changes', { event: '*', schema: 'public', table: 'nursing_notes' }, fetchPatients).subscribe();

        return () => {
            sub1.unsubscribe();
            sub2.unsubscribe();
            sub3.unsubscribe();
            sub4.unsubscribe();
        };
    }, []);

    const selectedPatient = patients.find(p => p.id === selectedId);

    const handleCheckItem = async (item: PrescriptionItem) => {
        if (!selectedPatient || item.checked) return; // Cannot uncheck

        const now = new Date().toISOString();

        // Optimistic UI updates
        setPatients(prev => prev.map(p => {
            if (p.id !== selectedId) return p;
            const updatedItems = (p.prescricao_estruturada || []).map(i =>
                i.id === item.id ? { ...i, checked: true, checked_at: now } : i
            );
            return { ...p, prescricao_estruturada: updatedItems };
        }));

        await supabase
            .from('prescription_items')
            .update({
                checked: true,
                checked_at: now
            })
            .eq('id', item.id);
    };

    const handleSaveVitals = async () => {
        if (!selectedId) return;

        const vitalsToInsert = [];
        const now = new Date().toISOString();

        if (vitalsForm.pa) vitalsToInsert.push({ attendance_id: selectedId, tipo: 'PA', valor: vitalsForm.pa, medido_em: now });
        if (vitalsForm.fc) vitalsToInsert.push({ attendance_id: selectedId, tipo: 'FC', valor: vitalsForm.fc, medido_em: now });
        if (vitalsForm.temp) vitalsToInsert.push({ attendance_id: selectedId, tipo: 'Temp', valor: vitalsForm.temp, medido_em: now });
        if (vitalsForm.spo2) vitalsToInsert.push({ attendance_id: selectedId, tipo: 'SpO2', valor: vitalsForm.spo2, medido_em: now });
        if (vitalsForm.fr) vitalsToInsert.push({ attendance_id: selectedId, tipo: 'FR', valor: vitalsForm.fr, medido_em: now });
        if (vitalsForm.glicemia) vitalsToInsert.push({ attendance_id: selectedId, tipo: 'HGT', valor: vitalsForm.glicemia, medido_em: now });

        if (vitalsToInsert.length === 0) return;

        const { data, error } = await supabase.from('patient_vitals').insert(vitalsToInsert).select();

        if (error) {
            console.error('Error saving vitals:', error);
            alert('Erro ao salvar sinais vitais');
        } else {
            if (data) {
                setPatients(prev => prev.map(p => {
                    if (p.id === selectedId) {
                        return {
                            ...p,
                            sinais_vitais_obs: [...(data as any[]), ...(p.sinais_vitais_obs || [])]
                        };
                    }
                    return p;
                }));
            }
            setVitalsForm({ pa: '', fc: '', temp: '', spo2: '', fr: '', glicemia: '' });
        }
    };

    const handleSaveNote = async () => {
        if (!selectedId || !newNote.trim()) return;

        const { data, error } = await supabase.from('nursing_notes').insert({
            attendance_id: selectedId,
            note: newNote.trim(),
            created_at: new Date().toISOString()
        }).select().single();

        if (error) {
            console.error('Error saving note:', error);
            alert('Erro ao salvar evolução');
        } else {
            if (data) {
                setPatients(prev => prev.map(p => {
                    if (p.id === selectedId) {
                        return {
                            ...p,
                            nursing_notes: [...(p.nursing_notes || []), data as any]
                        };
                    }
                    return p;
                }));
            }
            setNewNote('');
        }
    };

    const handleAction = async (id: string, action: 'alta' | 'reavaliacao') => {
        setLoading(true);
        try {
            const nextStatus = action === 'alta' ? 'finalizado' : 'aguardando_medico';
            await supabase.from('attendances').update({
                status: nextStatus,
                updated_at: new Date().toISOString()
            }).eq('id', id);
            setSelectedId(null);
        } finally {
            setLoading(false);
        }
    };

    const getProgress = (items: PrescriptionItem[] | null) => {
        if (!items || items.length === 0) return 0;
        const checked = items.filter(i => i.checked).length;
        return Math.round((checked / items.length) * 100);
    };

    // --- RENDER PATIENT LIST ---
    if (!selectedId) {
        return (
            <div className="p-6">
                <div className="flex items-center gap-3 mb-6">
                    <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg">
                        <Syringe className="h-6 w-6 text-white" />
                    </div>
                    <div>
                        <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tight">Posto de Enfermagem</h2>
                        <p className="text-slate-500 text-sm font-medium">Pacientes em Medicação e Observação</p>
                    </div>
                    <span className="ml-4 bg-slate-100 text-slate-600 text-xs font-black px-3 py-1 rounded-full border border-slate-200">
                        {patients.length} PACIENTES
                    </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {patients.length === 0 && (
                        <div className="col-span-full text-center p-20 border-2 border-dashed border-slate-200 rounded-3xl text-slate-400">
                            <Clock className="w-12 h-12 mx-auto mb-4 opacity-20" />
                            <p className="font-bold text-lg">Nenhum paciente na fila no momento</p>
                            <p className="text-sm">Novos encaminhamentos aparecerão aqui automaticamente.</p>
                        </div>
                    )}
                    {patients.map(p => {
                        const progress = getProgress(p.prescricao_estruturada);
                        return (
                            <div
                                key={p.id}
                                onClick={() => {
                                    setSelectedId(p.id);
                                    setActiveTab('prescricao');
                                }}
                                className={cn(
                                    "p-5 rounded-2xl border-2 cursor-pointer transition-all hover:scale-[1.02] active:scale-95 bg-white shadow-sm hover:shadow-xl",
                                    p.status === 'medicacao' ? "border-amber-100 hover:border-amber-300" : "border-blue-100 hover:border-blue-300"
                                )}
                            >
                                <div className="flex justify-between items-start mb-4">
                                    <div className="bg-slate-900 text-white text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-wider">
                                        FILA
                                    </div>
                                    <span className={cn(
                                        "text-[10px] font-black uppercase px-2 py-0.5 rounded",
                                        p.status === 'medicacao' ? "bg-amber-100 text-amber-700" : "bg-blue-100 text-blue-700"
                                    )}>
                                        {p.status === 'medicacao' ? 'Medicação Rápida' : 'Observação'}
                                    </span>
                                </div>
                                <h3 className="font-black text-xl text-slate-800 mb-1 truncate">{p.patient.nome_completo}</h3>
                                <p className="text-xs text-slate-400 font-mono mb-4">
                                    ENTRADA: {new Date(p.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </p>

                                {p.prescricao_estruturada && p.prescricao_estruturada.length > 0 ? (
                                    <div className="space-y-2">
                                        <div className="flex items-center justify-between text-[10px] font-bold">
                                            <span className="text-slate-400 uppercase">Progresso</span>
                                            <span className="text-green-600">{progress}%</span>
                                        </div>
                                        <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden border border-slate-200">
                                            <div
                                                className={cn("h-full transition-all duration-1000", progress === 100 ? "bg-green-500" : "bg-blue-500")}
                                                style={{ width: `${progress}%` }}
                                            />
                                        </div>
                                    </div>
                                ) : (
                                    <div className="text-[10px] font-bold text-amber-600 bg-amber-50 p-2 rounded flex items-center gap-2">
                                        <AlertTriangle className="w-3 h-3" />
                                        PRESCRIÇÃO TEXTUAL
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    }

    // --- RENDER FULL SCREEN DETAILS ---
    if (!selectedPatient) return null;

    return (
        <div className="h-screen bg-slate-50 flex flex-col fixed inset-0 z-50 overflow-hidden">
            {/* Header / Patient Bar */}
            <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between shadow-xl shrink-0">
                <div className="flex items-center gap-4">
                    <button
                        onClick={() => setSelectedId(null)}
                        className="p-3 bg-white/10 hover:bg-white/20 rounded-xl transition-colors"
                    >
                        <ArrowLeft className="w-5 h-5 text-white" />
                    </button>
                    <div>
                        <h1 className="text-2xl font-black text-white leading-tight uppercase tracking-tight">
                            {selectedPatient.patient.nome_completo}
                        </h1>
                        <div className="flex gap-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
                            <span className="bg-blue-600 text-white px-1 rounded">LEITO --</span>
                            <span>CPF: {selectedPatient.patient.cpf}</span>
                            <span>•</span>
                            <span>{new Date(selectedPatient.created_at).toLocaleDateString()} {new Date(selectedPatient.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <Button
                        variant="ghost"
                        className="text-orange-400 hover:text-orange-300 hover:bg-white/5 font-black text-xs uppercase"
                        onClick={() => handleAction(selectedPatient.id, 'reavaliacao')}
                        disabled={loading}
                    >
                        <RotateCcw className="w-4 h-4 mr-2" />
                        Reavaliação Médica
                    </Button>

                </div>
            </div>

            {/* TAB NAVIGATION */}
            <div className="bg-white border-b border-slate-200 px-6 flex gap-12 shrink-0 shadow-sm relative z-10">
                {[
                    { id: 'prescricao', label: 'Prescrição', icon: Pill },
                    { id: 'vitals', label: 'Sinais Vitais & Triagem', icon: HeartPulse },
                    { id: 'evolucao', label: 'Evolução / Notas', icon: FileText },
                ].map((tab) => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id as TabType)}
                        className={cn(
                            "py-5 text-[11px] font-black uppercase tracking-[0.2em] border-b-4 transition-all flex items-center gap-3",
                            activeTab === tab.id
                                ? "border-blue-600 text-blue-600"
                                : "border-transparent text-slate-400 hover:text-slate-600"
                        )}
                    >
                        <tab.icon className={cn("w-4 h-4", activeTab === tab.id ? "text-blue-600" : "text-slate-300")} />
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* MAIN CONTENT AREA */}
            <div className="flex-1 overflow-y-auto bg-slate-50">
                <div className="max-w-[98%] mx-auto p-8 space-y-8">

                    {activeTab === 'prescricao' && (
                        <div className="space-y-6">
                            <div className="flex items-center justify-between px-2">
                                <div>
                                    <h2 className="text-xl font-black text-slate-800 uppercase tracking-tight flex items-center gap-3">
                                        <div className="w-2 h-8 bg-blue-600 rounded-full" />
                                        Execução de Prescrição
                                    </h2>
                                    <p className="text-slate-400 text-sm font-medium ml-5">Checklist de administração de medicamentos</p>
                                </div>
                                <div className="text-[10px] font-black bg-blue-50 text-blue-600 px-4 py-2 rounded-xl border border-blue-100 uppercase tracking-widest">
                                    Modo Beira-Leito Ativo
                                </div>
                            </div>

                            {selectedPatient.prescricao_estruturada && selectedPatient.prescricao_estruturada.length > 0 ? (
                                <div className="grid gap-3">
                                    {selectedPatient.prescricao_estruturada.map((item, index) => (
                                        <div
                                            key={item.id}
                                            className={cn(
                                                "group flex flex-col py-3 px-5 rounded-xl border transition-all select-none bg-white",
                                                item.checked
                                                    ? "border-black shadow-none cursor-default"
                                                    : "border-black cursor-pointer shadow-sm hover:border-blue-600"
                                            )}
                                            onClick={() => !item.checked && handleCheckItem(item)}
                                        >
                                            {/* LINHA PRINCIPAL: BRUTALIST ALIGNMENT */}
                                            <div className="grid grid-cols-12 items-center w-full gap-4">
                                                {/* MEDICAMENTO (ESQUERDA) */}
                                                <div className="col-span-12 sm:col-span-5 flex items-center gap-3">
                                                    <div className="text-[14px] font-bold uppercase tracking-tight text-black">
                                                        {index + 1}. {item.medicamento}
                                                    </div>
                                                </div>

                                                {/* VIA (CENTRO) */}
                                                <div className="hidden sm:flex col-span-2 items-center justify-center gap-1.5 px-4 h-full border-x border-black">
                                                    <span className="text-[9px] font-black text-black uppercase tracking-tighter">VIA:</span>
                                                    <span className="text-[12px] font-black text-black uppercase italic">
                                                        {item.via || '---'}
                                                    </span>
                                                </div>

                                                {/* DOSE (DIREITA) */}
                                                <div className="col-span-6 sm:col-span-3 flex items-center justify-end gap-1.5 pr-6">
                                                    <span className="text-[10px] font-black text-black uppercase tracking-tighter">DOSE:</span>
                                                    <span className="text-[12px] font-black text-black uppercase">
                                                        {item.quantidade || '--'}
                                                    </span>
                                                </div>

                                                {/* CHECK + HORÁRIO (EXTREMA DIREITA) */}
                                                <div className="col-span-6 sm:col-span-2 flex items-center justify-end gap-4 shrink-0">
                                                    {item.checked && (
                                                        <div className="flex flex-col items-end">
                                                            <span className="text-[8px] font-black text-green-600 uppercase tracking-tighter">ADMINISTRADO</span>
                                                            <span className="text-[12px] font-black text-green-700 leading-none tabular-nums">
                                                                {new Date(item.checked_at!).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                            </span>
                                                        </div>
                                                    )}
                                                    <div className={cn(
                                                        "w-10 h-10 rounded-full flex items-center justify-center transition-all border-2",
                                                        item.checked
                                                            ? "bg-green-500 border-green-600 text-white shadow-lg"
                                                            : "bg-white border-black text-white group-hover:border-blue-600 group-hover:bg-blue-50"
                                                    )}>
                                                        {item.checked ? (
                                                            <CheckCircle className="w-6 h-6" />
                                                        ) : (
                                                            <CheckCircle className="w-6 h-6 text-black/10 group-hover:text-blue-600" />
                                                        )}
                                                    </div>
                                                </div>
                                            </div>

                                            {/* DETALHES (COMPOSIÇÃO E INSTRUÇÃO) */}
                                            {(item.diluicao || (item.composicao && (item.composicao as any[]).length > 0) || item.posologia) && (
                                                <div className="mt-2 space-y-2 border-t border-black pt-2">
                                                    {/* Lista de Componentes Estilo Relatório */}
                                                    {item.composicao && (item.composicao as any[]).length > 0 && (
                                                        <div className="flex flex-col gap-1 w-full">
                                                            <div className="text-[10px] font-black text-black uppercase mb-1 tracking-tight pl-2">Composição:</div>
                                                            {(item.composicao as any[]).map((comp, cIdx) => (
                                                                <div key={comp.id || cIdx} className="grid grid-cols-12 gap-4 w-full text-[11px] items-center">
                                                                    <div className="col-span-12 sm:col-span-10 flex items-center pr-6 pl-2">
                                                                        <Plus className="w-3 h-3 text-black shrink-0 mr-2" />
                                                                        <span className="text-black uppercase font-bold shrink-0">{comp.medicamento}</span>
                                                                        <div className="flex-1 border-b border-dotted border-black mx-2 mb-1 opacity-50" />
                                                                        <span className="text-black font-black shrink-0 uppercase">{comp.quantidade}</span>
                                                                    </div>
                                                                    <div className="hidden sm:block col-span-2" />
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}

                                                    <div className="flex items-center gap-8">
                                                        {/* Diluição */}
                                                        {item.diluicao && (
                                                            <div className="text-[11px] text-black font-black uppercase italic flex items-center gap-2">
                                                                <Wind className="w-4 h-4 text-black" />
                                                                {item.diluicao}
                                                            </div>
                                                        )}

                                                        {/* Instrução */}
                                                        {item.posologia && (
                                                            <div className="text-[12px] font-black text-black underline decoration-2 underline-offset-4">
                                                                {item.posologia}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    ))}

                                    {/* ORIENTAÇÕES MÉDICAS (Abaixo da lista, discreto) */}
                                    {selectedPatient.orientacoes_medicas && (
                                        <div className="mt-4 p-4 border border-slate-200 rounded-2xl bg-white shadow-sm font-medium text-slate-700 text-sm leading-relaxed italic">
                                            {selectedPatient.orientacoes_medicas}
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className="bg-white border-2 border-slate-100 rounded-[40px] p-16 text-center space-y-4 shadow-xl shadow-slate-200/50">
                                    <div className="bg-slate-50 w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-6">
                                        <FileText className="w-12 h-12 text-slate-200" />
                                    </div>
                                    <div className="max-w-lg mx-auto">
                                        <h4 className="text-2xl font-black text-slate-800 uppercase tracking-tight">Prescrição Livre</h4>
                                        <p className="text-slate-400 text-sm mt-2 mb-8 font-medium">Instruções médicas não estruturadas:</p>
                                        <div className="bg-slate-900 border-2 border-slate-800 rounded-3xl p-8 font-mono text-left whitespace-pre-wrap text-blue-100 leading-relaxed text-sm shadow-2xl">
                                            {selectedPatient.prescricao || 'Em branco.'}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {activeTab === 'vitals' && (
                        <div className="space-y-6">
                            {/* HEADER DE TRIAGEM DISCRETO */}
                            <div className="bg-white border border-slate-200 rounded-2xl p-4 flex items-center justify-between shadow-sm">
                                <div className="flex items-center gap-8">
                                    <div className="flex flex-col">
                                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Queixa Principal</span>
                                        <span className="text-sm font-bold text-slate-800 italic">"{selectedPatient.queixa_principal || '---'}"</span>
                                    </div>
                                    <div className="h-8 w-px bg-slate-100" />
                                    <div className="flex items-center gap-2">
                                        <Activity className="w-4 h-4 text-blue-500" />
                                        <div>
                                            <span className="text-[8px] font-black text-slate-400 uppercase block leading-none mb-1">PA Entrada</span>
                                            <span className="text-sm font-black text-slate-700">{selectedPatient.sinais_vitais?.pa || '--'}</span>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Thermometer className="w-4 h-4 text-orange-500" />
                                        <div>
                                            <span className="text-[8px] font-black text-slate-400 uppercase block leading-none mb-1">Temp</span>
                                            <span className="text-sm font-black text-slate-700">{selectedPatient.sinais_vitais?.temp || '--'}°C</span>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Droplet className="w-4 h-4 text-cyan-500" />
                                        <div>
                                            <span className="text-[8px] font-black text-slate-400 uppercase block leading-none mb-1">Sat</span>
                                            <span className="text-sm font-black text-slate-700">{selectedPatient.sinais_vitais?.spo2 || '--'}%</span>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <HeartPulse className="w-4 h-4 text-red-500" />
                                        <div>
                                            <span className="text-[8px] font-black text-slate-400 uppercase block leading-none mb-1">FC</span>
                                            <span className="text-sm font-black text-slate-700">{selectedPatient.sinais_vitais?.fc || '--'}</span>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Wind className="w-4 h-4 text-slate-400" />
                                        <div>
                                            <span className="text-[8px] font-black text-slate-400 uppercase block leading-none mb-1">FR</span>
                                            <span className="text-sm font-black text-slate-700">{selectedPatient.sinais_vitais?.fr || '--'}</span>
                                        </div>
                                    </div>
                                    {selectedPatient.sinais_vitais?.hgt && (
                                        <div className="flex items-center gap-2">
                                            <Activity className="w-4 h-4 text-emerald-500" />
                                            <div>
                                                <span className="text-[8px] font-black text-slate-400 uppercase block leading-none mb-1">HGT</span>
                                                <span className="text-sm font-black text-slate-700">{selectedPatient.sinais_vitais.hgt}</span>
                                            </div>
                                        </div>
                                    )}
                                    <div className="flex items-center gap-2">
                                        <div className={cn("w-2 h-2 rounded-full",
                                            selectedPatient.classificacao_risco === 'VERMELHO' ? "bg-red-500" :
                                                selectedPatient.classificacao_risco === 'AMARELO' ? "bg-yellow-400" : "bg-green-500")
                                        } />
                                        <div>
                                            <span className="text-[8px] font-black text-slate-400 uppercase block leading-none mb-1">Risco</span>
                                            <span className="text-xs font-black text-slate-700 uppercase">{selectedPatient.classificacao_risco || 'VERDE'}</span>
                                        </div>
                                    </div>
                                </div>

                                <Button
                                    onClick={() => setIsVitalsPanelOpen(true)}
                                    className="bg-black hover:bg-slate-800 text-white font-black uppercase text-[11px] px-6 rounded-xl shadow-lg ring-4 ring-black/5"
                                >
                                    <Plus className="w-4 h-4 mr-2" />
                                    Registrar Sinais
                                </Button>
                            </div>

                            {/* TABELA DE HISTÓRICO LIMPA */}
                            <div className="bg-white border border-slate-200 rounded-[32px] overflow-hidden shadow-sm">
                                <div className="px-8 py-6 border-b border-slate-100 flex items-center justify-between">
                                    <h3 className="text-xs font-black uppercase tracking-[0.3em] text-slate-400 flex items-center gap-2">
                                        <Clock className="w-4 h-4" />
                                        Histórico de Aferições
                                    </h3>
                                </div>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left border-collapse">
                                        <thead>
                                            <tr className="bg-slate-50/50">
                                                <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">Horário</th>
                                                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 text-center">PA (mmHg)</th>
                                                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 text-center">Temp (°C)</th>
                                                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 text-center">FC (bpm)</th>
                                                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 text-center">SpO2 (%)</th>
                                                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 text-center">FR (rpm)</th>
                                                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 text-center">HGT (mg/dl)</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {(() => {
                                                const grouped = selectedPatient.sinais_vitais_obs?.reduce((acc: any, curr) => {
                                                    const time = curr.medido_em;
                                                    if (!acc[time]) acc[time] = { time, values: {} };
                                                    acc[time].values[curr.tipo] = curr.valor;
                                                    return acc;
                                                }, {});
                                                const history = grouped ? Object.values(grouped).sort((a: any, b: any) => new Date(b.time).getTime() - new Date(a.time).getTime()) : [];

                                                if (history.length === 0) {
                                                    return (
                                                        <tr>
                                                            <td colSpan={7} className="px-8 py-20 text-center">
                                                                <div className="flex flex-col items-center gap-3">
                                                                    <div className="w-12 h-12 bg-slate-50 rounded-full flex items-center justify-center">
                                                                        <Activity className="w-6 h-6 text-slate-200" />
                                                                    </div>
                                                                    <p className="text-xs font-black text-slate-300 uppercase tracking-widest">Nenhum registro encontrado</p>
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    );
                                                }

                                                return history.map((entry: any, idx) => (
                                                    <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                                                        <td className="px-8 py-5 border-b border-slate-100">
                                                            <div className="flex flex-col">
                                                                <span className="font-black text-slate-800 tabular-nums">
                                                                    {new Date(entry.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                                </span>
                                                                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">
                                                                    {new Date(entry.time).toLocaleDateString()}
                                                                </span>
                                                            </div>
                                                        </td>
                                                        {[
                                                            { key: 'PA' },
                                                            { key: 'Temp' },
                                                            { key: 'FC' },
                                                            { key: 'SpO2' },
                                                            { key: 'FR' },
                                                            { key: 'HGT' }
                                                        ].map(col => (
                                                            <td key={col.key} className="px-6 py-5 border-b border-slate-100 text-center">
                                                                <span className={cn("font-black text-sm tabular-nums",
                                                                    entry.values[col.key] ? "text-slate-900" : "text-slate-200"
                                                                )}>
                                                                    {entry.values[col.key] || '---'}
                                                                </span>
                                                            </td>
                                                        ))}
                                                    </tr>
                                                ));
                                            })()}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            {/* SLIDE-OVER PANEL (REGISTRO) */}
                            {isVitalsPanelOpen && (
                                <div className="fixed inset-0 z-[100] flex justify-end">
                                    <div
                                        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity"
                                        onClick={() => setIsVitalsPanelOpen(false)}
                                    />
                                    <div className="relative w-full max-w-md bg-white h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
                                        <div className="p-8 border-b border-slate-100 flex items-center justify-between shrink-0">
                                            <div>
                                                <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight">Novo Registro</h3>
                                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Aferição de Sinais Vitais</p>
                                            </div>
                                            <button
                                                onClick={() => setIsVitalsPanelOpen(false)}
                                                className="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all"
                                            >
                                                <X className="w-5 h-5" />
                                            </button>
                                        </div>

                                        <div className="flex-1 overflow-y-auto p-8 space-y-8">
                                            {[
                                                { id: 'pa', label: 'Pressão Arterial (mmHg)', placeholder: '120/80', icon: Activity },
                                                { id: 'temp', label: 'Temperatura (°C)', placeholder: '36.5', icon: Thermometer },
                                                { id: 'fc', label: 'Freq. Cardíaca (bpm)', placeholder: '80', icon: HeartPulse },
                                                { id: 'spo2', label: 'Saturação (SpO2 %)', placeholder: '98', icon: Droplet },
                                                { id: 'fr', label: 'Freq. Respiratória (rpm)', placeholder: '18', icon: Wind },
                                                { id: 'glicemia', label: 'HGT (mg/dl)', placeholder: '90', icon: Activity },
                                            ].map((field) => (
                                                <div key={field.id} className="space-y-3">
                                                    <Label className="text-[10px] font-black uppercase text-black tracking-widest ml-1">{field.label}</Label>
                                                    <div className="relative group">
                                                        <field.icon className="absolute left-4 top-[14px] w-5 h-5 text-slate-300 group-focus-within:text-black transition-colors" />
                                                        <Input
                                                            autoFocus={field.id === 'pa'}
                                                            className="pl-12 h-14 rounded-2xl border-2 border-slate-100 bg-slate-50 focus:bg-white focus:border-black focus:ring-0 transition-all font-black text-lg text-slate-900"
                                                            placeholder={field.placeholder}
                                                            value={(vitalsForm as any)[field.id]}
                                                            onChange={e => setVitalsForm({ ...vitalsForm, [field.id]: e.target.value })}
                                                        />
                                                    </div>
                                                </div>
                                            ))}
                                        </div>

                                        <div className="p-8 border-t border-slate-100 bg-slate-50/50 shrink-0">
                                            <Button
                                                className="w-full bg-black hover:bg-slate-800 text-white font-black uppercase py-8 rounded-3xl shadow-xl transition-all active:scale-[0.98] text-lg"
                                                onClick={async () => {
                                                    await handleSaveVitals();
                                                    setIsVitalsPanelOpen(false);
                                                }}
                                            >
                                                Registrar Agora
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )
                    }

                    {activeTab === 'evolucao' && (
                        <div className="space-y-6">
                            {/* HEADER DE AÇÃO DISCRETO */}
                            <div className="bg-white border border-slate-200 rounded-2xl p-4 flex items-center justify-between shadow-sm">
                                <div className="flex items-center gap-6">
                                    <div className="flex flex-col">
                                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Ações da Evolução</span>
                                        <div className="flex items-center gap-2">
                                            <FileText className="w-4 h-4 text-blue-600" />
                                            <span className="text-sm font-black text-slate-800 uppercase tracking-tight">Registro de Evolução Diária</span>
                                        </div>
                                    </div>
                                </div>
                                <Button
                                    onClick={() => setIsNotePanelOpen(true)}
                                    className="bg-black hover:bg-slate-800 text-white font-black uppercase text-[11px] px-6 rounded-xl shadow-lg ring-4 ring-black/5"
                                >
                                    <Plus className="w-4 h-4 mr-2" />
                                    Nova Evolução
                                </Button>
                            </div>

                            {/* TIMELINE EM CARD FULL WIDTH */}
                            <div className="bg-white border border-slate-200 rounded-[32px] overflow-hidden shadow-sm p-10">
                                <div className="flex items-center gap-2 mb-10">
                                    <Clock className="w-5 h-5 text-slate-400" />
                                    <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-widest">
                                        Linha do Tempo Assistencial
                                    </h3>
                                </div>

                                <div className="relative pl-10 space-y-12 before:absolute before:inset-0 before:ml-[1.15rem] before:-translate-x-px before:h-full before:w-1 before:bg-gradient-to-b before:from-slate-200 before:via-slate-100 before:to-transparent">

                                    {/* CONTEXTO DA TRIAGEM */}
                                    <div className="relative">
                                        <div className="absolute -left-10 top-0 w-10 h-10 bg-orange-500 rounded-2xl flex items-center justify-center z-10 shadow-lg shadow-orange-200 border-4 border-white">
                                            <AlertTriangle className="w-5 h-5 text-white" />
                                        </div>
                                        <div className="bg-white p-6 rounded-[32px] border-2 border-orange-50 shadow-sm transition-all hover:border-orange-200">
                                            <div className="flex justify-between items-center mb-4">
                                                <div className="flex items-center gap-2">
                                                    <span className="w-2 h-2 bg-orange-500 rounded-full animate-pulse" />
                                                    <span className="text-[10px] font-black uppercase text-orange-500 tracking-widest">Triagem / Entrada Unidade</span>
                                                </div>
                                                <span className="text-xs font-black text-slate-400 font-mono tracking-tighter">{new Date(selectedPatient.created_at).toLocaleDateString()} - {new Date(selectedPatient.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                            </div>
                                            <div className="space-y-4">
                                                <div className="text-slate-700 font-bold text-lg italic leading-tight">
                                                    "{selectedPatient.queixa_principal || 'Não informada'}"
                                                </div>
                                                {(selectedPatient.historico_clinico || selectedPatient.discriminador) && (
                                                    <div className="text-[13px] text-slate-500 bg-slate-50 p-4 rounded-2xl border border-slate-100 leading-relaxed">
                                                        {selectedPatient.discriminador && <span className="font-black text-blue-600 mr-2 uppercase block mb-1 text-[10px] tracking-widest">Discriminador: {selectedPatient.discriminador}</span>}
                                                        {selectedPatient.historico_clinico}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    {/* CONTEXTO MÉDICO (SE EXISTIR) */}
                                    {(selectedPatient.anamnese || selectedPatient.exame_fisico) && (
                                        <div className="relative">
                                            <div className="absolute -left-10 top-0 w-10 h-10 bg-slate-900 rounded-2xl flex items-center justify-center z-10 shadow-lg shadow-slate-200 border-4 border-white">
                                                <User className="w-5 h-5 text-white" />
                                            </div>
                                            <div className="bg-white p-8 rounded-[32px] border-2 border-slate-50 shadow-sm transition-all hover:border-slate-200">
                                                <div className="flex justify-between items-center mb-6">
                                                    <div className="flex items-center gap-2">
                                                        <span className="w-2 h-2 bg-slate-900 rounded-full" />
                                                        <span className="text-[10px] font-black uppercase text-slate-900 tracking-widest">Avaliação Médica Inicial</span>
                                                    </div>
                                                </div>
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                                    {selectedPatient.anamnese && (
                                                        <div className="bg-slate-50/50 p-6 rounded-2xl border border-slate-100">
                                                            <span className="text-[10px] font-black text-slate-400 uppercase block mb-3 tracking-widest">Anamnese</span>
                                                            <p className="text-slate-600 text-[13px] leading-relaxed line-clamp-4">{selectedPatient.anamnese}</p>
                                                        </div>
                                                    )}
                                                    {selectedPatient.exame_fisico && (
                                                        <div className="bg-slate-50/50 p-6 rounded-2xl border border-slate-100">
                                                            <span className="text-[10px] font-black text-slate-400 uppercase block mb-3 tracking-widest">Exame Físico</span>
                                                            <p className="text-slate-600 text-[13px] leading-relaxed line-clamp-4">{selectedPatient.exame_fisico}</p>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {/* NOTAS DE ENFERMAGEM */}
                                    {selectedPatient.nursing_notes && selectedPatient.nursing_notes.length > 0 ? (
                                        selectedPatient.nursing_notes.map((note) => (
                                            <div key={note.id} className="relative">
                                                <div className="absolute -left-10 top-0 w-10 h-10 bg-blue-600 rounded-2xl flex items-center justify-center z-10 shadow-lg shadow-blue-200 border-4 border-white">
                                                    <Clock className="w-5 h-5 text-white" />
                                                </div>
                                                <div className="bg-white p-8 rounded-[40px] border-2 border-white shadow-xl shadow-slate-200/50 hover:border-blue-200 transition-all group">
                                                    <div className="flex justify-between items-start mb-6">
                                                        <div className="flex flex-col">
                                                            <span className="text-[10px] font-black uppercase text-blue-500 tracking-[0.2em] mb-1 italic">Posto de Enfermagem</span>
                                                            <div className="flex items-center gap-3">
                                                                <div className="w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center font-black text-[10px] text-slate-400 group-hover:bg-blue-600 group-hover:text-white transition-all">EN</div>
                                                                <span className="font-black text-slate-800 uppercase tracking-tight text-sm">Evolução de Observação</span>
                                                            </div>
                                                        </div>
                                                        <div className="text-right">
                                                            <span className="text-lg font-black text-slate-800 leading-none block font-mono">
                                                                {new Date(note.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                            </span>
                                                            <span className="text-[9px] font-black text-slate-400 block uppercase tracking-widest mt-1">
                                                                {new Date(note.created_at).toLocaleDateString()}
                                                            </span>
                                                        </div>
                                                    </div>
                                                    <div className="text-slate-600 font-bold text-md leading-relaxed whitespace-pre-wrap border-l-4 border-slate-100 pl-6 group-hover:border-blue-500 transition-all">
                                                        {note.note}
                                                    </div>
                                                </div>
                                            </div>
                                        ))
                                    ) : (
                                        <div className="text-center py-24 bg-slate-50/50 rounded-[40px] border-4 border-dashed border-slate-100">
                                            <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mx-auto mb-4 shadow-sm">
                                                <FileText className="w-6 h-6 text-slate-200" />
                                            </div>
                                            <p className="font-black text-slate-300 uppercase text-[10px] tracking-[0.4em]">Diário Assistencial Vazio</p>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* SLIDE-OVER PARA NOVA EVOLUÇÃO */}
                            {isNotePanelOpen && (
                                <div className="fixed inset-0 z-[100] flex justify-end">
                                    <div
                                        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity"
                                        onClick={() => setIsNotePanelOpen(false)}
                                    />
                                    <div className="relative w-full max-w-xl bg-white h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
                                        <div className="p-8 border-b border-slate-100 flex items-center justify-between shrink-0">
                                            <div>
                                                <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight">Nova Evolução</h3>
                                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Registro Beira-Leito / Observação</p>
                                            </div>
                                            <button
                                                onClick={() => setIsNotePanelOpen(false)}
                                                className="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all"
                                            >
                                                <X className="w-5 h-5" />
                                            </button>
                                        </div>

                                        <div className="flex-1 p-8">
                                            <textarea
                                                autoFocus
                                                className="w-full h-full rounded-[32px] border-2 border-slate-100 bg-slate-50 focus:bg-white focus:border-blue-600 focus:ring-0 transition-all p-8 text-slate-800 font-bold placeholder:text-slate-300 resize-none text-xl"
                                                placeholder="Descreva o quadro clínico, intercorrências ou cuidados realizados..."
                                                value={newNote}
                                                onChange={(e) => setNewNote(e.target.value)}
                                            />
                                        </div>

                                        <div className="p-8 border-t border-slate-100 bg-slate-50/50">
                                            <Button
                                                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-black uppercase py-8 rounded-3xl shadow-xl transition-all active:scale-[0.98] text-lg"
                                                onClick={async () => {
                                                    await handleSaveNote();
                                                    setIsNotePanelOpen(false);
                                                }}
                                                disabled={!newNote.trim()}
                                            >
                                                Publicar no Prontuário
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )
                    }

                </div >
            </div >
        </div >
    );
}
