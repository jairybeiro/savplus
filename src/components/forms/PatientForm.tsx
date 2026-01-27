'use client';

import React, { useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';

export function PatientForm() {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [telefone, setTelefone] = useState('');

  const maskPhone = (value: string) => {
    const numbers = value.replace(/\D/g, '');
    if (numbers.length <= 10) {
      return numbers
        .replace(/^(\d{2})(\d)/g, '($1) $2')
        .replace(/(\d{4})(\d)/, '$1-$2')
        .substring(0, 14);
    } else {
      return numbers
        .replace(/^(\d{2})(\d)/g, '($1) $2')
        .replace(/(\d{5})(\d)/, '$1-$2')
        .substring(0, 15);
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    const formData = new FormData(e.currentTarget);
    const nome = formData.get('nome') as string;
    const cpf = formData.get('cpf') as string;
    const dataNascimento = formData.get('data_nascimento') as string;
    const cns = formData.get('cns') as string;
    const telefoneVal = formData.get('telefone') as string;
    const queixa = formData.get('queixa') as string;

    try {
      // 1. Create Patient
      const { data: patient, error: patientError } = await supabase
        .from('patients')
        .insert([{
          nome_completo: nome,
          cpf,
          data_nascimento: dataNascimento,
          cns,
          telefone: telefoneVal
        }])
        .select()
        .single();

      if (patientError) {
        // If duplicate, try to find
        if (patientError.code === '23505') { // Unique violation
          const { data: existing } = await supabase.from('patients').select('id').eq('cpf', cpf).single();
          if (existing) {
            // Proceed with existing patient
            await createAttendance(existing.id, queixa);
            return;
          }
        }
        throw new Error(`Erro ao cadastrar paciente: ${patientError.message}`);
      }

      await createAttendance(patient.id, queixa);

    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
      setLoading(false);
    }
  };

  const createAttendance = async (patientId: string, queixa: string) => {
    const { error: attendanceError } = await supabase
      .from('attendances')
      .insert([{
        patient_id: patientId,
        status: 'aguardando_triagem',
        queixa_principal: queixa // Pre-fill for Triage visibility
      }]);

    if (attendanceError) throw new Error(`Erro ao criar atendimento: ${attendanceError.message}`);

    setMessage({ type: 'success', text: 'Paciente cadastrado e enviado para triagem!' });
    setLoading(false);
    // Optional: Reset form
    // (document.getElementById('patient-form') as HTMLFormElement).reset();
  };

  return (
    <Card className="max-w-xl mx-auto">
      <CardHeader>
        <CardTitle>Nova Admissão</CardTitle>
      </CardHeader>
      <CardContent>
        <form id="patient-form" onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="nome">Nome Completo</Label>
            <Input id="nome" name="nome" placeholder="Ex: João da Silva" required />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="cpf">CPF</Label>
              <Input id="cpf" name="cpf" placeholder="000.000.000-00" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="data_nascimento">Data de Nascimento</Label>
              <Input id="data_nascimento" name="data_nascimento" type="date" required />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="cns">CNS (Cartão Nacional de Saúde)</Label>
            <Input id="cns" name="cns" placeholder="Cartão SUS" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="telefone">Celular / WhatsApp</Label>
            <Input
              id="telefone"
              name="telefone"
              placeholder="(00) 00000-0000"
              value={telefone}
              onChange={(e) => setTelefone(maskPhone(e.target.value))}
              required
            />
          </div>

          <div className="space-y-2 border-t pt-4 mt-2">
            <Label htmlFor="queixa" className="text-red-600 font-bold">Queixa Principal (Pré-Triagem)</Label>
            <Input
              id="queixa"
              name="queixa"
              placeholder="Ex: Dor no peito, falta de ar, sangramento..."
              className="border-red-200 focus:ring-red-500"
              required
            />
            <p className="text-xs text-slate-500">Informação visível para a enfermeira priorizar a fila.</p>
          </div>

          {message && (
            <div className={`p-3 rounded-md text-sm ${message.type === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
              {message.text}
            </div>
          )}

          <Button type="submit" className="w-full bg-hospital-blue hover:bg-hospital-blue/90 mt-4" disabled={loading}>
            {loading ? 'Cadastrando...' : 'Confirmar Admissão'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
