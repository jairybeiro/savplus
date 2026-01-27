'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { generateValidationToken } from '@/lib/validation-token';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
    Activity,
    Stethoscope,
    Pill,
    TestTube2,
    ClipboardList,
    FileText,
    AlertCircle,
    Check,
    Thermometer,
    Heart,
    Wind,
    Droplets,
    Loader2,
    Printer,
    Plus,
    Trash2,
    Pencil,
    X,
    Search,
    DoorOpen,
    Syringe,
    Ambulance,
    UserX,
    Layers,
    ChevronRight
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ManchesterColor, MANCHESTER_COLORS } from '@/lib/manchester';

// Structured prescription item type
type PrescricaoItem = {
    id: string;
    medicamento: string;
    quantidade: string;
    posologia: string;
    via?: string;
    diluicao?: string;
    composicao?: Array<{
        id: string;
        medicamento: string;
        quantidade: string;
    }>;
};

type MedicalDashboardProps = {
    attendance: any;
    onAction: (action: string, data?: any) => void;
};

type TabType = 'avaliacao' | 'prescricao' | 'exames' | 'atestado' | 'nir';

export function MedicalDashboard({ attendance, onAction }: MedicalDashboardProps) {
    const [activeTab, setActiveTab] = useState<TabType>('avaliacao');
    const [callCount, setCallCount] = useState(0);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [showFinalizeModal, setShowFinalizeModal] = useState(false);

    // Structured prescription items list
    const [prescricaoItems, setPrescricaoItems] = useState<PrescricaoItem[]>([]);
    const [prescricaoExternaItems, setPrescricaoExternaItems] = useState<PrescricaoItem[]>([]);
    const [prescricaoMode, setPrescricaoMode] = useState<'interna' | 'externa'>('interna');

    // New item form fields
    const [newItem, setNewItem] = useState({
        medicamento: '',
        quantidade: '',
        posologia: '',
        via: '',
        diluicao: ''
    });

    const [itemComposition, setItemComposition] = useState<Array<{ id: string, medicamento: string, quantidade: string }>>([]);
    const [isCompositeMode, setIsCompositeMode] = useState(false);

    // Medication presets for quick prescription
    type MedicationPreset = {
        id: number;
        category: string;
        name: string;
        default_quantity: string;
        default_instruction: string;
    };
    const [medicationPresets, setMedicationPresets] = useState<MedicationPreset[]>([]);
    const [medicationSearch, setMedicationSearch] = useState('');
    const [showMedicationDropdown, setShowMedicationDropdown] = useState(false);
    const posologiaInputRef = React.useRef<HTMLInputElement>(null);
    const medicationSearchRef = React.useRef<HTMLInputElement>(null);

    // Atestado structured form
    const [atestadoForm, setAtestadoForm] = useState({
        qtdDias: 1,
        dataInicio: new Date().toISOString().split('T')[0],
        cid: '',
        exibirCid: false
    });
    const [isCreatingAtestado, setIsCreatingAtestado] = useState(false);

    // Exames - Mock data with preparation instructions
    type ExameType = {
        id: string;
        nome: string;
        categoria: string;
        preparo?: string;
    };

    const EXAMES_DISPONIVEIS: ExameType[] = [
        { id: '1', nome: 'Hemograma Completo', categoria: 'Laboratorial' },
        { id: '2', nome: 'Glicemia de Jejum', categoria: 'Laboratorial', preparo: 'Jejum de 8 a 12 horas.' },
        { id: '3', nome: 'Ureia e Creatinina', categoria: 'Laboratorial' },
        { id: '4', nome: 'Urocultura com Antibiograma', categoria: 'Laboratorial', preparo: 'Colher primeira urina da manhã ou reter urina por 4 horas.' },
        { id: '5', nome: 'PCR (Proteína C Reativa)', categoria: 'Laboratorial' },
        { id: '6', nome: 'Raio-X de Tórax PA e Perfil', categoria: 'Imagem' },
        { id: '7', nome: 'Raio-X de Abdome', categoria: 'Imagem' },
        { id: '8', nome: 'Eletrocardiograma (ECG)', categoria: 'Cardiológico' },
        { id: '9', nome: 'Tomografia de Crânio', categoria: 'Imagem' },
        { id: '10', nome: 'TC de Abdome Total com Contraste', categoria: 'Imagem', preparo: 'Jejum de 6 a 8 horas. Informar alergias a contraste iodado.' },
        { id: '11', nome: 'Ultrassonografia de Abdome Total', categoria: 'Imagem', preparo: 'Jejum de 6 horas e bexiga cheia.' },
        { id: '12', nome: 'Ultrassonografia Pélvica', categoria: 'Imagem', preparo: 'Bexiga cheia (ingerir 4-6 copos de água 1h antes).' },
        { id: '13', nome: 'Gasometria Arterial', categoria: 'Laboratorial' },
        { id: '14', nome: 'Sumário de Urina (EAS)', categoria: 'Laboratorial' },
        { id: '15', nome: 'Endoscopia Digestiva Alta', categoria: 'Procedimento', preparo: 'Jejum absoluto de 8 horas. Não usar antiácidos.' },
        { id: '16', nome: 'Colonoscopia', categoria: 'Procedimento', preparo: 'Preparo intestinal específico. Dieta líquida 24h antes.' },
    ];

    const FRASES_RAPIDAS = [
        'Dor abdominal a esclarecer',
        'Febre persistente sem foco definido',
        'Suspeita de pneumonia',
        'Trauma/Queda',
        'Dor torácica a esclarecer',
        'Infecção urinária',
        'Desidratação',
        'Dispneia a esclarecer'
    ];

    const [examesBusca, setExamesBusca] = useState('');
    const [examesSelecionados, setExamesSelecionados] = useState<ExameType[]>([]);
    const [justificativaClinica, setJustificativaClinica] = useState('');
    const [editingExame, setEditingExame] = useState<string | null>(null);
    const [editingNome, setEditingNome] = useState('');
    const [editingPreparo, setEditingPreparo] = useState('');
    const [customExameCounter, setCustomExameCounter] = useState(100); // Start high to avoid conflicts

    // Convert number to Portuguese words (1-30)
    const numeroPorExtenso = (num: number): string => {
        const extenso = [
            '', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez',
            'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove', 'vinte',
            'vinte e um', 'vinte e dois', 'vinte e três', 'vinte e quatro', 'vinte e cinco',
            'vinte e seis', 'vinte e sete', 'vinte e oito', 'vinte e nove', 'trinta'
        ];
        return extenso[num] || num.toString();
    };

    // Generate atestado text automatically
    const generateAtestadoText = (): string => {
        const patientName = patient?.nome_completo?.toUpperCase() || 'PACIENTE';
        const patientCPF = patient?.cpf || '---';
        const horaAtual = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        const qtd = atestadoForm.qtdDias;
        const extenso = numeroPorExtenso(qtd);
        const diasStr = qtd === 1 ? 'dia' : 'dias';

        // Calculate dates
        const dataInicioDate = new Date(atestadoForm.dataInicio + 'T12:00:00');
        const dataFimDate = new Date(dataInicioDate);
        dataFimDate.setDate(dataFimDate.getDate() + qtd - 1);

        const dataInicioFormatada = dataInicioDate.toLocaleDateString('pt-BR');
        const dataFimFormatada = dataFimDate.toLocaleDateString('pt-BR');
        const dataAtendimento = new Date().toLocaleDateString('pt-BR');

        const cidText = atestadoForm.exibirCid && atestadoForm.cid
            ? `CID: ${atestadoForm.cid.toUpperCase()}`
            : 'CID: Não informado (Sigilo Médico)';

        // Use markers for bold text that will be parsed in print
        return `Atesto para os devidos fins que o(a) Sr(a). **${patientName}**, inscrito(a) no CPF ${patientCPF}, foi atendido(a) nesta unidade no dia ${dataAtendimento} às ${horaAtual} e necessita de afastamento de suas atividades laborais por **${qtd.toString().padStart(2, '0')} (${extenso}) ${diasStr}**.

Período de afastamento: **De ${dataInicioFormatada} até ${dataFimFormatada}**.

${cidText}`;
    };

    // Form data state - mirrors the fields in the attendances table
    // Note: exames_solicitados is stored locally only (column may not exist)
    const [formData, setFormData] = useState({
        anamnese: '',
        exame_fisico: '',
        diagnostico: '',
        prescricao: '', // Will store JSON string of prescricaoItems
        orientacoes_medicas: '',
        exames_solicitados: '', // Local state only - stored in prescricao if needed
        atestado: '',
        justificativa_internamento: '',
        tipo_leito: 'enfermaria',
        prioridade_regulacao: '2',
        alergias: ''
    });

    const vitals = attendance.sinais_vitais || {};
    const patient = attendance.patient;

    // Load existing clinical data from database on mount
    useEffect(() => {
        async function loadClinicalData() {
            try {
                // 1. Fetch text fields from attendances
                const { data: attData, error: attError } = await supabase
                    .from('attendances')
                    .select('anamnese, exame_fisico, diagnostico, prescricao, atestado, justificativa_internamento, orientacoes_medicas, alergias')
                    .eq('id', attendance.id)
                    .single();

                if (attData) {
                    setFormData(prev => ({
                        ...prev,
                        anamnese: attData.anamnese || '',
                        exame_fisico: (attData as any).exame_fisico || '',
                        diagnostico: (attData as any).diagnostico || '',
                        prescricao: attData.prescricao || '',
                        orientacoes_medicas: (attData as any).orientacoes_medicas || '',
                        atestado: attData.atestado || '',
                        justificativa_internamento: (attData as any).justificativa_internamento || '',
                        alergias: (attData as any).alergias || ''
                    }));
                }

                // 2. Fetch structured prescription items (Relational)
                const { data: itemsData, error: itemsError } = await supabase
                    .from('prescription_items')
                    .select('*')
                    .eq('attendance_id', attendance.id);

                if (itemsData && itemsData.length > 0) {
                    // Map relational columns to local state
                    const mappedItems = itemsData.map(i => ({
                        id: i.id, // Keep UUID
                        medicamento: i.medicamento,
                        quantidade: i.quantidade,
                        posologia: i.posologia,
                        via: i.via || '',
                        diluicao: i.diluicao || '',
                        composicao: i.composicao || []
                    }));
                    setPrescricaoItems(mappedItems);
                }

                // 3. Load External Prescription from historico (it could be JSON or text)
                if (attData?.prescricao) {
                    try {
                        const parsed = JSON.parse(attData.prescricao);
                        if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].medicamento) {
                            setPrescricaoExternaItems(parsed);
                        } else {
                            // If it's plain text but we have internal items, we might be in mixed mode
                            // For now, let's keep it in the text field if it doesn't parse
                        }
                    } catch {
                        // Plain text history - we don't load it into structured items to avoid mess
                    }
                }

            } catch (e) {
                console.warn('Could not load initial clinical data', e);
            }
        }
        loadClinicalData();
    }, [attendance.id]);

    // State for editing mode
    const [editingId, setEditingId] = useState<string | null>(null);

    // Add new prescription item
    const handleAddItem = () => {
        if (!newItem.medicamento.trim()) return;

        const item: PrescricaoItem = {
            id: Date.now().toString(), // Helper ID for UI only
            medicamento: newItem.medicamento.toUpperCase().trim(),
            quantidade: newItem.quantidade.toUpperCase().trim(),
            posologia: newItem.posologia.toUpperCase().trim(),
            via: newItem.via.toUpperCase().trim(),
            diluicao: newItem.diluicao?.toUpperCase().trim(),
            composicao: itemComposition.length > 0 ? [...itemComposition] : undefined
        };

        const setList = prescricaoMode === 'interna' ? setPrescricaoItems : setPrescricaoExternaItems;
        const currentList = prescricaoMode === 'interna' ? prescricaoItems : prescricaoExternaItems;
        const newList = [...currentList, item];

        setList(newList);
        setNewItem({ medicamento: '', quantidade: '', posologia: '', via: '', diluicao: '' });
        setItemComposition([]);
        setIsCompositeMode(false);

        // Auto-persist if it's internal
        if (prescricaoMode === 'interna') {
            handleSaveDraft({ items: newList });
        }
    };

    // Start editing an item
    const handleEditItem = (item: PrescricaoItem) => {
        setEditingId(item.id);
        setNewItem({
            medicamento: item.medicamento,
            quantidade: item.quantidade,
            posologia: item.posologia,
            via: item.via || '',
            diluicao: item.diluicao || ''
        });
        setItemComposition(item.composicao || []);
        setIsCompositeMode(!!(item.composicao && item.composicao.length > 0));
    };

    // Update existing item
    const handleUpdateItem = () => {
        if (!editingId || !newItem.medicamento.trim()) return;

        const setList = prescricaoMode === 'interna' ? setPrescricaoItems : setPrescricaoExternaItems;
        const currentList = prescricaoMode === 'interna' ? prescricaoItems : prescricaoExternaItems;

        const newList = currentList.map(item =>
            item.id === editingId
                ? {
                    ...item,
                    medicamento: newItem.medicamento.toUpperCase().trim(),
                    quantidade: newItem.quantidade.toUpperCase().trim(),
                    posologia: newItem.posologia.toUpperCase().trim(),
                    via: newItem.via.toUpperCase().trim(),
                    diluicao: newItem.diluicao?.toUpperCase().trim(),
                    composicao: itemComposition.length > 0 ? [...itemComposition] : undefined
                }
                : item
        );

        setList(newList);
        setEditingId(null);
        setNewItem({ medicamento: '', quantidade: '', posologia: '', via: '', diluicao: '' });
        setItemComposition([]);
        setIsCompositeMode(false);

        // Auto-persist update
        if (prescricaoMode === 'interna') {
            handleSaveDraft({ items: newList });
        }
    };

    // Cancel editing
    const handleCancelEdit = () => {
        setEditingId(null);
        setNewItem({ medicamento: '', quantidade: '', posologia: '', via: '', diluicao: '' });
        setItemComposition([]);
        setIsCompositeMode(false);
    };

    // Remove prescription item
    const handleRemoveItem = (id: string) => {
        const currentList = prescricaoMode === 'interna' ? prescricaoItems : prescricaoExternaItems;
        const newList = currentList.filter(item => item.id !== id);
        const setList = prescricaoMode === 'interna' ? setPrescricaoItems : setPrescricaoExternaItems;

        setList(newList);

        // If we were editing this item, cancel edit mode
        if (editingId === id) {
            setEditingId(null);
            setNewItem({ medicamento: '', quantidade: '', posologia: '', via: '', diluicao: '' });
            setItemComposition([]);
            setIsCompositeMode(false);
        }

        // Auto-persist removal
        if (prescricaoMode === 'interna') {
            handleSaveDraft({ items: newList });
        }
    };

    // Add additive to current item
    const addAdditive = (medicamento: string = '', quantidade: string = '') => {
        setItemComposition(prev => [...prev, {
            id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
            medicamento: medicamento.toUpperCase(),
            quantidade: quantidade.toUpperCase()
        }]);
    };

    // Update additive
    const updateAdditive = (id: string, field: 'medicamento' | 'quantidade', value: string) => {
        setItemComposition(prev => prev.map(a =>
            a.id === id ? { ...a, [field]: value.toUpperCase() } : a
        ));
    };

    // Remove additive
    const removeAdditive = (id: string) => {
        setItemComposition(prev => prev.filter(a => a.id !== id));
    };

    // Apply medication preset to form fields
    const applyPreset = (preset: MedicationPreset) => {
        setNewItem({
            medicamento: preset.name.toUpperCase(),
            quantidade: (preset.default_quantity || '').toUpperCase(),
            posologia: (preset.default_instruction || '').toUpperCase(),
            via: '', // Presets usually don't have via defaults yet
            diluicao: ''
        });
        setMedicationSearch('');
        setShowMedicationDropdown(false);
        setTimeout(() => posologiaInputRef.current?.focus(), 100);
    };

    // Sync structured External or Internal items to history column if needed
    useEffect(() => {
        const allItems = [...prescricaoItems, ...prescricaoExternaItems];

        // Format prescription text for history, including composition and dilution
        const textList = allItems.map(item => {
            const parts = [];
            if (item.medicamento) parts.push(item.medicamento);
            if (item.quantidade) parts.push(`(${item.quantidade})`);
            if (item.via) parts.push(`[${item.via}]`);

            let base = `- ${parts.join(' ')}`;
            if (item.posologia) base += ` - ${item.posologia}`;
            if (item.diluicao) base += `\n  - DILUIÇÃO: ${item.diluicao}`;

            if (item.composicao && item.composicao.length > 0) {
                const additives = item.composicao.map(a => `    + ${a.medicamento} (${a.quantidade})`).join('\n');
                base += `\n${additives}`;
            }
            return base;
        }).join('\n\n');

        setFormData(prev => ({
            ...prev,
            prescricao: textList
        }));
    }, [prescricaoItems, prescricaoExternaItems]);

    // Fetch medication presets for quick prescription
    useEffect(() => {
        async function fetchPresets() {
            const { data, error } = await supabase
                .from('medication_presets')
                .select('*')
                .order('name', { ascending: true });

            if (error) {
                console.error('Error fetching medication presets:', error);
            }

            if (data) {
                console.log('Loaded medication presets:', data.length);
                setMedicationPresets(data as MedicationPreset[]);
            }
        }
        fetchPresets();
    }, []);

    // Handle Call/Recall - Updates status in database to trigger TV Panel
    const handleCall = async (e: React.MouseEvent) => {
        e.stopPropagation();

        // Don't call if in observation
        if (attendance.status === 'em_observacao') return;

        try {
            const { error } = await supabase
                .from('attendances')
                .update({
                    status: 'em_atendimento',
                    updated_at: new Date().toISOString()
                })
                .eq('id', attendance.id);

            if (error) {
                console.error('Error calling patient:', error);
                return;
            }

            // Increment local counter for visual feedback
            setCallCount(prev => prev + 1);
        } catch (err) {
            console.error('Error calling panel:', err);
        }
    };

    // Handle Mark Absent - Patient didn't respond to call
    const handleMarkAbsent = async () => {
        try {
            const { error } = await supabase
                .from('attendances')
                .update({
                    status: 'ausente',
                    updated_at: new Date().toISOString()
                })
                .eq('id', attendance.id);

            if (error) {
                console.error('Error marking patient absent:', error);
                alert('Erro ao marcar ausência: ' + error.message);
                return;
            }

            // Notify parent to clear selection and refresh list
            onAction('mark_absent', { attendanceId: attendance.id });
        } catch (err: any) {
            console.error('Error marking absent:', err);
            alert('Erro ao marcar ausência: ' + (err?.message || 'Erro desconhecido'));
        }
    };

    // Save draft - Persists all form fields to database
    const handleSaveDraft = async (options?: { generateToken?: boolean, items?: PrescricaoItem[] }): Promise<boolean> => {
        setSaving(true);
        try {
            // Use specific items list if provided (useful for handleAddItem/Remove sync)
            const targetItems = options?.items || prescricaoItems;

            // Generate the text representation from scratch to ensure sync
            const allItemsForText = [...targetItems, ...prescricaoExternaItems];
            const textList = allItemsForText.map(item => {
                const parts = [];
                if (item.medicamento) parts.push(item.medicamento);
                if (item.quantidade) parts.push(`(${item.quantidade})`);
                if (item.via) parts.push(`[${item.via}]`);

                let base = `- ${parts.join(' ')}`;
                if (item.posologia) base += ` - ${item.posologia}`;
                if (item.diluicao) base += `\n  - DILUIÇÃO: ${item.diluicao}`;

                if (item.composicao && item.composicao.length > 0) {
                    const additives = item.composicao.map(a => `    + ${a.medicamento} (${a.quantidade})`).join('\n');
                    base += `\n${additives}`;
                }
                return base;
            }).join('\n\n');

            const fullPrescricao = formData.exames_solicitados
                ? `${textList}\n\n--- EXAMES SOLICITADOS ---\n${formData.exames_solicitados}`
                : textList;

            const updateData: any = {
                anamnese: formData.anamnese,
                exame_fisico: formData.exame_fisico,
                diagnostico: formData.diagnostico,
                prescricao: fullPrescricao,
                orientacoes_medicas: formData.orientacoes_medicas,
                atestado: formData.atestado,
                justificativa_internamento: formData.justificativa_internamento,
                alergias: formData.alergias,
                updated_at: new Date().toISOString()
            };

            // Generate validation token if requested (for printing)
            if (options?.generateToken) {
                const { data: existing } = await supabase
                    .from('attendances')
                    .select('validation_token')
                    .eq('id', attendance.id)
                    .single();

                if (!existing?.validation_token) {
                    updateData.validation_token = generateValidationToken();
                }
            }

            const { error: attError } = await supabase
                .from('attendances')
                .update(updateData)
                .eq('id', attendance.id);

            if (attError) throw attError;

            // --- SYNC INTERNAL PRESCRIPTION ITEMS (RELATIONAL) ---
            // 1. Delete existing items for this attendance
            await supabase.from('prescription_items').delete().eq('attendance_id', attendance.id);

            // 2. Insert items in bulk (More robust and efficient)
            if (targetItems.length > 0) {
                const itemsToInsert = targetItems.map(item => ({
                    attendance_id: attendance.id,
                    medicamento: item.medicamento,
                    quantidade: item.quantidade,
                    posologia: item.posologia,
                    via: item.via,
                    diluicao: item.diluicao,
                    composicao: item.composicao?.filter(c => c.medicamento.trim() !== '') || [],
                    checked: false
                }));

                const { error: itemsError } = await supabase.from('prescription_items').insert(itemsToInsert);
                if (itemsError) {
                    console.error('Error in bulk insert:', itemsError);
                    throw itemsError;
                }
            }
            // -----------------------------------------------------

            return true;
        } catch (err: any) {
            console.error('Error saving:', err);
            return false;
        } finally {
            setSaving(false);
        }
    };

    // Save and Print - Saves data first, then opens print window
    const handlePrint = async (printType: string) => {
        // Save current form data with validation token generation
        const saved = await handleSaveDraft({ generateToken: true });
        if (saved) {
            // Open print window after successful save
            window.open(`/print/documento/${printType}/${attendance.id}`, '_blank');
        }
    };

    // Toggle exame selection
    const toggleExame = (exame: ExameType) => {
        setExamesSelecionados(prev => {
            const exists = prev.find(e => e.id === exame.id);
            if (exists) {
                return prev.filter(e => e.id !== exame.id);
            }
            return [...prev, exame];
        });
    };

    // Add custom exam from search
    const handleAddCustomExame = () => {
        if (!examesBusca.trim()) return;

        // Check if already exists in selected
        const alreadySelected = examesSelecionados.find(
            e => e.nome.toLowerCase() === examesBusca.trim().toLowerCase()
        );
        if (alreadySelected) {
            setExamesBusca('');
            return;
        }

        const newExame: ExameType = {
            id: `custom_${customExameCounter}`,
            nome: examesBusca.trim(),
            categoria: 'Personalizado',
            preparo: ''
        };
        setExamesSelecionados(prev => [...prev, newExame]);
        setCustomExameCounter(prev => prev + 1);
        setExamesBusca('');
    };

    // Start editing an exam
    const handleStartEdit = (exame: ExameType) => {
        setEditingExame(exame.id);
        setEditingNome(exame.nome);
        setEditingPreparo(exame.preparo || '');
    };

    // Save edited exam
    const handleSaveEdit = () => {
        if (!editingExame || !editingNome.trim()) return;

        setExamesSelecionados(prev => prev.map(e => {
            if (e.id === editingExame) {
                return { ...e, nome: editingNome.trim(), preparo: editingPreparo.trim() };
            }
            return e;
        }));
        setEditingExame(null);
        setEditingNome('');
        setEditingPreparo('');
    };

    // Cancel editing exam
    const handleCancelExameEdit = () => {
        setEditingExame(null);
        setEditingNome('');
        setEditingPreparo('');
    };

    // Remove exam from selected
    const handleRemoveExame = (exameId: string) => {
        setExamesSelecionados(prev => prev.filter(e => e.id !== exameId));
        if (editingExame === exameId) {
            handleCancelExameEdit();
        }
    };

    // Print exames - save data and open print window
    const handlePrintExames = async () => {
        if (examesSelecionados.length === 0) {
            alert('Selecione pelo menos um exame.');
            return;
        }
        if (!justificativaClinica.trim()) {
            alert('Preencha a justificativa clínica.');
            return;
        }

        setSaving(true);
        try {
            // Prepare exames data as JSON with preparation instructions
            const examesData = JSON.stringify({
                exames: examesSelecionados.map(e => ({
                    nome: e.nome,
                    preparo: e.preparo || ''
                })),
                justificativa: justificativaClinica
            });

            // Generate token if needed
            const { data: existing } = await supabase
                .from('attendances')
                .select('validation_token')
                .eq('id', attendance.id)
                .single();

            const updateData: any = {
                exames_solicitados: examesData,
                updated_at: new Date().toISOString()
            };

            if (!existing?.validation_token) {
                updateData.validation_token = generateValidationToken();
            }

            const { error } = await supabase
                .from('attendances')
                .update(updateData)
                .eq('id', attendance.id);

            if (error) throw error;

            // Open print window
            window.open(`/print/documento/pedido_exames/${attendance.id}`, '_blank');
        } catch (err: any) {
            console.error('Error saving exames:', err);
            alert('Erro ao salvar exames: ' + err.message);
        } finally {
            setSaving(false);
        }
    };

    // Finalize attendance - Save all data and update status
    const handleFinalize = async (nextStatus: string) => {
        setLoading(true);
        try {
            // Generate the text representation from scratch to ensure sync
            const allItemsForHistory = [...prescricaoItems, ...prescricaoExternaItems];
            const textListForHistory = allItemsForHistory.map(item => {
                const parts = [];
                if (item.medicamento) parts.push(item.medicamento);
                if (item.quantidade) parts.push(`(${item.quantidade})`);
                if (item.via) parts.push(`[${item.via}]`);

                let base = `- ${parts.join(' ')}`;
                if (item.posologia) base += ` - ${item.posologia}`;
                if (item.diluicao) base += `\n  - DILUIÇÃO: ${item.diluicao}`;

                if (item.composicao && item.composicao.length > 0) {
                    const additives = item.composicao.map(a => `    + ${a.medicamento} (${a.quantidade})`).join('\n');
                    base += `\n${additives}`;
                }
                return base;
            }).join('\n\n');

            const fullPrescricao = formData.exames_solicitados
                ? `${textListForHistory}\n\n--- EXAMES SOLICITADOS ---\n${formData.exames_solicitados}`
                : textListForHistory;

            const updateData: any = {
                status: nextStatus,
                anamnese: formData.anamnese,
                exame_fisico: formData.exame_fisico,
                diagnostico: formData.diagnostico,
                prescricao: fullPrescricao,
                orientacoes_medicas: formData.orientacoes_medicas,
                atestado: formData.atestado,
                alergias: formData.alergias,
                updated_at: new Date().toISOString()
            };

            // --- SYNC INTERNAL PRESCRIPTION ITEMS (RELATIONAL) ---
            // 1. Delete existing items
            await supabase.from('prescription_items').delete().eq('attendance_id', attendance.id);

            // 2. Insert internal items in bulk
            if (prescricaoItems.length > 0) {
                const itemsToInsert = prescricaoItems.map(item => ({
                    attendance_id: attendance.id,
                    medicamento: item.medicamento,
                    quantidade: item.quantidade,
                    posologia: item.posologia,
                    via: item.via,
                    diluicao: item.diluicao,
                    composicao: item.composicao?.filter(c => c.medicamento.trim() !== '') || [],
                    checked: false
                }));
                const { error: itemsError } = await supabase.from('prescription_items').insert(itemsToInsert);
                if (itemsError) throw itemsError;
            }
            // -----------------------------------------------------

            // Add hospitalization fields if interning
            if (nextStatus === 'aguardando_leito') {
                updateData.justificativa_internamento = formData.justificativa_internamento;
                updateData.prioridade_regulacao = formData.prioridade_regulacao;
                updateData.data_solicitacao_vaga = new Date().toISOString();
            }

            const { error } = await supabase
                .from('attendances')
                .update(updateData)
                .eq('id', attendance.id);

            if (error) {
                console.error('DATABASE ERROR:', error);
                throw new Error(`Erro no Banco de Dados: ${error.message}`);
            }

            // Notify parent component of success
            onAction('success');
        } catch (err: any) {
            console.error('Error finalizing:', err);
            alert(err.message || 'Erro ao finalizar atendimento.');
        } finally {
            setLoading(false);
        }
    };

    const calculateAge = (dob: string) => {
        if (!dob) return '--';
        try {
            const birthDate = new Date(dob);
            const today = new Date();
            let age = today.getFullYear() - birthDate.getFullYear();
            const m = today.getMonth() - birthDate.getMonth();
            if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) age--;
            return `${age} anos`;
        } catch { return '--'; }
    };

    const maskCPF = (cpf: string) => {
        if (!cpf) return '---';
        return cpf.replace(/^(\d{3})\.(\d{3})\.(\d{3})-(\d{2})$/, '$1.***.***-$4');
    };

    const TabButton = ({ id, label, icon: Icon, color }: { id: TabType, label: string, icon: any, color?: string }) => (
        <button
            onClick={() => setActiveTab(id)}
            className={cn(
                "flex items-center gap-2 px-6 py-3 text-sm font-bold uppercase tracking-wide transition-all border-b-2",
                activeTab === id
                    ? `border-blue-600 text-blue-600 bg-blue-50/50`
                    : "border-transparent text-slate-400 hover:text-slate-600 hover:bg-slate-50"
            )}
        >
            <Icon className="w-4 h-4" />
            {label}
        </button>
    );

    return (
        <div className="flex flex-col bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden">
            {/* 1. FIXED PATIENT HEADER */}
            <div className="bg-slate-900 text-white p-4 shrink-0 flex items-center justify-between">
                <div className="flex items-center gap-6">
                    <div>
                        <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-0.5">Paciente</p>
                        <h1 className="text-xl font-black leading-none">{patient.nome_completo}</h1>
                    </div>

                    <div className="h-8 w-px bg-white/10" />

                    <div className="flex gap-8">
                        <div>
                            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-0.5">Idade</p>
                            <p className="text-lg font-bold leading-none">{calculateAge(patient.data_nascimento)}</p>
                        </div>
                        <div>
                            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-0.5">CPF</p>
                            <p className="text-lg font-bold font-mono leading-none">{maskCPF(patient.cpf)}</p>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    {attendance.status !== 'em_observacao' && (
                        <>
                            <Button
                                onClick={handleCall}
                                size="sm"
                                className="bg-white text-slate-900 hover:bg-slate-100 font-bold h-8 text-xs px-3 shadow-md transition-all active:scale-95"
                            >
                                <Activity className={cn("w-3 h-3 mr-1.5", callCount > 0 && "animate-pulse text-blue-600")} />
                                {callCount === 0 ? 'CHAMAR' : `RECHAMAR (${callCount})`}
                            </Button>
                            {callCount > 0 && (
                                <Button
                                    onClick={handleMarkAbsent}
                                    size="sm"
                                    variant="ghost"
                                    className="bg-amber-500/20 text-amber-200 hover:bg-amber-500/40 hover:text-white font-bold h-8 text-xs px-3 transition-all active:scale-95 border border-amber-500/30"
                                >
                                    <UserX className="w-3 h-3 mr-1.5" />
                                    NÃO RESPONDEU
                                </Button>
                            )}
                        </>
                    )}
                    <div className={cn("px-3 py-1 rounded text-xs font-black uppercase ml-2", MANCHESTER_COLORS[attendance.classificacao_risco as ManchesterColor] || 'bg-slate-500')}>
                        {attendance.classificacao_risco}
                    </div>
                </div>
            </div>

            {/* 2. TAB NAVIGATION */}
            <div className="flex border-b border-slate-200 bg-white shrink-0">
                <TabButton id="avaliacao" label="Avaliação" icon={Activity} />
                <TabButton id="prescricao" label="Prescrição" icon={Pill} />
                <TabButton id="exames" label="Exames" icon={TestTube2} />
                <TabButton id="atestado" label="Atestado" icon={FileText} />
                <TabButton id="nir" label="Internamento (NIR)" icon={ClipboardList} color="text-orange-600" />
            </div>

            {/* 3. MAIN CONTENT AREA - Grows with content */}
            <div className="p-6 bg-slate-50/50">

                {/* === TAB: AVALIAÇÃO === */}
                {activeTab === 'avaliacao' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                        {/* Triage Summary Card */}
                        <Card className="p-0 overflow-hidden border-slate-200 h-fit">
                            <div className="bg-slate-100 px-4 py-2 border-b border-slate-200 flex items-center justify-between">
                                <h3 className="font-bold text-slate-700 text-xs uppercase tracking-wide flex items-center gap-2">
                                    <Activity className="w-3.5 h-3.5 text-blue-500" /> Resumo da Triagem
                                </h3>
                            </div>
                            <div className="p-4 space-y-4">
                                <div>
                                    <label className="text-[9px] uppercase font-black text-slate-400">Queixa Principal</label>
                                    <p className="text-sm font-bold text-slate-800 leading-snug">{attendance.queixa_principal}</p>
                                </div>
                                <div className="grid grid-cols-5 gap-2 pt-2">
                                    {[
                                        { label: 'PA', value: vitals.pa, unit: 'mmHg' },
                                        { label: 'TEMP', value: vitals.temp, unit: '°C' },
                                        { label: 'SAT', value: vitals.spo2, unit: '%' },
                                        { label: 'FC', value: vitals.fc, unit: 'bpm' },
                                        { label: 'FR', value: vitals.fr, unit: 'rpm' },
                                        { label: 'HGT', value: vitals.hgt, unit: 'mg/dL' }
                                    ].filter(v => v.value && v.value !== '--').map((v) => (
                                        <div key={v.label} className="bg-slate-50 p-2 rounded border border-slate-100 text-center">
                                            <span className="text-[9px] font-black text-slate-400 block mb-0.5">{v.label}</span>
                                            <span className="text-sm font-black font-mono text-slate-700 block leading-none">
                                                {v.value || '--'}<span className="text-[9px] text-slate-400 ml-0.5 font-normal">{v.unit}</span>
                                            </span>
                                        </div>
                                    ))}
                                </div>
                                {attendance.alergias && (
                                    <div className="mt-4 p-3 bg-red-50 border border-red-100 rounded-lg">
                                        <p className="text-[9px] font-black text-red-600 uppercase tracking-widest flex items-center gap-2">
                                            <AlertCircle className="w-3 h-3" /> Alergias Relatadas
                                        </p>
                                        <p className="text-sm font-bold text-red-800 mt-1 uppercase italic">
                                            {attendance.alergias}
                                        </p>
                                    </div>
                                )}
                            </div>
                        </Card>

                        {/* Anamnesis Editor & Allergy */}
                        <div className="flex flex-col gap-6 h-full">
                            <div className="flex-1 flex flex-col">
                                <label className="text-sm font-bold text-slate-700 mb-2 flex items-center gap-2">
                                    <Stethoscope className="w-4 h-4 text-blue-600" />
                                    Anamnese & Exame Físico
                                </label>
                                <textarea
                                    className="flex-1 w-full min-h-[250px] bg-white border border-slate-300 rounded-lg p-4 text-sm text-slate-800 leading-relaxed focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none resize-none shadow-sm"
                                    placeholder="Descreva a história da moléstia atual, exame físico direcionado e hipóteses diagnósticas..."
                                    value={formData.anamnese}
                                    onChange={(e) => setFormData({ ...formData, anamnese: e.target.value })}
                                />
                            </div>

                            <div className="shrink-0 flex flex-col">
                                <label className="text-sm font-bold text-red-600 mb-2 flex items-center gap-2">
                                    <AlertCircle className="w-4 h-4" />
                                    Alergias & Reações Adversas
                                </label>
                                <textarea
                                    className="w-full bg-red-50/30 border border-red-200 rounded-lg p-4 text-sm text-red-900 font-bold leading-relaxed focus:ring-2 focus:ring-red-500 focus:border-transparent outline-none resize-none shadow-sm placeholder:text-red-300"
                                    placeholder="Nenhuma alergia relatada..."
                                    rows={3}
                                    value={formData.alergias}
                                    onChange={(e) => setFormData({ ...formData, alergias: e.target.value })}
                                />
                                <p className="text-[10px] text-slate-400 mt-1 italic italic">
                                    * Este campo traz informações da Triagem e pode ser editado pelo médico.
                                </p>
                            </div>
                        </div>
                    </div>
                )
                }

                {/* === TAB: PRESCRIÇÃO === */}
                {
                    activeTab === 'prescricao' && (
                        <div className="flex flex-col animate-in fade-in slide-in-from-bottom-2 duration-300">
                            {/* Prescription Mode Tabs */}
                            <div className="flex gap-2 mb-4 bg-slate-100 p-1 rounded-lg">
                                <button
                                    onClick={() => setPrescricaoMode('interna')}
                                    className={cn(
                                        "flex-1 py-2 text-xs font-bold uppercase rounded-md transition-all flex items-center justify-center gap-2",
                                        prescricaoMode === 'interna' ? "bg-white shadow-sm text-blue-600" : "text-slate-500 hover:text-slate-700"
                                    )}
                                >
                                    <Syringe className="w-4 h-4" />
                                    Prescrição Interna
                                </button>
                                <button
                                    onClick={() => setPrescricaoMode('externa')}
                                    className={cn(
                                        "flex-1 py-2 text-xs font-bold uppercase rounded-md transition-all flex items-center justify-center gap-2",
                                        prescricaoMode === 'externa' ? "bg-white shadow-sm text-green-600" : "text-slate-500 hover:text-slate-700"
                                    )}
                                >
                                    <DoorOpen className="w-4 h-4" />
                                    Receita Externa
                                </button>
                            </div>

                            {/* Header with print buttons */}
                            <div className="flex items-center justify-between mb-3">
                                <label className={cn(
                                    "text-sm font-bold flex items-center gap-2",
                                    prescricaoMode === 'interna' ? "text-blue-700" : "text-green-700"
                                )}>
                                    <Pill className="w-4 h-4" />
                                    {prescricaoMode === 'interna' ? 'Itens para Enfermagem' : 'Itens para Casa'}
                                    ({prescricaoMode === 'interna' ? prescricaoItems.length : prescricaoExternaItems.length})
                                </label>
                                <div className="flex gap-2">
                                    {prescricaoMode === 'externa' ? (
                                        <>
                                            <button
                                                type="button"
                                                onClick={() => handlePrint('receita_simples')}
                                                disabled={saving || prescricaoExternaItems.length === 0}
                                                className="text-[10px] font-bold bg-green-100 hover:bg-green-200 text-green-700 px-2 py-1 rounded flex items-center gap-1 transition-colors disabled:opacity-50"
                                            >
                                                <Printer className="w-3 h-3" />
                                                Receita Simples
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => handlePrint('receita_controle')}
                                                disabled={saving || prescricaoExternaItems.length === 0}
                                                className="text-[10px] font-bold bg-orange-100 hover:bg-orange-200 text-orange-700 px-2 py-1 rounded flex items-center gap-1 transition-colors disabled:opacity-50"
                                            >
                                                <Printer className="w-3 h-3" />
                                                Receita Controlada
                                            </button>
                                        </>
                                    ) : (
                                        <button
                                            type="button"
                                            onClick={() => handlePrint('prescricao_interna')}
                                            disabled={saving || prescricaoItems.length === 0}
                                            className="text-[10px] font-bold bg-blue-100 hover:bg-blue-200 text-blue-700 px-2 py-1 rounded flex items-center gap-1 transition-colors disabled:opacity-50"
                                        >
                                            <Printer className="w-3 h-3" />
                                            Prescrição Interna
                                        </button>
                                    )}
                                </div>
                            </div>

                            {/* Quick Prescription Search */}
                            <div className="mb-3 relative">
                                <div className="flex items-center gap-2">
                                    <Search className="w-4 h-4 text-slate-400" />
                                    <input
                                        ref={medicationSearchRef}
                                        type="text"
                                        placeholder="Buscar medicamento rápido... (ex: Dipirona, Amoxicilina)"
                                        value={medicationSearch}
                                        onChange={(e) => {
                                            setMedicationSearch(e.target.value);
                                            setShowMedicationDropdown(e.target.value.length >= 2);
                                        }}
                                        onFocus={() => {
                                            if (medicationSearch.length >= 2) setShowMedicationDropdown(true);
                                        }}
                                        onBlur={() => {
                                            // Delay to allow click on dropdown items
                                            setTimeout(() => setShowMedicationDropdown(false), 200);
                                        }}
                                        className="flex-1 px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none bg-white text-slate-800"
                                    />
                                    {medicationSearch && (
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setMedicationSearch('');
                                                setShowMedicationDropdown(false);
                                            }}
                                            className="text-slate-400 hover:text-slate-600"
                                        >
                                            <X className="w-4 h-4" />
                                        </button>
                                    )}
                                </div>

                                {/* Search Results Dropdown */}
                                {showMedicationDropdown && medicationSearch.length >= 2 && (
                                    <div className="absolute z-20 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-xl max-h-[280px] overflow-y-auto animate-in fade-in slide-in-from-top-2 duration-200">
                                        {medicationPresets
                                            .filter(p => p.name.toLowerCase().includes(medicationSearch.toLowerCase()))
                                            .slice(0, 10)
                                            .map(preset => (
                                                <button
                                                    key={preset.id}
                                                    type="button"
                                                    onMouseDown={() => applyPreset(preset)}
                                                    className="w-full text-left px-4 py-3 hover:bg-blue-50 transition-colors group border-b border-slate-100 last:border-b-0"
                                                >
                                                    <div className="flex items-center justify-between">
                                                        <div className="font-bold text-sm text-slate-800 group-hover:text-blue-700">
                                                            {preset.name}
                                                        </div>
                                                        <span className="text-[9px] font-bold uppercase px-2 py-0.5 rounded bg-slate-100 text-slate-500">
                                                            {preset.category}
                                                        </span>
                                                    </div>
                                                    <div className="text-[11px] text-slate-500 mt-0.5">
                                                        {preset.default_quantity} • {preset.default_instruction}
                                                    </div>
                                                </button>
                                            ))
                                        }
                                        {medicationPresets.filter(p => p.name.toLowerCase().includes(medicationSearch.toLowerCase())).length === 0 && (
                                            <div className="px-4 py-4 text-center text-slate-400 text-sm">
                                                Nenhum medicamento encontrado para "{medicationSearch}"
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* Add/Edit item form - 2 line layout */}
                            <Card className={cn(
                                "p-3 mb-3 border-2 transition-colors",
                                editingId ? "bg-amber-50/50 border-amber-300" : "bg-green-50/50 border-green-200"
                            )}>
                                {/* Line 1: Medicamento + Quantidade */}
                                <div className="grid grid-cols-12 gap-2 mb-2">
                                    <div className="col-span-8">
                                        <label className={cn(
                                            "text-[10px] font-semibold uppercase",
                                            editingId ? "text-amber-700" : "text-green-700"
                                        )}>
                                            Medicamento
                                        </label>
                                        <input
                                            type="text"
                                            placeholder="Ex: AMOXICILINA + CLAVULANATO 875MG"
                                            className={cn(
                                                "w-full px-2 py-1.5 text-sm border rounded focus:ring-2 focus:border-transparent outline-none uppercase bg-white",
                                                editingId ? "border-amber-300 focus:ring-amber-500" : "border-green-300 focus:ring-green-500"
                                            )}
                                            value={newItem.medicamento}
                                            onChange={(e) => setNewItem({ ...newItem, medicamento: e.target.value })}
                                        />
                                    </div>
                                    <div className="col-span-4">
                                        <label className={cn(
                                            "text-[10px] font-semibold uppercase",
                                            editingId ? "text-amber-700" : "text-green-700"
                                        )}>
                                            Quantidade
                                        </label>
                                        <input
                                            type="text"
                                            placeholder="Ex: 2 CAIXAS"
                                            className={cn(
                                                "w-full px-2 py-1.5 text-sm border rounded focus:ring-2 focus:border-transparent outline-none uppercase bg-white text-slate-800",
                                                editingId ? "border-amber-300 focus:ring-amber-500" : "border-green-300 focus:ring-green-500"
                                            )}
                                            value={newItem.quantidade}
                                            onChange={(e) => setNewItem({ ...newItem, quantidade: e.target.value })}
                                        />
                                    </div>
                                </div>

                                {/* Composite and Dilution Controls */}
                                {prescricaoMode === 'interna' && (
                                    <div className="flex gap-4 mb-3 border-t border-slate-200/50 pt-3">
                                        <button
                                            type="button"
                                            onClick={() => setIsCompositeMode(!isCompositeMode)}
                                            className={cn(
                                                "text-[10px] font-bold px-2 py-1 rounded flex items-center gap-1 transition-all shrink-0",
                                                isCompositeMode ? "bg-purple-600 text-white shadow-md" : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                                            )}
                                        >
                                            <Layers className="w-3 h-3" />
                                            ITEM COMPOSTO
                                        </button>

                                        <div className="flex-1 flex items-center gap-2">
                                            <label className="text-[10px] font-bold text-slate-400 uppercase shrink-0">Diluído em:</label>
                                            <input
                                                type="text"
                                                placeholder="Ex: 100ml SF 0.9%"
                                                className="flex-1 px-2 py-1 text-xs border border-slate-200 rounded outline-none focus:ring-1 focus:ring-blue-400 uppercase bg-white/50"
                                                value={newItem.diluicao}
                                                onChange={(e) => setNewItem({ ...newItem, diluicao: e.target.value })}
                                            />
                                        </div>
                                    </div>
                                )}

                                {/* Additives List (only in composite mode) */}
                                {prescricaoMode === 'interna' && isCompositeMode && (
                                    <div className="mb-3 p-3 bg-purple-50/50 rounded-lg border border-purple-100 animate-in slide-in-from-top-2">
                                        <div className="flex items-center justify-between mb-2">
                                            <span className="text-[10px] font-black text-purple-700 uppercase">Aditivos / Componentes</span>
                                            <button
                                                type="button"
                                                onClick={() => addAdditive()}
                                                className="text-[10px] bg-purple-600 text-white px-2 py-1 rounded hover:bg-purple-700 font-bold"
                                            >
                                                + ADICIONAR
                                            </button>
                                        </div>
                                        <div className="space-y-2">
                                            {itemComposition.map((comp) => (
                                                <div key={comp.id} className="flex gap-2 items-center bg-white/50 p-1 rounded">
                                                    <input
                                                        type="text"
                                                        placeholder="Medicamento"
                                                        className="flex-[2] px-2 py-1 text-[11px] border border-purple-200 rounded uppercase outline-none focus:ring-1 focus:ring-purple-400"
                                                        value={comp.medicamento}
                                                        onChange={(e) => updateAdditive(comp.id, 'medicamento', e.target.value)}
                                                    />
                                                    <input
                                                        type="text"
                                                        placeholder="Qtde"
                                                        className="flex-1 px-2 py-1 text-[11px] border border-purple-200 rounded uppercase outline-none focus:ring-1 focus:ring-purple-400 font-mono"
                                                        value={comp.quantidade}
                                                        onChange={(e) => updateAdditive(comp.id, 'quantidade', e.target.value)}
                                                    />
                                                    <button
                                                        type="button"
                                                        onClick={() => removeAdditive(comp.id)}
                                                        className="text-red-400 hover:text-red-600 px-1 hover:bg-red-50 rounded"
                                                    >
                                                        <Trash2 className="w-3 h-3" />
                                                    </button>
                                                </div>
                                            ))}
                                            {itemComposition.length === 0 && (
                                                <div className="text-center py-2 text-[10px] text-purple-400 italic font-medium">
                                                    Adicione os outros itens da composição (ex: Glicose, Cloreto...)
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {/* Line 2: Posologia (full width) + Buttons */}
                                <div className="grid grid-cols-12 gap-2">
                                    <div className="col-span-12 md:col-span-7">
                                        <label className={cn(
                                            "text-[10px] font-semibold uppercase",
                                            editingId ? "text-amber-700" : "text-green-700"
                                        )}>
                                            Posologia / Instruções
                                        </label>
                                        <input
                                            ref={posologiaInputRef}
                                            type="text"
                                            placeholder="Ex: TOMAR 1 COMPRIMIDO DE 12 EM 12 HORAS POR 7 DIAS"
                                            className={cn(
                                                "w-full px-2 py-1.5 text-sm border rounded focus:ring-2 focus:border-transparent outline-none uppercase bg-white text-slate-800",
                                                editingId ? "border-amber-300 focus:ring-amber-500" : "border-green-300 focus:ring-green-500"
                                            )}
                                            value={newItem.posologia}
                                            onChange={(e) => setNewItem({ ...newItem, posologia: e.target.value })}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') {
                                                    editingId ? handleUpdateItem() : handleAddItem();
                                                }
                                            }}
                                        />
                                    </div>
                                    <div className="col-span-12 md:col-span-3">
                                        <label className={cn(
                                            "text-[10px] font-semibold uppercase",
                                            editingId ? "text-amber-700" : "text-green-700"
                                        )}>
                                            Via
                                        </label>
                                        <input
                                            type="text"
                                            placeholder="Ex: VO, EV, IM"
                                            className={cn(
                                                "w-full px-2 py-1.5 text-sm border rounded focus:ring-2 focus:border-transparent outline-none uppercase bg-white text-slate-800",
                                                editingId ? "border-amber-300 focus:ring-amber-500" : "border-green-300 focus:ring-green-500"
                                            )}
                                            value={newItem.via}
                                            onChange={(e) => setNewItem({ ...newItem, via: e.target.value })}
                                        />
                                    </div>

                                    {/* Action buttons */}
                                    <div className="col-span-2 flex items-end gap-1">
                                        {editingId ? (
                                            <>
                                                <button
                                                    onClick={handleUpdateItem}
                                                    disabled={!newItem.medicamento.trim()}
                                                    className="flex-1 h-[34px] bg-amber-500 hover:bg-amber-600 text-white rounded flex items-center justify-center transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                                    title="Atualizar item"
                                                >
                                                    <Check className="w-4 h-4" />
                                                </button>
                                                <button
                                                    onClick={handleCancelEdit}
                                                    className="h-[34px] px-2 bg-slate-400 hover:bg-slate-500 text-white rounded flex items-center justify-center transition-colors"
                                                    title="Cancelar edição"
                                                >
                                                    <X className="w-4 h-4" />
                                                </button>
                                            </>
                                        ) : (
                                            <button
                                                onClick={handleAddItem}
                                                disabled={!newItem.medicamento.trim()}
                                                className="w-full h-[34px] bg-green-600 hover:bg-green-700 text-white rounded flex items-center justify-center transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                                title="Adicionar item"
                                            >
                                                <Plus className="w-4 h-4" />
                                            </button>
                                        )}
                                    </div>
                                </div>

                                {/* Edit mode indicator */}
                                {editingId && (
                                    <div className="mt-2 text-xs text-amber-600 font-medium">
                                        ✏️ Editando item. Clique em ✓ para salvar ou ✕ para cancelar.
                                    </div>
                                )}
                            </Card>

                            {/* Items list */}
                            <div className="flex-1 overflow-y-auto space-y-2 mb-4">
                                {(prescricaoMode === 'interna' ? prescricaoItems : prescricaoExternaItems).length === 0 ? (
                                    <div className="flex items-center justify-center h-32 text-slate-400 text-sm">
                                        Nenhum medicamento adicionado nesta lista.
                                    </div>
                                ) : (
                                    (prescricaoMode === 'interna' ? prescricaoItems : prescricaoExternaItems).map((item, index) => (
                                        <Card key={item.id} className={cn(
                                            "p-3 border transition-colors group relative",
                                            editingId === item.id ? "border-amber-400 bg-amber-50" : "border-slate-100 hover:border-slate-300 bg-white shadow-sm"
                                        )}>
                                            <div className="flex justify-between items-start">
                                                <div className="flex-1">
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <span className="text-xs font-black text-slate-800 uppercase tracking-tight">
                                                            {index + 1}. {item.medicamento}
                                                        </span>
                                                        {item.quantidade && (
                                                            <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">
                                                                {item.quantidade}
                                                            </span>
                                                        )}
                                                        {item.composicao && item.composicao.length > 0 && (
                                                            <span className="text-[9px] font-black text-purple-600 bg-purple-50 border border-purple-100 px-1.5 py-0.5 rounded flex items-center gap-0.5">
                                                                <Layers className="w-2.5 h-2.5" /> COMPOSTO
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1 text-[11px] text-slate-500 font-medium lowercase">
                                                        {item.posologia && (
                                                            <span className="flex items-center gap-1 text-slate-700 capitalize">
                                                                <Check className="w-3 h-3 text-green-500" /> {item.posologia}
                                                            </span>
                                                        )}
                                                        {item.via && (
                                                            <span className="uppercase text-[9px] font-black tracking-widest text-slate-400 px-1.5 py-0.5 bg-slate-50 rounded">
                                                                {item.via}
                                                            </span>
                                                        )}
                                                        {item.diluicao && (
                                                            <span className="text-[10px] italic text-blue-500 font-bold uppercase">
                                                                DILUÍDO EM: {item.diluicao}
                                                            </span>
                                                        )}
                                                    </div>

                                                    {/* Render Composition if exists */}
                                                    {item.composicao && item.composicao.length > 0 && (
                                                        <div className="mt-2 ml-4 border-l-2 border-purple-100 pl-3 space-y-1">
                                                            {item.composicao.map((comp, cIdx) => (
                                                                <div key={comp.id || cIdx} className="flex items-center gap-2 text-[10px] text-purple-700 font-bold italic uppercase">
                                                                    <ChevronRight className="w-3 h-3 text-purple-300" />
                                                                    <span>{comp.medicamento}</span>
                                                                    <span className="opacity-60">{comp.quantidade}</span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                                {/* Action buttons */}
                                                <div className="flex gap-1">
                                                    <button
                                                        onClick={() => handleEditItem(item)}
                                                        disabled={editingId !== null && editingId !== item.id}
                                                        className="text-blue-400 hover:text-blue-600 p-1 transition-colors disabled:opacity-30"
                                                        title="Editar item"
                                                    >
                                                        <Pencil className="w-4 h-4" />
                                                    </button>
                                                    <button
                                                        onClick={() => handleRemoveItem(item.id)}
                                                        className="text-red-400 hover:text-red-600 p-1 transition-colors"
                                                        title="Remover item"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            </div>
                                        </Card>
                                    ))
                                )}
                            </div>

                            {/* Additional Medical Instructions */}
                            <div className="mt-4 border-t pt-4">
                                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">
                                    Orientações para a Enfermagem
                                </label>
                                <textarea
                                    className="w-full text-sm border border-slate-200 rounded-lg p-3 bg-white focus:ring-2 focus:ring-blue-500 outline-none transition-all placeholder:text-slate-300 text-slate-900 font-medium"
                                    placeholder="Digite aqui orientações específicas..."
                                    value={formData.orientacoes_medicas}
                                    onChange={(e) => setFormData({ ...formData, orientacoes_medicas: e.target.value })}
                                    rows={2}
                                />
                            </div>
                        </div>
                    )
                }

                {/* === TAB: EXAMES === */}
                {
                    activeTab === 'exames' && (
                        <div className="flex flex-col animate-in fade-in slide-in-from-bottom-2 duration-300">
                            {/* Header with Print button */}
                            <div className="flex items-center justify-between mb-3 flex-shrink-0">
                                <label className="text-sm font-bold text-blue-700 flex items-center gap-2">
                                    <TestTube2 className="w-4 h-4" />
                                    Pedido de Exames
                                </label>
                                <button
                                    type="button"
                                    onClick={handlePrintExames}
                                    disabled={saving || examesSelecionados.length === 0}
                                    className="text-[10px] font-bold bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded flex items-center gap-1 transition-colors disabled:opacity-50"
                                >
                                    <Printer className="w-3 h-3" />
                                    Imprimir Pedido
                                </button>
                            </div>

                            {/* Main content */}
                            <div>
                                <div className="grid grid-cols-2 gap-4">
                                    {/* Left column: Search and Quick Access */}
                                    <div className="space-y-3">
                                        {/* Search */}
                                        <div className="relative flex gap-2">
                                            <div className="relative flex-1">
                                                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                                <input
                                                    type="text"
                                                    placeholder="Buscar ou adicionar exame..."
                                                    value={examesBusca}
                                                    onChange={(e) => setExamesBusca(e.target.value)}
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Enter' && examesBusca.trim()) {
                                                            e.preventDefault();
                                                            const match = EXAMES_DISPONIVEIS.find(
                                                                ex => ex.nome.toLowerCase() === examesBusca.trim().toLowerCase()
                                                            );
                                                            if (match) {
                                                                toggleExame(match);
                                                                setExamesBusca('');
                                                            } else {
                                                                handleAddCustomExame();
                                                            }
                                                        }
                                                    }}
                                                    className="w-full pl-9 pr-3 py-2 text-sm text-slate-800 border border-blue-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none bg-white"
                                                />
                                            </div>
                                            {examesBusca.trim() && !EXAMES_DISPONIVEIS.some(e => e.nome.toLowerCase() === examesBusca.trim().toLowerCase()) && (
                                                <button
                                                    onClick={handleAddCustomExame}
                                                    className="px-3 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium flex items-center gap-1 transition-colors"
                                                    title="Adicionar exame personalizado"
                                                >
                                                    <Plus className="w-4 h-4" />
                                                </button>
                                            )}
                                        </div>

                                        {/* Quick Access Chips (when not searching) OR Search Results */}
                                        {!examesBusca.trim() ? (
                                            <div className="space-y-4">
                                                {/* Laboratório */}
                                                <div>
                                                    <label className="text-[10px] font-bold text-blue-600 uppercase mb-1.5 block">
                                                        🧪 Laboratório
                                                    </label>
                                                    <div className="flex flex-wrap gap-1.5">
                                                        {EXAMES_DISPONIVEIS.filter(e => e.categoria === 'Laboratorial').map(exame => {
                                                            const isSelected = examesSelecionados.find(e => e.id === exame.id);
                                                            return (
                                                                <button
                                                                    key={exame.id}
                                                                    onClick={() => toggleExame(exame)}
                                                                    className={cn(
                                                                        "px-2.5 py-1.5 rounded-full text-xs font-medium transition-all duration-200",
                                                                        isSelected
                                                                            ? "bg-blue-600 text-white shadow-md"
                                                                            : "bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200"
                                                                    )}
                                                                >
                                                                    {exame.preparo && <span className="mr-1">⚠️</span>}
                                                                    {exame.nome.length > 18 ? exame.nome.substring(0, 18) + '...' : exame.nome}
                                                                    {isSelected && <Check className="w-3 h-3 ml-1 inline" />}
                                                                </button>
                                                            );
                                                        })}
                                                    </div>
                                                </div>

                                                {/* Imagem / Diagnóstico */}
                                                <div>
                                                    <label className="text-[10px] font-bold text-purple-600 uppercase mb-1.5 block">
                                                        📷 Imagem / Diagnóstico
                                                    </label>
                                                    <div className="flex flex-wrap gap-1.5">
                                                        {EXAMES_DISPONIVEIS.filter(e => e.categoria === 'Imagem' || e.categoria === 'Cardiológico' || e.categoria === 'Procedimento').map(exame => {
                                                            const isSelected = examesSelecionados.find(e => e.id === exame.id);
                                                            return (
                                                                <button
                                                                    key={exame.id}
                                                                    onClick={() => toggleExame(exame)}
                                                                    className={cn(
                                                                        "px-2.5 py-1.5 rounded-full text-xs font-medium transition-all duration-200",
                                                                        isSelected
                                                                            ? "bg-purple-600 text-white shadow-md"
                                                                            : "bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-200"
                                                                    )}
                                                                >
                                                                    {exame.preparo && <span className="mr-1">⚠️</span>}
                                                                    {exame.nome.length > 18 ? exame.nome.substring(0, 18) + '...' : exame.nome}
                                                                    {isSelected && <Check className="w-3 h-3 ml-1 inline" />}
                                                                </button>
                                                            );
                                                        })}
                                                    </div>
                                                </div>

                                                {/* More exams link */}
                                                <p className="text-[10px] text-slate-400 italic">
                                                    Digite para buscar mais exames ou adicionar personalizado
                                                </p>
                                            </div>
                                        ) : (
                                            <div className="space-y-1 max-h-[200px] overflow-y-auto">
                                                {EXAMES_DISPONIVEIS
                                                    .filter(e => e.nome.toLowerCase().includes(examesBusca.toLowerCase()))
                                                    .map(exame => {
                                                        const isSelected = examesSelecionados.find(e => e.id === exame.id);
                                                        return (
                                                            <button
                                                                key={exame.id}
                                                                onClick={() => { toggleExame(exame); setExamesBusca(''); }}
                                                                className={cn(
                                                                    "w-full text-left px-3 py-2 rounded-lg text-sm transition-all duration-200",
                                                                    isSelected
                                                                        ? "bg-blue-100 border-2 border-blue-500 text-blue-800"
                                                                        : "bg-white border border-slate-200 hover:border-blue-300 text-slate-700"
                                                                )}
                                                            >
                                                                <div className="flex items-center justify-between">
                                                                    <span className="flex items-center gap-1">
                                                                        {exame.preparo && <span className="text-amber-500">⚠️</span>}
                                                                        {exame.nome}
                                                                    </span>
                                                                    {isSelected && <Check className="w-4 h-4 text-blue-600" />}
                                                                </div>
                                                            </button>
                                                        );
                                                    })}
                                                {EXAMES_DISPONIVEIS.filter(e => e.nome.toLowerCase().includes(examesBusca.toLowerCase())).length === 0 && (
                                                    <button
                                                        onClick={handleAddCustomExame}
                                                        className="w-full text-left px-3 py-3 rounded-lg text-sm bg-green-50 border-2 border-dashed border-green-400 text-green-700 hover:bg-green-100 transition-colors"
                                                    >
                                                        <Plus className="w-4 h-4 inline mr-2" />
                                                        Adicionar "<strong>{examesBusca}</strong>" como novo exame
                                                    </button>
                                                )}
                                            </div>
                                        )}
                                    </div>

                                    {/* Right column: Selected exams (grows) + Justification */}
                                    <div className="space-y-3">
                                        {/* Selected exams - Grows with content */}
                                        <div className="transition-all duration-300">
                                            <label className="text-[10px] font-semibold text-blue-700 uppercase mb-1 block">
                                                Exames Selecionados ({examesSelecionados.length})
                                                {examesSelecionados.some(e => e.preparo) && (
                                                    <span className="text-amber-600 ml-1">⚠️</span>
                                                )}
                                            </label>

                                            {examesSelecionados.length === 0 ? (
                                                <div className="bg-slate-50 border border-dashed border-slate-300 rounded-lg p-4 text-center">
                                                    <p className="text-xs text-slate-400">Nenhum exame selecionado</p>
                                                </div>
                                            ) : (
                                                <div className="bg-blue-50 border border-blue-200 rounded-lg p-2 space-y-1">
                                                    {examesSelecionados.map(exame => (
                                                        editingExame === exame.id ? (
                                                            <div key={exame.id} className="bg-white border-2 border-blue-500 rounded-lg p-2 space-y-2 animate-in fade-in duration-200">
                                                                <input
                                                                    type="text"
                                                                    value={editingNome}
                                                                    onChange={(e) => setEditingNome(e.target.value)}
                                                                    placeholder="Nome do exame"
                                                                    className="w-full px-2 py-1 text-xs text-slate-800 border border-slate-300 rounded focus:ring-1 focus:ring-blue-500 outline-none"
                                                                    autoFocus
                                                                />
                                                                <input
                                                                    type="text"
                                                                    value={editingPreparo}
                                                                    onChange={(e) => setEditingPreparo(e.target.value)}
                                                                    placeholder="Observação/Preparo (opcional)"
                                                                    className="w-full px-2 py-1 text-xs text-slate-800 border border-slate-300 rounded focus:ring-1 focus:ring-blue-500 outline-none"
                                                                />
                                                                <div className="flex gap-1">
                                                                    <button onClick={handleSaveEdit} className="flex-1 px-2 py-1 bg-green-600 hover:bg-green-700 text-white text-[10px] font-bold rounded">
                                                                        Salvar
                                                                    </button>
                                                                    <button onClick={handleCancelExameEdit} className="flex-1 px-2 py-1 bg-slate-400 hover:bg-slate-500 text-white text-[10px] font-bold rounded">
                                                                        Cancelar
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        ) : (
                                                            <div
                                                                key={exame.id}
                                                                className={cn(
                                                                    "flex items-start justify-between text-xs px-2 py-1.5 rounded transition-all duration-200 animate-in fade-in slide-in-from-left-2",
                                                                    exame.preparo
                                                                        ? "bg-amber-100 border border-amber-300 text-amber-800"
                                                                        : "bg-white border border-blue-200 text-slate-700"
                                                                )}
                                                            >
                                                                <div className="flex-1 min-w-0">
                                                                    <div className="flex items-center gap-1">
                                                                        {exame.preparo && <span>⚠️</span>}
                                                                        <span className="font-medium">{exame.nome}</span>
                                                                    </div>
                                                                    {exame.preparo && (
                                                                        <p className="text-[10px] text-amber-700 mt-0.5 italic">{exame.preparo}</p>
                                                                    )}
                                                                </div>
                                                                <div className="flex items-center gap-0.5 ml-1 flex-shrink-0">
                                                                    <button onClick={() => handleStartEdit(exame)} className="p-1 hover:bg-slate-200 rounded transition-colors" title="Editar">
                                                                        <Pencil className="w-3 h-3" />
                                                                    </button>
                                                                    <button onClick={() => handleRemoveExame(exame.id)} className="p-1 hover:bg-red-200 hover:text-red-600 rounded transition-colors" title="Remover">
                                                                        <Trash2 className="w-3 h-3" />
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        )
                                                    ))}
                                                </div>
                                            )}
                                        </div>

                                        {/* Justification - Always visible below selected exams */}
                                        <div className="transition-all duration-300">
                                            <label className="text-[10px] font-semibold text-blue-700 uppercase mb-1 block">
                                                Justificativa Clínica *
                                            </label>
                                            <textarea
                                                value={justificativaClinica}
                                                onChange={(e) => setJustificativaClinica(e.target.value)}
                                                placeholder="Descreva o motivo do pedido..."
                                                rows={2}
                                                className="w-full bg-white border border-blue-200 rounded-lg p-2 text-sm text-slate-800 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none resize-y"
                                            />

                                            {/* Quick phrases */}
                                            <div className="mt-2">
                                                <label className="text-[9px] font-semibold text-slate-500 uppercase mb-1 block">
                                                    Frases Rápidas
                                                </label>
                                                <div className="flex flex-wrap gap-1">
                                                    {FRASES_RAPIDAS.map((frase, i) => (
                                                        <button
                                                            key={i}
                                                            onClick={() => setJustificativaClinica(prev => prev ? `${prev}. ${frase}` : frase)}
                                                            className="text-[10px] bg-slate-100 hover:bg-blue-100 text-slate-600 hover:text-blue-700 px-2 py-1 rounded transition-colors"
                                                        >
                                                            {frase}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )
                }

                {/* === TAB: ATESTADO === */}
                {
                    activeTab === 'atestado' && (
                        <div className="flex flex-col animate-in fade-in slide-in-from-bottom-2 duration-300">
                            {!isCreatingAtestado ? (
                                /* Empty State */
                                <div className="flex flex-col items-center justify-center py-16 text-center">
                                    <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mb-4">
                                        <FileText className="w-10 h-10 text-slate-400" />
                                    </div>
                                    <h3 className="text-lg font-bold text-slate-600 mb-2">
                                        Nenhum atestado emitido
                                    </h3>
                                    <p className="text-sm text-slate-400 mb-6 max-w-xs">
                                        Nenhum atestado foi emitido para este atendimento.
                                    </p>
                                    <button
                                        onClick={() => setIsCreatingAtestado(true)}
                                        className="px-6 py-3 bg-slate-600 hover:bg-slate-700 text-white font-bold rounded-lg flex items-center gap-2 transition-colors shadow-md"
                                    >
                                        <Plus className="w-5 h-5" />
                                        Emitir Atestado Médico
                                    </button>
                                </div>
                            ) : (
                                /* Atestado Form */
                                <>
                                    {/* Header */}
                                    <div className="flex items-center justify-between mb-3">
                                        <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
                                            <FileText className="w-4 h-4" />
                                            Atestado Médico
                                        </label>
                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={() => {
                                                    setIsCreatingAtestado(false);
                                                    setAtestadoForm({
                                                        qtdDias: 1,
                                                        dataInicio: new Date().toISOString().split('T')[0],
                                                        cid: '',
                                                        exibirCid: false
                                                    });
                                                }}
                                                className="text-[10px] font-bold bg-red-100 hover:bg-red-200 text-red-700 px-3 py-1.5 rounded flex items-center gap-1 transition-colors"
                                            >
                                                <Trash2 className="w-3 h-3" />
                                                Cancelar
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setFormData(prev => ({ ...prev, atestado: generateAtestadoText() }));
                                                    setTimeout(() => handlePrint('atestado'), 100);
                                                }}
                                                disabled={saving}
                                                className="text-[10px] font-bold bg-slate-600 hover:bg-slate-700 text-white px-3 py-1.5 rounded flex items-center gap-1 transition-colors disabled:opacity-50"
                                            >
                                                <Printer className="w-3 h-3" />
                                                Imprimir Atestado
                                            </button>
                                        </div>
                                    </div>

                                    {/* Structured Form */}
                                    <Card className="p-4 mb-3 bg-slate-50/50 border-slate-200">
                                        <div className="grid grid-cols-12 gap-4">
                                            {/* Qty Days */}
                                            <div className="col-span-3">
                                                <label className="text-[10px] font-semibold text-slate-700 uppercase block mb-1">
                                                    Qtd. de Dias
                                                </label>
                                                <input
                                                    type="number"
                                                    min="1"
                                                    max="30"
                                                    value={atestadoForm.qtdDias}
                                                    onChange={(e) => setAtestadoForm({ ...atestadoForm, qtdDias: Math.max(1, parseInt(e.target.value) || 1) })}
                                                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded focus:ring-2 focus:ring-slate-500 focus:border-transparent outline-none bg-white text-center font-bold text-slate-800"
                                                />
                                            </div>

                                            {/* Start Date */}
                                            <div className="col-span-4">
                                                <label className="text-[10px] font-semibold text-slate-700 uppercase block mb-1">
                                                    Data de Início
                                                </label>
                                                <input
                                                    type="date"
                                                    value={atestadoForm.dataInicio}
                                                    onChange={(e) => setAtestadoForm({ ...atestadoForm, dataInicio: e.target.value })}
                                                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded focus:ring-2 focus:ring-slate-500 focus:border-transparent outline-none bg-white text-slate-800"
                                                />
                                            </div>

                                            {/* CID */}
                                            <div className="col-span-3">
                                                <label className="text-[10px] font-semibold text-slate-700 uppercase block mb-1">
                                                    CID
                                                </label>
                                                <input
                                                    type="text"
                                                    placeholder="Ex: A09"
                                                    value={atestadoForm.cid}
                                                    onChange={(e) => setAtestadoForm({ ...atestadoForm, cid: e.target.value.toUpperCase() })}
                                                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded focus:ring-2 focus:ring-slate-500 focus:border-transparent outline-none bg-white uppercase text-slate-800"
                                                />
                                            </div>

                                            {/* Toggle CID */}
                                            <div className="col-span-2 flex flex-col justify-end">
                                                <label className="text-[10px] font-semibold text-slate-700 uppercase block mb-1">
                                                    Exibir CID
                                                </label>
                                                <button
                                                    type="button"
                                                    onClick={() => setAtestadoForm({ ...atestadoForm, exibirCid: !atestadoForm.exibirCid })}
                                                    className={cn(
                                                        "w-full px-3 py-2 text-sm font-bold rounded transition-colors",
                                                        atestadoForm.exibirCid
                                                            ? "bg-green-100 text-green-700 border-2 border-green-500"
                                                            : "bg-slate-100 text-slate-500 border-2 border-slate-300"
                                                    )}
                                                >
                                                    {atestadoForm.exibirCid ? "SIM" : "NÃO"}
                                                </button>
                                            </div>
                                        </div>
                                    </Card>

                                    {/* Preview */}
                                    <div className="flex-1 flex flex-col">
                                        <label className="text-[10px] font-semibold text-slate-500 uppercase mb-1">
                                            Pré-visualização do Texto Gerado
                                        </label>
                                        <div className="flex-1 bg-white border border-slate-200 rounded-lg p-6 text-sm text-slate-800 leading-relaxed shadow-inner font-serif overflow-auto">
                                            {generateAtestadoText().split('\n').map((line, i) => {
                                                const htmlLine = line.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
                                                const isCID = line.startsWith('CID:');
                                                const isPeriodo = line.startsWith('Período');
                                                return (
                                                    <p
                                                        key={i}
                                                        className={cn(
                                                            isCID ? 'mt-4 font-sans text-xs bg-slate-100 px-3 py-2 rounded inline-block' : '',
                                                            isPeriodo ? 'mt-3 text-center font-sans' : ''
                                                        )}
                                                        dangerouslySetInnerHTML={{ __html: htmlLine || '&nbsp;' }}
                                                    />
                                                );
                                            })}
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>
                    )
                }

                {/* === TAB: NIR (INTERNAMENTO) === */}
                {
                    activeTab === 'nir' && (
                        <div className="flex flex-col animate-in fade-in slide-in-from-bottom-2 duration-300 gap-4">
                            <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 flex items-start gap-3">
                                <AlertCircle className="w-5 h-5 text-orange-600 shrink-0 mt-0.5" />
                                <div>
                                    <h4 className="text-sm font-bold text-orange-800">Solicitação de Internamento / Transferência (NIR)</h4>
                                    <p className="text-xs text-orange-700 mt-1">
                                        Preencha todos os campos abaixo. O paciente será encaminhado para a lista do NIR (Núcleo Interno de Regulação).
                                    </p>
                                </div>
                            </div>

                            {/* NIR Form Fields */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="text-[10px] uppercase font-black text-slate-400 mb-1 block">Tipo de Leito</label>
                                    <select
                                        className="w-full h-10 border border-slate-300 rounded-lg px-3 text-sm font-medium bg-white focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none text-slate-800"
                                        value={formData.tipo_leito}
                                        onChange={(e) => setFormData({ ...formData, tipo_leito: e.target.value })}
                                    >
                                        <option value="enfermaria">Enfermaria</option>
                                        <option value="uti">UTI</option>
                                        <option value="isolamento">Isolamento</option>
                                        <option value="semi_intensivo">Semi-Intensivo</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="text-[10px] uppercase font-black text-slate-400 mb-1 block">Prioridade Clínica</label>
                                    <select
                                        className="w-full h-10 border border-slate-300 rounded-lg px-3 text-sm font-medium bg-white focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none text-slate-800"
                                        value={formData.prioridade_regulacao}
                                        onChange={(e) => setFormData({ ...formData, prioridade_regulacao: e.target.value })}
                                    >
                                        <option value="1">🔴 Prioridade 1 - Imediata (Risco de Vida)</option>
                                        <option value="2">🟠 Prioridade 2 - Urgente</option>
                                        <option value="3">🟢 Prioridade 3 - Estável</option>
                                    </select>
                                </div>
                            </div>

                            <div className="flex-1 flex flex-col">
                                <label className="text-sm font-bold text-orange-800 mb-2 flex items-center gap-2">
                                    Justificativa Clínica *
                                    {!formData.justificativa_internamento && (
                                        <span className="text-[10px] font-normal text-red-500">(Obrigatório para solicitar vaga)</span>
                                    )}
                                </label>
                                <textarea
                                    className="flex-1 w-full bg-white border border-orange-200 rounded-lg p-4 text-sm text-slate-800 focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none resize-none shadow-sm min-h-[150px]"
                                    placeholder="Descreva detalhadamente o quadro clínico, diagnóstico e motivo da necessidade de internação..."
                                    value={formData.justificativa_internamento}
                                    onChange={(e) => setFormData({ ...formData, justificativa_internamento: e.target.value })}
                                />
                            </div>

                            {/* NIR Validation Status */}
                            {formData.justificativa_internamento && (
                                <div className="bg-green-50 border border-green-200 rounded-lg p-3 flex items-center gap-2">
                                    <Check className="w-4 h-4 text-green-600" />
                                    <span className="text-sm font-medium text-green-700">
                                        Formulário NIR preenchido. Clique em "Solicitar Vaga" no rodapé para enviar.
                                    </span>
                                </div>
                            )}
                        </div>
                    )
                }

            </div >

            {/* 4. FOOTER ACTIONS */}
            < div className="bg-white border-t border-slate-200 p-4 shrink-0 flex items-center justify-between" >
                <div className="text-xs text-slate-400 font-medium flex items-center gap-2">
                    {saving ? (
                        <>
                            <Loader2 className="w-3 h-3 animate-spin text-blue-500" />
                            Salvando...
                        </>
                    ) : (
                        <>
                            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                            Rascunho salvo automaticamente
                        </>
                    )}
                </div>
                <Button
                    className="bg-green-600 hover:bg-green-700 text-white font-black uppercase tracking-wider px-8 py-3 shadow-lg shadow-green-200 text-base"
                    onClick={() => setShowFinalizeModal(true)}
                    disabled={loading}
                >
                    {loading ? (
                        <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                    ) : (
                        <Check className="w-5 h-5 mr-2" />
                    )}
                    Finalizar Atendimento
                </Button>
            </div >

            {/* 5. FINALIZE MODAL */}
            {
                showFinalizeModal && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
                        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 overflow-hidden animate-in zoom-in-95 duration-300">
                            {/* Modal Header */}
                            <div className="bg-slate-800 text-white p-6 text-center">
                                <h2 className="text-2xl font-black uppercase tracking-widest">
                                    Qual o desfecho do atendimento?
                                </h2>
                                <p className="text-slate-300 text-sm mt-1">
                                    Selecione uma opção para encerrar
                                </p>
                            </div>

                            {/* Modal Body - 3 Big Cards */}
                            <div className="p-6 grid gap-4">
                                {/* ALTA MÉDICA */}
                                <button
                                    type="button"
                                    onClick={() => {
                                        setShowFinalizeModal(false);
                                        handleFinalize('finalizado');
                                    }}
                                    className="w-full p-6 rounded-xl border-2 border-green-200 bg-green-50 hover:bg-green-100 hover:border-green-400 transition-all group text-left flex items-center gap-5"
                                >
                                    <div className="w-16 h-16 bg-green-500 rounded-full flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                                        <DoorOpen className="w-8 h-8 text-white" />
                                    </div>
                                    <div className="flex-1">
                                        <h3 className="text-xl font-black text-green-800 uppercase tracking-wide">
                                            Alta Médica
                                        </h3>
                                        <p className="text-green-600 text-sm mt-1">
                                            Liberar paciente. Salva documentos e permite impressão.
                                        </p>
                                    </div>
                                    <Check className="w-6 h-6 text-green-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                                </button>

                                {/* MEDICAÇÃO / OBSERVAÇÃO */}
                                <button
                                    type="button"
                                    onClick={() => {
                                        setShowFinalizeModal(false);
                                        handleFinalize('em_observacao');
                                    }}
                                    className="w-full p-6 rounded-xl border-2 border-blue-200 bg-blue-50 hover:bg-blue-100 hover:border-blue-400 transition-all group text-left flex items-center gap-5 relative"
                                >
                                    <div className="w-16 h-16 bg-blue-500 rounded-full flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                                        <Syringe className="w-8 h-8 text-white" />
                                    </div>
                                    <div className="flex-1">
                                        <h3 className="text-xl font-black text-blue-800 uppercase tracking-wide">
                                            Medicação / Observação
                                        </h3>
                                        <p className="text-blue-600 text-sm mt-1">
                                            Move paciente para fila de Enfermagem para medicação ou observação.
                                        </p>
                                    </div>
                                    {prescricaoItems.length > 0 && (
                                        <span className="absolute top-3 right-3 text-[10px] font-bold bg-blue-600 text-white px-2 py-1 rounded-full uppercase">
                                            ✓ Recomendado (há prescrição)
                                        </span>
                                    )}
                                    <Check className="w-6 h-6 text-blue-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                                </button>

                                {/* SOLICITAR VAGA / NIR */}
                                <button
                                    type="button"
                                    onClick={() => {
                                        if (!formData.justificativa_internamento) {
                                            setShowFinalizeModal(false);
                                            alert('Preencha a Justificativa Clínica na aba NIR antes de solicitar vaga.');
                                            setActiveTab('nir');
                                            return;
                                        }
                                        setShowFinalizeModal(false);
                                        handleFinalize('aguardando_leito');
                                    }}
                                    className={cn(
                                        "w-full p-6 rounded-xl border-2 transition-all group text-left flex items-center gap-5",
                                        formData.justificativa_internamento
                                            ? "border-red-200 bg-red-50 hover:bg-red-100 hover:border-red-400"
                                            : "border-slate-200 bg-slate-50 opacity-60"
                                    )}
                                >
                                    <div className={cn(
                                        "w-16 h-16 rounded-full flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform",
                                        formData.justificativa_internamento ? "bg-red-500" : "bg-slate-400"
                                    )}>
                                        <Ambulance className="w-8 h-8 text-white" />
                                    </div>
                                    <div className="flex-1">
                                        <h3 className={cn(
                                            "text-xl font-black uppercase tracking-wide",
                                            formData.justificativa_internamento ? "text-red-800" : "text-slate-500"
                                        )}>
                                            Solicitar Vaga / NIR
                                        </h3>
                                        <p className={cn(
                                            "text-sm mt-1",
                                            formData.justificativa_internamento ? "text-red-600" : "text-slate-400"
                                        )}>
                                            {formData.justificativa_internamento
                                                ? "Encaminhar para regulação de leitos (NIR)."
                                                : "Preencha a justificativa clínica na aba NIR primeiro."
                                            }
                                        </p>
                                    </div>
                                    {formData.justificativa_internamento && (
                                        <Check className="w-6 h-6 text-red-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                                    )}
                                </button>
                            </div>

                            {/* Modal Footer */}
                            <div className="p-4 border-t border-slate-200 flex justify-center">
                                <button
                                    type="button"
                                    onClick={() => setShowFinalizeModal(false)}
                                    className="text-slate-500 hover:text-slate-700 font-bold text-sm uppercase tracking-wider px-6 py-2 rounded-lg hover:bg-slate-100 transition-colors"
                                >
                                    Cancelar
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }
        </div >
    );
}
