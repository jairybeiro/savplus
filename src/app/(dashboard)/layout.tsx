import React from 'react';
import { Header } from '@/components/layout/Header';

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode
}) {
    return (
        <div className="min-h-screen bg-slate-50/50 flex flex-col font-sans">
            <Header />
            <main className="flex-1 px-4 sm:px-6 lg:px-8 py-6 w-full">
                {children}
            </main>
        </div>
    );
}
