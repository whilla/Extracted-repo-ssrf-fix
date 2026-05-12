/**
 * AGENT MODULE EXPORTS
 * Central export point for all agent classes and types
 */

// Base Agent
export { 
  BaseAgent,
  type AgentRole,
  type AgentCapability,
  type AgentConfig,
  type AgentOutput,
  type AgentExecutionContext,
  type AgentState,
  type PerformanceRecord,
  type ScoringWeights,
  type OptimizationRule,
  type OptimizationEvent,
} from './BaseAgent';

// Specialized Agents
export {
  StrategistAgent,
  WriterAgent,
  HookAgent,
  CriticAgent,
  OptimizerAgent,
  HybridAgent,
  SynthesisAgent,
  VisualCriticAgent,
  VideoEditorAgent,
} from './SpecializedAgents';
