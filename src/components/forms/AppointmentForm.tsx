'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Search, Clock, User, FileText, X, Calendar, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';

interface Patient {
    id: string;
    nome_completo: string;
    cpf: string;
    telefone?: string;
}

interface EventType {
    id: string;
    title: string;
    duration: number;
    description: string;
}

interface AppointmentFormProps {
    onSuccess: () => void;
    onCancel: () => void;
    initialDate?: string;
    initialTime?: string;
}

export function AppointmentForm({ onSuccess, onCancel, initialDate, initialTime }: AppointmentFormProps) {
    const [loading, setLoading] = useState(false);
    const [search, setSearch] = useState('');
    const [patients, setPatients] = useState<Patient[]>([]);
    const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
    const [isNewPatient, setIsNewPatient] = useState(false);
    const [newPatientData, setNewPatientData] = useState({ nome_completo: '', cpf: '', telefone: '', data_nascimento: '' });

    const maskPhone = (value: string) => {
        const numbers = value.replace(/\D/g, '');
        if (numbers.length <= 10) {
            return numbers
                .replace(/^(\d{2})(\d)/g, '($1) $2')
                .replace(/(\d{4})(\d)/, '$1-$2')
                .substring(0, 14);
        } else {
            return numbers
                .replace(/^(\d{2})(\d)/g, '($1) $2')
                .replace(/(\d{5})(\d)/, '$1-$2')
                .substring(0, 15);
        }
    };
    const [date, setDate] = useState(initialDate || new Date().toISOString().split('T')[0]);
    const [time, setTime] = useState(initialTime || '08:00');
    const [reason, setReason] = useState('');
    const [eventTypes, setEventTypes] = useState<EventType[]>([]);
    const [selectedEventType, setSelectedEventType] = useState<EventType | null>(null);
    const [duration, setDuration] = useState(30);
    const [clinicId, setClinicId] = useState<string | null>(null);

    useEffect(() => {
        if (initialDate) setDate(initialDate);
        if (initialTime) setTime(initialTime);
    }, [initialDate, initialTime]);

    useEffect(() => {
        const fetchInitialData = async () => {
            // Fetch Clinic (Default)
            const { data: clinicData } = await supabase
                .from('clinics')
                .select('id')
                .limit(1)
                .single();
            if (clinicData) setClinicId(clinicData.id);

            // Fetch Event Types
            const { data: etData } = await supabase
                .from('event_types')
                .select('*')
                .eq('active', true)
                .order('title');
            setEventTypes(etData || []);
        };
        fetchInitialData();
    }, []);

    useEffect(() => {
        if (selectedEventType) {
            setDuration(selectedEventType.duration);
        }
    }, [selectedEventType]);

    useEffect(() => {
        if (search.length > 2) {
            const fetchPatients = async () => {
                const { data } = await supabase
                    .from('patients')
                    .select('id, nome_completo, cpf')
                    .ilike('nome_completo', `%${search}%`)
                    .limit(5);
                setPatients(data || []);
            };
            fetchPatients();
        } else {
            setPatients([]);
        }
    }, [search]);

    const handleCreatePatient = async () => {
        if (!newPatientData.nome_completo || !newPatientData.cpf || !newPatientData.telefone || !newPatientData.data_nascimento) {
            toast.error('Preencha Nome, CPF, Telefone e Data de Nascimento.');
            return null;
        }

        const { data, error } = await supabase
            .from('patients')
            .insert([{
                nome_completo: newPatientData.nome_completo.toUpperCase(),
                cpf: newPatientData.cpf,
                telefone: newPatientData.telefone,
                data_nascimento: newPatientData.data_nascimento
            }])
            .select()
            .single();

        if (error) {
            toast.error('Erro ao cadastrar paciente: ' + error.message);
            return null;
        }

        return data;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        let patientId = selectedPatient?.id;

        if (isNewPatient) {
            setLoading(true);
            const newPatient = await handleCreatePatient();
            if (!newPatient) {
                setLoading(false);
                return;
            }
            patientId = newPatient.id;
        }

        if (!patientId) {
            toast.error('Selecione ou cadastre um paciente.');
            return;
        }

        setLoading(true);

        const startTimeStr = `${date}T${time}:00`;
        const startTime = new Date(startTimeStr);
        const finalDuration = selectedEventType?.duration || 30;
        const endTime = new Date(startTime.getTime() + finalDuration * 60000);

        // Lead Time Validation (2h)
        const now = new Date();
        const minNotice = new Date(now.getTime() + 2 * 60 * 60 * 1000); // 2 hours

        if (startTime < minNotice) {
            toast.error('Agendamento deve ser feito com no mínimo 2h de antecedência.');
            setLoading(false);
            return;
        }

        // Capture Ads Tracking/UTMs from URL
        const trackingParams: any = {};
        if (typeof window !== 'undefined') {
            const urlParams = new URLSearchParams(window.location.search);
            const paramsToCapture = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'fbclid', 'gclid', 'msclkid'];
            paramsToCapture.forEach(param => {
                const value = urlParams.get(param);
                if (value) trackingParams[param] = value;
            });
        }

        const { error } = await supabase
            .from('appointments')
            .insert([{
                clinic_id: clinicId,
                patient_id: patientId,
                event_type_id: selectedEventType?.id,
                start_time: startTime.toISOString(),
                end_time: endTime.toISOString(),
                reason: reason || selectedEventType?.title || 'Consulta',
                status: 'scheduled',
                source: 'manual',
                timezone: 'America/Sao_Paulo',
                metadata: {
                    source: 'manual_ui',
                    created_at: new Date().toISOString(),
                    tracking: trackingParams
                }
            }]);

        setLoading(false);
        if (error) {
            toast.error('Erro ao agendar: ' + error.message);
        } else {
            toast.success('Agendamento realizado com sucesso!');
            onSuccess();
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex justify-end overflow-hidden">
            {/* Overlay */}
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 bg-slate-900/10 backdrop-blur-[2px]"
                onClick={onCancel}
            />

            {/* Drawer Content */}
            <motion.div
                initial={{ x: '100%' }}
                animate={{ x: 0 }}
                exit={{ x: '100%' }}
                transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                className="relative w-full max-w-md bg-white h-full shadow-[-20px_0_50px_-20px_rgba(0,0,0,0.1)] overflow-hidden flex flex-col"
            >
                {/* Header */}
                <div className="p-8 border-b border-slate-50 flex items-center justify-between bg-white sticky top-0 z-10">
                    <div>
                        <h2 className="text-2xl font-black text-slate-900 tracking-tight">Agendar Consulta</h2>
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mt-1">SaaS Starter - Sav Plus</p>
                    </div>
                    <button
                        onClick={onCancel}
                        className="w-12 h-12 flex items-center justify-center bg-slate-50 rounded-2xl text-slate-400 hover:text-slate-900 hover:bg-slate-100 transition-all active:scale-95"
                    >
                        <X className="w-6 h-6" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-8 space-y-10 custom-scrollbar">
                    <form onSubmit={handleSubmit} className="space-y-8">
                        {/* IDENTIFICAÇÃO */}
                        <div className="space-y-4">
                            <Label className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400 ml-1 flex items-center gap-2">
                                <User className="w-3.5 h-3.5" />
                                Paciente
                            </Label>

                            <AnimatePresence mode="wait">
                                {selectedPatient || isNewPatient ? (
                                    <motion.div
                                        key={selectedPatient?.id || 'new'}
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, scale: 0.95 }}
                                        className={cn(
                                            "p-6 rounded-[32px] group transition-all relative overflow-hidden",
                                            isNewPatient ? "bg-emerald-900 shadow-xl shadow-emerald-100" : "bg-slate-900 shadow-xl shadow-slate-100"
                                        )}
                                    >
                                        <div className="relative z-10 flex items-center justify-between">
                                            <div className="flex items-center gap-4">
                                                <div className="w-14 h-14 bg-white/10 rounded-2xl flex items-center justify-center text-white font-black text-xl">
                                                    {isNewPatient ? '+' : selectedPatient?.nome_completo[0]}
                                                </div>
                                                <div>
                                                    <div className="font-black text-white uppercase text-base tracking-tight leading-tight">
                                                        {isNewPatient ? 'Novo Paciente' : selectedPatient?.nome_completo}
                                                    </div>
                                                    <div className="text-[11px] text-white/50 font-mono mt-1 font-bold italic">
                                                        {isNewPatient ? 'Cadastro rápido ativo' : `CPF: ${selectedPatient?.cpf}`}
                                                    </div>
                                                </div>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setSelectedPatient(null);
                                                    setIsNewPatient(false);
                                                }}
                                                className="w-10 h-10 flex items-center justify-center bg-white/10 hover:bg-white/20 text-white rounded-xl transition-all"
                                            >
                                                <X className="w-5 h-5" />
                                            </button>
                                        </div>
                                        <div className="absolute -right-8 -bottom-8 w-32 h-32 bg-white/5 rounded-full blur-3xl" />
                                    </motion.div>
                                ) : (
                                    <motion.div
                                        key="search"
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        className="relative group"
                                    >
                                        <div className="absolute left-6 top-1/2 -translate-y-1/2">
                                            <Search className="w-4 h-4 text-slate-400 group-focus-within:text-slate-900 transition-colors" />
                                        </div>
                                        <Input
                                            placeholder="Buscar paciente pelo nome..."
                                            className="pl-14 h-18 bg-slate-50 border-transparent rounded-[24px] focus-visible:ring-slate-900/20 focus:bg-white focus:border-slate-100 font-bold text-slate-700 placeholder:text-slate-400 placeholder:font-normal transition-all duration-200"
                                            value={search}
                                            onChange={(e) => setSearch(e.target.value)}
                                        />

                                        <AnimatePresence>
                                            {(patients.length > 0 || search.length >= 3) && (
                                                <motion.div
                                                    initial={{ opacity: 0, y: 10 }}
                                                    animate={{ opacity: 1, y: 0 }}
                                                    exit={{ opacity: 0, y: 10 }}
                                                    className="absolute top-full left-0 right-0 mt-3 bg-white border border-slate-100 rounded-[32px] shadow-2xl z-[20] overflow-hidden divide-y divide-slate-50"
                                                >
                                                    {patients.map(p => (
                                                        <button
                                                            key={p.id}
                                                            type="button"
                                                            className="w-full text-left p-6 hover:bg-slate-50 transition-all flex items-center justify-between group"
                                                            onClick={() => {
                                                                setSelectedPatient(p);
                                                                setSearch('');
                                                                setPatients([]);
                                                            }}
                                                        >
                                                            <div className="flex items-center gap-4">
                                                                <div className="w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center font-black text-slate-400 group-hover:bg-slate-900 group-hover:text-white transition-all">
                                                                    {p.nome_completo[0]}
                                                                </div>
                                                                <div>
                                                                    <div className="font-black text-slate-800 uppercase text-xs tracking-tight">{p.nome_completo}</div>
                                                                    <div className="text-[10px] text-slate-400 font-mono mt-0.5">{p.cpf}</div>
                                                                </div>
                                                            </div>
                                                        </button>
                                                    ))}

                                                    {search.length >= 3 && (
                                                        <button
                                                            type="button"
                                                            className="w-full text-left p-6 bg-slate-50/50 hover:bg-emerald-50 transition-all flex items-center justify-center gap-3 border-t-2 border-dashed border-slate-100"
                                                            onClick={() => {
                                                                setIsNewPatient(true);
                                                                setNewPatientData({ ...newPatientData, nome_completo: search.toUpperCase() });
                                                                setSearch('');
                                                            }}
                                                        >
                                                            <Plus className="w-4 h-4 text-emerald-600" />
                                                            <span className="text-xs font-black uppercase tracking-widest text-emerald-700 font-outfit">Novo: "{search}"</span>
                                                        </button>
                                                    )}
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>

                        {/* Campos de Novo Paciente se ativo */}
                        <AnimatePresence>
                            {isNewPatient && (
                                <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: 'auto', opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    className="overflow-hidden space-y-6 bg-emerald-50/30 p-8 rounded-[32px] border-2 border-emerald-100/50"
                                >
                                    <div className="space-y-4">
                                        <Label className="text-[10px] font-black uppercase tracking-widest text-emerald-700 ml-1">Nome Completo</Label>
                                        <Input
                                            value={newPatientData.nome_completo}
                                            onChange={(e) => setNewPatientData({ ...newPatientData, nome_completo: e.target.value.toUpperCase() })}
                                            className="h-16 bg-white border-emerald-100 rounded-2xl font-bold uppercase"
                                        />
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-4">
                                            <Label className="text-[10px] font-black uppercase tracking-widest text-emerald-700 ml-1">CPF (Necessário)</Label>
                                            <Input
                                                placeholder="000.000.000-00"
                                                value={newPatientData.cpf}
                                                onChange={(e) => setNewPatientData({ ...newPatientData, cpf: e.target.value })}
                                                className="h-16 bg-white border-emerald-100 rounded-2xl font-bold"
                                            />
                                        </div>
                                        <div className="space-y-4">
                                            <Label className="text-[10px] font-black uppercase tracking-widest text-emerald-700 ml-1">Nascimento</Label>
                                            <Input
                                                type="date"
                                                value={newPatientData.data_nascimento}
                                                onChange={(e) => setNewPatientData({ ...newPatientData, data_nascimento: e.target.value })}
                                                className="h-16 bg-white border-emerald-100 rounded-2xl font-bold"
                                            />
                                        </div>
                                    </div>
                                    <div className="space-y-4">
                                        <Label className="text-[10px] font-black uppercase tracking-widest text-emerald-700 ml-1">Celular / WhatsApp (Obrigatório)</Label>
                                        <div className="relative group">
                                            <Input
                                                placeholder="(00) 00000-0000"
                                                value={newPatientData.telefone}
                                                onChange={(e) => setNewPatientData({ ...newPatientData, telefone: maskPhone(e.target.value) })}
                                                className="h-16 bg-white border-emerald-100 rounded-2xl font-bold focus:ring-emerald-500 focus:border-emerald-500 font-mono"
                                            />
                                            <div className="absolute right-6 top-1/2 -translate-y-1/2 opacity-20">
                                                <User className="w-5 h-5 text-emerald-900" />
                                            </div>
                                        </div>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>

                        {/* TIPO DE SERVIÇO */}
                        <div className="space-y-4">
                            <Label className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400 ml-1 flex items-center gap-2">
                                <FileText className="w-3.5 h-3.5" />
                                Tipo de Atendimento
                            </Label>
                            <div className="grid grid-cols-1 gap-3">
                                {eventTypes.map(type => (
                                    <button
                                        key={type.id}
                                        type="button"
                                        onClick={() => setSelectedEventType(type)}
                                        className={cn(
                                            "p-4 rounded-[20px] border-2 transition-all flex items-center justify-between group",
                                            selectedEventType?.id === type.id
                                                ? "border-slate-900 bg-slate-900 text-white shadow-xl shadow-slate-200"
                                                : "border-slate-50 bg-slate-50 hover:border-slate-200 text-slate-600"
                                        )}
                                    >
                                        <div className="flex items-center gap-4">
                                            <div className={cn(
                                                "w-10 h-10 rounded-xl flex items-center justify-center font-black text-xs",
                                                selectedEventType?.id === type.id ? "bg-white/10" : "bg-white shadow-sm"
                                            )}>
                                                {type.duration}'
                                            </div>
                                            <div className="text-left">
                                                <div className="font-black uppercase text-[10px] tracking-widest">{type.title}</div>
                                                <div className={cn(
                                                    "text-[9px] font-bold mt-0.5",
                                                    selectedEventType?.id === type.id ? "text-white/50" : "text-slate-400"
                                                )}>{type.description}</div>
                                            </div>
                                        </div>
                                        {selectedEventType?.id === type.id && (
                                            <div className="w-6 h-6 bg-white rounded-full flex items-center justify-center">
                                                <Plus className="w-3.5 h-3.5 text-slate-900 rotate-45" />
                                            </div>
                                        )}
                                    </button>
                                ))}

                                <button
                                    type="button"
                                    onClick={() => setSelectedEventType(null)}
                                    className={cn(
                                        "p-4 rounded-[20px] border-2 transition-all flex items-center justify-between group",
                                        !selectedEventType
                                            ? "border-slate-900 bg-slate-900 text-white shadow-xl shadow-slate-100"
                                            : "border-slate-50 bg-slate-50 hover:border-slate-200 text-slate-600"
                                    )}
                                >
                                    <div className="flex items-center gap-4">
                                        <div className={cn(
                                            "w-10 h-10 rounded-xl flex items-center justify-center font-black text-xs",
                                            !selectedEventType ? "bg-white/10" : "bg-white shadow-sm"
                                        )}>
                                            30'
                                        </div>
                                        <div className="text-left">
                                            <div className="font-black uppercase text-[10px] tracking-widest">Manual / Outros</div>
                                            <div className={cn(
                                                "text-[9px] font-bold mt-0.5",
                                                !selectedEventType ? "text-white/50" : "text-slate-400"
                                            )}>Defina o motivo manualmente</div>
                                        </div>
                                    </div>
                                </button>
                            </div>
                        </div>

                        {/* DATA E HORA */}
                        <div className="grid grid-cols-1 gap-6">
                            <div className="space-y-4">
                                <Label className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400 ml-1 flex items-center gap-2">
                                    <Calendar className="w-3.5 h-3.5" />
                                    Data da Agendamento
                                </Label>
                                <Input
                                    type="date"
                                    className="h-18 bg-slate-50 border-transparent rounded-[24px] px-6 font-bold text-slate-700 focus:bg-white focus:border-slate-100 transition-all font-outfit"
                                    value={date}
                                    onChange={(e) => setDate(e.target.value)}
                                />
                            </div>
                            <div className="space-y-4">
                                <Label className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400 ml-1 flex items-center gap-2">
                                    <Clock className="w-3.5 h-3.5" />
                                    Horário Inicial
                                </Label>
                                <Input
                                    type="time"
                                    className="h-18 bg-slate-50 border-transparent rounded-[24px] px-6 font-bold text-slate-700 focus:bg-white focus:border-slate-100 transition-all"
                                    value={time}
                                    onChange={(e) => setTime(e.target.value)}
                                />
                            </div>
                        </div>

                        {/* MOTIVO */}
                        <div className="space-y-4">
                            <Label className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400 ml-1 flex items-center gap-2">
                                <FileText className="w-3.5 h-3.5" />
                                Motivo / Observações
                            </Label>
                            <textarea
                                placeholder="Descreva brevemente o motivo da consulta..."
                                className="w-full min-h-[120px] p-6 bg-slate-50 border border-transparent rounded-[32px] font-bold text-slate-700 placeholder:text-slate-400 placeholder:font-normal focus:bg-white focus:border-slate-100 focus:ring-2 focus:ring-slate-900/20 transition-all outline-none text-sm leading-relaxed duration-200"
                                value={reason}
                                onChange={(e) => setReason(e.target.value)}
                            />
                        </div>
                    </form>
                </div>

                <div className="p-8 border-t border-slate-50 bg-white shadow-[0_-10px_30px_rgba(0,0,0,0.02)]">
                    <Button
                        type="button"
                        disabled={loading || (!selectedPatient && !isNewPatient)}
                        onClick={handleSubmit}
                        className={cn(
                            "w-full h-18 rounded-[24px] font-black uppercase text-[11px] tracking-[0.2em] shadow-2xl transition-all active:scale-[0.98] disabled:opacity-30",
                            isNewPatient ? "bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-100" : "bg-slate-900 hover:bg-slate-800 text-white shadow-slate-200"
                        )}
                    >
                        {loading ? 'Sincronizando...' : 'Confirmar Agendamento'}
                    </Button>
                </div>
            </motion.div>
        </div>
    );
}
