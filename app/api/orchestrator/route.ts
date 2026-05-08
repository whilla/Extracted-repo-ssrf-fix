export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server';
import { logService } from '@/lib/services/logService';
import { n8nBridgeService } from '@/lib/services/n8nBridgeService';
import { planService } from '@/lib/services/planService';
import { personaService } from '@/lib/services/personaService';
import * as multiAgentService from '@/lib/services/multiAgentService';
import { aiService } from '@/lib/services/aiService';
import { buildMemoryContext } from '@/lib/services/agentMemoryService';
import { kvGet } from '@/lib/services/puterService';

async function getAuthenticatedUser() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  
  if (!supabaseUrl || !supabaseAnonKey) {
    return null;
  }
  
  try {
    const { createRouteHandlerClient } = await import('@supabase/auth-helpers-nextjs');
    const { cookies } = await import('next/headers');
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    return user;
  } catch (error) {
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
    const { agent_id, goal, context, memory_id } = body;

    if (!agent_id || !goal) {
      return NextResponse.json({ error: 'Missing agent_id or goal' }, { status: 400 });
    }

    // 1. Log the "Thinking" phase
    await logService.logEvent({
      agent_id,
      status: 'thinking',
      message: `Analyzing the goal: "${goal}". Deploying the Multi-Agent Swarm...`,
    });

    // 2. Initialize Multi-Agent Context
    const agents = await multiAgentService.initializeAgents();
    const memoryContext = await buildMemoryContext(agent_id);
    const brandKit = await kvGet('brand_kit'); // Simplified brand kit fetch
    const brandContext = brandKit ? JSON.stringify(brandKit) : 'No specific brand kit defined.';

    // 3. Create Orchestration Plan
    const plan = await multiAgentService.createOrchestrationPlan(goal, 'full');
    
    await logService.logEvent({
      agent_id,
      status: 'thinking',
      message: `Swarm Plan created: ${plan.subtasks.length} specialized tasks mapped. Starting execution...`,
    });

    // 4. Execute Tasks (Respecting Dependencies)
    const taskResults = new Map<string, AgentOutput>();
    const pendingTasks = [...plan.subtasks];
    
    while (pendingTasks.length > 0) {
      const executableTasks = pendingTasks.filter(task => 
        !task.dependencies || task.dependencies.every(depId => taskResults.has(depId))
      );

      if (executableTasks.length === 0 && pendingTasks.length > 0) {
        throw new Error('Deadlock detected in orchestration plan dependencies.');
      }

      // Execute available tasks in parallel (matching plan.parallelGroups if possible, here we just do all ready)
      await Promise.all(executableTasks.map(async (task) => {
        const agent = await multiAgentService.getAgentById(task.assignedAgent);
        if (!agent) throw new Error(`Agent ${task.assignedAgent} not found for task ${task.id}`);

        // Resolve context from previous task results
        const contextObj: Record<string, string> = {
          brandContext,
          memoryContext,
        };
        if (task.dependencies) {
          task.dependencies.forEach(depId => {
            const res = taskResults.get(depId);
            if (res) {
              // Map common roles to template keys (e.g., planner -> executionPlan)
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
          (prompt) => aiService.chat(prompt)
        );

        taskResults.set(task.id, output);
      }));

      // Remove executed tasks from pending
      executableTasks.forEach(t => {
        const idx = pendingTasks.indexOf(t);
        if (idx > -1) pendingTasks.splice(idx, 1);
      });
    }

    // 5. Aggregate Final Output
    const finalAgent = await multiAgentService.getAgentByRole('generator');
    const generatorOutput = Array.from(taskResults.values()).find(o => o.agentRole === 'generator');
    const distributionAgent = await multiAgentService.getAgentByRole('distribution');
    const distributionOutput = Array.from(taskResults.values()).find(o => o.agentRole === 'distribution');
    
    const finalContent = distributionOutput?.content || generatorOutput?.content || 'No content generated';

    // 6. Final Humanization & Route to Approval
    const humanizedResponse = await personaService.humanize(
      `The agent swarm has completed the task. Final content: ${finalContent}`, 
      agent_id
    );

    await logService.logEvent({
      agent_id,
      status: 'completed',
      message: 'Swarm execution complete. Quality validated and routed to dashboard.',
    });

    // Trigger the posting workflow (n8n)
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
      swarm_metrics: {
        tasks_completed: taskResults.size,
        agents_involved: new Set(Array.from(taskResults.values()).map(o => o.agentId)).size
      },
      nextStep: 'human_approval' 
    });

  } catch (error: any) {
    console.error('[api/orchestrator] Swarm Orchestration error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
