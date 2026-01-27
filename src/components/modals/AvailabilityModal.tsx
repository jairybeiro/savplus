'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { X, Save, Clock, Calendar, Settings as SettingsIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';

interface AvailabilitySettings {
    doctor_id: string;
    slot_duration_minutes: number;
    min_scheduling_notice_hours: number;
    working_days: string[];
    start_hour: string;
    end_hour: string;
}

interface AvailabilityModalProps {
    onClose: () => void;
    onSave: () => void;
}

const DAYS = [
    { id: 'mon', label: 'Seg' },
    { id: 'tue', label: 'Ter' },
    { id: 'wed', label: 'Qua' },
    { id: 'thu', label: 'Qui' },
    { id: 'fri', label: 'Sex' },
    { id: 'sat', label: 'Sáb' },
    { id: 'sun', label: 'Dom' },
];

export function AvailabilityModal({ onClose, onSave }: AvailabilityModalProps) {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [settings, setSettings] = useState<AvailabilitySettings>({
        doctor_id: '',
        slot_duration_minutes: 30,
        min_scheduling_notice_hours: 2,
        working_days: ['mon', 'tue', 'wed', 'thu', 'fri'],
        start_hour: '08:00',
        end_hour: '18:00',
    });

    useEffect(() => {
        fetchSettings();
    }, []);

    const fetchSettings = async () => {
        setLoading(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            const { data, error } = await supabase
                .from('doctor_availability_settings')
                .select('*')
                .eq('doctor_id', user.id)
                .maybeSingle();

            if (data) {
                setSettings(data);
            } else {
                // Initialize settings if first time
                setSettings(prev => ({ ...prev, doctor_id: user.id }));
            }
        } catch (error) {
            console.error('Error fetching settings:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error('User not found');

            const { error } = await supabase
                .from('doctor_availability_settings')
                .upsert({
                    ...settings,
                    doctor_id: user.id,
                    updated_at: new Date().toISOString()
                }, { onConflict: 'doctor_id' });

            if (error) throw error;

            toast.success('Configurações salvas com sucesso!');
            onSave();
            onClose();
        } catch (error: any) {
            toast.error('Erro ao salvar: ' + error.message);
        } finally {
            setSaving(false);
        }
    };

    const toggleDay = (dayId: string) => {
        setSettings(prev => ({
            ...prev,
            working_days: prev.working_days.includes(dayId)
                ? prev.working_days.filter(d => d !== dayId)
                : [...prev.working_days, dayId]
        }));
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 bg-slate-900/40 backdrop-blur-md"
                onClick={onClose}
            />

            <motion.div
                initial={{ scale: 0.9, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.9, opacity: 0, y: 20 }}
                className="relative bg-white w-full max-w-2xl rounded-[40px] shadow-2xl overflow-hidden"
            >
                <div className="p-10">
                    <div className="flex items-center justify-between mb-10">
                        <div className="flex items-center gap-6">
                            <div className="w-16 h-16 bg-slate-900 rounded-[24px] flex items-center justify-center text-white">
                                <SettingsIcon className="w-8 h-8" />
                            </div>
                            <div>
                                <h2 className="text-2xl font-black text-slate-900 uppercase italic tracking-tight">Configuração da Agenda</h2>
                                <p className="text-slate-400 font-bold text-xs uppercase tracking-widest mt-1 italic">Personalize sua jornada e lead time</p>
                            </div>
                        </div>
                        <button onClick={onClose} className="w-12 h-12 rounded-2xl bg-slate-50 flex items-center justify-center text-slate-400 hover:text-slate-900 transition-all">
                            <X className="w-6 h-6" />
                        </button>
                    </div>

                    {loading ? (
                        <div className="py-20 flex flex-col items-center justify-center opacity-40">
                            <div className="w-10 h-10 border-4 border-slate-900 border-t-transparent rounded-full animate-spin mb-4" />
                            <p className="text-[10px] font-black uppercase tracking-widest">Carregando...</p>
                        </div>
                    ) : (
                        <div className="space-y-10">
                            {/* DIAS DE TRABALHO */}
                            <div className="space-y-4">
                                <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 ml-1">Dias de Atendimento</label>
                                <div className="flex flex-wrap gap-3">
                                    {DAYS.map(day => (
                                        <button
                                            key={day.id}
                                            onClick={() => toggleDay(day.id)}
                                            className={cn(
                                                "px-6 py-3 rounded-2xl font-black uppercase text-[10px] tracking-widest transition-all border",
                                                settings.working_days.includes(day.id)
                                                    ? "bg-slate-900 text-white border-slate-900 shadow-xl shadow-slate-200"
                                                    : "bg-white text-slate-400 border-slate-100 hover:border-slate-300"
                                            )}
                                        >
                                            {day.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-10">
                                {/* HORÁRIOS */}
                                <div className="space-y-6">
                                    <div className="space-y-4">
                                        <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 ml-1">Início da Jornada</label>
                                        <Input
                                            type="time"
                                            value={settings.start_hour}
                                            onChange={e => setSettings({ ...settings, start_hour: e.target.value })}
                                            className="h-14 bg-slate-50 border-transparent rounded-[20px] font-bold"
                                        />
                                    </div>
                                    <div className="space-y-4">
                                        <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 ml-1">Fim da Jornada</label>
                                        <Input
                                            type="time"
                                            value={settings.end_hour}
                                            onChange={e => setSettings({ ...settings, end_hour: e.target.value })}
                                            className="h-14 bg-slate-50 border-transparent rounded-[20px] font-bold"
                                        />
                                    </div>
                                </div>

                                {/* CONFIGS TÉCNICAS */}
                                <div className="space-y-6">
                                    <div className="space-y-4">
                                        <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 ml-1">Duração do Slot</label>
                                        <select
                                            value={settings.slot_duration_minutes}
                                            onChange={e => setSettings({ ...settings, slot_duration_minutes: parseInt(e.target.value) })}
                                            className="w-full h-14 bg-slate-50 border-transparent rounded-[20px] px-6 font-bold text-sm focus:ring-2 focus:ring-slate-900/20 transition-all outline-none appearance-none"
                                        >
                                            <option value={15}>15 minutos</option>
                                            <option value={30}>30 minutos</option>
                                            <option value={45}>45 minutos</option>
                                            <option value={60}>1 hora</option>
                                        </select>
                                    </div>
                                    <div className="space-y-4">
                                        <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 ml-1">Lead Time (Horas)</label>
                                        <Input
                                            type="number"
                                            value={settings.min_scheduling_notice_hours}
                                            onChange={e => setSettings({ ...settings, min_scheduling_notice_hours: parseInt(e.target.value) })}
                                            className="h-14 bg-slate-50 border-transparent rounded-[20px] font-bold"
                                            min={0}
                                        />
                                    </div>
                                </div>
                            </div>

                            <Button
                                onClick={handleSave}
                                disabled={saving}
                                className="w-full h-20 bg-slate-900 hover:bg-black text-white rounded-[30px] font-black uppercase text-xs tracking-[0.3em] shadow-2xl shadow-slate-200 transition-all flex items-center justify-center gap-4 mt-4"
                            >
                                {saving ? 'Salvando...' : (
                                    <>
                                        <Save className="w-5 h-5" />
                                        Salvar Configurações
                                    </>
                                )}
                            </Button>
                        </div>
                    )}
                </div>
            </motion.div>
        </div>
    );
}

function cn(...classes: any[]) {
    return classes.filter(Boolean).join(' ');
}
