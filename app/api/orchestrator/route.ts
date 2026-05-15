export const dynamic = "force-dynamic";
import { NextResponse, type NextRequest } from 'next/server';
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
import { withApiMiddleware } from '@/lib/utils/apiMiddleware';
import { viralScoringEngine } from '@/lib/core/ViralScoringEngine';
import { quickBrainstorm, initBrainstormSession, generateInitialIdeas } from '@/lib/services/brainstormEngine';

const OrchestratorRequestSchema = z.object({
  agent_id: z.string().min(1, 'agent_id is required'),
  goal: z.string().min(1, 'goal is required'),
  context: z.string().optional(),
  memory_id: z.string().optional(),
});

function detectPlatformFromGoal(goal: string): string {
  const lower = goal.toLowerCase();
  if (lower.includes('instagram') || lower.includes('ig ')) return 'instagram';
  if (lower.includes('tiktok') || lower.includes('tt ')) return 'tiktok';
  if (lower.includes('linkedin')) return 'linkedin';
  if (lower.includes('twitter') || lower.includes('x ')) return 'twitter';
  if (lower.includes('youtube') || lower.includes('yt ')) return 'youtube';
  if (lower.includes('facebook') || lower.includes('fb ')) return 'facebook';
  if (lower.includes('threads')) return 'threads';
  if (lower.includes('pinterest')) return 'pinterest';
  if (lower.includes('discord')) return 'discord';
  if (lower.includes('reddit')) return 'reddit';
  if (lower.includes('blog') || lower.includes('wordpress') || lower.includes('medium')) return 'blog';
  return 'general';
}

export async function POST(request: NextRequest) {
  return withApiMiddleware(request, async (apiContext) => {
    try {

    const body = await request.json();
    const result = OrchestratorRequestSchema.safeParse(body);
    
    if (!result.success) {
      const errors = result.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join('; ');
      return NextResponse.json({ error: `Validation failed: ${errors}` }, { status: 400 });
    }
    
    const { agent_id, goal, context: userContext, memory_id } = result.data;
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
    
    let finalContent = distributionOutput?.content || generatorOutput?.content || 'No content generated';

    // ── Viral Scoring: Score and optimize final content ──
    let viralScore = null;
    try {
      viralScore = await viralScoringEngine.score(finalContent);
      
      // If score is below threshold, regenerate with improvements
      if (viralScore.total < 55 && viralScore.improvements.length > 0) {
        await logService.logEvent({
          agent_id,
          status: 'thinking',
          message: `Viral score ${viralScore.total}/100 is low. Regenerating with improvements...`,
        });

        const improvementPrompt = `Improve this content based on these suggestions:\n${viralScore.improvements.map((i: string) => `- ${i}`).join('\n')}\n\nOriginal content:\n${finalContent}`;
        
        const optimizedContent = await aiService.chat(improvementPrompt);
        if (optimizedContent && optimizedContent !== finalContent) {
          finalContent = optimizedContent;
          viralScore = await viralScoringEngine.score(finalContent);
        }
      }
    } catch (err) {
      console.warn('[api/orchestrator] Viral scoring failed:', err);
    }

    // ── Brainstorm: If goal is vague, generate ideas first ──
    let brainstormIdeas: string[] = [];
    if (goal.length < 30) {
      try {
        await logService.logEvent({
          agent_id,
          status: 'thinking',
          message: `Goal is broad. Running brainstorm for: "${goal}"`,
        });

        const brandKit = await kvGet('brand_kit');
        brainstormIdeas = await quickBrainstorm(goal, brandKit ? JSON.parse(brandKit) : null, 3);
        
        if (brainstormIdeas.length > 0) {
          await logService.logEvent({
            agent_id,
            status: 'thinking',
            message: `Generated ${brainstormIdeas.length} ideas from brainstorm engine.`,
          });
        }
      } catch (err) {
        console.warn('[api/orchestrator] Brainstorm failed:', err);
      }
    }

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

    // ── Conditional n8n trigger with dynamic values ──
    let n8nTriggered = false;
    let n8nError: string | null = null;
    try {
      const isN8nAvailable = await n8nBridgeService.isAvailable();
      if (isN8nAvailable) {
        const detectedPlatform = detectPlatformFromGoal(goal);
        const isVideoGoal = /video|reel|short|clip|youtube|tiktok/i.test(goal);
        await n8nBridgeService.triggerWorkflow('workflow-social-posting', {
          agent_id,
          caption: finalContent,
          video_url: isVideoGoal ? 'pending_generation' : null,
          platform: detectedPlatform,
          trace_id: traceId,
          user_id: apiContext.userId,
        });
        n8nTriggered = true;
      }
    } catch (err) {
      n8nError = err instanceof Error ? err.message : 'n8n trigger failed';
      console.warn('[api/orchestrator] n8n trigger skipped:', n8nError);
    }

    return NextResponse.json({ 
      status: 'success', 
      response: humanizedResponse,
      finalContent, 
      traceId,
      swarm_metrics: {
        tasks_completed: taskResults.size,
        agents_involved: new Set(Array.from(taskResults.values()).map((o: any) => o.agentId)).size
      },
      viral_score: viralScore,
      brainstorm_ideas: brainstormIdeas,
      nextStep: 'human_approval',
      n8n_triggered: n8nTriggered,
      n8n_error: n8nError,
    });

  } catch (error: any) {
    console.error('[api/orchestrator] Swarm Orchestration error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  });
}
