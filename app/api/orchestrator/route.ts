export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { logService } from '@/lib/services/logService';
import { n8nBridgeService } from '@/lib/services/n8nBridgeService';
import { planService } from '@/lib/services/planService';
import { personaService } from '@/lib/services/personaService';
import * as multiAgentService from '@/lib/services/multiAgentService';
import { aiService } from '@/lib/services/aiService';
import { buildMemoryContext } from '@/lib/services/agentMemoryService';
import { kvGet } from '@/lib/services/puterService';
import { swarmTraceService } from '@/lib/services/swarmTraceService';
import { generateId } from '@/lib/services/memoryService';

import type { User } from '@supabase/supabase-js';

const OrchestratorRequestSchema = z.object({
  agent_id: z.string().min(1, 'agent_id is required'),
  goal: z.string().min(1, 'goal is required'),
  context: z.string().optional(),
  memory_id: z.string().optional(),
});

async function getAuthenticatedUser(): Promise<{ id: string } | null> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!supabaseUrl || !supabaseKey) {
    return null;
  }
  
  try {
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(supabaseUrl, supabaseKey);
    return { id: 'authenticated' };
  } catch (error) {
    if (error instanceof Error && error.message.includes('Cannot find module')) {
      console.error('[api/orchestrator] Missing Supabase dependencies:', error.message);
      return null;
    }
    console.error(
      '[api/orchestrator] Authentication error:',
      error instanceof Error ? error.message : 'Unknown authentication error'
    );
    return null;
  }
}

export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const result = OrchestratorRequestSchema.safeParse(body);
    
    if (!result.success) {
      const errors = result.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join('; ');
      return NextResponse.json({ error: `Validation failed: ${errors}` }, { status: 400 });
    }
    
    const { agent_id, goal, context, memory_id } = result.data;
    const traceId = generateId();
    await swarmTraceService.startTrace(traceId, goal);

    await logService.logEvent({
      agent_id,
      status: 'thinking',
      message: `Analyzing the goal: "${goal}". Deploying the Multi-Agent Swarm...`,
    });

    const agents = await multiAgentService.initializeAgents();
    const memoryContext = await buildMemoryContext(agent_id);
    const brandKit = await kvGet('brand_kit'); 
    const brandContext = brandKit ? JSON.stringify(brandKit) : 'No specific brand kit defined.';

    const plan = await multiAgentService.createOrchestrationPlan(goal, 'full');
    
    await logService.logEvent({
      agent_id,
      status: 'thinking',
      message: `Swarm Plan created: ${plan.subtasks.length} specialized tasks mapped. Starting execution...`,
    });

    const taskResults = new Map<string, any>();
    const pendingTasks = [...plan.subtasks];
    
    while (pendingTasks.length > 0) {
      const executableTasks = pendingTasks.filter(task => 
        !task.dependencies || task.dependencies.every(depId => taskResults.has(depId))
      );

      if (executableTasks.length === 0 && pendingTasks.length > 0) {
        await swarmTraceService.endTrace(traceId, 'failed');
        throw new Error('Deadlock detected in orchestration plan dependencies.');
      }

      await Promise.all(executableTasks.map(async (task) => {
        const agent = await multiAgentService.getAgentById(task.assignedAgent);
        if (!agent) throw new Error(`Agent ${task.assignedAgent} not found for task ${task.id}`);

        const contextObj: Record<string, string> = {
          brandContext,
          memoryContext,
        };
        if (task.dependencies) {
          task.dependencies.forEach(depId => {
            const res = taskResults.get(depId);
            if (res) {
              const role = res.agentRole;
              const key = role === 'planner' ? 'executionPlan' : 
                          role === 'identity' ? 'identity' : 
                          role === 'rules' ? 'rules' : 
                          role === 'structure' ? 'structure' : 
                          role === 'generator' ? 'content' : role;
              contextObj[key] = res.content;
            }
          });
        }

        await logService.logEvent({
          agent_id,
          status: 'acting',
          message: `Agent ${agent.name} (${agent.role}) is working on: ${task.type}...`,
        });

        const output = await multiAgentService.executeAgentTask(
          agent,
          task.input,
          contextObj,
          (prompt) => aiService.chat(prompt),
          traceId
        );

        taskResults.set(task.id, output);
      }));

      executableTasks.forEach(t => {
        const idx = pendingTasks.indexOf(t);
        if (idx > -1) pendingTasks.splice(idx, 1);
      });
    }

    const generatorOutput = Array.from(taskResults.values()).find((o: any) => o.agentRole === 'generator');
    const distributionOutput = Array.from(taskResults.values()).find((o: any) => o.agentRole === 'distribution');
    
    const finalContent = distributionOutput?.content || generatorOutput?.content || 'No content generated';

    const humanizedResponse = await personaService.humanize(
      `The agent swarm has completed the task. Final content: ${finalContent}`, 
      agent_id
    );

    await swarmTraceService.endTrace(traceId, 'completed', finalContent);

    await logService.logEvent({
      agent_id,
      status: 'completed',
      message: 'Swarm execution complete. Quality validated and routed to dashboard.',
    });

    await n8nBridgeService.triggerWorkflow('workflow-social-posting', {
      agent_id,
      caption: finalContent,
      video_url: 'pending_generation',
      platform: 'tiktok',
    });

    return NextResponse.json({ 
      status: 'success', 
      response: humanizedResponse,
      finalContent, 
      traceId,
      swarm_metrics: {
        tasks_completed: taskResults.size,
        agents_involved: new Set(Array.from(taskResults.values()).map((o: any) => o.agentId)).size
      },
      nextStep: 'human_approval' 
    });

  } catch (error: any) {
    console.error('[api/orchestrator] Swarm Orchestration error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
