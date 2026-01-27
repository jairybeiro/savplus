'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
    Check,
    Settings as SettingsIcon,
    Lock,
    ChevronLeft,
    ChevronRight,
    CalendarDays,
    Calendar,
    MoreVertical,
    Play,
    MessageCircle,
    Trash2,
    Plus,
    Clock
} from 'lucide-react';
import { AvailabilityModal } from '@/components/modals/AvailabilityModal';
import { format, startOfDay, endOfDay, addMinutes, addHours, startOfHour, parseISO, isSameMinute, isPast } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { AppointmentForm } from '@/components/forms/AppointmentForm';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';

interface Appointment {
    id: string;
    patient_id: string;
    start_time: string;
    end_time: string;
    status: 'scheduled' | 'confirmed' | 'waiting' | 'in_progress' | 'finished' | 'canceled';
    reason: string;
    event_type_id?: string;
    event_type?: {
        title: string;
        duration: number;
    };
    patient: {
        id: string;
        nome_completo: string;
        cpf: string;
        telefone?: string;
    };
}

export default function AgendaPage() {
    const router = useRouter();
    const [appointments, setAppointments] = useState<Appointment[]>([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [selectedTimeSlot, setSelectedTimeSlot] = useState<Date | null>(null);
    const [currentDate, setCurrentDate] = useState(new Date());
    const [showSettings, setShowSettings] = useState(false);
    const [availability, setAvailability] = useState<any>(null);
    const [blockedSlots, setBlockedSlots] = useState<any[]>([]);
    const [activeMenuId, setActiveMenuId] = useState<string | null>(null);

    const isSlotAvailable = (slot: Date) => {
        const now = new Date();
        const leadTimeLimit = addHours(now, availability?.min_scheduling_notice_hours || 2);
        return slot >= leadTimeLimit;
    };

    const isBlocked = (slot: Date) => {
        return blockedSlots.some(blocked => {
            const start = parseISO(blocked.start_time);
            const end = parseISO(blocked.end_time);
            return slot >= start && slot < end;
        });
    };

    const generateTimeSlots = () => {
        if (!availability) return [];

        const dayOfWeek = format(currentDate, 'eee', { locale: ptBR }).toLowerCase();
        // Check if working day (handling Portuguese to English mapping or using day indices)
        const dayMap: Record<string, string> = {
            'seg': 'mon', 'ter': 'tue', 'qua': 'wed', 'qui': 'thu', 'sex': 'fri', 'sáb': 'sat', 'dom': 'sun'
        };
        const currentDayId = dayMap[dayOfWeek];

        if (!availability.working_days.includes(currentDayId)) return [];

        const slots = [];
        const [startH, startM] = availability.start_hour.split(':').map(Number);
        const [endH, endM] = availability.end_hour.split(':').map(Number);

        let currentSlot = startOfHour(startOfDay(currentDate));
        currentSlot.setHours(startH, startM, 0, 0);

        const endTime = new Date(currentSlot);
        endTime.setHours(endH, endM, 0, 0);

        while (currentSlot < endTime) {
            slots.push(new Date(currentSlot));
            currentSlot = addMinutes(currentSlot, availability.slot_duration_minutes || 30);
        }
        return slots;
    };

    const timeSlots = generateTimeSlots();

    const fetchAvailability = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data } = await supabase
            .from('doctor_availability_settings')
            .select('*')
            .eq('doctor_id', user.id)
            .maybeSingle();

        setAvailability(data || {
            working_days: ['mon', 'tue', 'wed', 'thu', 'fri'],
            start_hour: '08:00',
            end_hour: '18:00',
            slot_duration_minutes: 30,
            min_scheduling_notice_hours: 2
        });
    };

    const fetchBlockedSlots = async () => {
        const dayStart = startOfDay(currentDate);
        const dayEnd = endOfDay(currentDate);
        const { data } = await supabase
            .from('blocked_slots')
            .select('*')
            .gte('start_time', dayStart.toISOString())
            .lte('start_time', dayEnd.toISOString());
        setBlockedSlots(data || []);
    };

    const fetchAppointments = async () => {
        setLoading(true);
        const dayStart = startOfDay(currentDate);
        const dayEnd = endOfDay(currentDate);

        const { data, error } = await supabase
            .from('appointments')
            .select('*, patient:patients(id, nome_completo, cpf, telefone), event_type:event_types(title, duration)')
            .gte('start_time', dayStart.toISOString())
            .lte('start_time', dayEnd.toISOString())
            .neq('status', 'canceled')
            .order('start_time', { ascending: true });

        if (error) console.error('Error fetching appointments:', error);
        else setAppointments(data || []);
        setLoading(false);
    };

    useEffect(() => {
        fetchAvailability();
        fetchAppointments();
        fetchBlockedSlots();
    }, [currentDate]);

    const handleBlockSlot = async (slot: Date) => {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            const endTime = addMinutes(slot, availability?.slot_duration_minutes || 30);
            const { error } = await supabase
                .from('blocked_slots')
                .insert([{
                    doctor_id: user?.id,
                    start_time: slot.toISOString(),
                    end_time: endTime.toISOString(),
                    reason: 'Bloqueio Manual'
                }]);
            if (error) throw error;
            fetchBlockedSlots();
            toast.success('Horário bloqueado.');
        } catch (error: any) {
            toast.error('Erro ao bloquear: ' + error.message);
        }
    };

    const handleUnblockSlot = async (slot: Date) => {
        try {
            const blocked = blockedSlots.find(b => isSameMinute(parseISO(b.start_time), slot));
            if (!blocked) return;
            const { error } = await supabase.from('blocked_slots').delete().eq('id', blocked.id);
            if (error) throw error;
            fetchBlockedSlots();
            toast.success('Horário liberado.');
        } catch (error: any) {
            toast.error('Erro ao liberar: ' + error.message);
        }
    };

    const handleCheckIn = async (appointment: Appointment) => {
        // Optimistic UI update
        const previousAppointments = [...appointments];
        setAppointments(prev => prev.map(a => a.id === appointment.id ? { ...a, status: 'waiting' } : a));
        setActiveMenuId(null);

        try {
            const { error: attendanceError } = await supabase
                .from('attendances')
                .insert([{
                    patient_id: appointment.patient_id,
                    appointment_id: appointment.id,
                    status: 'aguardando_medico',
                    queixa_principal: appointment.reason || 'Consulta Agendada'
                }]);

            if (attendanceError) throw attendanceError;

            const response = await fetch(`/api/v1/appointments/${appointment.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    status: 'waiting',
                    metadata: { last_action: 'check-in_ui' }
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Erro ao atualizar status');
            }

            toast.success(`Check-in realizado! ${appointment.patient.nome_completo} está na recepção.`);
        } catch (error: any) {
            setAppointments(previousAppointments);
            toast.error('Erro ao realizar check-in: ' + error.message);
        }
    };

    const handleStartConsultation = async (appointment: Appointment) => {
        setActiveMenuId(null);
        try {
            const { error } = await supabase
                .from('appointments')
                .update({ status: 'in_progress' })
                .eq('id', appointment.id);

            if (error) throw error;

            // Ensure attendance record exists
            const { data: existingAtt } = await supabase
                .from('attendances')
                .select('id')
                .eq('appointment_id', appointment.id)
                .single();

            if (!existingAtt) {
                await supabase
                    .from('attendances')
                    .insert({
                        appointment_id: appointment.id,
                        patient_id: appointment.patient_id,
                        status: 'em_atendimento',
                        created_at: new Date().toISOString()
                    });
            }

            toast.success(`Iniciando consulta de ${appointment.patient.nome_completo}`);
            router.push(`/office/prontuario/${appointment.id}`);
        } catch (error: any) {
            toast.error('Erro ao iniciar consulta: ' + error.message);
        }
    };

    const handleCancelAppointment = async (appointment: Appointment) => {
        setActiveMenuId(null);
        try {
            const response = await fetch(`/api/v1/appointments/${appointment.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    status: 'cancelled',
                    metadata: { cancelled_via: 'manual_ui' }
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Erro ao cancelar agendamento');
            }
            fetchAppointments();
            toast.success('Agendamento cancelado.');
        } catch (error: any) {
            toast.error('Erro ao cancelar: ' + error.message);
        }
    };

    const handleWhatsApp = (appointment: Appointment) => {
        setActiveMenuId(null);
        if (!appointment.patient.telefone) {
            toast.error('Nenhum telefone cadastrado para este paciente.');
            return;
        }
        const cleanPhone = appointment.patient.telefone.replace(/\D/g, '');
        const url = `https://wa.me/55${cleanPhone}`;
        window.open(url, '_blank');
    };

    const handleOpenForm = (slot?: Date) => {
        setSelectedTimeSlot(slot || null);
        setShowForm(true);
    };

    const getStatusStyle = (status: string) => {
        switch (status) {
            case 'scheduled': return 'bg-blue-50/50 text-blue-700 border-blue-100/50 ring-1 ring-blue-200/20';
            case 'confirmed': return 'bg-emerald-50/50 text-emerald-700 border-emerald-100/50 ring-1 ring-emerald-200/20';
            case 'waiting': return 'bg-amber-50/80 text-amber-900 border-amber-200 ring-2 ring-amber-500/20';
            case 'in_progress': return 'bg-indigo-50/50 text-indigo-700 border-indigo-100/50 ring-1 ring-indigo-200/20 animate-pulse';
            case 'finished': return 'bg-slate-50/50 text-slate-500 border-slate-100/50';
            case 'canceled': return 'bg-slate-100/30 text-slate-400 border-slate-200/50 grayscale opacity-60';
            default: return 'bg-slate-50 text-slate-500 border-slate-100';
        }
    };

    return (
        <div className="max-w-[1400px] mx-auto space-y-12 py-8 px-4">
            {/* HEADER PREMIUM - ULTRA REFINED */}
            <motion.div
                initial={{ opacity: 0, y: -30 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-col lg:flex-row lg:items-center justify-between gap-10 bg-white p-10 rounded-[40px] border border-slate-50 shadow-[0_20px_50px_-20px_rgba(0,0,0,0.05)]"
            >
                <div className="flex items-center gap-8">
                    <motion.div
                        whileHover={{ rotate: 15, scale: 1.05 }}
                        className="bg-slate-900 w-20 h-20 rounded-[28px] flex items-center justify-center shadow-2xl shadow-slate-300"
                    >
                        <CalendarDays className="w-10 h-10 text-white" />
                    </motion.div>
                    <div>
                        <h1 className="text-4xl font-black text-slate-900 tracking-tighter uppercase italic">
                            {format(currentDate, "EEEE", { locale: ptBR })}
                        </h1>
                        <p className="text-slate-400 font-bold text-xl tracking-tight mt-1 flex items-center gap-3">
                            <span className="w-2 h-2 rounded-full bg-slate-900 animate-pulse" />
                            {format(currentDate, "dd 'de' MMMM, yyyy", { locale: ptBR })}
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-4">
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setShowSettings(true)}
                        className="w-14 h-14 rounded-2xl bg-white hover:bg-slate-50 shadow-sm border border-slate-200/50 text-slate-400 hover:text-slate-900"
                    >
                        <SettingsIcon className="w-6 h-6" />
                    </Button>
                    <div className="w-[1px] h-10 bg-slate-100 mx-2" />
                    <div className="flex items-center gap-4 bg-slate-50/50 p-3 rounded-[32px] border border-slate-100">
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setCurrentDate(prev => new Date(prev.setDate(prev.getDate() - 1)))}
                            className="w-14 h-14 rounded-2xl bg-white hover:bg-slate-50 shadow-sm border border-slate-200/50"
                        >
                            <ChevronLeft className="w-6 h-6 text-slate-600" />
                        </Button>
                        <button
                            onClick={() => setCurrentDate(new Date())}
                            className="px-10 py-3 bg-white border border-slate-200/50 shadow-sm rounded-2xl text-base font-black text-slate-900 uppercase tracking-[0.2em] hover:bg-slate-900 hover:text-white transition-all duration-300"
                        >
                            {format(currentDate, "dd/MM")}
                        </button>
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setCurrentDate(prev => new Date(prev.setDate(prev.getDate() + 1)))}
                            className="w-14 h-14 rounded-2xl bg-white hover:bg-slate-50 shadow-sm border border-slate-200/50"
                        >
                            <ChevronRight className="w-6 h-6 text-slate-600" />
                        </Button>
                    </div>
                </div>

                <motion.div
                    whileHover={{ scale: 1.02, y: -2 }}
                    whileTap={{ scale: 0.98 }}
                >
                    <Button
                        onClick={() => handleOpenForm()}
                        className="bg-slate-900 hover:bg-black text-white font-black uppercase text-[11px] tracking-[0.3em] px-12 h-20 rounded-[30px] shadow-2xl shadow-slate-300 transition-all flex items-center gap-6 group"
                    >
                        <div className="w-8 h-8 bg-white/10 rounded-xl flex items-center justify-center group-hover:rotate-90 transition-transform duration-700">
                            <Plus className="w-5 h-5 text-white" />
                        </div>
                        Novo Agendamento
                    </Button>
                </motion.div>
            </motion.div>

            {/* TIMELINE SECTION - GHOST GLASS STYLE */}
            <motion.div
                initial={{ opacity: 0, y: 40 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="relative"
            >
                <Card className="border-0 shadow-[0_40px_100px_-40px_rgba(0,0,0,0.08)] rounded-[60px] overflow-hidden bg-white/80 backdrop-blur-xl border border-white/20 min-h-[400px]">
                    <CardContent className="p-0">
                        {timeSlots.length === 0 ? (
                            <div className="py-20 flex flex-col items-center justify-center text-center px-10">
                                <div className="w-24 h-24 bg-slate-50 rounded-[32px] flex items-center justify-center text-slate-200 mb-6">
                                    <Calendar className="w-12 h-12" />
                                </div>
                                <h3 className="text-2xl font-black text-slate-900 uppercase italic">Férias ou Descanço!</h3>
                                <p className="text-slate-400 font-bold text-sm uppercase tracking-widest mt-2">Não há atendimento configurado para este dia da semana.</p>
                                <Button
                                    onClick={() => setShowSettings(true)}
                                    variant="ghost"
                                    className="mt-6 text-slate-900 font-black uppercase text-[10px] tracking-widest hover:bg-slate-50"
                                >
                                    Configurar Grade de Horários
                                </Button>
                            </div>
                        ) : (
                            <div className="divide-y divide-slate-100/50">
                                {timeSlots.map((slot, index) => {
                                    const appInSlot = appointments.find(a => isSameMinute(parseISO(a.start_time), slot));
                                    const slotIsBlocked = isBlocked(slot);

                                    return (
                                        <motion.div
                                            initial={{ opacity: 0, x: -20 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            transition={{ delay: index * 0.04 }}
                                            key={slot.toISOString()}
                                            className="flex min-h-[120px] group/row relative overflow-hidden"
                                        >
                                            {/* TIME COLUMN */}
                                            <div className="w-40 py-10 flex flex-col items-center justify-start border-r border-slate-100/30 bg-slate-50/10 relative z-10">
                                                <span className="text-2xl font-black text-slate-900 tracking-tighter opacity-80 group-hover/row:opacity-100 transition-opacity">
                                                    {format(slot, "HH:mm")}
                                                </span>
                                                <div className="w-1.5 h-1.5 rounded-full bg-slate-900/10 mt-3 group-hover/row:bg-slate-900/30 transition-colors" />
                                            </div>

                                            {/* SLOT CONTENT */}
                                            <div className="flex-1 p-6 relative">
                                                <AnimatePresence mode="wait">
                                                    {slotIsBlocked ? (
                                                        <motion.div
                                                            key={`${slot.toISOString()}-blocked`}
                                                            initial={{ opacity: 0 }}
                                                            animate={{ opacity: 1 }}
                                                            className="w-full h-full rounded-[40px] bg-slate-50/50 border-2 border-dashed border-slate-100 flex items-center justify-between px-10 group/blocked"
                                                        >
                                                            <div className="flex items-center gap-6">
                                                                <div className="w-14 h-14 rounded-2xl bg-white shadow-sm flex items-center justify-center text-slate-300 group-hover/blocked:text-slate-900 transition-colors">
                                                                    <Lock className="w-5 h-5" />
                                                                </div>
                                                                <div className="text-left">
                                                                    <span className="block text-[12px] font-black uppercase tracking-[0.3em] text-slate-400">
                                                                        Horário Bloqueado
                                                                    </span>
                                                                    <span className="block text-[10px] font-bold text-slate-300 italic">
                                                                        Este horário não está disponível para agendamentos
                                                                    </span>
                                                                </div>
                                                            </div>
                                                            <Button
                                                                onClick={() => handleUnblockSlot(slot)}
                                                                variant="ghost"
                                                                className="opacity-0 group-hover/blocked:opacity-100 text-red-500 font-black uppercase text-[10px] tracking-widest hover:bg-red-50 rounded-xl transition-all"
                                                            >
                                                                Desbloquear
                                                            </Button>
                                                        </motion.div>
                                                    ) : appInSlot ? (
                                                        <motion.div
                                                            key={`${appInSlot.id}-card`}
                                                            initial={{ opacity: 0, scale: 0.9, y: 10 }}
                                                            animate={{ opacity: 1, scale: 1, y: 0 }}
                                                            exit={{ opacity: 0, scale: 0.9, y: -10 }}
                                                            className={cn(
                                                                "h-full rounded-[36px] p-8 flex items-center justify-between transition-all border border-slate-200/30 shadow-sm hover:shadow-xl hover:-translate-y-1 duration-500",
                                                                getStatusStyle(appInSlot.status)
                                                            )}
                                                        >
                                                            <div className="flex items-center gap-8">
                                                                <div className="w-20 h-20 bg-white rounded-3xl flex items-center justify-center text-slate-900 shadow-xl shadow-slate-900/5 font-black text-2xl uppercase">
                                                                    {appInSlot.patient.nome_completo[0]}
                                                                </div>
                                                                <div>
                                                                    <div className="flex items-center gap-4">
                                                                        <h3 className="text-2xl font-black uppercase tracking-tight text-slate-900">
                                                                            {appInSlot.patient.nome_completo}
                                                                        </h3>
                                                                        <span className="text-[10px] font-black uppercase tracking-widest px-4 py-1.5 bg-white shadow-sm rounded-full border border-slate-100">
                                                                            {appInSlot.reason || 'Consulta'}
                                                                        </span>
                                                                    </div>
                                                                    <div className="flex items-center gap-6 mt-3">
                                                                        <span className="text-[11px] font-mono font-bold text-slate-400">CPF: {appInSlot.patient.cpf}</span>
                                                                        <div className="w-1.5 h-1.5 rounded-full bg-slate-200" />
                                                                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
                                                                            <Clock className="w-4 h-4" />
                                                                            Duração: {appInSlot.event_type?.duration || availability?.slot_duration_minutes || 30} MIN
                                                                        </span>
                                                                    </div>
                                                                </div>
                                                            </div>

                                                            <div className="flex items-center gap-6 relative">
                                                                {appInSlot.status === 'scheduled' && (
                                                                    <Button
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            handleCheckIn(appInSlot);
                                                                        }}
                                                                        className="bg-slate-900 hover:bg-black text-white font-black uppercase text-[10px] tracking-widest px-8 h-14 rounded-2xl shadow-xl shadow-slate-200 transition-all hover:scale-105 active:scale-95"
                                                                    >
                                                                        Check-in
                                                                    </Button>
                                                                )}

                                                                {appInSlot.status === 'waiting' && (
                                                                    <div className="flex items-center gap-2 px-5 py-2.5 bg-amber-100/50 border border-amber-200 rounded-full">
                                                                        <div className="w-2 h-2 rounded-full bg-amber-600 animate-pulse" />
                                                                        <span className="text-[10px] font-black uppercase tracking-widest text-amber-800">Na Recepção</span>
                                                                    </div>
                                                                )}

                                                                <div className="relative">
                                                                    <Button
                                                                        variant="ghost"
                                                                        size="icon"
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            setActiveMenuId(activeMenuId === appInSlot.id ? null : appInSlot.id);
                                                                        }}
                                                                        className={cn(
                                                                            "w-14 h-14 rounded-2xl text-slate-300 hover:text-slate-900 hover:bg-white border border-transparent hover:border-slate-100 transition-all focus:ring-0",
                                                                            activeMenuId === appInSlot.id && "text-slate-900 bg-white border-slate-100"
                                                                        )}
                                                                    >
                                                                        <MoreVertical className="w-6 h-6" />
                                                                    </Button>

                                                                    <AnimatePresence>
                                                                        {activeMenuId === appInSlot.id && (
                                                                            <>
                                                                                <motion.div
                                                                                    initial={{ opacity: 0 }}
                                                                                    animate={{ opacity: 1 }}
                                                                                    exit={{ opacity: 0 }}
                                                                                    className="fixed inset-0 z-[60]"
                                                                                    onClick={() => setActiveMenuId(null)}
                                                                                />
                                                                                <motion.div
                                                                                    initial={{ opacity: 0, scale: 0.95, y: 10, x: -10 }}
                                                                                    animate={{ opacity: 1, scale: 1, y: 0, x: 0 }}
                                                                                    exit={{ opacity: 0, scale: 0.95, y: 10 }}
                                                                                    className="absolute bottom-full right-0 mb-4 w-64 bg-white rounded-[24px] shadow-[0_20px_40px_-10px_rgba(0,0,0,0.2)] border border-slate-100 p-3 z-[70] overflow-hidden"
                                                                                >
                                                                                    <div className="space-y-1">
                                                                                        {appInSlot.status === 'scheduled' && (
                                                                                            <button
                                                                                                onClick={() => handleCheckIn(appInSlot)}
                                                                                                className="w-full h-14 px-4 flex items-center gap-4 hover:bg-slate-50 text-slate-600 hover:text-slate-900 transition-all rounded-xl"
                                                                                            >
                                                                                                <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                                                                                                    <Check className="w-4 h-4" />
                                                                                                </div>
                                                                                                <span className="text-xs font-black uppercase tracking-widest">Realizar Check-in</span>
                                                                                            </button>
                                                                                        )}

                                                                                        {(appInSlot.status === 'waiting' || appInSlot.status === 'scheduled') && (
                                                                                            <button
                                                                                                onClick={() => handleStartConsultation(appInSlot)}
                                                                                                className="w-full h-14 px-4 flex items-center gap-4 hover:bg-slate-50 text-slate-600 hover:text-slate-900 transition-all rounded-xl"
                                                                                            >
                                                                                                <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
                                                                                                    <Play className="w-4 h-4" />
                                                                                                </div>
                                                                                                <span className="text-xs font-black uppercase tracking-widest">Iniciar Consulta</span>
                                                                                            </button>
                                                                                        )}

                                                                                        <button
                                                                                            onClick={() => handleWhatsApp(appInSlot)}
                                                                                            className="w-full h-14 px-4 flex items-center gap-4 hover:bg-slate-50 text-slate-600 hover:text-slate-900 transition-all rounded-xl"
                                                                                        >
                                                                                            <div className="w-8 h-8 rounded-lg bg-green-50 text-green-600 flex items-center justify-center">
                                                                                                <MessageCircle className="w-4 h-4" />
                                                                                            </div>
                                                                                            <span className="text-xs font-black uppercase tracking-widest">WhatsApp</span>
                                                                                        </button>

                                                                                        <div className="h-[1px] bg-slate-50 my-1" />

                                                                                        <button
                                                                                            onClick={() => handleCancelAppointment(appInSlot)}
                                                                                            className="w-full h-14 px-4 flex items-center gap-4 hover:bg-red-50 text-slate-400 hover:text-red-600 transition-all rounded-xl"
                                                                                        >
                                                                                            <div className="w-8 h-8 rounded-lg bg-red-50 text-red-100 flex items-center justify-center group-hover:bg-red-100">
                                                                                                <Trash2 className="w-4 h-4" />
                                                                                            </div>
                                                                                            <span className="text-xs font-black uppercase tracking-widest">Cancelar</span>
                                                                                        </button>
                                                                                    </div>
                                                                                </motion.div>
                                                                            </>
                                                                        )}
                                                                    </AnimatePresence>
                                                                </div>
                                                            </div>
                                                        </motion.div>
                                                    ) : isSlotAvailable(slot) ? (
                                                        <motion.div
                                                            key={`${slot.toISOString()}-empty`}
                                                            initial={{ opacity: 0 }}
                                                            animate={{ opacity: 1 }}
                                                            className="w-full h-full flex items-center justify-between"
                                                        >
                                                            <button
                                                                onClick={() => handleOpenForm(slot)}
                                                                className="flex-1 h-full rounded-[40px] border-2 border-dashed border-slate-100 hover:border-slate-900 hover:bg-slate-900 hover:border-solid group/btn transition-all duration-500 flex items-center justify-between px-10 mr-4"
                                                            >
                                                                <div className="flex items-center gap-6">
                                                                    <div className="w-14 h-14 rounded-2xl border border-slate-100 bg-white shadow-sm flex items-center justify-center group-hover/btn:rotate-90 group-hover/btn:bg-white group-hover/btn:border-transparent transition-all duration-700">
                                                                        <Plus className="w-5 h-5 text-slate-400 group-hover/btn:text-slate-900" />
                                                                    </div>
                                                                    <div className="text-left">
                                                                        <span className="block text-[12px] font-black uppercase tracking-[0.3em] text-slate-200 group-hover/btn:text-white transition-colors">
                                                                            Horário Livre
                                                                        </span>
                                                                        <span className="block text-[10px] font-bold text-slate-100/0 group-hover/btn:text-white/50 transition-all">
                                                                            {format(slot, "HH:mm")} disponível para agendamento
                                                                        </span>
                                                                    </div>
                                                                </div>
                                                                <div className="w-12 h-12 rounded-full bg-white/10 opacity-0 group-hover/btn:opacity-100 transition-opacity flex items-center justify-center">
                                                                    <ChevronRight className="w-6 h-6 text-white" />
                                                                </div>
                                                            </button>
                                                            <Button
                                                                variant="ghost"
                                                                onClick={() => handleBlockSlot(slot)}
                                                                className="h-14 w-14 rounded-2xl text-slate-100 hover:text-slate-900 hover:bg-slate-50 border border-transparent hover:border-slate-100"
                                                                title="Bloquear Horário"
                                                            >
                                                                <Lock className="w-5 h-5" />
                                                            </Button>
                                                        </motion.div>
                                                    ) : (
                                                        <div className="w-full h-full rounded-[40px] border-2 border-dashed border-slate-50 bg-slate-50/10 flex items-center justify-between px-10 opacity-60 cursor-not-allowed">
                                                            <div className="flex items-center gap-6">
                                                                <div className="w-14 h-14 rounded-2xl border border-slate-100 bg-slate-100/30 flex items-center justify-center">
                                                                    <Clock className="w-5 h-5 text-slate-300" />
                                                                </div>
                                                                <div className="text-left">
                                                                    <span className="block text-[12px] font-black uppercase tracking-[0.3em] text-slate-300">
                                                                        Indisponível (Lead Time)
                                                                    </span>
                                                                    <span className="block text-[10px] font-bold text-slate-300 italic">
                                                                        Mínimo {availability?.min_scheduling_notice_hours || 2}h de antecedência necessário
                                                                    </span>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    )}
                                                </AnimatePresence>
                                            </div>
                                        </motion.div>
                                    );
                                })}
                            </div>
                        )}
                    </CardContent>
                </Card>
            </motion.div>

            <AnimatePresence>
                {showForm && (
                    <AppointmentForm
                        initialDate={currentDate.toISOString().split('T')[0]}
                        initialTime={selectedTimeSlot ? format(selectedTimeSlot, 'HH:mm') : undefined}
                        onSuccess={() => {
                            setShowForm(false);
                            fetchAppointments();
                        }}
                        onCancel={() => setShowForm(false)}
                    />
                )}
                {showSettings && (
                    <AvailabilityModal
                        onClose={() => setShowSettings(false)}
                        onSave={() => {
                            fetchAvailability();
                            fetchAppointments();
                            fetchBlockedSlots();
                        }}
                    />
                )}
            </AnimatePresence>
        </div>
    );
}
