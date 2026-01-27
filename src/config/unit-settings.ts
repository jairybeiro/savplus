/**
 * Configuração Central da Unidade de Saúde
 * Todos os cabeçalhos de impressão devem consumir dados DESTA constante
 */

export const UNIT_CONFIG = {
    // Hierarquia administrativa
    organizationName: 'PREFEITURA MUNICIPAL DE SÃO PAULO',
    secretaryName: 'SECRETARIA MUNICIPAL DE SAÚDE',
    unitName: 'UPA 24H VILA MARIANA',

    // Endereço e contato
    address: 'Rua Domingos de Moraes, 2500 - Vila Mariana - CEP 04036-100',
    city: 'São Paulo',
    state: 'SP',
    phone: '(11) 3333-4444',

    // Identificação visual
    logoUrl: '/images/logo-upa.svg',

    // CNES (Cadastro Nacional de Estabelecimentos de Saúde)
    cnes: '1234567',

    // Dados para prescrição controlada
    pharmacyLicense: 'CRF-SP 12345',
};

export type UnitConfig = typeof UNIT_CONFIG;
