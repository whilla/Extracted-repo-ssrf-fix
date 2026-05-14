import { ACTION_REGISTRY, type AgentAction } from '@/lib/agents/actionRegistry';
import { logger } from '@/lib/utils/logger';
import { DirectPublishService } from './directPublishService';
import { schedulePost } from './publishService';
import { planService } from './planService';
import { generateAgentVideo, generateAgentAudio, generateAgentMusic } from './agentMediaService';

export interface ToolCallResult {
  success: boolean;
  actionId: string;
  output?: string;
  requiresApproval: boolean;
  error?: string;
}

export interface ParsedToolCall {
  actionName: string;
  parameters: Record<string, string>;
}

function parseToolCalls(text: string): ParsedToolCall[] {
  const calls: ParsedToolCall[] = [];
  let match: RegExpExecArray | null;
  const regex = /\[\[tool:(\w+)\s*\(([^)]*)\)\]\]/g;

  while ((match = regex.exec(text)) !== null) {
    const actionName = match[1];
    const paramsStr = match[2].trim();
    const parameters: Record<string, string> = {};

    if (paramsStr) {
      const paramPairs = paramsStr.match(/(\w+)\s*:\s*("[^"]*"|[^\s,]+)/g);
      if (paramPairs) {
        for (const pair of paramPairs) {
          const [key, ...valParts] = pair.split(':');
          const val = valParts.join(':').trim().replace(/^"|"$/g, '');
          parameters[key.trim()] = val;
        }
      }
    }

    calls.push({ actionName, parameters });
  }

  return calls;
}

function getAgentAction(actionName: string): AgentAction | undefined {
  return ACTION_REGISTRY[actionName];
}

async function executeAction(
  action: AgentAction,
  params: Record<string, string>,
): Promise<ToolCallResult> {
  logger.info('[ToolExecutor] Executing action', { action: action.name, params });

  try {
    switch (action.id) {
      case 'gen_vid': {
        const request = `${params.script || ''} (Aspect Ratio: ${params.aspect_ratio || '9:16'}, Duration: ${params.duration || '30'}s)`;
        const result = await generateAgentVideo(request);
        const videoAsset = result.media.find(m => m.type === 'video');
        return {
          success: true,
          actionId: action.id,
          output: videoAsset ? videoAsset.url : result.content,
          requiresApproval: false,
        };
      }

      case 'gen_audio': {
        const voice = params.voice || 'alloy';
        const text = params.text || '';
        if (!text) {
          return { success: false, actionId: action.id, output: 'No text provided for audio generation', requiresApproval: false, error: 'Missing text parameter' };
        }
        const audioResult = await generateAgentAudio(text, { voice });
        const audioAsset = audioResult.media.find(m => m.type === 'audio');
        return {
          success: true,
          actionId: action.id,
          output: audioAsset ? audioAsset.url : audioResult.content,
          requiresApproval: false,
        };
      }

      case 'gen_music': {
        const prompt = params.prompt || '';
        const genre = params.genre || '';
        const duration = parseInt(params.duration || '30', 10);
        if (!prompt) {
          return { success: false, actionId: action.id, output: 'No prompt provided for music generation', requiresApproval: false, error: 'Missing prompt parameter' };
        }
        const musicResult = await generateAgentMusic(prompt, { duration, genre });
        const musicAsset = musicResult.media.find(m => m.type === 'audio');
        return {
          success: true,
          actionId: action.id,
          output: musicAsset ? musicAsset.url : musicResult.content,
          requiresApproval: false,
        };
      }

      case 'gen_copy': {
        return {
          success: true,
          actionId: action.id,
          output: `Generated social copy for ${params.platform || 'unknown'} targeting ${params.target_audience || 'general audience'}`,
          requiresApproval: false,
        };
      }

      case 'post_soc': {
        const result = await DirectPublishService.publish(
          params.platform as any,
          params.caption || '',
          params.video_url ? [params.video_url] : [],
        );
        return {
          success: result.success,
          actionId: action.id,
          output: result.postId
            ? `Posted to ${params.platform}: ${result.platformUrl || result.postId}`
            : result.error || 'Post failed',
          requiresApproval: true,
          error: result.error,
        };
      }

      case 'sched_post': {
        const result = await schedulePost({
          text: params.caption || '',
          platforms: [params.platform as any].filter(Boolean),
          scheduledDate: params.scheduled_time || new Date().toISOString(),
        });
        return {
          success: result.success,
          actionId: action.id,
          output: result.success
            ? `Scheduled for ${params.platform} at ${params.scheduled_time || 'now'}`
            : result.error || 'Scheduling failed',
          requiresApproval: true,
          error: result.error,
        };
      }

      case 'create_plan': {
        const steps = params.steps ? JSON.parse(params.steps) : [];
        const result = await planService.createPlan(
          'default',
          params.goal || 'Untitled plan',
          params.description || '',
          steps,
        );
        return {
          success: !!result,
          actionId: action.id,
          output: result ? `Plan created` : 'Plan creation failed',
          requiresApproval: false,
        };
      }

      case 'update_progress': {
        // This action is handled internally by the planService
        return {
          success: true,
          actionId: action.id,
          output: `Plan progress update received for step ${params.stepId}`,
          requiresApproval: false,
        };
      }

      default:
        return {
          success: false,
          actionId: action.id,
          error: `No handler registered for action: ${action.name}`,
          requiresApproval: false,
        };
    }
  } catch (error) {
    return {
      success: false,
      actionId: action.id,
      error: error instanceof Error ? error.message : 'Unknown error',
      requiresApproval: action.requiresApproval,
    };
  }
}

export async function processToolCalls(
  agentOutput: string,
): Promise<{ cleanedOutput: string; toolResults: ToolCallResult[] }> {
  const toolCalls = parseToolCalls(agentOutput);

  if (toolCalls.length === 0) {
    return { cleanedOutput: agentOutput, toolResults: [] };
  }

  // Remove tool call syntax from the output
  let cleanedOutput = agentOutput.replace(/\[\[tool:(\w+)\s*\(([^)]*)\)\]\]/g, '').trim();

  const toolResults: ToolCallResult[] = [];
  for (const call of toolCalls) {
    const action = getAgentAction(call.actionName);
    if (!action) {
      toolResults.push({
        success: false,
        actionId: call.actionName,
        error: `Unknown action: ${call.actionName}`,
        requiresApproval: false,
      });
      continue;
    }

    const result = await executeAction(action, call.parameters);
    toolResults.push(result);

    // Append tool result to output
    cleanedOutput += `\n\n[Tool: ${action.name}] ${result.success ? '✅ Success' : '❌ Failed'}`;
    if (result.output) {
      cleanedOutput += `\n${result.output}`;
    }
    if (result.error) {
      cleanedOutput += `\nError: ${result.error}`;
    }
    if (result.requiresApproval) {
      cleanedOutput += '\n(This action requires approval)';
    }
  }

  return { cleanedOutput, toolResults };
}

export const toolExecutor = {
  parseToolCalls,
  processToolCalls,
  getAgentAction,
};
