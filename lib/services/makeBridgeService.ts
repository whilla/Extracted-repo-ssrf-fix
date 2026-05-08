/**
 * MAKE BRIDGE SERVICE
 * Handles communication with Make.com (Integromat) API
 * 
 * Responsibilities:
 * - Create and update scenarios
 * - Trigger scenarios via webhooks
 * - Manage connection and template data
 */

export class MakeBridgeService {
  private static baseUrl = 'https://eu1.make.com/api/v1';

  static get apiKey(): string {
    return process.env.MAKE_API_KEY || '';
  }

  static get organizationId(): string {
    return process.env.MAKE_ORGANIZATION_ID || '';
  }

  /**
   * Helper to safely parse JSON responses with content-type check
   */
  private static async safeJson(response: Response) {
    const contentType = response.headers.get('content-type');
    if (contentType?.includes('application/json')) {
      return await response.json();
    }
    return await response.text();
  }

  /**
   * Trigger a Make scenario via webhook
   * @param webhookUrl The specific Make webhook URL
   * @param payload The data to send
   */
  static async triggerWebhook(webhookUrl: string, payload: any) {
    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...payload,
          timestamp: new Date().toISOString(),
          source: 'nexusai-control-plane',
        }),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Make webhook trigger failed: ${response.status} ${response.statusText}. ${errorBody}`);
      }

      return await this.safeJson(response);
    } catch (error) {
      console.error(`[MakeBridgeService] Error triggering webhook:`, error);
      throw error;
    }
  }

  /**
   * Create a new scenario from a blueprint (JSON)
   * @param blueprint The blueprint JSON for the scenario
   */
  static async createScenario(blueprint: any) {
    if (!this.apiKey) {
      throw new Error('MAKE_API_KEY is not configured');
    }
    if (!this.organizationId) {
      throw new Error('MAKE_ORGANIZATION_ID is not configured');
    }

    try {
      const response = await fetch(`${this.baseUrl}/scenarios`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'NexusAI Generated Automation',
          blueprint: blueprint,
          organizationId: this.organizationId,
        }),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Make API create scenario failed: ${response.status} ${response.statusText}. ${errorBody}`);
      }

      return await this.safeJson(response);
    } catch (error) {
      console.error(`[MakeBridgeService] Error creating scenario:`, error);
      throw error;
    }
  }

  /**
   * Generic API call to Make.com
   */
  static async callMakeApi(endpoint: string, options: any = {}) {
    if (!this.apiKey) throw new Error('MAKE_API_KEY is not configured');

    const url = `${this.baseUrl}${endpoint}`;

    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          ...options.headers, // Caller headers win
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Make API call failed: ${response.status} ${response.statusText}. ${errorBody}`);
      }

      return await this.safeJson(response);
    } catch (error) {
      console.error(`[MakeBridgeService] Error calling Make API ${endpoint}:`, error);
      throw error;
    }
  }
}

export { MakeBridgeService as makeBridgeService };
