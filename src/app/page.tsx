import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function Home() {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <Card className="max-w-md w-full">
        <CardHeader className="text-center">
          <CardTitle className="text-3xl font-bold text-hospital-blue">UPA Flow</CardTitle>
          <p className="text-slate-500">Sistema de Gestão de Fluxo Hospitalar</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <Link href="/recepcao" className="block">
            <Button className="w-full text-lg h-12" variant="outline">
              Recepção
            </Button>
          </Link>
          <Link href="/triagem" className="block">
            <Button className="w-full text-lg h-12" variant="outline">
              Triagem (Enfermagem)
            </Button>
          </Link>
          <Link href="/medico" className="block">
            <Button className="w-full text-lg h-12" variant="outline">
              Consultório Médico
            </Button>
          </Link>
          <div className="grid grid-cols-3 gap-2">
            <Link href="/medicacao" className="block">
              <Button className="w-full h-12 text-sm" variant="outline">Medicação</Button>
            </Link>
            <Link href="/nir" className="block">
              <Button className="w-full h-12 text-sm" variant="outline">NIR</Button>
            </Link>
            <Link href="/farmacia" className="block">
              <Button className="w-full h-12 text-sm" variant="outline">Farmácia</Button>
            </Link>
          </div>
          <Link href="/painel" target="_blank" className="block mt-4">
            <Button className="w-full bg-slate-800 hover:bg-slate-900 border-slate-700 text-white" variant="outline">
              📺 Abrir Painel TV
            </Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
