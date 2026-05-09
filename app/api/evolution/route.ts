export const dynamic = "force-dynamic";
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

async function getAuthenticatedUser() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  
  if (!supabaseUrl || !supabaseAnonKey) {
    return null;
  }
  
  try {
    const { createServerClient } = await import('@supabase/ssr');
    const { cookies } = await import('next/headers');
    const supabase = createServerClient(supabaseUrl, supabaseAnonKey, { cookies });
    const { data: { user } } = await supabase.auth.getUser();
    return user;
  } catch (error) {
    console.error('Authentication error:', error instanceof Error ? error.message : error);
    return null;
  }
}

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

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
  } catch (error: any) {
    console.error('GET /api/evolution error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let action: string | undefined;
    let proposalId: string | undefined;
    try {
      const body = await request.json();
      action = body.action;
      proposalId = body.proposalId;
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    if (action === 'trigger_cycle') {
      try {
        const result = await runEvolutionCycle();
        return NextResponse.json({ success: true, result });
      } catch (error: any) {
        console.error('Evolution cycle trigger error:', error);
        return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
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
        console.error('Apply evolution error:', error);
        return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
      }
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error: any) {
    console.error('POST /api/evolution error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
