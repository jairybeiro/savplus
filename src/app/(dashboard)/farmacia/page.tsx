'use client';

import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Package, Check } from 'lucide-react';

type StockItem = { id: string; medicamento: string; qtd_disponivel: number; };
type Patient = { id: string; patient: { nome_completo: string }; prescricao: string; status: string; };

export default function FarmaciaPage() {
    const [stock, setStock] = useState<StockItem[]>([]);
    const [patients, setPatients] = useState<Patient[]>([]);

    const fetchData = async () => {
        // 1. Fetch Stock
        const { data: stockData } = await supabase.from('pharmacy_stock').select('*').order('medicamento');
        if (stockData) setStock(stockData);

        // 2. Fetch Patients (Finalized/Transferred in last 24h with prescription)
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);

        const { data: patientData } = await supabase
            .from('attendances')
            .select('id, prescricao, status, patient:patients(nome_completo)')
            .in('status', ['finalizado', 'transferido'])
            .neq('prescricao', '') // Only with prescription
            .gt('created_at', yesterday.toISOString())
            .order('created_at', { ascending: false });

        if (patientData) setPatients(patientData as any);
    };

    useEffect(() => {
        fetchData();
    }, []);

    const handleDispense = (id: string) => {
        // Just a visual confirmation for MVP
        alert('Medicamento dispensado com sucesso!');
        // In a real app, we would mark this dispense in DB
    };

    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Column 1: Patients to Dispense */}
            <div className="lg:col-span-2 space-y-6">
                <h2 className="text-2xl font-bold flex items-center gap-2 text-slate-800">
                    <Package className="h-6 w-6" />
                    Dispensação (Últimas 24h)
                </h2>
                <div className="space-y-4">
                    {patients.map(p => (
                        <Card key={p.id}>
                            <CardHeader className="py-3 bg-slate-50 border-b flex flex-row items-center justify-between">
                                <CardTitle className="text-base">{p.patient.nome_completo}</CardTitle>
                                <span className="text-xs uppercase bg-white px-2 py-1 rounded border">{p.status}</span>
                            </CardHeader>
                            <CardContent className="pt-4 flex justify-between items-start gap-4">
                                <div className="text-sm text-slate-600 whitespace-pre-wrap font-mono bg-blue-50/50 p-2 rounded w-full">
                                    {p.prescricao}
                                </div>
                                <Button onClick={() => handleDispense(p.id)} className="bg-hospital-blue shrink-0">
                                    <Check className="w-4 h-4 mr-2" /> Dispensar
                                </Button>
                            </CardContent>
                        </Card>
                    ))}
                    {patients.length === 0 && <p className="text-slate-500 italic">Nenhuma prescrição pendente.</p>}
                </div>
            </div>

            {/* Column 2: Stock */}
            <div className="space-y-4">
                <h2 className="text-2xl font-bold text-slate-800">Estoque</h2>
                <div className="bg-white border rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                        <thead className="bg-slate-100 font-bold border-b">
                            <tr>
                                <td className="p-3">Medicamento</td>
                                <td className="p-3 text-right">Qtd.</td>
                            </tr>
                        </thead>
                        <tbody>
                            {stock.map(item => (
                                <tr key={item.id} className="border-b last:border-0 hover:bg-slate-50">
                                    <td className="p-3">{item.medicamento}</td>
                                    <td className="p-3 text-right font-mono font-bold text-slate-700">{item.qtd_disponivel}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
