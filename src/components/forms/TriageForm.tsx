'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Button } from '@/components/ui/button';
import { MANCHESTER_COLORS, ManchesterColor } from '@/lib/manchester';
import { cn } from '@/lib/utils';
import { Activity } from 'lucide-react';

interface TriageFormProps {
    attendanceId: string;
    onSuccess: () => void;
    onCancel: () => void;
}

export function TriageForm({ attendanceId, onSuccess, onCancel }: TriageFormProps) {
    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState({
        queixa_principal: '',
        historico_clinico: '',
        discriminadores: '',
        pa_sis: '',
        pa_dias: '',
        temperatura: '',
        frequencia_cardiaca: '',
        saturacao_o2: '',
        frequencia_respiratoria: '',
        hgt: '',
        alergias: '',
        classificacao_risco: 'azul' as ManchesterColor,
    });

    // 1. Load Data (Persistence)
    useEffect(() => {
        async function loadData() {
            const { data, error } = await supabase
                .from('attendances')
                .select('queixa_principal, discriminador, sinais_vitais, classificacao_risco, alergias, historico_clinico')
                .eq('id', attendanceId)
                .single();

            if (data) {
                setFormData(prev => {
                    const paValue = (data.sinais_vitais as any)?.pa || '';
                    const [sis, dias] = paValue.split('/');
                    return {
                        ...prev,
                        queixa_principal: data.queixa_principal || '',
                        classificacao_risco: (data.classificacao_risco as ManchesterColor) || 'azul',
                        // Map signs if they exist
                        pa_sis: sis || '',
                        pa_dias: dias || '',
                        temperatura: (data.sinais_vitais as any)?.temp || '',
                        frequencia_cardiaca: (data.sinais_vitais as any)?.fc || '',
                        saturacao_o2: (data.sinais_vitais as any)?.spo2 || '',
                        frequencia_respiratoria: (data.sinais_vitais as any)?.fr || '',
                        hgt: (data.sinais_vitais as any)?.hgt || '',
                        alergias: data.alergias || '',
                        historico_clinico: data.historico_clinico || '',
                        discriminadores: data.discriminador || '',
                    };
                });
            }
        }
        loadData();
    }, [attendanceId]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        try {
            const { error } = await supabase
                .from('attendances')
                .update({
                    status: 'aguardando_medico',
                    queixa_principal: formData.queixa_principal,
                    discriminador: formData.discriminadores,
                    historico_clinico: formData.historico_clinico,
                    classificacao_risco: formData.classificacao_risco,
                    alergias: formData.alergias,
                    sinais_vitais: {
                        pa: (formData.pa_sis && formData.pa_dias) ? `${formData.pa_sis}/${formData.pa_dias}` : '',
                        temp: formData.temperatura,
                        fc: formData.frequencia_cardiaca,
                        spo2: formData.saturacao_o2,
                        fr: formData.frequencia_respiratoria,
                        hgt: formData.hgt
                    },
                    updated_at: new Date().toISOString(),
                })
                .eq('id', attendanceId);

            if (error) throw error;
            onSuccess();
        } catch (err) {
            console.error('Error saving triage:', err);
            alert('Erro ao salvar triagem');
        } finally {
            setLoading(false);
        }
    };

    const isFormValid =
        formData.pa_sis.trim() !== '' &&
        formData.pa_dias.trim() !== '' &&
        formData.temperatura.trim() !== '' &&
        formData.frequencia_cardiaca.trim() !== '' &&
        formData.saturacao_o2.trim() !== '';

    const handleNumberInput = (value: string, field: string) => {
        // Allow only numbers, decimals, and commas
        const cleanValue = value.replace(/[^0-9.,]/g, '');
        setFormData({ ...formData, [field]: cleanValue });
    };

    const inputClass = "mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-blue-600 focus:ring-blue-600 text-lg font-bold text-gray-900 placeholder:text-slate-300 h-10 px-3 bg-white";
    const labelClass = "block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1";
    const textareaClass = "mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-blue-600 focus:ring-blue-600 text-base font-medium text-gray-900 placeholder:text-slate-300 p-3 bg-white";

    return (
        <form onSubmit={handleSubmit} className="space-y-4 bg-slate-50/50 p-6 rounded-xl shadow-xl border border-slate-200">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Column 1: Vitals */}
                <div className="space-y-4 bg-white p-4 rounded-lg border border-slate-200 shadow-sm">
                    <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                        <Activity className="w-4 h-4 text-blue-600" />
                        <h3 className="text-[11px] font-black text-slate-800 uppercase tracking-widest">Sinais Vitais</h3>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div className="col-span-2">
                            <label className={labelClass}>Pressão Arterial (mmHg)</label>
                            <div className="flex items-center gap-2">
                                <input
                                    type="text" placeholder="SIS" className={cn(inputClass, "text-center")}
                                    value={formData.pa_sis}
                                    onChange={e => handleNumberInput(e.target.value, 'pa_sis')}
                                />
                                <span className="text-2xl font-black text-slate-300">/</span>
                                <input
                                    type="text" placeholder="DIAS" className={cn(inputClass, "text-center")}
                                    value={formData.pa_dias}
                                    onChange={e => handleNumberInput(e.target.value, 'pa_dias')}
                                />
                            </div>
                        </div>
                        <div>
                            <label className={labelClass}>Temp. (°C)</label>
                            <input
                                type="text" placeholder="36.5" className={inputClass}
                                value={formData.temperatura}
                                onChange={e => handleNumberInput(e.target.value, 'temperatura')}
                            />
                        </div>
                        <div>
                            <label className={labelClass}>Saturação (%)</label>
                            <input
                                type="text" placeholder="98" className={inputClass}
                                value={formData.saturacao_o2}
                                onChange={e => handleNumberInput(e.target.value, 'saturacao_o2')}
                            />
                        </div>
                        <div>
                            <label className={labelClass}>F.C. (bpm)</label>
                            <input
                                type="text" placeholder="80" className={inputClass}
                                value={formData.frequencia_cardiaca}
                                onChange={e => handleNumberInput(e.target.value, 'frequencia_cardiaca')}
                            />
                        </div>
                        <div>
                            <label className={labelClass}>F.R. (rpm)</label>
                            <input
                                type="text" placeholder="16" className={inputClass}
                                value={formData.frequencia_respiratoria}
                                onChange={e => handleNumberInput(e.target.value, 'frequencia_respiratoria')}
                            />
                        </div>
                        <div>
                            <label className={labelClass}>HGT (mg/dL)</label>
                            <input
                                type="text" placeholder="90" className={cn(inputClass, "border-orange-200 focus:border-orange-500")}
                                value={formData.hgt}
                                onChange={e => handleNumberInput(e.target.value, 'hgt')}
                            />
                        </div>
                    </div>
                </div>

                {/* Column 2: Subjective */}
                <div className="space-y-4 bg-white p-4 rounded-lg border border-slate-200 shadow-sm">
                    <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                        <Activity className="w-4 h-4 text-blue-600" />
                        <h3 className="text-[11px] font-black text-slate-800 uppercase tracking-widest">Avaliação Clínica</h3>
                    </div>

                    <div>
                        <label className={labelClass}>Queixa Principal</label>
                        <textarea
                            rows={2} className={textareaClass}
                            value={formData.queixa_principal}
                            onChange={e => setFormData({ ...formData, queixa_principal: e.target.value })}
                        />
                    </div>

                    <div>
                        <label className={cn(labelClass, "text-red-500")}>Alergias</label>
                        <textarea
                            rows={2} className={cn(textareaClass, "border-red-100 bg-red-50/10")}
                            value={formData.alergias}
                            onChange={e => setFormData({ ...formData, alergias: e.target.value })}
                            placeholder="Ex: Dipirona, Latex, Frutos do mar..."
                        />
                    </div>

                    <div>
                        <label className={labelClass}>Histórico / Discriminadores</label>
                        <textarea
                            rows={3} className={textareaClass}
                            value={formData.historico_clinico}
                            onChange={e => setFormData({ ...formData, historico_clinico: e.target.value })}
                            placeholder="Descreva o quadro clínico..."
                        />
                    </div>
                </div>
            </div>

            {/* Manchester Classification */}
            <div className="pt-4 border-t border-slate-200">
                <label className={labelClass}>Classificação de Risco (Manchester)</label>
                <div className="mt-2 grid grid-cols-5 gap-2">
                    {(Object.keys(MANCHESTER_COLORS) as ManchesterColor[]).map((color) => (
                        <button
                            key={color}
                            type="button"
                            onClick={() => setFormData({ ...formData, classificacao_risco: color })}
                            className={cn(
                                "py-3 rounded-lg font-black uppercase text-[10px] transition-all border-2 flex flex-col items-center justify-center gap-1 shadow-sm",
                                formData.classificacao_risco === color
                                    ? "ring-2 ring-offset-2 ring-slate-400 scale-105 border-white shadow-lg"
                                    : "opacity-40 hover:opacity-100 border-transparent",
                                MANCHESTER_COLORS[color]
                            )}
                        >
                            {color}
                        </button>
                    ))}
                </div>
            </div>

            <div className="flex justify-end gap-3 pt-6">
                <Button type="button" variant="outline" className="h-12 px-8 font-bold border-2 border-slate-200 text-slate-600 hover:bg-slate-100" onClick={onCancel} disabled={loading}>
                    CANCELAR
                </Button>
                <Button
                    type="submit"
                    className={cn(
                        "h-12 px-12 font-black text-base shadow-lg transition-all",
                        isFormValid ? "bg-blue-600 hover:bg-blue-700 text-white" : "bg-slate-200 text-slate-400 cursor-not-allowed"
                    )}
                    disabled={loading || !isFormValid}
                >
                    {loading ? 'PROCESSANDO...' : 'FINALIZAR TRIAGEM'}
                </Button>
            </div>
        </form>
    );
}
