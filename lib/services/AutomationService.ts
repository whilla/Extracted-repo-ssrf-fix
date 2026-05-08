/**
 * AUTOMATION SERVICE
 * Orchestrates the deployment of viral content workflows to n8n or Make.com
 * 
 * Responsibilities:
 * - Translate Agent blueprints into platform-specific JSON
 * - Manage deployment lifecycle (Create -> Test -> Activate)
 * - Map content strategies to trigger/action sequences
 * - Monitor automation health
 */

import { n8nBridgeService } from './n8nBridgeService';
import { makeBridgeService } from './makeBridgeService';

export enum AutomationPlatform {
  N8N = 'n8n',
  MAKE = 'make'
}

export interface AutomationBlueprint {
  id: string;
  name: string;
  platform: AutomationPlatform;
  trigger: {
    type: 'schedule' | 'webhook' | 'event';
    config: Record<string, any>;
  };
  steps: Array<{
    action: string;
    params: Record<string, any>;
    dependency?: string;
  }>;
  metadata: {
    frequency: 'hourly' | 'daily' | 'weekly';
    goal: string;
  };
}

export interface DeploymentResult {
  success: boolean;
  platform: AutomationPlatform;
  externalId: string;
  webhookUrl?: string;
  error?: string;
}

export class AutomationService {
  /**
   * Deploy an automation blueprint to the chosen platform
   */
  async deployWorkflow(blueprint: AutomationBlueprint): Promise<DeploymentResult> {
    console.log(`[AutomationService] Deploying ${blueprint.name} to ${blueprint.platform}...`);

    try {
      if (blueprint.platform === AutomationPlatform.N8N) {
        return await this.deployToN8N(blueprint);
      } else {
        return await this.deployToMake(blueprint);
      }
    } catch (error) {
      console.error(`[AutomationService] Deployment failed:`, error);
      return {
        success: false,
        platform: blueprint.platform,
        externalId: '',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  private async deployToN8N(blueprint: AutomationBlueprint): Promise<DeploymentResult> {
    const n8nBlueprint = this.translateToN8nJson(blueprint);
    
    const response = await n8nBridgeService.callN8nApi('/workflows', {
      method: 'POST',
      body: JSON.stringify({
        name: blueprint.name,
        nodes: n8nBlueprint.nodes,
        connections: n8nBlueprint.connections,
        active: true,
      }),
    });

    if (!response || !response.id) {
      throw new Error(`n8n deployment failed: Invalid response received. ${JSON.stringify(response)}`);
    }

    return {
      success: true,
      platform: AutomationPlatform.N8N,
      externalId: response.id,
    };
  }

  private async deployToMake(blueprint: AutomationBlueprint): Promise<DeploymentResult> {
    const makeBlueprint = this.translateToMakeJson(blueprint);
    
    const response = await makeBridgeService.createScenario(makeBlueprint);

    if (!response || !response.id) {
      throw new Error(`Make deployment failed: Invalid response received. ${JSON.stringify(response)}`);
    }

    return {
      success: true,
      platform: AutomationPlatform.MAKE,
      externalId: response.id,
    };
  }

  /**
   * Simple translation logic: maps generic agent actions to platform nodes
   */
  private translateToN8nJson(blueprint: AutomationBlueprint): any {
    // Simplified: create a basic workflow with a trigger and one action
    return {
      nodes: [
        {
          parameters: { 
            interval: 
              blueprint.metadata.frequency === 'daily' ? 1440 :
              blueprint.metadata.frequency === 'weekly' ? 10080 :
              60  // hourly
          },
          type: 'n8n-nodes-base.scheduleTrigger',
          typeVersion: 1,
          position: [0, 0],
          id: 'trigger',
          name: 'Schedule Trigger',
        },
        {
          parameters: {
            method: 'POST',
            url: 'https://api.nexusai.com/api/worker/process',
            body: { task: blueprint.name },
          },
          type: 'n8n-nodes-base.httpRequest',
          typeVersion: 4,
          position: [250, 0],
          id: 'executor',
          name: 'Request Content Generation',
        }
      ],
      connections: {
        'Schedule Trigger': {
          main: [[{ node: 'Request Content Generation', type: 'main', index: 0 }]],
        },
      },
    };
  }

  private translateToMakeJson(blueprint: AutomationBlueprint): any {
    // Simplified Make.com blueprint structure
    return {
      name: blueprint.name,
      modules: [
        {
          module: 'scheduling',
          parameters: { frequency: blueprint.metadata.frequency },
        },
        {
          module: 'http',
          parameters: { url: 'https://api.nexusai.com/api/worker/process' },
        },
      ],
    };
  }

  /**
   * Stop and remove a workflow
   */
  async removeWorkflow(platform: AutomationPlatform, externalId: string): Promise<boolean> {
    try {
      if (platform === AutomationPlatform.N8N) {
        await n8nBridgeService.callN8nApi(`/workflows/${externalId}`, { method: 'DELETE' });
      } else {
        await makeBridgeService.callMakeApi(`/scenarios/${externalId}`, { method: 'DELETE' });
      }
      return true;
    } catch {
      return false;
    }
  }
}

export const automationService = new AutomationService();
