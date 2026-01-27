export type ManchesterColor = 'vermelho' | 'laranja' | 'amarelo' | 'verde' | 'azul';

export const MANCHESTER_COLORS: Record<ManchesterColor, string> = {
    vermelho: 'bg-red-500 text-white',
    laranja: 'bg-orange-500 text-white',
    amarelo: 'bg-yellow-400 text-black',
    verde: 'bg-green-500 text-white',
    azul: 'bg-blue-500 text-white',
};

export const MANCHESTER_LABELS: Record<ManchesterColor, string> = {
    vermelho: 'Emergência',
    laranja: 'Muito Urgente',
    amarelo: 'Urgente',
    verde: 'Pouco Urgente',
    azul: 'Não Urgente',
};
