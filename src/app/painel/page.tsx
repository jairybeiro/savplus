'use client';

import React, { useEffect, useState, useRef } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { ManchesterColor, MANCHESTER_COLORS } from '@/lib/manchester';
import { cn } from '@/lib/utils';
import { Volume2, VolumeX, Activity, Clock, User, Play } from 'lucide-react';

type Attendance = {
    id: string;
    patient: { nome_completo: string; };
    status: string;
    classificacao_risco: ManchesterColor;
    created_at: string;
    updated_at: string;
};

const PRIORITY_MAP: Record<ManchesterColor, number> = {
    vermelho: 1,
    laranja: 2,
    amarelo: 3,
    verde: 4,
    azul: 5,
};

const maskName = (name: string) => {
    if (!name) return '';
    const parts = name.split(' ');
    if (parts.length === 1) return parts[0];
    return `${parts[0]} ${parts[parts.length - 1]}`;
};

const getDestination = (status: string) => {
    if (status === 'em_triagem') return 'TRIAGEM - SALA 01';
    if (status === 'em_atendimento') return 'CONSULTÓRIO MÉDICO';
    return 'AGUARDANDO...';
};

const getColorBg = (color: string) => {
    switch (color) {
        case 'vermelho': return 'bg-red-600';
        case 'laranja': return 'bg-orange-500';
        case 'amarelo': return 'bg-yellow-500';
        case 'verde': return 'bg-green-600';
        case 'azul': return 'bg-blue-500';
        default: return 'bg-slate-500';
    }
};

export default function PainelPage() {
    // Application State
    const [isStarted, setIsStarted] = useState(false);
    const [isMounted, setIsMounted] = useState(false);
    const [currentTime, setCurrentTime] = useState(new Date());

    // Data Lists
    const [triageQueue, setTriageQueue] = useState<Attendance[]>([]);
    const [doctorQueue, setDoctorQueue] = useState<Attendance[]>([]);

    // Call Overlay
    const [currentCall, setCurrentCall] = useState<Attendance | null>(null);
    const [showOverlay, setShowOverlay] = useState(false);
    const audioRef = useRef<HTMLAudioElement | null>(null);

    // Audio Status
    const [isAudioEnabled, setIsAudioEnabled] = useState(false);

    // 1. Initial Setup
    useEffect(() => {
        setIsMounted(true);
        const timer = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    // 2. Fetch Lists
    const fetchQueues = async () => {
        const { data: triageData } = await supabase
            .from('attendances')
            .select('id, status, created_at, patient:patients(nome_completo)')
            .in('status', ['recepcao', 'aguardando_triagem'])
            .order('created_at', { ascending: true })
            .limit(7);
        if (triageData) setTriageQueue(triageData as any);

        const { data: doctorData } = await supabase
            .from('attendances')
            .select('id, status, classificacao_risco, created_at, patient:patients(nome_completo)')
            .eq('status', 'aguardando_medico');

        if (doctorData) {
            const sorted = (doctorData as any[]).sort((a, b) => {
                const pA = PRIORITY_MAP[a.classificacao_risco as ManchesterColor] || 99;
                const pB = PRIORITY_MAP[b.classificacao_risco as ManchesterColor] || 99;
                if (pA !== pB) return pA - pB;
                return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
            });
            setDoctorQueue(sorted.slice(0, 7));
        }
    };

    // 3. Play Chime (Web Audio API - Ultra Robust)
    const playChime = () => {
        try {
            const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
            const ctx = new AudioContext();

            // --- DING ---
            const osc1 = ctx.createOscillator();
            const gain1 = ctx.createGain();
            osc1.type = 'sine';
            osc1.frequency.setValueAtTime(880, ctx.currentTime); // A5
            gain1.gain.setValueAtTime(0.3, ctx.currentTime);
            gain1.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.2);
            osc1.connect(gain1);
            gain1.connect(ctx.destination);
            osc1.start(ctx.currentTime);
            osc1.stop(ctx.currentTime + 1.2);

            // --- DONG ---
            setTimeout(() => {
                const osc2 = ctx.createOscillator();
                const gain2 = ctx.createGain();
                osc2.type = 'sine';
                osc2.frequency.setValueAtTime(660, ctx.currentTime); // E5
                gain2.gain.setValueAtTime(0.3, ctx.currentTime);
                gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.2);
                osc2.connect(gain2);
                gain2.connect(ctx.destination);
                osc2.start(ctx.currentTime);
                osc2.stop(ctx.currentTime + 1.2);
            }, 500);

            setIsAudioEnabled(true);
        } catch (e) {
            console.error("Web Audio API not supported", e);
        }
    };

    // 4. Start Panel & Unlock Audio (Critical for TVs)
    const handleStart = () => {
        // Gesture to unlock browser audio policy
        playChime();
        setIsStarted(true);
        fetchQueues();
    };

    // 5. Call Trigger
    const handleNewCall = (call: Attendance) => {
        setCurrentCall(call);
        setShowOverlay(true);

        // Play Sound
        playChime();

        // Voice (Decoupled)
        setTimeout(() => {
            const text = `Paciente ${call.patient?.nome_completo || ''}, comparecer à ${getDestination(call.status)}`;
            if ('speechSynthesis' in window) {
                window.speechSynthesis.cancel();
                const u = new SpeechSynthesisUtterance(text);
                u.lang = 'pt-BR';
                u.rate = 0.9;
                u.volume = 1.0;
                window.speechSynthesis.speak(u);
            }
        }, 1500);

        setTimeout(() => setShowOverlay(false), 15000);
    };

    // 6. Subscription
    useEffect(() => {
        if (!isStarted) return;

        const subscription = supabase
            .channel('painel-global')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'attendances' }, async (payload) => {
                await fetchQueues();

                const oldStatus = (payload.old as any)?.status;
                const newStatus = (payload.new as any)?.status;

                // Only trigger call when status ACTUALLY CHANGES to em_triagem or em_atendimento
                // This prevents print operations from triggering calls (they update other fields but not status)
                const statusChanged = oldStatus !== newStatus;
                const isCallStatus = ['em_triagem', 'em_atendimento'].includes(newStatus);

                if (statusChanged && isCallStatus) {
                    const { data } = await supabase
                        .from('attendances')
                        .select('*, patient:patients(nome_completo)')
                        .eq('id', (payload.new as any).id)
                        .single();
                    if (data) handleNewCall(data as any);
                }
            })
            .subscribe();

        return () => { subscription.unsubscribe(); };
    }, [isStarted]);

    // --- RENDERING ---

    // 1. Splash Screen (Locked State)
    if (!isStarted) {
        return (
            <div className="h-screen w-screen bg-slate-950 flex flex-col items-center justify-center text-white font-sans p-8">
                <div className="max-w-md w-full text-center space-y-8">
                    <div className="flex justify-center">
                        <div className="w-24 h-24 bg-blue-600/20 rounded-full flex items-center justify-center animate-pulse">
                            <Activity className="w-12 h-12 text-blue-500" />
                        </div>
                    </div>
                    <div>
                        <h1 className="text-4xl font-black uppercase tracking-tighter mb-2">Painel de Senhas</h1>
                        <p className="text-slate-400">Clique no botão abaixo para iniciar o monitoramento e ativar os alertas sonoros na TV.</p>
                    </div>
                    <button
                        onClick={handleStart}
                        className="w-full bg-blue-600 hover:bg-blue-700 text-white font-black py-6 rounded-2xl text-2xl shadow-2xl flex items-center justify-center gap-4 transition-all hover:scale-105 active:scale-95 group"
                    >
                        <Play className="fill-current w-8 h-8 group-hover:animate-ping" />
                        INICIAR MONITOR
                    </button>
                    <div className="flex items-center justify-center gap-2 text-slate-600 text-sm font-bold uppercase tracking-widest">
                        <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                        Sistema Conectado
                    </div>
                </div>
            </div>
        );
    }

    // 2. Active Panel
    return (
        <div className="h-screen w-screen bg-slate-950 text-white overflow-hidden flex flex-col font-sans select-none relative">

            {/* Header */}
            <header className="h-24 bg-blue-900 border-b-8 border-yellow-500 flex items-center justify-between px-12 shadow-lg z-10 shrink-0">
                <div className="flex items-center gap-4 font-black text-3xl uppercase tracking-widest text-slate-100">
                    <Activity className="w-10 h-10 text-yellow-400 animate-pulse" />
                    PAINEL DE SENHAS
                </div>
                <div className="flex items-center gap-10">
                    <div className="opacity-70">
                        {isAudioEnabled ? <Volume2 className="w-8 h-8 text-green-400" /> : <VolumeX className="w-8 h-8 text-red-500" />}
                    </div>
                    <div className="text-5xl font-mono font-black text-yellow-400">
                        {isMounted ? currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--'}
                    </div>
                </div>
            </header>

            {/* Main Grid */}
            <div className="flex-1 grid grid-cols-2 divide-x-8 divide-slate-800">
                <div className="bg-slate-900/50 p-10 flex flex-col">
                    <h2 className="text-4xl font-black text-blue-400 uppercase mb-8 flex items-center gap-4 pb-6 border-b-4 border-blue-900/50">
                        <User className="w-12 h-12" />
                        Aguardando Triagem
                    </h2>
                    <div className="flex-1 space-y-4">
                        {triageQueue.map((item, i) => (
                            <div key={item.id} className="bg-slate-800 p-6 rounded-2xl flex items-center justify-between border-2 border-slate-700/50 shadow-xl">
                                <div className="flex items-center gap-6">
                                    <span className="text-slate-500 font-mono text-3xl font-black">#{i + 1}</span>
                                    <span className="text-4xl font-black text-slate-100 truncate max-w-[450px]">
                                        {maskName(item.patient?.nome_completo)}
                                    </span>
                                </div>
                                <div className="w-4 h-4 rounded-full bg-blue-500/20 animate-pulse" />
                            </div>
                        ))}
                    </div>
                </div>

                <div className="bg-slate-950 p-10 flex flex-col relative">
                    <h2 className="text-4xl font-black text-yellow-500 uppercase mb-8 flex items-center gap-4 pb-6 border-b-4 border-yellow-900/20 z-10">
                        <Activity className="w-12 h-12" />
                        Aguardando Médico
                    </h2>
                    <div className="flex-1 space-y-4 z-10">
                        {doctorQueue.map((item) => (
                            <div key={item.id} className="bg-slate-900 p-6 rounded-2xl flex items-center justify-between border-2 border-slate-800 relative overflow-hidden shadow-2xl">
                                <div className={cn("absolute left-0 top-0 bottom-0 w-3", getColorBg(item.classificacao_risco))} />
                                <div className="flex items-center gap-6 pl-4">
                                    <span className="text-4xl font-black text-white truncate max-w-[450px]">
                                        {maskName(item.patient?.nome_completo)}
                                    </span>
                                </div>
                                <div className={cn("px-6 py-2 rounded-xl font-black uppercase text-2xl tracking-tighter shadow-md border-2 border-white/10", MANCHESTER_COLORS[item.classificacao_risco])}>
                                    {item.classificacao_risco}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Overlay */}
            <div className={cn(
                "absolute inset-0 z-50 bg-blue-950 flex flex-col transition-all duration-500 transform",
                showOverlay ? "translate-y-0 opacity-100" : "translate-y-full opacity-0 pointer-events-none"
            )}>
                {currentCall && (
                    <div className="flex-1 flex flex-col items-center justify-center p-16 text-center space-y-10 pt-32">
                        <header className="absolute top-0 left-0 right-0 h-28 bg-blue-900 flex items-center justify-center border-b-[8px] border-yellow-400 shadow-2xl">
                            <h1 className="text-5xl font-black text-white uppercase tracking-[0.2em] animate-pulse">CHAMADA DE PACIENTE</h1>
                        </header>

                        <div className="space-y-2">
                            <p className="text-blue-300 text-3xl font-black uppercase tracking-[0.3em]">Paciente</p>
                            <h2 className="text-[9rem] font-black text-yellow-400 drop-shadow-[0_8px_8px_rgba(0,0,0,0.5)] leading-tight italic tracking-tighter">
                                {maskName(currentCall.patient?.nome_completo).toUpperCase()}
                            </h2>
                        </div>

                        <div className="space-y-6">
                            <p className="text-blue-300 text-3xl font-black uppercase tracking-[0.3em]">Dirija-se ao</p>
                            <div className="text-7xl font-black text-white bg-white/10 px-16 py-10 rounded-[2rem] backdrop-blur-xl border-4 border-white/20 shadow-2xl inline-block">
                                {getDestination(currentCall.status)}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
