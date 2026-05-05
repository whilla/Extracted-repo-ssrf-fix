import { NextResponse, type NextRequest } from 'next/server';
import { 
  getEvolutionLog, 
  getEvolutionStats 
} from '@/lib/services/evolutionLogService';
import { 
  runEvolutionCycle, 
  applyEvolution, 
  getEvolutionHistory 
} from '@/lib/services/agentEvolutionService';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const view = searchParams.get('view');

  if (view === 'stats') {
    const stats = await getEvolutionStats();
    return NextResponse.json(stats);
  }

  if (view === 'history') {
    const history = await getEvolutionHistory();
    return NextResponse.json(history);
  }

  const log = await getEvolutionLog();
  return NextResponse.json(log);
}

export async function POST(request: NextRequest) {
  const { action, proposalId } = await request.json();

  if (action === 'trigger_cycle') {
    try {
      const result = await runEvolutionCycle();
      return NextResponse.json({ success: true, result });
    } catch (error: any) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
  }

  if (action === 'apply_proposal') {
    if (!proposalId) {
      return NextResponse.json({ error: 'proposalId is required' }, { status: 400 });
    }
    try {
      const success = await applyEvolution(proposalId);
      return NextResponse.json({ success });
    } catch (error: any) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}
