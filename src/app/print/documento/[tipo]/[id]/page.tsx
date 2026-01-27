'use client';

import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { UNIT_CONFIG } from '@/config/unit-settings';
import { QRCodeSVG } from 'qrcode.react';

// ============================================
// CONFIGURATION - Dynamic rows per page by document type
// ============================================
const ROWS_PER_PAGE_CONFIG: Record<string, number> = {
    receita_simples: 10,      // Smaller footer, more space for items
    receita_controle: 6,      // Large footer with buyer/seller boxes
    prescricao_interna: 6,    // Table format needs more space
    atestado: 1,              // Usually single content
    pedido_exames: 12         // Exam list
};

const getRowsPerPage = (tipo: string): number => {
    return ROWS_PER_PAGE_CONFIG[tipo] || 6;
};

// ============================================
// TYPES
// ============================================
type DocumentType = 'receita_simples' | 'receita_controle' | 'prescricao_interna' | 'atestado' | 'pedido_exames';

type RowType = 'SECTION_HEADER' | 'MEDICINE' | 'SPACER';

// Structured prescription item from the form
type PrescricaoItem = {
    id: string;
    medicamento: string;
    quantidade: string;
    posologia: string;
    diluicao?: string;
    composicao?: Array<{ id: string, medicamento: string, quantidade: string }>;
};

type PrintableRow = {
    type: RowType;
    text?: string;
    number?: number;
    // Structured fields for new format
    medicamento?: string;
    quantidade?: string;
    posologia?: string;
    diluicao?: string;
    composicao?: Array<{ id: string, medicamento: string, quantidade: string }>;
};

type AttendanceData = {
    id: string;
    created_at: string;
    prescricao: string;
    atestado: string;
    diagnostico: string;
    exames_solicitados?: string;
    patient: {
        nome_completo: string;
        cpf: string;
        data_nascimento: string;
    };
    medico_nome?: string;
    medico_crm?: string;
    validation_token?: string;
};

// ============================================
// UTILITY FUNCTIONS
// ============================================
const formatDate = (date: Date = new Date()) => {
    return date.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: 'long',
        year: 'numeric'
    });
};

const formatCPF = (cpf: string) => {
    if (!cpf) return '---';
    return cpf;
};

const calculateAge = (dob: string) => {
    if (!dob) return '--';
    const birthDate = new Date(dob);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) age--;
    return `${age} anos`;
};

// ============================================
// PRESCRIPTION PARSER - Creates unified printable rows
// Supports both structured JSON format and legacy text format
// ============================================
function preparePrintData(prescriptionText: string): PrintableRow[] {
    if (!prescriptionText || prescriptionText.trim() === '') {
        return [];
    }

    const rows: PrintableRow[] = [];

    // Try to parse as JSON (structured format)
    try {
        const parsed = JSON.parse(prescriptionText);
        if (Array.isArray(parsed)) {
            // Structured format - each item becomes a MEDICINE row
            // Each structured item counts as 2 rows (for pagination: medicamento + posologia)
            parsed.forEach((item: PrescricaoItem, index: number) => {
                rows.push({
                    type: 'MEDICINE',
                    number: index + 1,
                    medicamento: item.medicamento,
                    quantidade: item.quantidade,
                    posologia: item.posologia,
                    diluicao: item.diluicao,
                    composicao: item.composicao
                });
            });
            return rows;
        }
    } catch {
        // Not JSON, fall through to legacy text parsing
    }

    // Legacy text format parsing
    const lines = prescriptionText.split('\n').filter(line => line.trim().length > 0);
    let medicineCounter = 1;

    for (const line of lines) {
        const trimmedLine = line.trim();

        // Detect Section Headers (lines that start with keywords and don't have medicine numbering)
        const isSectionHeader = (
            // Common section patterns
            trimmedLine.toLowerCase().startsWith('uso oral') ||
            trimmedLine.toLowerCase().startsWith('uso nasal') ||
            trimmedLine.toLowerCase().startsWith('uso tópico') ||
            trimmedLine.toLowerCase().startsWith('uso topico') ||
            trimmedLine.toLowerCase().startsWith('uso injetável') ||
            trimmedLine.toLowerCase().startsWith('uso injetavel') ||
            trimmedLine.toLowerCase().startsWith('uso endovenoso') ||
            trimmedLine.toLowerCase().startsWith('uso intramuscular') ||
            trimmedLine.toLowerCase().startsWith('uso subcutâneo') ||
            trimmedLine.toLowerCase().startsWith('uso retal') ||
            trimmedLine.toLowerCase().startsWith('uso oftálmico') ||
            trimmedLine.toLowerCase().startsWith('uso oftalmico') ||
            trimmedLine.toLowerCase().startsWith('uso auricular') ||
            trimmedLine.toLowerCase().startsWith('uso inalatório') ||
            trimmedLine.toLowerCase().startsWith('uso inalatorio') ||
            trimmedLine.toLowerCase().startsWith('---') ||
            // Lines that are capitalized and short (likely headers)
            (trimmedLine.toUpperCase() === trimmedLine && trimmedLine.length < 50 && !trimmedLine.match(/^\d+\./))
        );

        if (isSectionHeader) {
            rows.push({
                type: 'SECTION_HEADER',
                text: trimmedLine
            });
        } else {
            // It's a medicine/item
            const hasNumber = trimmedLine.match(/^\d+[\.)\]]\s*/);
            let cleanText = trimmedLine;
            if (hasNumber) {
                cleanText = trimmedLine.replace(/^\d+[\.)\]]\s*/, '');
            }

            rows.push({
                type: 'MEDICINE',
                text: cleanText,
                number: medicineCounter
            });
            medicineCounter++;
        }
    }

    return rows;
}

// Calculate visual weight of rows for pagination
// Structured medicines count as 2 (medicamento line + posologia line)
function calculateRowWeight(rows: PrintableRow[]): number {
    return rows.reduce((acc, row) => {
        if (row.type === 'MEDICINE' && row.medicamento) {
            // Structured format - count medicamento line + posologia line
            let weight = 2;
            if (row.diluicao) weight += 1;
            if (row.composicao) weight += row.composicao.length;
            return acc + weight;
        }
        return acc + 1;
    }, 0);
}

// Chunk array into smaller arrays based on visual weight
function chunkArrayByWeight(array: PrintableRow[], maxWeight: number): PrintableRow[][] {
    const chunks: PrintableRow[][] = [];
    let currentChunk: PrintableRow[] = [];
    let currentWeight = 0;

    for (const row of array) {
        let rowWeight = 1;
        if (row.type === 'MEDICINE' && row.medicamento) {
            rowWeight = 2;
            if (row.diluicao) rowWeight += 1;
            if (row.composicao) rowWeight += row.composicao.length;
        }

        if (currentWeight + rowWeight > maxWeight && currentChunk.length > 0) {
            chunks.push(currentChunk);
            currentChunk = [];
            currentWeight = 0;
        }

        currentChunk.push(row);
        currentWeight += rowWeight;
    }

    if (currentChunk.length > 0) {
        chunks.push(currentChunk);
    }

    return chunks.length > 0 ? chunks : [[]];
}

// Legacy chunk function for backwards compatibility
function chunkArray<T>(array: T[], maxSize: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += maxSize) {
        chunks.push(array.slice(i, i + maxSize));
    }
    return chunks.length > 0 ? chunks : [[]];
}

// ============================================
// PAGE HEADER COMPONENT
// ============================================
function PageHeader({
    tipo,
    patient,
    attendance,
    pageNumber,
    totalPages,
    viaLabel
}: {
    tipo: DocumentType;
    patient: any;
    attendance: AttendanceData;
    pageNumber: number;
    totalPages: number;
    viaLabel?: string;
}) {
    const isControlled = tipo === 'receita_controle';

    return (
        <div className="page-header">
            <div className="header-top">
                <div className="logo-section">
                    <img
                        src={UNIT_CONFIG.logoUrl}
                        alt="Logo"
                        className="logo"
                        onError={(e) => {
                            (e.target as HTMLImageElement).style.display = 'none';
                        }}
                    />
                </div>
                <div className="org-info">
                    <p className="org-name">{UNIT_CONFIG.organizationName}</p>
                    <p className="secretary-name">{UNIT_CONFIG.secretaryName}</p>
                    <p className="unit-name">{UNIT_CONFIG.unitName}</p>
                    <p className="unit-address">{UNIT_CONFIG.address}</p>
                    <p className="unit-contact">Tel: {UNIT_CONFIG.phone} | CNES: {UNIT_CONFIG.cnes}</p>
                </div>
                <div className="header-right">
                    {/* SUS Logo for receitas */}
                    {(tipo === 'receita_simples' || tipo === 'receita_controle') && (
                        <div className="sus-logo">SUS</div>
                    )}
                    {isControlled && viaLabel && (
                        <div className="control-badge">
                            <span>{viaLabel}</span>
                        </div>
                    )}
                    {/* Only show page number for prescricao_interna */}
                    {tipo === 'prescricao_interna' && totalPages > 1 && (
                        <div className="page-number">
                            Página {pageNumber} de {totalPages}
                        </div>
                    )}
                </div>
            </div>

            <div className="document-title">
                {tipo === 'receita_simples' && 'RECEITA MÉDICA'}
                {tipo === 'receita_controle' && 'RECEITA DE CONTROLE ESPECIAL'}
                {tipo === 'prescricao_interna' && 'PRESCRIÇÃO MÉDICA HOSPITALAR'}
                {tipo === 'atestado' && 'ATESTADO MÉDICO'}
                {tipo === 'pedido_exames' && 'PEDIDO DE EXAMES E PROCEDIMENTOS'}
            </div>

            <div className="patient-info">
                <div className="patient-row">
                    <span className="label">Paciente:</span>
                    <span className="value patient-name">{patient?.nome_completo || '---'}</span>
                </div>
                <div className="patient-details">
                    <div>
                        <span className="label">CPF:</span>
                        <span className="value">{formatCPF(patient?.cpf)}</span>
                    </div>
                    <div>
                        <span className="label">Nascimento:</span>
                        <span className="value">{patient?.data_nascimento ? new Date(patient.data_nascimento).toLocaleDateString('pt-BR') : '---'}</span>
                    </div>
                    <div>
                        <span className="label">Idade:</span>
                        <span className="value">{calculateAge(patient?.data_nascimento)}</span>
                    </div>
                </div>
                <div className="patient-row">
                    <span className="label">Data:</span>
                    <span className="value">{formatDate(new Date(attendance.created_at))}</span>
                </div>
            </div>
        </div>
    );
}

// ============================================
// PAGE FOOTER COMPONENT
// ============================================
function PageFooter({ tipo, attendance }: { tipo: DocumentType; attendance: AttendanceData }) {
    const doctorName = attendance.medico_nome || 'Dr. Médico Plantonista';
    const doctorCRM = attendance.medico_crm || 'CRM-SP 000000';
    const isControlled = tipo === 'receita_controle';
    // Show QR code for all validatable documents
    // Show QR code for all validatable documents
    const showQRCode = tipo === 'receita_simples' || tipo === 'receita_controle' || tipo === 'atestado' || tipo === 'pedido_exames';

    // Use validation_token for URL if available, fallback to ID
    const validationKey = attendance.validation_token || attendance.id.substring(0, 10).toUpperCase();
    const validationUrl = typeof window !== 'undefined'
        ? `${window.location.origin}/validar-documento?key=${validationKey}`
        : `/validar-documento?key=${validationKey}`;

    // Format token for display (e.g., "5D21-F295-4B")
    const displayToken = validationKey.match(/.{1,4}/g)?.join('-') || validationKey;

    return (
        <div className="page-footer">
            {/* Signature Section - Always first */}
            <div className="signature-section">
                <div className="signature-area">
                    <div className="signature-line"></div>
                    <p className="doctor-name">{doctorName}</p>
                    <p className="doctor-crm">{doctorCRM}</p>
                    <p className="unit-info">{UNIT_CONFIG.unitName}</p>
                </div>

                {/* QR Code for validatable documents */}
                {showQRCode && (
                    <div className="qr-section">
                        <QRCodeSVG
                            value={validationUrl}
                            size={60}
                            level="M"
                            includeMargin={false}
                        />
                        <p className="qr-label">Valide este documento</p>
                        <p className="qr-token">Cód: {displayToken}</p>
                    </div>
                )}
            </div>

            {/* Control boxes for controlled prescriptions - After signature */}
            {isControlled && (
                <div className="control-boxes">
                    <div className="control-box">
                        <p className="box-title">IDENTIFICAÇÃO DO COMPRADOR</p>
                        <div className="box-field"><span>Nome:</span><span className="line"></span></div>
                        <div className="box-field"><span>RG:</span><span className="line"></span></div>
                        <div className="box-field"><span>Endereço:</span><span className="line"></span></div>
                        <div className="box-field"><span>Telefone:</span><span className="line"></span></div>
                    </div>
                    <div className="control-box">
                        <p className="box-title">IDENTIFICAÇÃO DO FORNECEDOR</p>
                        <div className="box-field"><span>Farmácia:</span><span className="line"></span></div>
                        <div className="box-field"><span>CNPJ:</span><span className="line"></span></div>
                        <div className="box-field"><span>Data:</span><span className="line"></span></div>
                        <div className="box-field"><span>Assinatura:</span><span className="line"></span></div>
                    </div>
                </div>
            )}

            <div className="print-date">
                {UNIT_CONFIG.city}, {formatDate()}
            </div>
        </div>
    );
}

// ============================================
// PAGE BODY - Renders rows based on type
// ============================================
function ReceitaBody({ rows }: { rows: PrintableRow[] }) {
    return (
        <div className="page-body">
            <div className="prescription-content">
                {rows.map((row, index) => {
                    if (row.type === 'SECTION_HEADER') {
                        return (
                            <div key={index} className="section-header">
                                {row.text}
                            </div>
                        );
                    } else if (row.type === 'MEDICINE') {
                        // Check if it's structured format (has medicamento field)
                        if (row.medicamento) {
                            return (
                                <div key={index} className="medicine-item">
                                    {/* Line 1: Number + Drug Name | Quantity */}
                                    <div className="medicine-header">
                                        <span className="medicine-name">
                                            {row.number}. {row.medicamento}
                                        </span>
                                        <span className="medicine-qty">
                                            Quantidade: {row.quantidade || '---'}
                                        </span>
                                    </div>
                                    {/* Line 2: Instructions */}
                                    {row.posologia && (
                                        <div className="medicine-posologia">
                                            {row.posologia}
                                        </div>
                                    )}
                                    {/* Line 3: Dilution */}
                                    {row.diluicao && (
                                        <div className="medicine-posologia" style={{ fontStyle: 'italic', fontSize: '9px' }}>
                                            Diluído em: {row.diluicao}
                                        </div>
                                    )}
                                    {/* Line 4: Composition */}
                                    {row.composicao && row.composicao.length > 0 && (
                                        <div className="medicine-posologia" style={{ marginTop: '4px', borderLeft: '1px solid #eee' }}>
                                            {row.composicao.map((c, i) => (
                                                <div key={i} style={{ fontSize: '9px', fontStyle: 'italic' }}>
                                                    + {c.medicamento} ({c.quantidade})
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            );
                        } else {
                            // Legacy text format
                            return (
                                <div key={index} className="medicine-row">
                                    <span className="medicine-number">{row.number}.</span>
                                    <span className="medicine-text">{row.text}</span>
                                </div>
                            );
                        }
                    }
                    return null;
                })}
            </div>
        </div>
    );
}

function PrescricaoInternaBody({ rows }: { rows: PrintableRow[] }) {
    const hours = ['06:00', '12:00', '18:00', '00:00'];

    // Filter only medicines for the table
    const medicines = rows.filter(r => r.type === 'MEDICINE');

    return (
        <div className="page-body internal">
            <table className="internal-table">
                <thead>
                    <tr>
                        <th className="col-item">Nº</th>
                        <th className="col-medication">MEDICAMENTO / POSOLOGIA</th>
                        {hours.map(h => (
                            <th key={h} className="col-hour">{h}</th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {medicines.map((row, index) => (
                        <tr key={index}>
                            <td className="col-item">{row.number}</td>
                            <td className="col-medication">
                                <div style={{ fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase' }}>
                                    {row.medicamento || row.text} {row.quantidade ? `(${row.quantidade})` : ''}
                                </div>
                                <div style={{ fontSize: '10px', marginTop: '2px', textTransform: 'uppercase' }}>
                                    {row.posologia}
                                </div>
                                {row.diluicao && (
                                    <div style={{ fontSize: '9px', fontStyle: 'italic', marginTop: '2px', color: '#444' }}>
                                        DILUÍDO EM: {row.diluicao}
                                    </div>
                                )}
                                {row.composicao && row.composicao.length > 0 && (
                                    <div style={{ marginTop: '4px', paddingLeft: '8px', borderLeft: '1px solid #ccc' }}>
                                        {row.composicao.map((c, i) => (
                                            <div key={i} style={{ fontSize: '9px', fontStyle: 'italic' }}>
                                                + {c.medicamento} ({c.quantidade})
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </td>
                            {hours.map(h => (
                                <td key={h} className="col-hour check-cell"></td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
            <div className="nurse-section">
                <p>Enfermeiro(a) Responsável: _________________________________ COREN: ______________</p>
            </div>
        </div>
    );
}

function AtestadoBody({ text }: { text: string }) {
    const defaultText = 'Atesto para os devidos fins que o(a) paciente acima identificado(a) esteve sob cuidados médicos nesta unidade de saúde, necessitando de afastamento de suas atividades.';
    const content = text || defaultText;

    // Convert **text** markers to <strong> tags
    const parseBold = (line: string) => {
        return line.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    };

    return (
        <div className="page-body atestado">
            <div className="atestado-content">
                {content.split('\n').map((line, index) => {
                    if (line.startsWith('CID:')) {
                        return (
                            <p key={index} className="atestado-cid">
                                {line}
                            </p>
                        );
                    }
                    if (line.startsWith('Período')) {
                        return (
                            <p
                                key={index}
                                className="atestado-period"
                                dangerouslySetInnerHTML={{ __html: parseBold(line) }}
                            />
                        );
                    }
                    if (!line.trim()) {
                        return <br key={index} />;
                    }
                    return (
                        <p
                            key={index}
                            className="atestado-text"
                            dangerouslySetInnerHTML={{ __html: parseBold(line) }}
                        />
                    );
                })}
            </div>
        </div>
    );
}

// Pedido de Exames body
type ExameItem = { nome: string; preparo?: string } | string;

function PedidoExamesBody({ examesData }: { examesData: string }) {
    let parsed: { exames?: ExameItem[]; justificativa?: string } = {};

    try {
        parsed = JSON.parse(examesData || '{}');
    } catch {
        // If not JSON, treat as legacy text format
        parsed = { exames: [], justificativa: examesData };
    }

    const exames = parsed.exames || [];
    const justificativa = parsed.justificativa || '';

    // Normalize exames to always have nome and preparo
    const normalizedExames = exames.map(e => {
        if (typeof e === 'string') {
            return { nome: e, preparo: '' };
        }
        return e;
    });

    return (
        <div className="page-body pedido-exames">
            <h2 className="pedido-title">PEDIDO DE EXAMES E PROCEDIMENTOS</h2>

            {justificativa && (
                <div className="justificativa-section">
                    <h3 className="section-label">JUSTIFICATIVA CLÍNICA:</h3>
                    <p className="justificativa-text">{justificativa}</p>
                </div>
            )}

            <div className="exames-section">
                {normalizedExames.length > 0 ? (
                    <ul className="exames-list">
                        {normalizedExames.map((exame, i) => (
                            <li key={i}>
                                <span className="exame-nome">{exame.nome}</span>
                                {exame.preparo && (
                                    <span className="exame-preparo"> (Preparo: {exame.preparo})</span>
                                )}
                            </li>
                        ))}
                    </ul>
                ) : (
                    <p className="no-exames">Nenhum exame especificado</p>
                )}
            </div>
        </div>
    );
}

// ============================================
// COMPLETE PAGE COMPONENT
// ============================================
function PrintPage({
    tipo,
    attendance,
    rows,
    pageNumber,
    totalPages,
    isLastPage,
    viaLabel
}: {
    tipo: DocumentType;
    attendance: AttendanceData;
    rows: PrintableRow[];
    pageNumber: number;
    totalPages: number;
    isLastPage: boolean;
    viaLabel?: string;
}) {
    const isFirstPage = pageNumber === 1;
    const isControlled = tipo === 'receita_controle';

    return (
        <div className={`print-page ${!isLastPage ? 'page-break' : ''}`}>
            <PageHeader
                tipo={tipo}
                patient={attendance.patient}
                attendance={attendance}
                pageNumber={pageNumber}
                totalPages={totalPages}
                viaLabel={viaLabel}
            />

            {tipo === 'receita_simples' && (
                <ReceitaBody rows={rows} />
            )}
            {tipo === 'receita_controle' && (
                <ReceitaBody rows={rows} />
            )}
            {tipo === 'prescricao_interna' && (
                <PrescricaoInternaBody rows={rows} />
            )}
            {tipo === 'atestado' && (
                <AtestadoBody text={attendance.atestado} />
            )}
            {tipo === 'pedido_exames' && (
                <PedidoExamesBody examesData={attendance.exames_solicitados || ''} />
            )}

            <PageFooter tipo={tipo} attendance={attendance} />
        </div>
    );
}

// ============================================
// MAIN COMPONENT
// ============================================
export default function PrintDocumentPage() {
    const params = useParams();
    const tipo = params.tipo as DocumentType;
    const id = params.id as string;

    const [attendance, setAttendance] = useState<AttendanceData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        async function fetchData() {
            try {
                const { data, error } = await supabase
                    .from('attendances')
                    .select('*, patient:patients(nome_completo, cpf, data_nascimento)')
                    .eq('id', id)
                    .single();

                if (error) throw error;
                setAttendance(data as unknown as AttendanceData);
            } catch (err: any) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        }

        if (id) fetchData();
    }, [id]);

    useEffect(() => {
        if (attendance && !loading) {
            setTimeout(() => {
                window.print();
            }, 500);
        }
    }, [attendance, loading]);

    if (loading) {
        return (
            <div className="loading-screen">
                <div className="spinner"></div>
                <p>Carregando documento...</p>
            </div>
        );
    }

    if (error || !attendance) {
        return (
            <div className="error-screen">
                <h1>Erro</h1>
                <p>{error || 'Atendimento não encontrado'}</p>
                <button onClick={() => window.history.back()}>Voltar</button>
            </div>
        );
    }

    // Prepare and chunk data based on document type
    const rowsPerPage = getRowsPerPage(tipo);
    const isSinglePageDoc = tipo === 'atestado' || tipo === 'pedido_exames';
    const allRows = isSinglePageDoc ? [] : preparePrintData(attendance.prescricao);

    // Use weight-based chunking for structured items (each structured medicine = 2 visual rows)
    const hasStructuredItems = allRows.some(r => r.medicamento);
    const chunks = isSinglePageDoc
        ? [[]]
        : hasStructuredItems
            ? chunkArrayByWeight(allRows, rowsPerPage)
            : chunkArray(allRows, rowsPerPage);
    const totalPages = chunks.length || 1;

    return (
        <>
            <style jsx global>{`
                /* ===========================
                   PRINT MEDIA STYLES
                   =========================== */
                @media print {
                    @page {
                        size: A4;
                        margin: 10mm;
                    }
                    
                    body {
                        -webkit-print-color-adjust: exact !important;
                        print-color-adjust: exact !important;
                        margin: 0;
                        padding: 0;
                        background: white;
                    }
                    
                    .no-print {
                        display: none !important;
                    }
                    
                    .print-container {
                        gap: 0;
                    }
                    
                    .print-page {
                        box-shadow: none !important;
                        margin: 0 !important;
                        padding: 10mm !important;
                        /* A4 height (297mm) minus top and bottom padding (10mm each) = 277mm */
                        height: 277mm !important;
                        min-height: 277mm !important;
                        max-height: 277mm !important;
                        page-break-inside: avoid;
                        display: flex !important;
                        flex-direction: column !important;
                    }
                    
                    .page-break {
                        page-break-after: always;
                    }
                    
                    .page-body {
                        flex: 1 1 auto !important;
                    }
                    
                    .page-footer {
                        margin-top: auto !important;
                        flex-shrink: 0 !important;
                    }
                }
                
                /* ===========================
                   SCREEN STYLES
                   =========================== */
                * {
                    box-sizing: border-box;
                }
                
                body {
                    background: #2d3748;
                    margin: 0;
                    padding: 20px;
                    font-family: 'Times New Roman', Times, serif;
                }
                
                .print-container {
                    display: flex;
                    flex-direction: column;
                    gap: 30px;
                    align-items: center;
                }
                
                .print-page {
                    width: 210mm;
                    min-height: 297mm;
                    height: 297mm; /* Force exact A4 height */
                    max-height: 297mm;
                    padding: 12mm;
                    background: white;
                    box-shadow: 0 10px 40px rgba(0,0,0,0.5);
                    display: flex;
                    flex-direction: column;
                    color: #000;
                    box-sizing: border-box;
                    overflow: hidden;
                }
                
                .page-break {
                    page-break-after: always;
                }
                
                /* ===========================
                   HEADER STYLES
                   =========================== */
                .page-header {
                    border-bottom: 2px solid #000;
                    padding-bottom: 10px;
                    margin-bottom: 12px;
                    flex-shrink: 0;
                }
                
                .header-top {
                    display: flex;
                    align-items: flex-start;
                    gap: 12px;
                    margin-bottom: 10px;
                }
                
                .logo-section {
                    flex-shrink: 0;
                }
                
                .logo {
                    width: 45px;
                    height: 45px;
                    object-fit: contain;
                }
                
                .org-info {
                    flex: 1;
                }
                
                .org-name {
                    font-size: 11px;
                    font-weight: bold;
                    margin: 0;
                    text-transform: uppercase;
                    color: #000;
                }
                
                .secretary-name {
                    font-size: 10px;
                    margin: 1px 0;
                    color: #000;
                }
                
                .unit-name {
                    font-size: 12px;
                    font-weight: bold;
                    margin: 3px 0;
                    color: #000;
                }
                
                .unit-address, .unit-contact {
                    font-size: 8px;
                    margin: 1px 0;
                    color: #333;
                }
                
                .header-right {
                    display: flex;
                    flex-direction: column;
                    align-items: flex-end;
                    gap: 6px;
                }
                
                .sus-logo {
                    font-size: 28px;
                    font-weight: 900;
                    color: #1e40af;
                    letter-spacing: 2px;
                    font-family: Arial, sans-serif;
                    text-transform: uppercase;
                }
                
                .control-badge {
                    background: transparent;
                    color: #000;
                    padding: 3px 10px;
                    text-align: center;
                    border: 2px solid #000;
                    border-radius: 3px;
                }
                
                .control-badge span {
                    display: block;
                    font-size: 12px;
                    font-weight: bold;
                    color: #000;
                    letter-spacing: 0.5px;
                }
                
                .page-number {
                    font-size: 9px;
                    color: #666;
                    font-style: italic;
                }
                
                .document-title {
                    text-align: center;
                    font-size: 14px;
                    font-weight: bold;
                    text-transform: uppercase;
                    padding: 8px 0;
                    letter-spacing: 2px;
                    border-top: 1px solid #ccc;
                    border-bottom: 1px solid #ccc;
                    margin: 8px 0;
                    color: #000;
                }
                
                .patient-info {
                    font-size: 10px;
                    color: #000;
                }
                
                .patient-row {
                    margin: 3px 0;
                }
                
                .patient-details {
                    display: flex;
                    gap: 20px;
                    margin: 3px 0;
                }
                
                .label {
                    font-weight: bold;
                    margin-right: 4px;
                    color: #000;
                }
                
                .value {
                    color: #000;
                }
                
                .patient-name {
                    font-size: 11px;
                    font-weight: bold;
                    text-transform: uppercase;
                }
                
                /* ===========================
                   BODY STYLES
                   =========================== */
                .page-body {
                    flex: 1;
                    padding: 10px 0;
                    color: #000;
                    overflow: hidden;
                }
                
                .prescription-content {
                    color: #000;
                }
                
                .section-header {
                    font-size: 11px;
                    font-weight: bold;
                    color: #000;
                    margin: 12px 0 8px 0;
                    padding: 4px 0;
                    border-bottom: 1px solid #666;
                    text-transform: uppercase;
                }
                
                .section-header:first-child {
                    margin-top: 0;
                }
                
                /* Legacy medicine row */
                .medicine-row {
                    display: flex;
                    gap: 8px;
                    font-size: 11px;
                    line-height: 1.5;
                    margin-bottom: 10px;
                    padding-bottom: 8px;
                    border-bottom: 1px dotted #aaa;
                    color: #000;
                }
                
                .medicine-number {
                    font-weight: bold;
                    flex-shrink: 0;
                    width: 20px;
                    color: #000;
                }
                
                .medicine-text {
                    flex: 1;
                    color: #000;
                }
                
                /* Structured medicine item */
                .medicine-item {
                    margin-bottom: 12px;
                    padding-bottom: 10px;
                    border-bottom: 1px dotted #aaa;
                }
                
                .medicine-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: baseline;
                    margin-bottom: 4px;
                }
                
                .medicine-name {
                    font-size: 11px;
                    font-weight: bold;
                    color: #000;
                    text-transform: uppercase;
                }
                
                .medicine-qty {
                    font-size: 11px;
                    font-weight: bold;
                    color: #000;
                    flex-shrink: 0;
                }
                
                .medicine-posologia {
                    font-size: 10px;
                    color: #000;
                    text-transform: uppercase;
                    padding-left: 16px;
                    line-height: 1.4;
                }
                
                .controlled-warning {
                    background: #fff3cd;
                    border: 2px solid #000;
                    padding: 6px;
                    text-align: center;
                    font-weight: bold;
                    font-size: 9px;
                    margin-bottom: 12px;
                    color: #000;
                }
                
                /* Internal Table */
                .internal-table {
                    width: 100%;
                    border-collapse: collapse;
                    font-size: 9px;
                    color: #000;
                }
                
                .internal-table th,
                .internal-table td {
                    border: 1px solid #000;
                    padding: 5px 3px;
                    color: #000;
                }
                
                .internal-table th {
                    background: #e5e5e5;
                    font-weight: bold;
                }
                
                .col-item {
                    width: 22px;
                    text-align: center;
                }
                
                .col-medication {
                    text-align: left;
                }
                
                .col-hour {
                    width: 40px;
                    text-align: center;
                }
                
                .check-cell {
                    height: 20px;
                }
                
                .nurse-section {
                    margin-top: 15px;
                    font-size: 9px;
                    color: #000;
                }
                
                /* Atestado */
                .page-body.atestado {
                    display: flex;
                    flex-direction: column;
                    justify-content: center;
                    align-items: center;
                    padding: 40px 20px;
                }
                
                .atestado-content {
                    max-width: 520px;
                    text-align: center;
                }
                
                .atestado-text {
                    font-family: 'Times New Roman', Times, serif;
                    font-size: 13px;
                    line-height: 2;
                    text-align: justify;
                    text-indent: 50px;
                    color: #000;
                    margin-bottom: 5px;
                }
                
                .atestado-text strong {
                    font-weight: bold;
                }
                
                .atestado-period {
                    font-family: 'Times New Roman', Times, serif;
                    font-size: 13px;
                    line-height: 2;
                    text-align: center;
                    color: #000;
                    margin-top: 15px;
                    margin-bottom: 10px;
                }
                
                .atestado-period strong {
                    font-weight: bold;
                }
                
                .atestado-cid {
                    font-family: Arial, sans-serif;
                    font-size: 11px;
                    font-weight: bold;
                    color: #333;
                    margin-top: 20px;
                    padding: 8px 15px;
                    background: #f5f5f5;
                    border-radius: 4px;
                    display: inline-block;
                }
                
                /* Pedido de Exames */
                .page-body.pedido-exames {
                    display: flex;
                    flex-direction: column;
                    padding: 20px 10px;
                }
                
                .pedido-title {
                    font-size: 14px;
                    font-weight: bold;
                    text-align: center;
                    margin-bottom: 25px;
                    letter-spacing: 1px;
                    text-decoration: underline;
                    display: none; /* Already in header */
                }
                
                .justificativa-section {
                    margin-bottom: 20px;
                    padding: 12px;
                    background: #f8f9fa;
                    border: 1px solid #e0e0e0;
                    border-radius: 4px;
                }
                
                .section-label {
                    font-size: 10px;
                    font-weight: bold;
                    color: #333;
                    margin-bottom: 6px;
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                }
                
                .justificativa-text {
                    font-size: 12px;
                    line-height: 1.6;
                    color: #000;
                    font-style: italic;
                }
                
                .exames-section {
                    margin-top: 10px;
                }
                
                .exames-list {
                    list-style: none;
                    padding: 0;
                    margin: 0;
                }
                
                .exames-list li {
                    font-size: 12px;
                    color: #000;
                    padding: 8px 0;
                    border-bottom: 1px dotted #ccc;
                    position: relative;
                    padding-left: 20px;
                }
                
                .exames-list li:before {
                    content: "•";
                    position: absolute;
                    left: 0;
                    color: #333;
                    font-weight: bold;
                }
                
                .exames-list li:last-child {
                    border-bottom: none;
                }
                
                .exame-nome {
                    font-weight: normal;
                }
                
                .exame-preparo {
                    font-size: 10px;
                    font-style: italic;
                    color: #555;
                }
                
                .no-exames {
                    font-size: 11px;
                    color: #666;
                    font-style: italic;
                }
                
                /* ===========================
                   FOOTER STYLES
                   =========================== */
                .page-footer {
                    margin-top: auto;
                    padding-top: 15px;
                    border-top: 2px solid #000;
                    flex-shrink: 0;
                }
                
                .control-boxes {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 12px;
                    margin-bottom: 15px;
                }
                
                .control-box {
                    border: 1px solid #000;
                    padding: 6px;
                    font-size: 8px;
                    color: #000;
                }
                
                .box-title {
                    font-weight: bold;
                    text-align: center;
                    margin-bottom: 6px;
                    font-size: 9px;
                    color: #000;
                }
                
                .box-field {
                    display: flex;
                    align-items: baseline;
                    margin: 5px 0;
                    color: #000;
                }
                
                .box-field span:first-child {
                    width: 55px;
                    flex-shrink: 0;
                }
                
                .box-field .line {
                    flex: 1;
                    border-bottom: 1px solid #000;
                    margin-left: 4px;
                }
                
                .signature-section {
                    display: flex;
                    justify-content: center;
                    align-items: flex-start;
                    gap: 30px;
                    margin: 15px 0;
                    padding: 10px 0;
                    border-top: 1px solid #ccc;
                }
                
                .signature-area {
                    text-align: center;
                }
                
                .signature-line {
                    width: 200px;
                    border-top: 1px solid #000;
                    margin: 0 auto 6px;
                }
                
                .doctor-name {
                    font-size: 11px;
                    font-weight: bold;
                    margin: 2px 0;
                    color: #000;
                }
                
                .doctor-crm {
                    font-size: 10px;
                    margin: 1px 0;
                    color: #000;
                }
                
                .unit-info {
                    font-size: 8px;
                    color: #444;
                }
                
                .qr-section {
                    text-align: center;
                }
                
                .qr-label {
                    font-size: 7px;
                    color: #666;
                    margin-top: 3px;
                }
                
                .qr-token {
                    font-size: 8px;
                    font-family: 'Courier New', Courier, monospace;
                    font-weight: bold;
                    color: #000;
                    margin-top: 2px;
                    letter-spacing: 0.5px;
                }
                
                .print-date {
                    text-align: right;
                    font-size: 9px;
                    margin-top: 10px;
                    color: #000;
                }
                
                /* ===========================
                   BUTTONS
                   =========================== */
                .print-button-container {
                    position: fixed;
                    bottom: 20px;
                    right: 20px;
                    display: flex;
                    gap: 10px;
                    z-index: 1000;
                }
                
                .print-button {
                    background: #2563eb;
                    color: white;
                    border: none;
                    padding: 12px 24px;
                    border-radius: 8px;
                    cursor: pointer;
                    font-weight: bold;
                    font-size: 14px;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
                }
                
                .print-button:hover {
                    background: #1d4ed8;
                }
                
                .back-button {
                    background: #64748b;
                    color: white;
                    border: none;
                    padding: 12px 24px;
                    border-radius: 8px;
                    cursor: pointer;
                    font-weight: bold;
                    font-size: 14px;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
                }
                
                /* Loading/Error */
                .loading-screen, .error-screen {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    height: 100vh;
                    font-family: sans-serif;
                    color: white;
                }
                
                .spinner {
                    width: 40px;
                    height: 40px;
                    border: 4px solid rgba(255,255,255,0.3);
                    border-top: 4px solid white;
                    border-radius: 50%;
                    animation: spin 1s linear infinite;
                    margin-bottom: 20px;
                }
                
                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
            `}</style>

            <div className="print-button-container no-print">
                <button className="back-button" onClick={() => window.history.back()}>
                    ← Voltar
                </button>
                <button className="print-button" onClick={() => window.print()}>
                    🖨️ Imprimir ({tipo === 'receita_controle' ? `${totalPages * 2} páginas (2 vias)` : `${totalPages} ${totalPages === 1 ? 'página' : 'páginas'}`})
                </button>
            </div>

            <div className="print-container">
                {/* For receita_controle: render two copies (1ª VIA and 2ª VIA) */}
                {tipo === 'receita_controle' ? (
                    <>
                        {/* 1ª VIA */}
                        {chunks.map((chunkRows, pageIndex) => (
                            <PrintPage
                                key={`via1-${pageIndex}`}
                                tipo={tipo}
                                attendance={attendance}
                                rows={chunkRows}
                                pageNumber={pageIndex + 1}
                                totalPages={totalPages}
                                isLastPage={pageIndex === totalPages - 1}
                                viaLabel="1ª VIA"
                            />
                        ))}

                        {/* Divisor de página entre as vias */}
                        <div className="page-break" style={{ height: 0 }} />

                        {/* 2ª VIA */}
                        {chunks.map((chunkRows, pageIndex) => (
                            <PrintPage
                                key={`via2-${pageIndex}`}
                                tipo={tipo}
                                attendance={attendance}
                                rows={chunkRows}
                                pageNumber={pageIndex + 1}
                                totalPages={totalPages}
                                isLastPage={pageIndex === totalPages - 1}
                                viaLabel="2ª VIA"
                            />
                        ))}
                    </>
                ) : (
                    /* For other document types: render single copy */
                    chunks.map((chunkRows, pageIndex) => (
                        <PrintPage
                            key={pageIndex}
                            tipo={tipo}
                            attendance={attendance}
                            rows={chunkRows}
                            pageNumber={pageIndex + 1}
                            totalPages={totalPages}
                            isLastPage={pageIndex === totalPages - 1}
                        />
                    ))
                )}
            </div>
        </>
    );
}
