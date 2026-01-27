'use client';

import React from 'react';
import { DollarSign, ArrowUpRight, ArrowDownLeft, Wallet, Receipt, CreditCard } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export default function FinanceiroPage() {
    const stats = [
        { label: 'Receita Total', val: 'R$ 45.200,00', icon: ArrowUpRight, color: 'text-emerald-600', bg: 'bg-emerald-50' },
        { label: 'Despesas', val: 'R$ 12.400,00', icon: ArrowDownLeft, color: 'text-rose-600', bg: 'bg-rose-50' },
        { label: 'Saldo em Caixa', val: 'R$ 32.800,00', icon: Wallet, color: 'text-blue-600', bg: 'bg-blue-50' },
        { label: 'A Receber', val: 'R$ 8.900,00', icon: Receipt, color: 'text-amber-600', bg: 'bg-amber-50' }
    ];

    return (
        <div className="min-h-screen bg-[#FDFDFD] p-10">
            <header className="mb-12">
                <h1 className="text-4xl font-black tracking-tight text-slate-900 uppercase italic">
                    Financeiro
                </h1>
                <p className="text-slate-400 font-bold text-xs uppercase tracking-widest mt-2">
                    Controle de Fluxo de Caixa e Faturamento
                </p>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-12">
                {stats.map((stat, idx) => (
                    <Card key={idx} className="p-8 border-0 shadow-sm rounded-[35px] bg-white flex items-center justify-between group hover:shadow-xl transition-all">
                        <div>
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">{stat.label}</p>
                            <p className="text-2xl font-black italic text-slate-900">{stat.val}</p>
                        </div>
                        <div className={cn("w-14 h-14 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform", stat.bg, stat.color)}>
                            <stat.icon className="w-6 h-6" />
                        </div>
                    </Card>
                ))}
            </div>

            <div className="bg-white p-10 rounded-[40px] shadow-sm flex flex-col items-center justify-center py-40 border-2 border-dashed border-slate-100">
                <CreditCard className="w-12 h-12 text-slate-200 mb-4" />
                <p className="text-slate-400 font-bold text-sm uppercase tracking-widest italic">
                    Novas funcionalidades financeiras em breve...
                </p>
            </div>
        </div>
    );
}
