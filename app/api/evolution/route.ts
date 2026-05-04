import { NextResponse, type NextRequest } from 'next/server';
import { getEvolutionLog, getEvolutionStats } from '@/lib/services/evolutionLogService';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const view = searchParams.get('view');

  if (view === 'stats') {
    const stats = await getEvolutionStats();
    return NextResponse.json(stats);
  }

  const log = await getEvolutionLog();
  return NextResponse.json(log);
}
