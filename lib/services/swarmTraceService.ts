

import { kvGet, kvSet } from './puterService';

export interface TraceStep {
  stepId: string;
  agentId: string;
  agentRole: string;
  input: string;
  output: string;
  startTime: string;
  endTime: string;
  duration: number;
  tokensUsed?: number;
  status: 'success' | 'failed';
  error?: string;
}

export interface SwarmTrace {
  traceId: string;
  goal: string;
  startTime: string;
  endTime?: string;
  status: 'running' | 'completed' | 'failed';
  steps: TraceStep[];
  finalOutput?: string;
}

/**
 * SwarmTraceService provides deep observability into the 
 * execution of multi-agent workflows.
 */
export const swarmTraceService = {
  /**
   * Initializes a new trace for a swarm execution.
   */
  async startTrace(traceId: string, goal: string): Promise<void> {
    const trace: SwarmTrace = {
      traceId,
      goal,
      startTime: new Date().toISOString(),
      status: 'running',
      steps: [],
    };
    await kvSet(`trace_${traceId}`, JSON.stringify(trace));
  },

  /**
   * Records a single step in the swarm execution.
   */
  async recordStep(traceId: string, step: TraceStep): Promise<void> {
    const data = await kvGet(`trace_${traceId}`);
    if (!data) return;

    const trace: SwarmTrace = JSON.parse(data);
    trace.steps.push(step);
    await kvSet(`trace_${traceId}`, JSON.stringify(trace));
  },

  /**
   * Finalizes the trace and marks it as completed or failed.
   */
  async endTrace(traceId: string, status: 'completed' | 'failed', finalOutput?: string): Promise<void> {
    const data = await kvGet(`trace_${traceId}`);
    if (!data) return;

    const trace: SwarmTrace = JSON.parse(data);
    trace.status = status;
    trace.endTime = new Date().toISOString();
    trace.finalOutput = finalOutput;
    await kvSet(`trace_${traceId}`, JSON.stringify(trace));
  },

  /**
   * Retrieves a full trace for debugging or UI visualization.
   */
  async getTrace(traceId: string): Promise<SwarmTrace | null> {
    const data = await kvGet(`trace_${traceId}`);
    return data ? JSON.parse(data) : null;
  },

  /**
   * Generates a human-readable "Post-Mortem" for failed runs.
   */
  async generatePostMortem(traceId: string): Promise<string> {
    const trace = await this.getTrace(traceId);
    if (!trace) return 'Trace not found.';

    const failedStep = trace.steps.find(s => s.status === 'failed');
    if (!failedStep) return 'No specific failure found in the trace.';

    return `
      SWARM POST-MORTEM
      =================
      Goal: ${trace.goal}
      Failure Point: Agent ${failedStep.agentRole}
      Error: ${failedStep.error}
      Context: The failure occurred after ${trace.steps.indexOf(failedStep)} successful steps.
      Last Successful Step: ${trace.steps[trace.steps.indexOf(failedStep)-1]?.agentRole || 'None'}
    `;
  }
};
