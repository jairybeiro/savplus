import { PatientForm } from '@/components/forms/PatientForm';

export default function RecepcaoPage() {
    return (
        <div className="space-y-8">
            <div className="text-center space-y-2">
                <h2 className="text-3xl font-bold tracking-tight text-slate-800">Recepção</h2>
                <p className="text-slate-500">Cadastro de pacientes para atendimento na UPA.</p>
            </div>
            <PatientForm />
        </div>
    );
}
