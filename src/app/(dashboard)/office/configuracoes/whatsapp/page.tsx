'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MessageSquare, RefreshCw, Smartphone, CheckCircle2, XCircle, AlertCircle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

export default function WhatsAppConfigPage() {
    const [loading, setLoading] = useState(true);
    const [connecting, setConnecting] = useState(false);
    const [connection, setConnection] = useState<any>(null);
    const [instanceName, setInstanceName] = useState('');
    const [clinicId, setClinicId] = useState<string | null>(null);
    const [doctorId, setDoctorId] = useState<string | null>(null);
    const [configError, setConfigError] = useState<string | null>(null);
    const [contextError, setContextError] = useState<string | null>(null);
    const [authStatus, setAuthStatus] = useState<'loading' | 'unauthenticated' | 'no_profile' | 'ready'>('loading');
    const pollingIntervalRef = React.useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
        fetchInitialData();
        return () => {
            if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
        };
    }, []);

    const startPolling = (cId: string, dId: string) => {
        if (pollingIntervalRef.current) {
            console.log('[WhatsApp Polling] Clearing existing interval.');
            clearInterval(pollingIntervalRef.current);
        }

        console.log(`[WhatsApp Polling] Starting for Clinic: ${cId}, Doctor: ${dId}`);
        pollingIntervalRef.current = setInterval(async () => {
            try {
                const res = await fetch(`/api/v1/whatsapp/status?clinic_id=${cId}&doctor_id=${dId}`);
                const data = await res.json();

                if (data.status === 'connected') {
                    console.log('[WhatsApp Polling] REAL Status: CONNECTED. Stopping polling.');
                    setConnection((prev: any) => ({ ...prev, status: 'connected', phone: data.phone, qr_code: null }));
                    toast.success('WhatsApp conectado com sucesso!');
                    if (pollingIntervalRef.current) {
                        clearInterval(pollingIntervalRef.current);
                        pollingIntervalRef.current = null;
                    }
                } else if (data.status === 'connecting') {
                    // Update QR Code if it changed during polling
                    if (data.qr_code) {
                        setConnection((prev: any) => ({ ...prev, qr_code: data.qr_code }));
                    }
                } else if (data.status === 'error') {
                    console.error('[WhatsApp Polling] REAL Status: ERROR. Stopping polling.');
                    setConnection((prev: any) => ({ ...prev, status: 'error' }));
                    toast.error('Ocorreu um erro na conexão.');
                    if (pollingIntervalRef.current) {
                        clearInterval(pollingIntervalRef.current);
                        pollingIntervalRef.current = null;
                    }
                } else if (data.status === 'disconnected') {
                    console.log('[WhatsApp Polling] REAL Status: DISCONNECTED. Stopping polling.');
                    setConnection(null);
                    if (pollingIntervalRef.current) {
                        clearInterval(pollingIntervalRef.current);
                        pollingIntervalRef.current = null;
                    }
                }
            } catch (err) {
                console.error('[WhatsApp Polling] Fetch error:', err);
            }
        }, 5000);
    };

    const fetchInitialData = async () => {
        try {
            setLoading(true);
            setAuthStatus('loading');
            setContextError(null);
            console.log('Iniciando carregamento de dados do WhatsApp via resolveContext...');

            const contextRes = await fetch('/api/v1/context');
            const contextData = await contextRes.json();

            if (!contextRes.ok) {
                console.warn('Falha ao resolver contexto:', contextData.error);
                setContextError(contextData.error);
                setAuthStatus('unauthenticated');
                return;
            }

            const { clinicId: cId, doctorId: dId, profile, clinic, connection: initialConn } = contextData;

            console.log('Contexto resolvido:', { cId, dId });
            setDoctorId(dId);
            setClinicId(cId);

            if (profile && clinic) {
                setInstanceName(`Dr. ${profile.email?.split('@')[0] || profile.full_name || 'Gestor'} - ${clinic.name}`);
            } else if (clinic) {
                setInstanceName(`Gestor - ${clinic.name}`);
            }

            if (initialConn) {
                console.log('Conexão inicial carregada:', initialConn.status);
                setConnection(initialConn);

                // Fetch fresh status once to confirm
                try {
                    const res = await fetch(`/api/v1/whatsapp/status?clinic_id=${cId}&doctor_id=${dId}`);
                    const freshData = await res.json();
                    if (res.ok) {
                        setConnection((prev: any) => ({ ...prev, ...freshData }));
                        if (freshData.status === 'connecting') {
                            startPolling(cId, dId);
                        }
                    }
                } catch (err) {
                    console.warn('Falha ao sincronizar status inicial:', err);
                    // Fallback to polling if we were already connecting
                    if (initialConn.status === 'connecting') {
                        startPolling(cId, dId);
                    }
                }
            }
            setAuthStatus('ready');
        } catch (e: any) {
            console.error('Falha no fetchInitialData:', e);
            toast.error('Erro ao carregar dados iniciais: ' + e.message);
        } finally {
            setLoading(false);
        }
    };

    const handleConnect = async () => {
        if (!clinicId || !doctorId) {
            toast.error('Dados da clínica ou médico não carregados. Tente atualizar a página.');
            return;
        }

        if (!instanceName.trim()) {
            toast.error('Por favor, informe um nome para a conta do WhatsApp.');
            return;
        }

        try {
            setConnecting(true);
            setConfigError(null);

            const res = await fetch('/api/v1/whatsapp/connect', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    clinic_id: clinicId,
                    doctor_id: doctorId,
                    instance_name: instanceName
                })
            });

            const data = await res.json().catch(() => ({ error: 'Erro de comunicação com o servidor' }));

            if (!res.ok) {
                if (res.status === 500 && data.error?.includes('Configuração')) {
                    setConfigError(data.error);
                    return;
                }
                throw new Error(data.error || 'Erro ao conectar ao WhatsApp');
            }

            if (!data.qr_code) {
                throw new Error('QR Code não recebido da Evolution API. Verifique o console do servidor.');
            }

            setConnection({ ...connection, status: 'connecting', qr_code: data.qr_code });
            toast.success('Pronto! Escaneie o QR Code abaixo.');

            // Start polling for status
            startPolling(clinicId, doctorId);
        } catch (e: any) {
            console.error('Connection Error:', e);
            toast.error(e.message);
        } finally {
            setConnecting(false);
        }
    };

    const handleDisconnect = async () => {
        try {
            const res = await fetch('/api/v1/whatsapp/disconnect', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ clinic_id: clinicId, doctor_id: doctorId })
            });
            if (res.ok) {
                setConnection(null);
                toast.success('WhatsApp desconectado.');
            }
        } catch (e: any) {
            toast.error('Erro ao desconectar');
        }
    };

    if (loading) return <div className="flex items-center justify-center p-20"><Loader2 className="animate-spin" /></div>;

    return (
        <div className="max-w-4xl mx-auto space-y-8 p-6">
            <header>
                <h1 className="text-3xl font-black text-slate-900 tracking-tight">WhatsApp & Notificações</h1>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                {/* Status Card */}
                <Card className="md:col-span-2 border-0 shadow-xl shadow-slate-100 rounded-[32px] overflow-hidden">
                    <CardHeader className="bg-slate-900 p-8 text-white">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-4">
                                <div className="w-14 h-14 bg-white/10 rounded-2xl flex items-center justify-center">
                                    <MessageSquare className="w-8 h-8 text-white" />
                                </div>
                                <div>
                                    <CardTitle className="text-2xl font-black italic text-white">Status da Conexão</CardTitle>
                                    <CardDescription className="text-slate-300 font-bold">Gerencie seu canal de comunicação</CardDescription>
                                </div>
                            </div>
                            <div className={cn(
                                "px-6 py-2 rounded-full font-black uppercase text-[10px] tracking-widest border-2",
                                connection?.status === 'connected' ? "bg-emerald-500 border-emerald-400 text-white" :
                                    connection?.status === 'connecting' ? "bg-amber-500 border-amber-400 text-white animate-pulse" :
                                        connection?.status === 'error' ? "bg-red-500 border-red-400 text-white" :
                                            "bg-slate-500 border-slate-400 text-white"
                            )}>
                                {connection?.status || 'Sem Conexão'}
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent className="p-10 space-y-8">
                        {authStatus === 'unauthenticated' && (
                            <div className="flex flex-col items-center justify-center py-10 text-center space-y-4 animate-in fade-in zoom-in-95">
                                <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center">
                                    <Smartphone className="w-10 h-10 text-slate-400" />
                                </div>
                                <div>
                                    <h3 className="text-xl font-black text-slate-900">Acesso Restrito</h3>
                                    <p className="text-slate-500 font-bold max-w-xs mx-auto mt-2">
                                        {contextError || 'Você precisa estar logado para configurar o WhatsApp.'}
                                    </p>
                                </div>
                                {!contextError && (
                                    <Button onClick={() => window.location.href = '/login'} className="bg-slate-900 text-white rounded-2xl px-8 h-12 font-black uppercase text-[10px] tracking-widest">
                                        Ir para o Login
                                    </Button>
                                )}
                            </div>
                        )}

                        {authStatus === 'no_profile' && (
                            <div className="flex flex-col items-center justify-center py-10 text-center space-y-4 animate-in fade-in zoom-in-95">
                                <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center">
                                    <XCircle className="w-10 h-10 text-red-500" />
                                </div>
                                <div>
                                    <h3 className="text-xl font-black text-slate-900">Perfil não encontrado</h3>
                                    <p className="text-slate-500 font-bold max-w-xs mx-auto mt-2">Seu perfil ainda não foi criado no sistema. Contate o administrador.</p>
                                </div>
                            </div>
                        )}

                        {authStatus === 'ready' && configError && (
                            <div className="flex items-center gap-4 p-6 bg-red-50 rounded-3xl border border-red-100 mb-4 animate-in fade-in slide-in-from-top-4">
                                <XCircle className="w-6 h-6 text-red-500 shrink-0" />
                                <p className="text-sm font-bold text-red-700">{configError}</p>
                            </div>
                        )}

                        {authStatus === 'ready' && (!connection || connection?.status === 'disconnected' || connection?.status === 'error') ? (
                            <div className="space-y-6">
                                <div className="space-y-4">
                                    <div className="flex flex-col gap-1">
                                        <Label className="text-[11px] font-black uppercase tracking-widest text-slate-400">Nome da Conta do WhatsApp</Label>
                                        <span className="text-[10px] text-slate-400 font-medium italic">Esse nome é só para você identificar esta conexão.</span>
                                    </div>
                                    <Input
                                        value={instanceName}
                                        onChange={e => setInstanceName(e.target.value)}
                                        placeholder="Ex: Dr. Marcos | Clínica Marcos"
                                        className="h-16 rounded-2xl border-slate-100 font-bold text-slate-700 bg-slate-50"
                                    />
                                </div>
                                <Button
                                    onClick={handleConnect}
                                    disabled={connecting}
                                    className="w-full h-18 bg-slate-900 hover:bg-slate-800 text-white rounded-[24px] font-black uppercase tracking-widest text-[11px] shadow-2xl flex items-center gap-3 transition-all active:scale-95"
                                >
                                    {connecting ? <Loader2 className="animate-spin w-5 h-5" /> : <Smartphone className="w-5 h-5" />}
                                    Conectar Novo WhatsApp
                                </Button>
                                <div className="flex items-start gap-4 p-6 bg-blue-50/50 rounded-3xl border border-blue-100">
                                    <AlertCircle className="w-6 h-6 text-blue-500 shrink-0" />
                                    <p className="text-xs font-bold text-blue-700 leading-relaxed italic">
                                        Ao conectar, o sistema começará a enviar automaticamente lembretes e confirmações para seus pacientes através da sua conta.
                                    </p>
                                </div>
                            </div>
                        ) : authStatus === 'ready' && connection?.status === 'connecting' ? (
                            <div className="flex flex-col items-center justify-center space-y-8 py-4">
                                <div className="relative group">
                                    <div className="absolute -inset-4 bg-amber-500/10 rounded-[48px] blur-2xl group-hover:bg-amber-500/20 transition-all"></div>
                                    <div className="relative bg-white p-8 rounded-[40px] shadow-2xl border-2 border-slate-100">
                                        {connection.qr_code ? (
                                            <img
                                                src={connection.qr_code.startsWith('data:') ? connection.qr_code : `data:image/png;base64,${connection.qr_code}`}
                                                alt="QR Code"
                                                className="w-64 h-64"
                                            />
                                        ) : (
                                            <RefreshCw className="w-64 h-64 text-slate-100 animate-spin" />
                                        )}
                                    </div>
                                </div>
                                <div className="text-center">
                                    <h3 className="text-xl font-black text-slate-900 uppercase">Escaneie o QR Code</h3>
                                    <p className="text-slate-400 text-sm font-bold mt-2">Abra o WhatsApp no seu celular {'>'} Aparelhos Conectados {'>'} Conectar um Aparelho</p>
                                </div>
                                <Button variant="ghost" onClick={handleDisconnect} className="text-red-500 font-black uppercase text-[10px] tracking-widest mt-4">
                                    Cancelar Processo
                                </Button>
                            </div>
                        ) : authStatus === 'ready' && connection?.status === 'connected' ? (
                            <div className="space-y-8">
                                <div className="flex items-center justify-between p-8 bg-emerald-50 rounded-[32px] border-2 border-emerald-100">
                                    <div className="flex items-center gap-6">
                                        <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center text-emerald-500 shadow-sm border border-emerald-100">
                                            <CheckCircle2 className="w-8 h-8" />
                                        </div>
                                        <div>
                                            <div className="text-emerald-900 font-black uppercase text-xs tracking-widest">Aparelho Conectado</div>
                                            <div className="text-emerald-600 font-bold text-lg mt-0.5">
                                                {connection.phone || (
                                                    <span className="text-emerald-600/60 text-sm italic">Número ainda não sincronizado</span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                    <Button variant="outline" onClick={handleDisconnect} className="rounded-2xl border-red-100 text-red-500 hover:bg-red-50 font-black uppercase text-[10px] tracking-widest px-6 h-12">
                                        Desconectar
                                    </Button>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="p-6 bg-slate-50 rounded-3xl border border-slate-100">
                                        <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Status do Bot IA</div>
                                        <div className="text-slate-900 font-black italic">Pre-Active (V2)</div>
                                    </div>
                                    <div className="p-6 bg-slate-50 rounded-3xl border border-slate-100">
                                        <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Notificações</div>
                                        <div className="text-slate-900 font-black italic">Ativadas</div>
                                    </div>
                                </div>
                            </div>
                        ) : null}
                    </CardContent>
                </Card>

                {/* Info Card */}
                <Card className="border-0 bg-emerald-900 rounded-[32px] overflow-hidden text-white shadow-2xl shadow-emerald-200 h-fit">
                    <CardContent className="p-8 space-y-6">
                        <h3 className="text-xl font-black italic">Vantagens do WhatsApp Pro</h3>
                        <ul className="space-y-4">
                            {[
                                'Confirmação instantânea de agendamento',
                                'Lembretes 24h antes da consulta',
                                'Redução de até 40% nas faltas',
                                'Comunicação direta e profissional',
                                'Fila de auditoria transparente'
                            ].map((text, i) => (
                                <li key={i} className="flex items-center gap-3 text-sm font-bold opacity-80">
                                    <div className="w-5 h-5 rounded-full bg-white/10 flex items-center justify-center shrink-0">
                                        <div className="w-2 h-2 rounded-full bg-emerald-400" />
                                    </div>
                                    {text}
                                </li>
                            ))}
                        </ul>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
