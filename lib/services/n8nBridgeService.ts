import { createClient } from '@supabase/supabase-js';

/**
 * n8nBridgeService handles secure communication between the 
 * Next.js Control Plane and the n8n Execution Plane.
 */
export class n8nBridgeService {
  private static n8nUrl = process.env.N8N_URL || process.env.N8N_HOST || 'localhost';
  private static n8nPort = process.env.N8N_PORT || '5678';
  private static bridgeSecret = process.env.N8N_BRIDGE_SECRET || '';

  private static getBaseUrl(): string {
    return this.n8nUrl.startsWith('http') 
      ? this.n8nUrl 
      : `http://${this.n8nUrl}:${this.n8nPort}`;
  }

  /**
   * Check if n8n is available and configured
   */
  static async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.getBaseUrl()}/healthz`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Trigger an n8n workflow via webhook
   */
  static async triggerWorkflow(workflowId: string, payload: any) {
    if (!this.bridgeSecret) {
      throw new Error('N8N_BRIDGE_SECRET is not configured in environment variables');
    }

    const url = `${this.getBaseUrl()}/webhook/${workflowId}`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-NexusAI-Bridge-Secret': this.bridgeSecret,
        },
        body: JSON.stringify({
          ...payload,
          timestamp: new Date().toISOString(),
          source: 'nexusai-control-plane',
        }),
      });

      if (!response.ok) {
        throw new Error(`n8n workflow trigger failed: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error(`[n8nBridgeService] Error triggering workflow ${workflowId}:`, error);
      throw error;
    }
  }

  /**
   * Trigger workflow and wait for execution ID for status checking
   */
  static async triggerWorkflowAsync(workflowId: string, payload: any): Promise<string> {
    const result: any = await this.triggerWorkflow(workflowId, payload);
    return result.executionId || result.id || result.workflowId || '';
  }

  /**
   * Get workflow execution status
   */
  static async getExecutionStatus(executionId: string): Promise<any> {
    return this.callN8nApi(`/executions/${executionId}`, { method: 'GET' });
  }

  /**
   * List all workflows
   */
  static async listWorkflows(): Promise<any[]> {
    const result: any = await this.callN8nApi('/workflows', { method: 'GET' });
    return result.data || [];
  }

  /**
   * Get specific workflow details
   */
  static async getWorkflow(workflowId: string): Promise<any> {
    return this.callN8nApi(`/workflows/${workflowId}`, { method: 'GET' });
  }

  /**
   * Activate a workflow
   */
  static async activateWorkflow(workflowId: string): Promise<void> {
    await this.callN8nApi(`/workflows/${workflowId}/activate`, { method: 'POST' });
  }

  /**
   * Deactivate a workflow
   */
  static async deactivateWorkflow(workflowId: string): Promise<void> {
    await this.callN8nApi(`/workflows/${workflowId}/deactivate`, { method: 'POST' });
  }

  /**
   * Get recent executions
   */
  static async getRecentExecutions(limit = 10): Promise<any[]> {
    const result: any = await this.callN8nApi(`/executions?limit=${limit}`, { method: 'GET' });
    return result.data || [];
  }

  /**
   * Call n8n REST API for management tasks
   */
  static async callN8nApi(endpoint: string, options: any = {}) {
    const apiKey = process.env.N8N_API_KEY;
    if (!apiKey) {
      throw new Error('N8N_API_KEY is not configured');
    }

    const url = `${this.getBaseUrl()}/api/v1${endpoint}`;

    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          ...options.headers,
          'X-N8N-API-KEY': apiKey,
        },
      });

      if (!response.ok) {
        throw new Error(`n8n API call failed: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error(`[n8nBridgeService] Error calling n8n API ${endpoint}:`, error);
      throw error;
    }
  }
}
