'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import {
    Calendar,
    Activity,
    ClipboardList,
    FileText,
    Plus,
    Check,
    History,
    FileEdit,
    AlertTriangle,
    Clock,
    ArrowLeft,
    Trash2
} from 'lucide-react';
import { format, differenceInYears, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';

interface Patient {
    id: string;
    nome_completo: string;
    cpf: string;
    data_nascimento: string;
    telefone: string;
    alergias?: string;
}

interface AppointmentDetails {
    id: string;
    patient_id: string;
    start_time: string;
    status: string;
    reason: string;
    patient: Patient;
}

interface AttendanceRecord {
    id: string;
    created_at: string;
    anamnese: string;
    exame_fisico: string;
    diagnostico: string;
    conduta: string;
    status: string;
    queixa_principal?: string;
}

interface PrescriptionItem {
    id: string;
    medicamento: string;
    quantidade: string;
    posologia: string;
    via: string;
}

interface ExameItem {
    id: string;
    nome: string;
}

export default function ProntuarioPage() {
    const params = useParams();
    const router = useRouter();
    const [appointment, setAppointment] = useState<AppointmentDetails | null>(null);
    const [history, setHistory] = useState<AttendanceRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'resumo' | 'prescricao' | 'documentos'>('resumo');

    // UI States
    const [showVitalModal, setShowVitalModal] = useState(false);
    const [saving, setSaving] = useState(false);

    // Clinical States
    const [anamnese, setAnamnese] = useState('');
    const [exameFisico, setExameFisico] = useState('');
    const [diagnostico, setDiagnostico] = useState('');

    // Prescription State
    const [prescription, setPrescription] = useState<PrescriptionItem[]>([]);
    const [newMed, setNewMed] = useState({ medicamento: '', quantidade: '', posologia: '', via: 'VO' });

    // Documents State
    const [atestado, setAtestado] = useState({ dias: '1', cid: '', texto: '' });
    const [selectedExames, setSelectedExames] = useState<ExameItem[]>([]);

    // Vital Signs State
    const [vitals, setVitals] = useState({
        pa: '',
        temp: '',
        fc: '',
        spo2: ''
    });

    useEffect(() => {
        if (params.id) {
            fetchData();
        }
    }, [params.id]);

    const fetchData = async () => {
        setLoading(true);
        try {
            // 1. Try to fetch as Appointment first
            const { data: appData, error: appError } = await supabase
                .from('appointments')
                .select('*, patient:patients(*)')
                .eq('id', params.id)
                .maybeSingle();

            if (appData) {
                setAppointment(appData);

                // 2. Fetch History (Previous attendances)
                const { data: histData } = await supabase
                    .from('attendances')
                    .select('*')
                    .eq('patient_id', appData.patient_id)
                    .order('created_at', { ascending: false });

                setHistory(histData || []);

                // 3. Check for open attendance/draft for THIS appointment
                const { data: currentAtt } = await supabase
                    .from('attendances')
                    .select('*')
                    .eq('appointment_id', params.id)
                    .maybeSingle();

                if (currentAtt) {
                    setAnamnese(currentAtt.anamnese || '');
                    setExameFisico(currentAtt.exame_fisico || '');
                    setDiagnostico(currentAtt.diagnostico || '');
                    if (currentAtt.sinais_vitais) setVitals(currentAtt.sinais_vitais);
                    if (currentAtt.prescricao) {
                        try {
                            setPrescription(JSON.parse(currentAtt.prescricao));
                        } catch (e) { }
                    }
                }
            } else {
                // Try to fetch as Patient (Historical View only)
                const { data: patData, error: patError } = await supabase
                    .from('patients')
                    .select('*')
                    .eq('id', params.id)
                    .maybeSingle();

                if (patError || !patData) throw new Error('Paciente ou agendamento não encontrado.');

                // Mock an appointment structure for the header
                setAppointment({
                    id: 'historical',
                    patient_id: patData.id,
                    patient: patData,
                    status: 'finished',
                    start_time: new Date().toISOString(),
                    reason: 'Consulta de Histórico'
                } as any);

                // Fetch History
                const { data: histData } = await supabase
                    .from('attendances')
                    .select('*')
                    .eq('patient_id', patData.id)
                    .order('created_at', { ascending: false });

                setHistory(histData || []);
            }

        } catch (error: any) {
            toast.error('Erro ao carregar: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    const handleFinalize = async () => {
        if (!appointment) return;
        setSaving(true);

        try {
            const { error: appError } = await supabase
                .from('appointments')
                .update({ status: 'finished' })
                .eq('id', appointment.id);

            if (appError) throw appError;

            // Updated persistence logic
            const { error: attError } = await supabase
                .from('attendances')
                .update({
                    status: 'finalizado',
                    anamnese,
                    exame_fisico: exameFisico,
                    diagnostico,
                    prescricao: JSON.stringify(prescription),
                    atestado: JSON.stringify(atestado),
                    exames_solicitados: JSON.stringify(selectedExames),
                    sinais_vitais: vitals,
                    updated_at: new Date().toISOString()
                })
                .eq('appointment_id', appointment.id);

            if (attError) throw attError;

            toast.success('Atendimento finalizado com sucesso!');
            router.push('/office/agenda');
        } catch (error: any) {
            toast.error('Erro ao finalizar: ' + error.message);
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="h-screen flex items-center justify-center bg-[#f8fafc]">
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex flex-col items-center gap-4"
                >
                    <div className="w-12 h-12 border-4 border-slate-900 border-t-transparent rounded-full animate-spin" />
                    <p className="text-slate-500 font-bold uppercase tracking-widest text-xs">Carregando Prontuário...</p>
                </motion.div>
            </div>
        );
    }

    if (!appointment) return null;

    const patientAge = appointment.patient.data_nascimento
        ? differenceInYears(new Date(), parseISO(appointment.patient.data_nascimento))
        : null;

    return (
        <div className="min-h-screen bg-[#FDFDFD] text-slate-900 font-sans">
            {/* BOUTIQUE HEADER */}
            <header className="fixed top-0 left-0 right-0 h-24 bg-white/80 backdrop-blur-xl border-b border-slate-100 z-50 px-10 flex items-center justify-between">
                <div className="flex items-center gap-6">
                    <button
                        onClick={() => router.back()}
                        className="w-12 h-12 rounded-2xl bg-slate-50 flex items-center justify-center text-slate-400 hover:text-slate-900 transition-colors"
                    >
                        <ArrowLeft className="w-5 h-5" />
                    </button>
                    <div>
                        <div className="flex items-center gap-3">
                            <h1 className="text-2xl font-black tracking-tight text-slate-900 uppercase italic">
                                {appointment.patient.nome_completo}
                            </h1>
                            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                        </div>
                        <p className="text-slate-400 font-bold text-xs uppercase tracking-widest mt-0.5">
                            {patientAge ? `${patientAge} Anos` : 'Idade não informada'} • CPF: {appointment.patient.cpf}
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-4">
                    <div className="flex bg-slate-100 p-1.5 rounded-2xl">
                        {[
                            { id: 'resumo', label: 'Resumo', icon: History },
                            { id: 'prescricao', label: 'Prescrição', icon: ClipboardList },
                            { id: 'documentos', label: 'Documentos', icon: FileText }
                        ].map((tab) => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id as any)}
                                className={cn(
                                    "px-8 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-[2px] transition-all flex items-center gap-3",
                                    activeTab === tab.id
                                        ? "bg-white text-slate-900 shadow-xl shadow-slate-200"
                                        : "text-slate-400 hover:text-slate-600"
                                )}
                            >
                                <tab.icon className="w-4 h-4" />
                                {tab.label}
                            </button>
                        ))}
                    </div>
                    {appointment?.id !== 'historical' && (
                        <Button
                            onClick={handleFinalize}
                            disabled={saving}
                            className="bg-slate-900 hover:bg-black text-white px-8 h-12 rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-2xl shadow-slate-200 ml-4"
                        >
                            {saving ? 'Finalizando...' : 'Finalizar Atendimento'}
                        </Button>
                    )}
                </div>
            </header>

            {/* MAIN LAYOUT */}
            <main className="pt-32 pb-10 px-10 grid grid-cols-12 gap-10">
                {/* CENTER CONTENT */}
                <div className="col-span-12 lg:col-span-9 space-y-8">
                    <AnimatePresence mode="wait">
                        {activeTab === 'resumo' && (
                            <motion.div
                                key="resumo"
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -20 }}
                                className="space-y-10"
                            >
                                {/* CURRENT ATTENDANCE FORM */}
                                <Card className="border-0 shadow-[0_20px_50px_-20px_rgba(0,0,0,0.05)] rounded-[40px] p-10 bg-white">
                                    <h2 className="text-lg font-black uppercase tracking-[3px] text-slate-400 mb-8 flex items-center gap-4">
                                        <FileEdit className="w-5 h-5" />
                                        Evolução Atual
                                    </h2>
                                    <div className="space-y-8">
                                        <div className="space-y-4">
                                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Anamnese / Queixa</label>
                                            <textarea
                                                value={anamnese}
                                                onChange={(e) => setAnamnese(e.target.value)}
                                                className="w-full min-h-[150px] bg-slate-50/50 border border-slate-100 rounded-[30px] p-8 text-slate-800 placeholder:text-slate-300 focus:ring-2 focus:ring-slate-900/20 transition-all outline-none text-lg leading-relaxed duration-200"
                                                placeholder="Descreva a queixa e histórico atual..."
                                            />
                                        </div>
                                        <div className="grid grid-cols-2 gap-8">
                                            <div className="space-y-4">
                                                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Exame Físico</label>
                                                <textarea
                                                    value={exameFisico}
                                                    onChange={(e) => setExameFisico(e.target.value)}
                                                    className="w-full min-h-[200px] bg-slate-50/50 border border-slate-100 rounded-[30px] p-8 text-slate-800 placeholder:text-slate-300 focus:ring-2 focus:ring-slate-900/20 transition-all outline-none leading-relaxed duration-200"
                                                    placeholder="Aparelhos, sistemas, sinais..."
                                                />
                                            </div>
                                            <div className="space-y-4">
                                                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Hipótese Diagnóstica / CID</label>
                                                <textarea
                                                    value={diagnostico}
                                                    onChange={(e) => setDiagnostico(e.target.value)}
                                                    className="w-full min-h-[200px] bg-slate-50/50 border border-slate-100 rounded-[30px] p-8 text-slate-800 placeholder:text-slate-300 focus:ring-2 focus:ring-slate-900/20 transition-all outline-none leading-relaxed duration-200"
                                                    placeholder="Conclusão e codificação..."
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </Card>

                                {/* HISTORICAL TIMELINE */}
                                <div className="space-y-8">
                                    <h2 className="text-lg font-black uppercase tracking-[3px] text-slate-400 flex items-center gap-4">
                                        <History className="w-5 h-5" />
                                        Linha do Tempo
                                    </h2>
                                    <div className="space-y-6">
                                        {history.length === 0 ? (
                                            <div className="py-20 text-center bg-slate-50 rounded-[40px] border-2 border-dashed border-slate-100">
                                                <History className="w-12 h-12 text-slate-200 mx-auto mb-4" />
                                                <p className="text-slate-400 font-bold text-sm uppercase tracking-widest">Primeira consulta neste sistema</p>
                                            </div>
                                        ) : (
                                            history.map((record, idx) => (
                                                <motion.div
                                                    initial={{ opacity: 0, x: -20 }}
                                                    animate={{ opacity: 1, x: 0 }}
                                                    transition={{ delay: idx * 0.1 }}
                                                    key={record.id}
                                                    className="flex gap-8 group"
                                                >
                                                    <div className="w-32 pt-2 flex flex-col items-end shrink-0">
                                                        <span className="text-sm font-black text-slate-900 tracking-tight uppercase">
                                                            {format(parseISO(record.created_at), "dd MMM, yy", { locale: ptBR })}
                                                        </span>
                                                        <span className="text-[10px] font-bold text-slate-300 uppercase mt-1">
                                                            {format(parseISO(record.created_at), "HH:mm")}
                                                        </span>
                                                    </div>
                                                    <div className="relative pb-10 flex-1">
                                                        <div className="absolute left-[-29px] top-4 w-1.5 h-1.5 rounded-full bg-slate-200 ring-8 ring-white group-hover:bg-slate-900 transition-all" />
                                                        <div className="absolute left-[-26px] top-6 bottom-0 w-[1px] bg-slate-100 group-last:hidden" />
                                                        <div className="bg-white border border-slate-50 p-8 rounded-[30px] shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-500">
                                                            <div className="flex items-center gap-4 mb-4">
                                                                <span className="text-[10px] font-black uppercase tracking-[2px] px-4 py-1.5 bg-slate-900 text-white rounded-full">
                                                                    {record.status === 'finalizado' ? 'Atendimento Clínico' : record.status}
                                                                </span>
                                                            </div>
                                                            <p className="text-slate-600 line-clamp-3 leading-relaxed">
                                                                {record.anamnese || record.queixa_principal || "Sem evolução descritiva."}
                                                            </p>
                                                            {record.diagnostico && (
                                                                <div className="mt-4 pt-4 border-t border-slate-50 flex items-center gap-3">
                                                                    <div className="w-6 h-6 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                                                                        <Check className="w-3 h-3" />
                                                                    </div>
                                                                    <span className="text-[11px] font-bold text-slate-400 italic">HD: {record.diagnostico}</span>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                </motion.div>
                                            ))
                                        )}
                                    </div>
                                </div>
                            </motion.div>
                        )}

                        {activeTab === 'prescricao' && (
                            <motion.div
                                key="prescricao"
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -20 }}
                                className="space-y-8"
                            >
                                <Card className="border-0 shadow-[0_20px_50px_-20px_rgba(0,0,0,0.05)] rounded-[40px] p-10 bg-white">
                                    <div className="flex items-center justify-between mb-8">
                                        <h2 className="text-xl font-black uppercase italic tracking-tight text-slate-900">Gerador de Receita Externa</h2>
                                        <div className="px-5 py-2 bg-emerald-50 text-emerald-700 rounded-full text-[10px] font-black uppercase tracking-widest">A4 / Digital</div>
                                    </div>

                                    {/* Prescription Form */}
                                    <div className="bg-slate-50/50 p-8 rounded-[30px] border border-slate-100 mb-8 space-y-6">
                                        <div className="grid grid-cols-12 gap-6">
                                            <div className="col-span-8 space-y-2">
                                                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Medicamento</label>
                                                <input
                                                    type="text"
                                                    value={newMed.medicamento}
                                                    onChange={e => setNewMed({ ...newMed, medicamento: e.target.value })}
                                                    placeholder="Nome do fármaco..."
                                                    className="w-full h-14 bg-white border border-slate-100 rounded-2xl px-6 text-slate-800 placeholder:text-slate-300 focus:ring-2 focus:ring-slate-900/20 transition-all outline-none duration-200"
                                                />
                                            </div>
                                            <div className="col-span-4 space-y-2">
                                                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Quantidade</label>
                                                <input
                                                    type="text"
                                                    value={newMed.quantidade}
                                                    onChange={e => setNewMed({ ...newMed, quantidade: e.target.value })}
                                                    placeholder="Ex: 2 caixas"
                                                    className="w-full h-14 bg-white border border-slate-100 rounded-2xl px-6 text-slate-800 placeholder:text-slate-300 focus:ring-2 focus:ring-slate-900/20 transition-all outline-none duration-200"
                                                />
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-12 gap-6">
                                            <div className="col-span-9 space-y-2">
                                                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Posologia / Instruções</label>
                                                <input
                                                    type="text"
                                                    value={newMed.posologia}
                                                    onChange={e => setNewMed({ ...newMed, posologia: e.target.value })}
                                                    placeholder="Dosagem e frequência..."
                                                    className="w-full h-14 bg-white border-0 rounded-2xl px-6 text-slate-800 placeholder:text-slate-300 focus:ring-2 focus:ring-slate-900 transition-all outline-none"
                                                />
                                            </div>
                                            <div className="col-span-3 flex items-end">
                                                <Button
                                                    onClick={() => {
                                                        if (!newMed.medicamento) return;
                                                        setPrescription([...prescription, { ...newMed, id: Math.random().toString() }]);
                                                        setNewMed({ medicamento: '', quantidade: '', posologia: '', via: 'VO' });
                                                    }}
                                                    className="w-full h-14 bg-slate-900 hover:bg-black text-white rounded-2xl font-black uppercase text-[10px] tracking-widest"
                                                >
                                                    Adicionar Item
                                                </Button>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Medication List */}
                                    <div className="space-y-4">
                                        {prescription.length === 0 ? (
                                            <div className="py-20 text-center border-2 border-dashed border-slate-50 rounded-[30px] text-slate-300">
                                                Nenhum item adicionado à receita.
                                            </div>
                                        ) : (
                                            prescription.map((item, idx) => (
                                                <motion.div
                                                    initial={{ opacity: 0, x: 20 }}
                                                    animate={{ opacity: 1, x: 0 }}
                                                    key={item.id}
                                                    className="flex items-center justify-between p-6 bg-white border border-slate-100 rounded-[28px] hover:shadow-xl hover:shadow-slate-100 transition-all group"
                                                >
                                                    <div className="flex items-center gap-6">
                                                        <div className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center font-black text-slate-900">{idx + 1}</div>
                                                        <div>
                                                            <h4 className="font-black text-slate-900 uppercase italic tracking-tight">{item.medicamento}</h4>
                                                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">{item.posologia} • Qtde: {item.quantidade}</p>
                                                        </div>
                                                    </div>
                                                    <button
                                                        onClick={() => setPrescription(prescription.filter(p => p.id !== item.id))}
                                                        className="w-10 h-10 rounded-xl bg-rose-50 text-rose-500 opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center hover:bg-rose-500 hover:text-white"
                                                    >
                                                        <Plus className="w-4 h-4 rotate-45" />
                                                    </button>
                                                </motion.div>
                                            ))
                                        )}
                                    </div>

                                    {prescription.length > 0 && (
                                        <div className="mt-10 pt-10 border-t border-slate-50 flex justify-end gap-4">
                                            <Button variant="ghost" className="h-14 rounded-2xl px-8 font-black uppercase text-[10px] tracking-widest text-slate-400" onClick={() => setPrescription([])}>Limpar Tudo</Button>
                                            <Button className="h-14 rounded-2xl px-10 bg-emerald-600 hover:bg-emerald-700 text-white font-black uppercase text-[10px] tracking-widest">Visualizar Impressão</Button>
                                        </div>
                                    )}
                                </Card>
                            </motion.div>
                        )}

                        {activeTab === 'documentos' && (
                            <motion.div
                                key="documentos"
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -20 }}
                                className="space-y-8"
                            >
                                <div className="grid grid-cols-2 gap-8">
                                    {/* ATESTADO BUILDER */}
                                    <Card className="p-10 rounded-[40px] border-0 shadow-sm bg-white space-y-8">
                                        <div className="flex items-center gap-4">
                                            <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-3xl flex items-center justify-center">
                                                <FileText className="w-8 h-8" />
                                            </div>
                                            <div>
                                                <h3 className="text-xl font-black text-slate-900 uppercase italic">Atestado</h3>
                                                <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest">Afastamento Médico</p>
                                            </div>
                                        </div>
                                        <div className="space-y-6">
                                            <div className="grid grid-cols-2 gap-4">
                                                <div className="space-y-2">
                                                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Qtd. Dias</label>
                                                    <input
                                                        type="number"
                                                        value={atestado.dias}
                                                        onChange={e => setAtestado({ ...atestado, dias: e.target.value })}
                                                        className="w-full h-14 bg-slate-50 border border-transparent rounded-2xl px-6 text-slate-800 focus:ring-2 focus:ring-slate-900/20 transition-all outline-none duration-200"
                                                    />
                                                </div>
                                                <div className="space-y-2">
                                                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">CID (Opcional)</label>
                                                    <input
                                                        type="text"
                                                        value={atestado.cid}
                                                        onChange={e => setAtestado({ ...atestado, cid: e.target.value })}
                                                        placeholder="Ex: A09"
                                                        className="w-full h-14 bg-slate-50 border border-transparent rounded-2xl px-6 text-slate-800 focus:ring-2 focus:ring-slate-900/20 transition-all outline-none uppercase duration-200"
                                                    />
                                                </div>
                                            </div>
                                            <div className="space-y-2">
                                                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Justificativa Adicional</label>
                                                <textarea
                                                    value={atestado.texto}
                                                    onChange={e => setAtestado({ ...atestado, texto: e.target.value })}
                                                    className="w-full h-32 bg-slate-50 border border-transparent rounded-2xl p-6 text-slate-800 focus:ring-2 focus:ring-slate-900/20 transition-all outline-none leading-relaxed duration-200"
                                                    placeholder="Observações complementares..."
                                                />
                                            </div>
                                            <Button className="w-full h-14 bg-blue-600 hover:bg-blue-700 text-white rounded-[24px] font-black uppercase text-[10px] tracking-widest">Emitir Atestado</Button>
                                        </div>
                                    </Card>

                                    {/* EXAME BUILDER */}
                                    <Card className="p-10 rounded-[40px] border-0 shadow-sm bg-white space-y-8">
                                        <div className="flex items-center gap-4">
                                            <div className="w-16 h-16 bg-purple-50 text-purple-600 rounded-3xl flex items-center justify-center">
                                                <ClipboardList className="w-8 h-8" />
                                            </div>
                                            <div>
                                                <h3 className="text-xl font-black text-slate-900 uppercase italic">Exames</h3>
                                                <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest">Pedido de Exames</p>
                                            </div>
                                        </div>
                                        <div className="space-y-4">
                                            <div className="flex flex-wrap gap-2 mb-6">
                                                {['Hemograma', 'Glicemia', 'Creatinina', 'Urina I', 'Raio-X Tórax', 'ECG'].map(ex => (
                                                    <button
                                                        key={ex}
                                                        onClick={() => {
                                                            if (selectedExames.find(e => e.nome === ex)) {
                                                                setSelectedExames(selectedExames.filter(e => e.nome !== ex));
                                                            } else {
                                                                setSelectedExames([...selectedExames, { id: Math.random().toString(), nome: ex }]);
                                                            }
                                                        }}
                                                        className={cn(
                                                            "px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest transition-all",
                                                            selectedExames.find(e => e.nome === ex)
                                                                ? "bg-purple-600 text-white"
                                                                : "bg-purple-50 text-purple-600 hover:bg-purple-100"
                                                        )}
                                                    >
                                                        {ex}
                                                    </button>
                                                ))}
                                            </div>
                                            <div className="min-h-[140px] border-2 border-dashed border-slate-50 rounded-2xl p-4">
                                                <div className="flex flex-wrap gap-2">
                                                    {selectedExames.map(ex => (
                                                        <span key={ex.id} className="inline-flex items-center gap-2 bg-slate-900 text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest">
                                                            {ex.nome}
                                                            <Plus className="w-3 h-3 rotate-45 cursor-pointer" onClick={() => setSelectedExames(selectedExames.filter(e => e.id !== ex.id))} />
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>
                                            <Button className="w-full h-14 bg-purple-600 hover:bg-purple-700 text-white rounded-[24px] font-black uppercase text-[10px] tracking-widest">Gerar Pedido</Button>
                                        </div>
                                    </Card>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                {/* RIGHT SIDEBAR (RESUMO / SINAIS) */}
                <div className="col-span-12 lg:col-span-3 space-y-8">
                    {/* SINAIS VITAIS CARD */}
                    <Card className="border-0 shadow-[0_20px_50px_-20px_rgba(0,0,0,0.05)] rounded-[40px] p-8 bg-slate-900 text-white space-y-8 relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -mr-16 -mt-16 blur-3xl" />

                        <div className="flex items-center justify-between relative z-10">
                            <h3 className="text-[10px] font-black uppercase tracking-[3px] text-slate-500">Sinais Vitais</h3>
                            <button
                                onClick={() => setShowVitalModal(true)}
                                className="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center hover:bg-white/20 transition-all"
                            >
                                <Plus className="w-4 h-4" />
                            </button>
                        </div>

                        <div className="grid grid-cols-1 gap-6 relative z-10">
                            {[
                                { label: 'PA', val: vitals.pa || '---', unit: 'mmHg' },
                                { label: 'TEMP', val: vitals.temp || '---', unit: '°C' },
                                { label: 'FC', val: vitals.fc || '---', unit: 'bpm' },
                                { label: 'SAT', val: vitals.spo2 || '---', unit: '%' }
                            ].map((vit) => (
                                <div key={vit.label} className="flex items-center justify-between">
                                    <div>
                                        <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest leading-none mb-1">{vit.label}</p>
                                        <p className="text-2xl font-black italic">{vit.val}</p>
                                    </div>
                                    <span className="text-[10px] font-bold text-slate-500 uppercase">{vit.unit}</span>
                                </div>
                            ))}
                        </div>

                        <Button
                            onClick={() => setShowVitalModal(true)}
                            className="w-full bg-white/5 hover:bg-white/10 border border-white/10 text-white h-14 rounded-2xl font-black uppercase text-[10px] tracking-widest mt-4 relative z-10"
                        >
                            Atualizar Sinais
                        </Button>
                    </Card>

                    {/* ALERGIAS CARD */}
                    <Card className="border-0 shadow-sm rounded-[40px] p-8 bg-white border border-slate-50">
                        <h3 className="text-[10px] font-black uppercase tracking-[3px] text-slate-400 mb-6 flex items-center justify-between">
                            Alergias / Riscos
                            <AlertTriangle className="w-4 h-4 text-rose-500" />
                        </h3>
                        {appointment.patient.alergias ? (
                            <div className="flex items-center gap-4 p-5 bg-rose-50 rounded-2xl border border-rose-100">
                                <span className="text-xs font-black text-rose-700 uppercase tracking-tight">{appointment.patient.alergias}</span>
                            </div>
                        ) : (
                            <div className="p-5 bg-slate-50 rounded-2xl border border-slate-100 italic text-slate-400 text-[10px] font-black uppercase text-center">
                                Nenhuma alergia relatada
                            </div>
                        )}
                        <Button variant="ghost" className="w-full mt-4 text-[10px] font-black uppercase tracking-widest text-slate-300 hover:text-slate-900 transition-colors">
                            Editar Alergias
                        </Button>
                    </Card>

                    {/* ATENDIMENTOS ANTERIORES COUNT */}
                    <div className="p-8 rounded-[40px] bg-indigo-50/50 border border-indigo-100 flex items-center justify-between">
                        <div>
                            <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest leading-none mb-1">Total Retornos</p>
                            <p className="text-3xl font-black text-indigo-900 italic">{history.length}</p>
                        </div>
                        <div className="w-14 h-14 bg-indigo-100 rounded-2xl flex items-center justify-center">
                            <Clock className="w-6 h-6 text-indigo-600" />
                        </div>
                    </div>
                </div>
            </main>

            {/* VITAL SIGNS MODAL */}
            <AnimatePresence>
                {showVitalModal && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
                            onClick={() => setShowVitalModal(false)}
                        />
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0, y: 20 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.9, opacity: 0, y: 20 }}
                            className="relative w-full max-w-lg bg-white rounded-[40px] shadow-2xl p-10 space-y-8"
                        >
                            <div className="flex items-center justify-between">
                                <h3 className="text-2xl font-black uppercase italic tracking-tighter text-slate-900">Coleta de Sinais Vitais</h3>
                                <button onClick={() => setShowVitalModal(false)} className="text-slate-300 hover:text-slate-900 transition-colors">
                                    <Plus className="w-6 h-6 rotate-45" />
                                </button>
                            </div>
                            <div className="grid grid-cols-2 gap-6">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">PA (mmHg)</label>
                                    <input
                                        type="text"
                                        value={vitals.pa}
                                        onChange={e => setVitals({ ...vitals, pa: e.target.value })}
                                        className="w-full h-14 bg-slate-50 border-0 rounded-2xl px-6 text-slate-800 focus:ring-2 focus:ring-slate-900 transition-all outline-none"
                                        placeholder="120/80"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Temp (°C)</label>
                                    <input
                                        type="text"
                                        value={vitals.temp}
                                        onChange={e => setVitals({ ...vitals, temp: e.target.value })}
                                        className="w-full h-14 bg-slate-50 border-0 rounded-2xl px-6 text-slate-800 focus:ring-2 focus:ring-slate-900 transition-all outline-none"
                                        placeholder="36.5"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">FC (bpm)</label>
                                    <input
                                        type="text"
                                        value={vitals.fc}
                                        onChange={e => setVitals({ ...vitals, fc: e.target.value })}
                                        className="w-full h-14 bg-slate-50 border-0 rounded-2xl px-6 text-slate-800 focus:ring-2 focus:ring-slate-900 transition-all outline-none"
                                        placeholder="75"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Sat (%)</label>
                                    <input
                                        type="text"
                                        value={vitals.spo2}
                                        onChange={e => setVitals({ ...vitals, spo2: e.target.value })}
                                        className="w-full h-14 bg-slate-50 border-0 rounded-2xl px-6 text-slate-800 focus:ring-2 focus:ring-slate-900 transition-all outline-none"
                                        placeholder="98"
                                    />
                                </div>
                            </div>
                            <Button
                                onClick={() => setShowVitalModal(false)}
                                className="w-full h-16 bg-slate-900 hover:bg-black text-white rounded-[24px] font-black uppercase text-xs tracking-[4px]"
                            >
                                Salvar Sinais
                            </Button>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
}
