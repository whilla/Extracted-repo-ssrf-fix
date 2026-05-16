import { ACTION_REGISTRY, type AgentAction } from '../agents/actionRegistry';

export interface ToolResult {
  success: boolean;
  content: string;
  error?: string;
}

export async function processToolCalls(text: string): Promise<{ cleanedOutput: string; toolResults: string[] }> {
  const toolExecutor = ToolExecutorService.getInstance();
  const results: string[] = [];
  let cleanedOutput = text;

  // Match pattern: [[tool:action_name(param1: value1, param2: value2)]]
  const regex = /\[\[tool:([a-zA-Z0-9_]+)\((.*?)\)\]\]/g;
  let match;

  while ((match = regex.exec(text)) !== null) {
    const actionName = match[1];
    const argsString = match[2];
    
    // Parse simple key: value pairs
    const args: Record<string, any> = {};
    argsString.split(',').forEach(pair => {
      const [key, val] = pair.split(':').map(s => s.trim());
      if (key && val) {
        // Remove quotes if present
        args[key] = val.replace(/^["']|["']$/g, '');
      }
    });

    const result = await toolExecutor.execute(actionName, args);
    results.push(`Tool ${actionName} result: ${result.success ? result.content : 'Error: ' + result.error}`);
  }

  // Remove tool calls from the output
  cleanedOutput = text.replace(/\[\[tool:[^\]]+\]\]/g, '').trim();

  return { cleanedOutput, toolResults: results };
}

export class ToolExecutorService {
// ... rest of the class

  private static instance: ToolExecutorService;

  private constructor() {}

  static getInstance(): ToolExecutorService {
    if (!ToolExecutorService.instance) {
      ToolExecutorService.instance = new ToolExecutorService();
    }
    return ToolExecutorService.instance;
  }

  async execute(actionName: string, args: Record<string, any>): Promise<ToolResult> {
    const action = ACTION_REGISTRY[actionName];
    if (!action) {
      return { success: false, content: `Tool ${actionName} not found in registry.` };
    }

    console.log(`[ToolExecutor] Executing ${actionName} with args:`, args);

    // Handle Internal Tools
    if (action.workflowId.startsWith('internal-')) {
      return this.handleInternalTool(actionName, args);
    }

    // Handle External (n8n) Tools
    return this.handleExternalTool(action, args);
  }

  private async handleInternalTool(actionName: string, args: Record<string, any>): Promise<ToolResult> {
    switch (actionName) {
      case 'update_video_timeline':
        return this.executeTimelineUpdate(args);
      case 'web_search':
        return this.executeWebSearch(args);
      default:
        return { success: false, content: `Internal tool ${actionName} not implemented.` };
    }
  }

  private async executeTimelineUpdate(args: Record<string, any>): Promise<ToolResult> {
    const { action, payload } = args;
    // In a real app, this would update a database record for the video timeline
    return {
      success: true,
      content: `Successfully performed ${action} on timeline. Payload: ${JSON.stringify(payload)}`
    };
  }

  private async executeWebSearch(args: Record<string, any>): Promise<ToolResult> {
    const { query } = args;
    // Mocking a web search result. In a real app, this would call Brave Search or Serper API.
    return {
      success: true,
      content: `Search results for "${query}": 1. Current trends show high interest in AI agents for productivity. 2. New updates in Next.js 16 are improving server component performance. 3. Viral short-form content is shifting towards "story-first" narratives.`
    };
  }

  private async handleExternalTool(action: AgentAction, args: Record<string, any>): Promise<ToolResult> {
    try {
      // Mocking n8n call
      console.log(`[ToolExecutor] Calling n8n workflow ${action.workflowId}...`);
      return {
        success: true,
        content: `n8n workflow ${action.workflowId} executed successfully with args ${JSON.stringify(args)}`
      };
    } catch (error) {
      return { success: false, content: `n8n error: ${String(error)}` };
    }
  }
}

export const toolExecutorService = ToolExecutorService.getInstance();
