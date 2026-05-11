import { n8nBridgeService } from './n8nBridgeService';
import { ACTION_REGISTRY } from '@/lib/agents/actionRegistry';

export class ActionExecutor {
  /**
   * Executes an agent action.
   * If the action requires approval, it will be routed to the approval system.
   */
  static async execute(actionName: string, params: any, agentId: string, userId: string) {
    const action = ACTION_REGISTRY[actionName];
    
    if (!action) {
      throw new Error(`Action ${actionName} is not registered in the system.`);
    }

    // Validate parameters
    for (const [param, config] of Object.entries(action.parameters)) {
      if (!(param in params)) {
        throw new Error(`Missing required parameter: ${param}`);
      }
      if (typeof params[param] !== config.type) {
        throw new Error(`Invalid type for parameter ${param}. Expected ${config.type}.`);
      }
    }

    if (action.requiresApproval) {
      return this.routeToApproval(action, params, agentId, userId);
    }

    return this.triggerN8n(action, params, agentId);
  }

  private static async triggerN8n(action: any, params: any, agentId: string) {
    // Handle internal plan services that don't use n8n webhooks
    if (action.workflowId === 'internal-plan-creation') {
      const { planService } = await import('./planService');
      const steps = JSON.parse(params.steps);
      return {
        status: 'completed',
        result: await planService.createPlan(agentId, params.goal, params.description, steps),
      };
    }

    if (action.workflowId === 'internal-plan-update') {
      const { planService } = await import('./planService');
      return {
        status: 'completed',
        result: await planService.updateStepStatus(params.stepId, params.status, params.result),
      };
    }

    console.log(`[ActionExecutor] Triggering n8n workflow: ${action.workflowId}`);
    
    const result = await n8nBridgeService.triggerWorkflow(action.workflowId, {
      agent_id: agentId,
      action_id: action.id,
      params: params,
    });

    return {
      status: 'completed',
      result,
    };
  }

  private static async routeToApproval(action: any, params: any, agentId: string, userId: string) {
    console.log(`[ActionExecutor] Routing action ${action.name} to approval system...`);
    
    const response = await fetch(`/api/approvals/create`, {
      method: 'POST',
      body: JSON.stringify({
        userId,
        agentId,
        actionId: action.id,
        payload: params,
        type: 'social_post',
        status: 'pending',
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to create approval: ${response.status}`);
    }

    return {
      status: 'pending_approval',
      result: await response.json(),
    };
  }
}
