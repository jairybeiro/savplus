import { NextResponse } from 'next/server';
import { resolveContext } from '@/lib/resolveContext';

export async function GET() {
    try {
        const context = await resolveContext();
        return NextResponse.json(context);
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 401 });
    }
}
