/**
 * AGENT BLACKBOARD
 * A shared communication space for AI agents to exchange findings, 
 * observations, and critiques during a single request lifecycle.
 * 
 * This enables a transition from competitive generation 
 * (winner-take-all) to collaborative synthesis.
 */

export interface BlackboardObservation {
  agentId: string;
  agentRole: string;
  type: 'observation' | 'critique' | 'hypothesis' | 'constraint';
  content: string;
  confidence: number;
  timestamp: string;
  metadata?: Record<string, any>;
}

export class AgentBlackboard {
  private observations: BlackboardObservation[] = [];
  private requestId: string;

  constructor(requestId: string) {
    this.requestId = requestId;
  }

  /**
   * Post a new observation to the blackboard
   */
  post(observation: Omit<BlackboardObservation, 'timestamp'>): void {
    this.observations.push({
      ...observation,
      timestamp: new Date().toISOString(),
    });
    
    // Enhanced Tracing: Log the flow of information
    const trace = `[BLACKBOARD-TRACE][${this.requestId}] ${observation.agentRole} -> ${observation.type.toUpperCase()}: "${observation.content.slice(0, 100)}${observation.content.length > 100 ? '...' : ''}" (Conf: ${observation.confidence})`;
    console.log(trace);
  }

  /**
   * Retrieve all observations
   */
  getAll(): BlackboardObservation[] {
    return [...this.observations];
  }

  /**
   * Retrieve observations of a specific type
   */
  getByType(type: BlackboardObservation['type']): BlackboardObservation[] {
    return this.observations.filter(obs => obs.type === type);
  }

  /**
   * Get the most recent observation from a specific agent
   */
  getLastFromAgent(agentId: string): BlackboardObservation | null {
    const agentObs = this.observations.filter(obs => obs.agentId === agentId);
    return agentObs.length > 0 ? agentObs[agentObs.length - 1] : null;
  }

  /**
   * Summary of the current project state for agents to consume
   */
  getSummary(): string {
    if (this.observations.length === 0) return 'No observations posted yet.';

    const grouped = this.observations.reduce((acc, obs) => {
      if (!acc[obs.type]) acc[obs.type] = [];
      acc[obs.type].push(`[${obs.agentRole}] ${obs.content}`);
      return acc;
    }, {} as Record<string, string[]>);

    return Object.entries(grouped)
      .map(([type, items]) => `${type.toUpperCase()}:\n- ${items.join('\n- ')}`)
      .join('\n\n');
  }

  clear(): void {
    this.observations = [];
  }
}
