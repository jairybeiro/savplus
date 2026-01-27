'use client';

import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { TriageForm } from '@/components/forms/TriageForm';
import { User, Activity, Clock, UserX, RefreshCw, XCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatWaitTime } from '@/lib/time';

type Attendance = {
  id: string;
  created_at: string;
  updated_at?: string;
  patient: {
    nome_completo: string;
    cpf: string;
    data_nascimento: string;
  };
  patient_id: string;
  status: string;
  queixa_principal?: string;
};

export default function TriagemPage() {
  const [queue, setQueue] = useState<Attendance[]>([]);
  const [absentList, setAbsentList] = useState<Attendance[]>([]);
  const [showAbsentList, setShowAbsentList] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [callCount, setCallCount] = useState(0);
  const [isRecalled, setIsRecalled] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 60000);
    return () => clearInterval(interval);
  }, []);

  const maskCPF = (cpf: string) => {
    if (!cpf) return '---';
    // Returns 000.***.***-00 format
    return cpf.replace(/^(\d{3})\.(\d{3})\.(\d{3})-(\d{2})$/, '$1.***.***-$4');
  };

  const fetchQueue = async () => {
    const { data, error } = await supabase
      .from('attendances')
      .select('*, patient:patients(nome_completo, cpf, data_nascimento)')
      .in('status', ['recepcao', 'aguardando_triagem', 'em_triagem'])
      .order('created_at', { ascending: true });

    if (error) console.error('Error fetching queue:', error);
    else setQueue(data || []);
  };

  // Fetch absent patients from triage
  const fetchAbsentList = async () => {
    const { data } = await supabase
      .from('attendances')
      .select('*, patient:patients(nome_completo, cpf, data_nascimento)')
      .eq('status', 'ausente_triagem')
      .order('updated_at', { ascending: false });

    if (data) {
      setAbsentList(data as Attendance[]);
    }
  };

  // Recall absent patient - put back in triage queue
  const handleRecallAbsent = async (id: string) => {
    // If there's already a patient on screen, handle based on rules
    if (selectedId && isRecalled) {
      // Intentional swap between absent patients can be handled if needed
    }

    await supabase
      .from('attendances')
      .update({
        status: 'em_triagem'
        // updated_at is NOT updated here to preserve the original absence start time
      })
      .eq('id', id);

    setSelectedId(id);
    setCallCount(1); // Set call count to 1 as they are being called back
    setIsRecalled(true); // Mark as recalled to lock against queue clicks
    fetchAbsentList();
    fetchQueue();
  };

  // Cancel absent patient - desistência
  const handleCancelAbsent = async (id: string) => {
    await supabase
      .from('attendances')
      .update({
        status: 'cancelado',
        updated_at: new Date().toISOString()
      })
      .eq('id', id);

    if (selectedId === id) {
      setSelectedId(null);
      setIsRecalled(false);
    }
    fetchAbsentList();
  };

  useEffect(() => {
    fetchQueue();
    fetchAbsentList();

    // Realtime subscription
    const subscription = supabase
      .channel('public:attendances')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attendances' }, () => {
        fetchQueue();
        fetchAbsentList();
      })
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const handleSelect = async (id: string) => {
    // RULE: If patient on screen is RECALLED, block subbing from queue
    if (selectedId && isRecalled) {
      console.log('Paciente rechamado está em atendimento. Finalize para trocar.');
      return;
    }

    // RULE: If patient on screen is from queue, they can be swapped.
    // "o que estava na tela volta para a espera"
    if (selectedId && !isRecalled && selectedId !== id) {
      const prevPatient = queue.find(p => p.id === selectedId);
      if (prevPatient && prevPatient.status === 'em_triagem') {
        // Revert status to 'aguardando_triagem' so they go back to the wait state
        await supabase
          .from('attendances')
          .update({ status: 'aguardando_triagem' })
          .eq('id', selectedId);
      }
    }

    setSelectedId(id);
    setCallCount(0); // Reset call count when selecting new patient
    setIsRecalled(false); // Reset recalled state
  };

  const handleSuccess = () => {
    setSelectedId(null);
    setCallCount(0);
    setIsRecalled(false);
    fetchQueue();
  };

  const handleCall = async () => {
    if (!selectedId) return;
    try {
      const { error } = await supabase
        .from('attendances')
        .update({
          status: 'em_triagem',
          updated_at: new Date().toISOString()
        })
        .eq('id', selectedId);

      if (error) {
        console.error('Error calling patient:', error);
        alert('Erro ao chamar paciente: ' + error.message);
      } else {
        setCallCount(prev => prev + 1);
        console.log('Paciente chamado!');
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleMarkAbsent = async () => {
    if (!selectedId) return;
    try {
      const updates: any = {
        status: 'ausente_triagem'
      };

      // ONLY update 'updated_at' if it's the first time they fail (coming from queue)
      // Otherwise, preserve the original absence start time
      if (!isRecalled) {
        updates.updated_at = new Date().toISOString();
      }

      const { error } = await supabase
        .from('attendances')
        .update(updates)
        .eq('id', selectedId);

      if (error) {
        console.error('Error marking absent:', error);
        alert('Erro ao marcar ausência: ' + error.message);
        return;
      }

      setSelectedId(null);
      setCallCount(0);
      setIsRecalled(false);
      fetchQueue();
      fetchAbsentList();
    } catch (err: any) {
      console.error('Error:', err);
      alert('Erro ao marcar ausência: ' + (err?.message || 'Erro desconhecido'));
    }
  };

  return (
    <div className={cn(
      "grid grid-cols-1 gap-6 h-[calc(100vh-100px)]",
      absentList.length > 0 ? "lg:grid-cols-12" : "lg:grid-cols-12"
    )}>
      {/* Absent Column - Dynamic */}
      {absentList.length > 0 && (
        <div className="lg:col-span-3 border-r border-slate-200 pr-6 overflow-y-auto">
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2 text-amber-600">
            <UserX className="h-5 w-5" />
            Ausentes ({absentList.length})
          </h2>
          <div className="space-y-3">
            {absentList.map((item) => {
              const absentSince = item.updated_at ? formatWaitTime(item.updated_at) : '--';
              const totalWait = formatWaitTime(item.created_at);
              const isSelected = selectedId === item.id;
              return (
                <Card
                  key={item.id}
                  className={cn(
                    "bg-amber-50/50 border-amber-200 border-l-4 border-l-amber-500 cursor-pointer",
                    isSelected && "ring-2 ring-blue-600 shadow-lg"
                  )}
                  onClick={() => handleRecallAbsent(item.id)}
                >
                  <div className="p-4">
                    <div className="flex justify-between items-start mb-2">
                      <div className="font-bold text-slate-800 text-sm truncate uppercase tracking-tighter">
                        {item.patient?.nome_completo}
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <span className={cn(
                          "text-[9px] font-black uppercase px-2 py-0.5 rounded shadow-sm",
                          isSelected ? "bg-blue-600 text-white animate-pulse" : "bg-amber-200 text-amber-800"
                        )}>
                          {isSelected ? "Em Avaliação" : "Ausente"}
                        </span>
                        <span className="text-[10px] font-black uppercase text-amber-600/80 tracking-tighter">
                          HÁ {absentSince}
                        </span>
                        <span className="text-[8px] font-bold text-slate-400 uppercase italic">
                          Total: {totalWait}
                        </span>
                      </div>
                    </div>
                    <div className="flex gap-2 mt-3">
                      <Button
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRecallAbsent(item.id);
                        }}
                        className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-[11px] h-8 font-black uppercase"
                      >
                        <RefreshCw className="w-3 h-3 mr-1" />
                        Chamar Novamente
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCancelAbsent(item.id);
                        }}
                        className="flex-1 text-[11px] h-8 font-black uppercase"
                      >
                        Desistência
                      </Button>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* Queue Column */}
      <div className="lg:col-span-3 border-r border-slate-200 pr-6 overflow-y-auto">
        <h2 className="text-xl font-bold mb-4 flex items-center gap-2 text-slate-900">
          <Clock className="h-5 w-5" />
          Fila ({queue.length})
        </h2>
        <div className="space-y-3">
          {queue.length === 0 && (
            <p className="text-slate-500 italic">Nenhum paciente aguardando.</p>
          )}
          {queue.map((item) => {
            const isSelected = selectedId === item.id;
            const isBeingAttended = item.status === 'em_triagem';

            return (
              <Card
                key={item.id}
                className={cn(
                  "cursor-pointer transition-all border-l-4",
                  isSelected ? "ring-2 ring-blue-600 bg-blue-50/50" : "hover:shadow-md",
                  item.queixa_principal ? "border-l-red-400" : "border-l-slate-200",
                  isBeingAttended && !isSelected ? "opacity-60 bg-slate-50" : ""
                )}
                onClick={() => handleSelect(item.id)}
              >
                <div className="p-4">
                  <div className="flex items-center justify-between mb-1">
                    <div className="font-bold text-slate-800 truncate uppercase tracking-tighter">{item.patient?.nome_completo || 'Paciente sem nome'}</div>
                    <span className={cn(
                      "text-[9px] font-black uppercase px-2 py-0.5 rounded",
                      isSelected ? "bg-blue-600 text-white animate-pulse shadow-sm" : "bg-slate-200 text-slate-500"
                    )}>
                      {isSelected ? "Em Avaliação" : "Aguardando"}
                    </span>
                  </div>
                  <div className="text-xs text-slate-500 font-mono">CPF: {maskCPF(item.patient?.cpf)}</div>
                  {item.queixa_principal && (
                    <div className="mt-2 text-xs font-bold text-red-600 bg-red-50 p-1.5 rounded flex items-center gap-1">
                      <Activity className="w-3 h-3" />
                      {item.queixa_principal}
                    </div>
                  )}
                  <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-100">
                    <div className="text-[10px] text-slate-400 font-medium">
                      {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                    <div className="flex items-center gap-1 text-[10px] font-black text-blue-600 uppercase bg-blue-50 px-2 py-0.5 rounded">
                      <Clock className="w-2.5 h-2.5" />
                      Esperando há {formatWaitTime(item.created_at)}
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Main Area */}
      <div className={cn(
        "flex flex-col",
        absentList.length > 0 ? "lg:col-span-6" : "lg:col-span-9"
      )}>
        {selectedId ? (
          <div className="h-full flex flex-col">
            {/* Compact Safety Header */}
            {(() => {
              const p = queue.find(q => q.id === selectedId);
              if (!p) return null;

              const calculateAge = (dob: string) => {
                if (!dob) return '--';
                try {
                  const birthDate = new Date(dob);
                  const today = new Date();
                  let age = today.getFullYear() - birthDate.getFullYear();
                  const m = today.getMonth() - birthDate.getMonth();
                  if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) age--;
                  return age;
                } catch { return '--'; }
              };

              return (
                <div className="bg-blue-600 p-3 mb-4 rounded-xl flex items-center justify-between shadow-lg text-white">
                  <div className="flex gap-8 items-center pl-2">
                    <div>
                      <p className="text-[9px] font-black uppercase tracking-widest opacity-70">Paciente</p>
                      <p className="text-xl font-black">{p.patient?.nome_completo}</p>
                    </div>
                    <div className="border-l border-white/20 pl-6">
                      <p className="text-[9px] font-black uppercase tracking-widest opacity-70">Idade</p>
                      <p className="text-lg font-bold">{calculateAge(p.patient?.data_nascimento)} anos</p>
                    </div>
                    <div className="border-l border-white/20 pl-6">
                      <p className="text-[9px] font-black uppercase tracking-widest opacity-70">CPF</p>
                      <p className="text-lg font-bold font-mono">{maskCPF(p.patient?.cpf)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      onClick={handleCall}
                      size="sm"
                      className="bg-white text-blue-800 hover:bg-blue-50 font-black px-4 h-10 rounded-lg shadow-md flex gap-2 text-sm"
                    >
                      <Activity className={cn("w-4 h-4", callCount > 0 && "animate-pulse")} />
                      {callCount === 0 ? 'CHAMAR' : `RECHAMAR (${callCount})`}
                    </Button>
                    {callCount > 0 && (
                      <Button
                        onClick={handleMarkAbsent}
                        size="sm"
                        variant="ghost"
                        className="bg-amber-100 text-amber-700 hover:bg-amber-200 font-black px-3 h-10 rounded-lg flex gap-2 text-sm border border-amber-300"
                      >
                        <UserX className="w-4 h-4" />
                        NÃO RESPONDEU
                      </Button>
                    )}
                  </div>
                </div>
              );
            })()}

            <TriageForm
              attendanceId={selectedId}
              onSuccess={handleSuccess}
              onCancel={() => setSelectedId(null)}
            />
          </div>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-slate-400 border-2 border-dashed border-slate-200 rounded-lg">
            <User className="h-16 w-16 mb-4 opacity-50" />
            <p className="text-lg">Selecione um paciente da fila para iniciar a triagem.</p>
          </div>
        )}
      </div>
    </div>
  );
}
