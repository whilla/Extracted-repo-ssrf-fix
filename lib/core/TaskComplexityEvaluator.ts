/**
 * TASK COMPLEXITY EVALUATOR
 * Determines the required effort and resources for a given AI task
 * 
 * Use Case:
 * - Simple tasks (e.g., "rewrite this") -> Use 1 agent, skip competition
 * - Medium tasks (e.g., "create a hook") -> Use 2-3 agents
 * - Complex tasks (e.g., "full viral strategy") -> Use full agent swarm
 */

export enum TaskComplexity {
  SIMPLE = 'simple',
  MEDIUM = 'medium',
  COMPLEX = 'complex'
}

export interface ComplexityAssessment {
  level: TaskComplexity;
  suggestedAgentCount: number;
  skipCompetition: boolean;
  estimatedTokenCost: 'low' | 'medium' | 'high';
  reasoning: string;
}

export type TaskType = 'full' | 'strategy' | 'optimize' | 'critique';

export class TaskComplexityEvaluator {
  /**
   * Analyze input to determine task complexity
   */
  static evaluate(userInput: string, taskType: TaskType): ComplexityAssessment {
    const inputLength = userInput.length;
    const hasComplexKeywords = /strategy|analyze|research|comprehensive|detailed|deep dive/i.test(userInput);
    const isShortInput = inputLength < 50;

    // 1. Complex Tasks
    if (taskType === 'full' || (taskType === 'strategy' && hasComplexKeywords)) {
      return {
        level: TaskComplexity.COMPLEX,
        suggestedAgentCount: 6,
        skipCompetition: false,
        estimatedTokenCost: 'high',
        reasoning: 'Request requires full strategic depth and multi-agent validation',
      };
    }

    // 2. Simple Tasks
    if (isShortInput && (taskType === 'optimize' || taskType === 'critique')) {
      return {
        level: TaskComplexity.SIMPLE,
        suggestedAgentCount: 1,
        skipCompetition: true,
        estimatedTokenCost: 'low',
        reasoning: 'Simple refinement task on short input; full swarm is overkill',
      };
    }

    // 3. Medium Tasks (Default)
    return {
      level: TaskComplexity.MEDIUM,
      suggestedAgentCount: 3,
      skipCompetition: false,
      estimatedTokenCost: 'medium',
      reasoning: 'Standard content generation task',
    };
  }
}

export { TaskComplexityEvaluator };
