'use client';

import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { UNIT_CONFIG } from '@/config/unit-settings';

type ValidationData = {
    id: string;
    created_at: string;
    prescricao: string;
    medico_nome?: string;
    medico_crm?: string;
    patient: {
        nome_completo: string;
    };
};

// Mask patient name for privacy (e.g., "José Ferreira Rodrigues" -> "JOSÉ F**** R*******")
function maskName(fullName: string): string {
    if (!fullName) return '---';
    const parts = fullName.toUpperCase().split(' ');
    if (parts.length === 1) {
        return parts[0];
    }

    // Keep first name, mask the rest
    const masked = parts.map((part, index) => {
        if (index === 0) return part; // First name visible
        if (part.length <= 2) return part; // Keep short words like "DE", "DA"
        return part.charAt(0) + '*'.repeat(Math.min(part.length - 1, 6));
    });

    return masked.join(' ');
}

// Format date in Portuguese
function formatDate(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

export default function ValidarDocumentoPage() {
    const params = useParams();
    const id = params.id as string;

    const [data, setData] = useState<ValidationData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        async function fetchData() {
            try {
                const { data: attendance, error } = await supabase
                    .from('attendances')
                    .select('id, created_at, prescricao, medico_nome, medico_crm, patient:patients(nome_completo)')
                    .eq('id', id)
                    .single();

                if (error) throw error;
                setData(attendance as unknown as ValidationData);
            } catch (err: any) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        }

        if (id) fetchData();
    }, [id]);

    return (
        <>
            <style jsx global>{`
                * {
                    box-sizing: border-box;
                    margin: 0;
                    padding: 0;
                }
                
                body {
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                    background: linear-gradient(135deg, #1e3a5f 0%, #0d1b2a 100%);
                    min-height: 100vh;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    padding: 20px;
                }
                
                .validation-container {
                    width: 100%;
                    max-width: 420px;
                    background: white;
                    border-radius: 16px;
                    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
                    overflow: hidden;
                }
                
                .header {
                    background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%);
                    color: white;
                    padding: 20px;
                    text-align: center;
                }
                
                .header-logo {
                    font-size: 14px;
                    font-weight: 600;
                    margin-bottom: 4px;
                    opacity: 0.9;
                }
                
                .header-unit {
                    font-size: 12px;
                    opacity: 0.8;
                }
                
                .status-section {
                    padding: 30px 20px;
                    text-align: center;
                }
                
                .status-icon {
                    font-size: 80px;
                    margin-bottom: 15px;
                    animation: pulse 2s ease-in-out infinite;
                }
                
                @keyframes pulse {
                    0%, 100% { transform: scale(1); }
                    50% { transform: scale(1.1); }
                }
                
                .status-valid {
                    color: #059669;
                }
                
                .status-invalid {
                    color: #dc2626;
                    animation: shake 0.5s ease-in-out;
                }
                
                @keyframes shake {
                    0%, 100% { transform: translateX(0); }
                    25% { transform: translateX(-5px); }
                    75% { transform: translateX(5px); }
                }
                
                .status-text {
                    font-size: 18px;
                    font-weight: 700;
                    margin-bottom: 5px;
                }
                
                .status-valid-text {
                    color: #059669;
                }
                
                .status-invalid-text {
                    color: #dc2626;
                }
                
                .status-subtitle {
                    font-size: 13px;
                    color: #6b7280;
                }
                
                .details-section {
                    background: #f8fafc;
                    padding: 20px;
                    border-top: 1px solid #e5e7eb;
                }
                
                .detail-row {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 10px 0;
                    border-bottom: 1px solid #e5e7eb;
                }
                
                .detail-row:last-child {
                    border-bottom: none;
                }
                
                .detail-label {
                    font-size: 12px;
                    color: #6b7280;
                    font-weight: 500;
                }
                
                .detail-value {
                    font-size: 13px;
                    color: #1f2937;
                    font-weight: 600;
                    text-align: right;
                }
                
                .footer {
                    padding: 15px 20px;
                    background: #1e3a5f;
                    color: white;
                    text-align: center;
                    font-size: 10px;
                    opacity: 0.9;
                }
                
                .footer a {
                    color: #93c5fd;
                    text-decoration: none;
                }
                
                /* Loading */
                .loading-container {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    padding: 60px 20px;
                }
                
                .spinner {
                    width: 40px;
                    height: 40px;
                    border: 4px solid #e5e7eb;
                    border-top: 4px solid #3b82f6;
                    border-radius: 50%;
                    animation: spin 1s linear infinite;
                    margin-bottom: 15px;
                }
                
                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
                
                .loading-text {
                    font-size: 14px;
                    color: #6b7280;
                }
                
                .privacy-notice {
                    background: #fef3c7;
                    border: 1px solid #fcd34d;
                    border-radius: 8px;
                    padding: 10px;
                    margin: 15px 20px 0;
                    font-size: 11px;
                    color: #92400e;
                    text-align: center;
                }
            `}</style>

            <div className="validation-container">
                {/* Header */}
                <div className="header">
                    <div className="header-logo">{UNIT_CONFIG.organizationName}</div>
                    <div className="header-unit">{UNIT_CONFIG.unitName}</div>
                </div>

                {loading ? (
                    <div className="loading-container">
                        <div className="spinner"></div>
                        <p className="loading-text">Verificando documento...</p>
                    </div>
                ) : error || !data ? (
                    <>
                        {/* Invalid Status */}
                        <div className="status-section">
                            <div className="status-icon status-invalid">❌</div>
                            <div className="status-text status-invalid-text">
                                DOCUMENTO NÃO ENCONTRADO
                            </div>
                            <div className="status-subtitle">
                                Este documento não existe ou foi removido do sistema.
                            </div>
                        </div>

                        <div className="privacy-notice">
                            ⚠️ Se você acredita que isso é um erro, entre em contato com a unidade de saúde.
                        </div>
                    </>
                ) : (
                    <>
                        {/* Valid Status */}
                        <div className="status-section">
                            <div className="status-icon status-valid">✅</div>
                            <div className="status-text status-valid-text">
                                DOCUMENTO ORIGINAL E VÁLIDO
                            </div>
                            <div className="status-subtitle">
                                Esta receita foi emitida oficialmente por esta unidade de saúde.
                            </div>
                        </div>

                        {/* Details */}
                        <div className="details-section">
                            <div className="detail-row">
                                <span className="detail-label">Paciente</span>
                                <span className="detail-value">{maskName(data.patient?.nome_completo)}</span>
                            </div>
                            <div className="detail-row">
                                <span className="detail-label">Médico(a)</span>
                                <span className="detail-value">{data.medico_nome || 'Médico Plantonista'}</span>
                            </div>
                            <div className="detail-row">
                                <span className="detail-label">CRM</span>
                                <span className="detail-value">{data.medico_crm || 'CRM-SP'}</span>
                            </div>
                            <div className="detail-row">
                                <span className="detail-label">Data de Emissão</span>
                                <span className="detail-value">{formatDate(data.created_at)}</span>
                            </div>
                            <div className="detail-row">
                                <span className="detail-label">ID do Documento</span>
                                <span className="detail-value" style={{ fontSize: '10px', fontFamily: 'monospace' }}>
                                    {data.id.substring(0, 8)}...
                                </span>
                            </div>
                        </div>

                        <div className="privacy-notice">
                            🔒 Por segurança, os medicamentos prescritos não são exibidos.
                            Confira os dados na receita física.
                        </div>
                    </>
                )}

                {/* Footer */}
                <div className="footer">
                    Sistema UPA Flow • {UNIT_CONFIG.phone}
                </div>
            </div>
        </>
    );
}
