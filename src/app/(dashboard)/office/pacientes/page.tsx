'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import {
    Search,
    User,
    ChevronRight,
    ClipboardList,
    History,
    Calendar,
    Filter,
    Users
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { motion, AnimatePresence } from 'framer-motion';

interface Patient {
    id: string;
    nome_completo: string;
    cpf: string;
    data_nascimento: string;
    ultima_consulta?: string;
    total_atendimentos?: number;
}

export default function ProntuarioListingPage() {
    const router = useRouter();
    const [searchTerm, setSearchTerm] = useState('');
    const [patients, setPatients] = useState<Patient[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchPatients();
    }, []);

    const fetchPatients = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('patients')
                .select(`
                    id, 
                    nome_completo, 
                    cpf, 
                    data_nascimento,
                    attendances (count)
                `)
                .order('nome_completo', { ascending: true });

            if (error) throw error;

            // Map the data to include attendance count
            const formattedPatients = data?.map(p => ({
                ...p,
                total_atendimentos: (p.attendances as any)?.[0]?.count || 0
            })) || [];

            setPatients(formattedPatients);
        } catch (error) {
            console.error('Error fetching patients:', error);
        } finally {
            setLoading(false);
        }
    };

    const filteredPatients = patients.filter(p =>
        p.nome_completo.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.cpf.includes(searchTerm)
    );

    return (
        <div className="min-h-screen bg-[#FDFDFD] text-slate-900 font-sans p-10">
            {/* BOUTIQUE HEADER */}
            <header className="mb-12 flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div>
                    <h1 className="text-4xl font-black tracking-tight text-slate-900 uppercase italic">
                        Gestão de Pacientes
                    </h1>
                    <p className="text-slate-400 font-bold text-xs uppercase tracking-widest mt-2">
                        Base de Dados de Pacientes • {patients.length} Cadastrados
                    </p>
                </div>

                <div className="flex items-center gap-4">
                    <div className="relative group">
                        <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-300 group-focus-within:text-slate-900 transition-colors" />
                        <input
                            type="text"
                            placeholder="Buscar paciente por nome ou CPF..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-[400px] h-16 bg-white border-0 rounded-[24px] pl-14 pr-6 text-slate-800 shadow-[0_10px_40px_-10px_rgba(0,0,0,0.05)] focus:ring-2 focus:ring-slate-900 transition-all outline-none"
                        />
                    </div>
                </div>
            </header>

            {/* QUICK STATS */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-12">
                {[
                    { label: 'Total Pacientes', val: patients.length, icon: Users, color: 'text-blue-600', bg: 'bg-blue-50' },
                    { label: 'Consultas Hoje', val: '12', icon: Calendar, color: 'text-emerald-600', bg: 'bg-emerald-50' },
                    { label: 'Novos Recordes', val: '4', icon: ClipboardList, color: 'text-purple-600', bg: 'bg-purple-50' },
                    { label: 'Ativos', val: patients.length, icon: History, color: 'text-amber-600', bg: 'bg-amber-50' }
                ].map((stat, idx) => (
                    <Card key={idx} className="p-8 border-0 shadow-sm rounded-[35px] bg-white flex items-center justify-between group hover:shadow-xl transition-all">
                        <div>
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">{stat.label}</p>
                            <p className="text-3xl font-black italic text-slate-900">{stat.val}</p>
                        </div>
                        <div className={cn("w-14 h-14 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform", stat.bg, stat.color)}>
                            <stat.icon className="w-6 h-6" />
                        </div>
                    </Card>
                ))}
            </div>

            {/* PATIENT LIST */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {loading ? (
                    <div className="col-span-full py-40 flex flex-col items-center justify-center opacity-40">
                        <div className="w-10 h-10 border-4 border-slate-900 border-t-transparent rounded-full animate-spin mb-4" />
                        <p className="text-[10px] font-black uppercase tracking-widest">Carregando Base de Dados...</p>
                    </div>
                ) : filteredPatients.length === 0 ? (
                    <div className="col-span-full py-40 text-center bg-slate-50/50 rounded-[40px] border-2 border-dashed border-slate-100">
                        <User className="w-12 h-12 text-slate-200 mx-auto mb-4" />
                        <p className="text-slate-400 font-bold text-sm uppercase tracking-widest">Nenhum paciente encontrado</p>
                    </div>
                ) : (
                    filteredPatients.map((patient, idx) => (
                        <motion.div
                            key={patient.id}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: idx * 0.05 }}
                        >
                            <Card
                                onClick={() => router.push(`/office/prontuario/${patient.id}`)}
                                className="p-8 border-0 shadow-sm rounded-[40px] bg-white group hover:shadow-2xl hover:-translate-y-1 transition-all cursor-pointer relative overflow-hidden"
                            >
                                <div className="absolute top-0 right-0 w-32 h-32 bg-slate-50 rounded-full -mr-16 -mt-16 group-hover:bg-slate-100 transition-colors" />

                                <div className="flex items-center justify-between relative z-10">
                                    <div className="flex items-center gap-6">
                                        <div className="w-20 h-20 rounded-[28px] bg-slate-950 text-white flex items-center justify-center text-2xl font-black shadow-2xl shadow-slate-200 group-hover:rotate-6 transition-transform">
                                            {patient.nome_completo.charAt(0)}
                                        </div>
                                        <div>
                                            <h3 className="text-xl font-black text-slate-900 uppercase italic tracking-tight group-hover:text-blue-600 transition-colors">
                                                {patient.nome_completo}
                                            </h3>
                                            <div className="flex items-center gap-4 mt-2">
                                                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">CPF: {patient.cpf}</span>
                                                <span className="w-1 h-1 rounded-full bg-slate-200" />
                                                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Nasc: {patient.data_nascimento ? new Date(patient.data_nascimento).toLocaleDateString('pt-BR') : '---'}</span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex flex-col items-end gap-2">
                                        <div className="px-4 py-2 bg-slate-50 rounded-full text-[10px] font-black uppercase tracking-widest text-slate-500">
                                            {patient.total_atendimentos} Atendimentos
                                        </div>
                                        <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-300 group-hover:text-slate-900 transition-colors">
                                            Ver Histórico
                                            <ChevronRight className="w-4 h-4" />
                                        </div>
                                    </div>
                                </div>
                            </Card>
                        </motion.div>
                    ))
                )}
            </div>
        </div>
    );
}
