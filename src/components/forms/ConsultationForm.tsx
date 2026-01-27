'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Activity, Beaker, ClipboardList, Stethoscope } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ConsultationFormProps {
    attendanceId: string;
    patientName?: string;
    triageData?: {
        queixa?: string;
        discriminador?: string;
        sinais_vitais?: any;
        classificacao?: string;
        alergias?: string;
    };
    onSuccess: () => void;
    onCancel: () => void;
}

export function ConsultationForm({ attendanceId, patientName, triageData, onSuccess, onCancel }: ConsultationFormProps) {
    const [loading, setLoading] = useState(false);
    const [showInternamentoModal, setShowInternamentoModal] = useState(false);
    const [activeTab, setActiveTab] = useState<'exame' | 'conduta'>('exame');
    const [conductSubTab, setConductSubTab] = useState<'prescricao' | 'exames' | 'atestado'>('prescricao');

    // Stability Protocol: Initial state for advanced fields
    const [formData, setFormData] = useState({
        anamnese: '',
        exame_fisico: '',
        diagnostico: '',
        prescricao: '',
        exames_solicitados: '',
        historico_familiar: '',
        alergias: '',
        atestado: ''
    });

    // Load existing data if any (for continuity/recall)
    useEffect(() => {
        async function loadClinicalData() {
            try {
                const { data, error } = await supabase
                    .from('attendances')
                    .select('anamnese, exame_fisico, diagnostico, prescricao, historico_familiar, alergias, atestado')
                    .eq('id', attendanceId)
                    .single();

                if (data) {
                    setFormData({
                        anamnese: data.anamnese || '',
                        exame_fisico: data.exame_fisico || '',
                        diagnostico: data.diagnostico || '',
                        prescricao: data.prescricao || '',
                        exames_solicitados: (data as any).exames_solicitados || '',
                        historico_familiar: data.historico_familiar || '',
                        alergias: data.alergias || triageData?.alergias || '',
                        atestado: data.atestado || ''
                    });
                }
            } catch (e) {
                console.warn('Silent Protocol: Could not load initial clinical data', e);
            }
        }
        loadClinicalData();
    }, [attendanceId, triageData?.alergias]);

    const handleFinalize = async (nextStatus: string) => {
        setLoading(true);
        try {
            const { error } = await supabase
                .from('attendances')
                .update({
                    status: nextStatus,
                    anamnese: formData.anamnese,
                    exame_fisico: formData.exame_fisico,
                    diagnostico: formData.diagnostico,
                    prescricao: formData.prescricao,
                    exames_solicitados: formData.exames_solicitados,
                    historico_familiar: formData.historico_familiar,
                    alergias: formData.alergias,
                    atestado: formData.atestado,
                    updated_at: new Date().toISOString()
                })
                .eq('id', attendanceId);

            if (error) {
                console.error('DATABASE ERROR:', error);
                throw new Error(`Erro no Banco de Dados: ${error.message}. Verifique se as colunas e os novos status (enum) existem na tabela 'attendances'.`);
            }
            onSuccess();
        } catch (err: any) {
            console.error('Stability Protocol: Error saving consultation:', err);
            alert(err.message || 'Erro ao finalizar atendimento. Verifique a conexão.');
        } finally {
            setLoading(false);
        }
    };

    const labelClass = "block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 mt-4";
    const textareaClass = "mt-1 block w-full rounded-md border-slate-200 shadow-sm focus:border-blue-600 focus:ring-blue-600 text-base font-medium text-slate-800 placeholder:text-slate-300 p-3 min-h-[100px]";

    if (showInternamentoModal) {
        return (
            <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 backdrop-blur-sm">
                <div className="bg-white p-8 rounded-2xl w-full max-w-md space-y-6 shadow-2xl border border-slate-100">
                    <div className="flex items-center gap-3 text-red-600 border-b pb-4">
                        <Activity className="w-6 h-6" />
                        <h3 className="text-2xl font-black uppercase tracking-tighter">Solicitar Internamento</h3>
                    </div>

                    <div className="space-y-4">
                        <div>
                            <label className={labelClass}>Prioridade Clínica</label>
                            <select
                                id="mo-prioridade"
                                className="w-full h-12 border-2 border-slate-200 rounded-xl px-4 text-lg font-bold bg-white focus:border-red-600 outline-none"
                            >
                                <option value="1">Prioridade 1 (Imediata)</option>
                                <option value="2">Prioridade 2 (Urgente)</option>
                                <option value="3">Prioridade 3 (Estável)</option>
                            </select>
                        </div>
                        <div>
                            <label className={labelClass}>Justificativa</label>
                            <textarea
                                id="mo-justificativa"
                                className={cn(textareaClass, "min-h-[100px] border-2")}
                                placeholder="Motivo do internamento..."
                            />
                        </div>
                    </div>

                    <div className="flex flex-col gap-3 pt-4">
                        <Button
                            className="h-14 bg-red-600 hover:bg-red-700 text-white font-black text-lg rounded-xl shadow-lg"
                            onClick={async () => {
                                setLoading(true);
                                try {
                                    const prio = (document.getElementById('mo-prioridade') as HTMLSelectElement).value;
                                    const just = (document.getElementById('mo-justificativa') as HTMLTextAreaElement).value;
                                    const { error } = await supabase
                                        .from('attendances')
                                        .update({
                                            status: 'aguardando_internacao',
                                            data_solicitacao_vaga: new Date().toISOString(),
                                            prioridade_regulacao: prio,
                                            justificativa_internamento: just,
                                            anamnese: formData.anamnese,
                                            diagnostico: formData.diagnostico,
                                            updated_at: new Date().toISOString()
                                        })
                                        .eq('id', attendanceId);
                                    if (error) {
                                        console.error('DATABASE ERROR:', error);
                                        throw new Error(`Erro no Banco de Dados: ${error.message}`);
                                    }
                                    onSuccess();
                                } catch (e: any) {
                                    alert(e.message || 'Erro ao solicitar vaga.');
                                } finally {
                                    setLoading(false);
                                }
                            }}
                        >
                            CONFIRMAR SOLICITAÇÃO
                        </Button>
                        <Button variant="ghost" className="h-12 font-bold text-slate-400" onClick={() => setShowInternamentoModal(false)}>
                            CANCELAR
                        </Button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* 1. Resumo da Triagem (Clean & Technical) */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
                <div className="flex items-center gap-2 mb-4 border-b pb-2 opacity-50">
                    <ClipboardList className="w-4 h-4" />
                    <h3 className="text-xs font-black uppercase tracking-widest">Resumo da Triagem</h3>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    <div className="md:col-span-2 space-y-4">
                        <div>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Queixa Principal</p>
                            <p className="text-slate-800 font-medium leading-relaxed">{triageData?.queixa || 'Não informada'}</p>
                        </div>
                        <div>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Histórico / Discriminador</p>
                            <p className="text-slate-700 text-sm italic">"{triageData?.discriminador || 'Sem discriminadores adicionais'}"</p>
                        </div>
                        {triageData?.alergias && (
                            <div className="bg-red-50 p-3 rounded-lg border border-red-100">
                                <p className="text-[10px] font-black text-red-600 uppercase tracking-widest flex items-center gap-2">
                                    <Activity className="w-3 h-3" />
                                    Alergias Relatadas na Triagem
                                </p>
                                <p className="text-red-800 font-bold text-sm mt-1">{triageData.alergias}</p>
                            </div>
                        )}
                    </div>

                    <div className="bg-slate-50 p-4 rounded-lg border border-slate-100 flex flex-col gap-3">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b pb-1">Sinais Vitais</p>
                        <div className="grid grid-cols-2 gap-y-2 text-xs">
                            <div className="flex justify-between pr-2 border-r border-slate-200">
                                <span className="text-slate-500 font-bold">PA:</span>
                                <span className="font-mono font-black text-slate-900">{(triageData?.sinais_vitais as any)?.pa || '--'}</span>
                            </div>
                            <div className="flex justify-between pl-2">
                                <span className="text-slate-500 font-bold">TEMP:</span>
                                <span className="font-mono font-black text-slate-900">{(triageData?.sinais_vitais as any)?.temp || '--'}°C</span>
                            </div>
                            <div className="flex justify-between pr-2 border-r border-slate-200">
                                <span className="text-slate-500 font-bold">FC:</span>
                                <span className="font-mono font-black text-slate-900">{(triageData?.sinais_vitais as any)?.fc || '--'}</span>
                            </div>
                            <div className="flex justify-between pl-2">
                                <span className="text-slate-500 font-bold">SAT:</span>
                                <span className="font-mono font-black text-slate-900">{(triageData?.sinais_vitais as any)?.spo2 || '--'}%</span>
                            </div>
                            {(triageData?.sinais_vitais as any)?.hgt && (
                                <div className="col-span-2 mt-1 pt-1 border-t border-slate-200 flex justify-between">
                                    <span className="text-orange-600 font-black uppercase text-[9px]">Glicemia (HGT):</span>
                                    <span className="font-mono font-black text-orange-700">{(triageData?.sinais_vitais as any)?.hgt} mg/dL</span>
                                </div>
                            )}
                        </div>
                        {triageData?.classificacao && (
                            <div className="mt-2 pt-2 border-t border-slate-200 flex items-center justify-between">
                                <span className="text-[10px] font-black text-slate-400 uppercase">Risco:</span>
                                <span className={cn(
                                    "px-2 py-0.5 rounded text-[10px] font-black uppercase text-white shadow-sm",
                                    triageData.classificacao === 'vermelho' ? "bg-red-600" :
                                        triageData.classificacao === 'laranja' ? "bg-orange-500" :
                                            triageData.classificacao === 'amarelo' ? "bg-yellow-400 text-slate-900" :
                                                triageData.classificacao === 'verde' ? "bg-green-600" : "bg-blue-600"
                                )}>
                                    {triageData.classificacao}
                                </span>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* 2. Formulário com Abas */}
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                <div className="flex bg-slate-50 border-b border-slate-200">
                    <button
                        onClick={() => setActiveTab('exame')}
                        className={cn(
                            "px-8 py-4 text-xs font-black uppercase tracking-widest border-r transition-all",
                            activeTab === 'exame' ? "bg-white text-blue-600 border-b-2 border-b-blue-600" : "text-slate-400 hover:bg-slate-100"
                        )}
                    >
                        1. Exame Clínico
                    </button>
                    <button
                        onClick={() => setActiveTab('conduta')}
                        className={cn(
                            "px-8 py-4 text-xs font-black uppercase tracking-widest border-r transition-all",
                            activeTab === 'conduta' ? "bg-white text-green-600 border-b-2 border-b-green-600" : "text-slate-400 hover:bg-slate-100"
                        )}
                    >
                        2. Conduta e Prescrição
                    </button>
                </div>

                <div className="p-6">
                    {activeTab === 'exame' ? (
                        <div className="space-y-4 animate-in fade-in slide-in-from-left-2 duration-300">
                            <div>
                                <div className="flex items-center justify-between">
                                    <label className={labelClass}>Anamnese / Evolução</label>
                                    <div className="flex gap-2">
                                        <button
                                            type="button"
                                            onClick={() => setFormData(prev => ({ ...prev, anamnese: prev.anamnese + (prev.anamnese ? '\n' : '') + '[+ Exame Físico Normal]' }))}
                                            className="text-[9px] font-black bg-slate-100 hover:bg-slate-200 px-2 py-1 rounded text-slate-600 uppercase transition-colors"
                                        >
                                            [+ Exame Normal]
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setFormData(prev => ({ ...prev, anamnese: prev.anamnese + (prev.anamnese ? '\n' : '') + '[+ Sem Alergias]' }))}
                                            className="text-[9px] font-black bg-slate-100 hover:bg-slate-200 px-2 py-1 rounded text-slate-600 uppercase transition-colors"
                                        >
                                            [+ Sem Alergias]
                                        </button>
                                    </div>
                                </div>
                                <textarea
                                    className={textareaClass}
                                    value={formData.anamnese}
                                    onChange={e => setFormData({ ...formData, anamnese: e.target.value })}
                                    placeholder="Histórico da doença atual, sintomas, tempo de evolução..."
                                />
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div>
                                    <label className={labelClass}>Exame Físico</label>
                                    <textarea
                                        className={cn(textareaClass, "min-h-[150px]")}
                                        value={formData.exame_fisico}
                                        onChange={e => setFormData({ ...formData, exame_fisico: e.target.value })}
                                        placeholder="Avaliação por sistemas..."
                                    />
                                </div>
                                <div className="space-y-4">
                                    <div>
                                        <label className={labelClass}>Alergias / Antecedentes</label>
                                        <textarea
                                            className={cn(textareaClass, "min-h-[60px] bg-red-50/20")}
                                            value={formData.alergias}
                                            onChange={e => setFormData({ ...formData, alergias: e.target.value })}
                                        />
                                    </div>
                                    <div>
                                        <label className={labelClass}>Hipótese Diagnóstica (CID)</label>
                                        <textarea
                                            className={cn(textareaClass, "min-h-[60px] font-bold text-blue-800")}
                                            value={formData.diagnostico}
                                            onChange={e => setFormData({ ...formData, diagnostico: e.target.value })}
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-6 animate-in fade-in slide-in-from-right-2 duration-300">
                            {/* Sub-Tabs for Conduct */}
                            <div className="flex bg-slate-100 p-1 rounded-xl w-fit">
                                {[
                                    { id: 'prescricao', label: '1. Prescrição', color: 'text-green-600' },
                                    { id: 'exames', label: '2. Exames', color: 'text-blue-600' },
                                    { id: 'atestado', label: '3. Atestado', color: 'text-slate-600' }
                                ].map((tab) => (
                                    <button
                                        key={tab.id}
                                        onClick={() => setConductSubTab(tab.id as any)}
                                        className={cn(
                                            "px-4 py-2 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all",
                                            conductSubTab === tab.id
                                                ? "bg-white shadow-sm " + tab.color
                                                : "text-slate-400 hover:text-slate-600"
                                        )}
                                    >
                                        {tab.label}
                                    </button>
                                ))}
                            </div>

                            <div className="min-h-[300px]">
                                {conductSubTab === 'prescricao' && (
                                    <div className="animate-in fade-in duration-200">
                                        <label className={cn(labelClass, "text-green-600 mt-0")}>Prescrição Médica (Hospitalar/Observação)</label>
                                        <textarea
                                            className={cn(textareaClass, "min-h-[250px] bg-green-50/10 border-green-100 text-green-900 font-mono text-sm")}
                                            value={formData.prescricao}
                                            onChange={e => setFormData({ ...formData, prescricao: e.target.value })}
                                            placeholder="1. Dipirona 1g EV agora... 2. Soro Fisiológico 500ml..."
                                        />
                                    </div>
                                )}

                                {conductSubTab === 'exames' && (
                                    <div className="animate-in fade-in duration-200">
                                        <label className={cn(labelClass, "text-blue-600 mt-0")}>Solicitação de Exames (Laboratório / Imagem)</label>
                                        <textarea
                                            className={cn(textareaClass, "min-h-[250px] bg-blue-50/10 border-blue-100 text-blue-900 font-mono text-sm")}
                                            value={formData.exames_solicitados}
                                            onChange={e => setFormData({ ...formData, exames_solicitados: e.target.value })}
                                            placeholder="Ex: Hemograma completo, Creatinina, Raio-X de Tórax..."
                                        />
                                    </div>
                                )}

                                {conductSubTab === 'atestado' && (
                                    <div className="animate-in fade-in duration-200">
                                        <label className={cn(labelClass, "text-slate-600 mt-0")}>Atestado / Orientações de Alta / Encaminhamentos</label>
                                        <textarea
                                            className={cn(textareaClass, "min-h-[250px] bg-slate-50/30 font-medium")}
                                            value={formData.atestado}
                                            onChange={e => setFormData({ ...formData, atestado: e.target.value })}
                                            placeholder="Orientações de repouso, medicação domiciliar, etc..."
                                        />
                                    </div>
                                )}
                            </div>

                            <div className="flex gap-4 pt-4 border-t border-slate-100">
                                <Button variant="outline" className="h-10 text-[10px] font-black uppercase tracking-widest flex gap-2 border-2">
                                    <Stethoscope className="w-3 h-3" /> Imprimir Receita/Conduta
                                </Button>
                                <Button variant="outline" className="h-10 text-[10px] font-black uppercase tracking-widest flex gap-2 border-2">
                                    <ClipboardList className="w-3 h-3" /> Imprimir Atestado
                                </Button>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* 3. Rodapé de Ações de Desfecho */}
            <div className="flex justify-between items-center py-6 border-t border-slate-200">
                <Button variant="ghost" className="h-14 px-8 font-black text-slate-400" onClick={onCancel}>
                    VOLTAR
                </Button>

                <div className="flex gap-3">
                    <Button
                        type="button"
                        disabled={loading}
                        onClick={() => handleFinalize('finalizado')}
                        className="h-14 px-8 bg-green-600 hover:bg-green-700 text-white font-black text-sm rounded-xl shadow-lg flex flex-col items-center justify-center leading-none"
                    >
                        <span className="text-lg">🏠 ALTA</span>
                        <span className="text-[8px] opacity-70 mt-1 uppercase">Liberar Paciente</span>
                    </Button>

                    <Button
                        type="button"
                        disabled={loading}
                        onClick={() => handleFinalize('em_observacao')}
                        className="h-14 px-8 bg-orange-500 hover:bg-orange-600 text-white font-black text-sm rounded-xl shadow-lg flex flex-col items-center justify-center leading-none"
                    >
                        <span className="text-lg">💉 MEDICAÇÃO</span>
                        <span className="text-[8px] opacity-70 mt-1 uppercase">Enviar para Obs</span>
                    </Button>

                    <Button
                        type="button"
                        disabled={loading}
                        onClick={() => setShowInternamentoModal(true)}
                        className="h-14 px-8 bg-red-600 hover:bg-red-700 text-white font-black text-sm rounded-xl shadow-lg flex flex-col items-center justify-center leading-none"
                    >
                        <span className="text-lg">🏥 INTERNAR</span>
                        <span className="text-[8px] opacity-70 mt-1 uppercase">Módulo NIR</span>
                    </Button>
                </div>
            </div>
        </div>
    );
}
