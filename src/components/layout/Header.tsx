'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Activity, LayoutDashboard, Stethoscope, Pill, ClipboardList, Package, User, Calendar, Users, FileText, DollarSign, MessageSquare } from 'lucide-react';

export function Header() {
    const pathname = usePathname();
    const isOffice = pathname.startsWith('/office');

    const upaItems = [
        { href: '/recepcao', label: 'Recepção', icon: User },
        { href: '/triagem', label: 'Triagem', icon: Activity },
        { href: '/medico-v2', label: 'Consultório', icon: Stethoscope },
        { href: '/medicacao', label: 'Medicação', icon: Pill },
        { href: '/nir', label: 'NIR', icon: ClipboardList },
        { href: '/farmacia', label: 'Farmácia', icon: Package },
    ];

    const officeItems = [
        { href: '/office/agenda', label: 'Agenda', icon: Calendar },
        { href: '/office/pacientes', label: 'Pacientes', icon: Users },
        { href: '/office/prontuario', label: 'Prontuário', icon: FileText },
        { href: '/office/financeiro', label: 'Financeiro', icon: DollarSign },
        { href: '/office/configuracoes/whatsapp', label: 'WhatsApp', icon: MessageSquare },
    ];

    const navItems = isOffice ? officeItems : upaItems;

    return (
        <header className="bg-white border-b border-hospital-gray shadow-sm sticky top-0 z-50">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-18 flex items-center justify-between">
                {/* Logo Section */}
                <div className="flex items-center gap-3">
                    <div className={cn(
                        "h-10 w-10 rounded-xl text-white flex items-center justify-center font-black shadow-lg transition-all",
                        isOffice ? "bg-slate-900 shadow-slate-200" : "bg-blue-600 shadow-blue-200"
                    )}>
                        {isOffice ? 'S' : '+'}
                    </div>
                    <div>
                        <h1 className="text-xl font-black text-slate-900 tracking-tighter leading-none">
                            {isOffice ? 'SAV PLUS' : 'UPA FLOW'}
                        </h1>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
                            {isOffice ? 'Premium Clinic' : 'Health System'}
                        </p>
                    </div>
                </div>

                {/* Navigation Links */}
                <nav className="hidden md:flex items-center gap-1">
                    {navItems.map((item) => {
                        const isActive = pathname === item.href;
                        const Icon = item.icon;

                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                className={cn(
                                    "px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-all",
                                    isActive
                                        ? "bg-blue-50 text-blue-600 shadow-sm"
                                        : "text-slate-500 hover:text-blue-600 hover:bg-slate-50"
                                )}
                            >
                                <Icon className={cn("w-4 h-4", isActive ? "text-blue-600" : "text-slate-400")} />
                                {item.label}
                            </Link>
                        );
                    })}
                </nav>

                {/* Status Indicator */}
                <div className="flex items-center gap-2 bg-green-50 px-3 py-1.5 rounded-full border border-green-100">
                    <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                    <span className="text-[10px] font-black text-green-700 uppercase tracking-widest">Servidor Online</span>
                </div>
            </div>
        </header>
    );
}
