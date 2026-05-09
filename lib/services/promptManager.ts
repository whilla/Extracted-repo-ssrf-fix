/**
 * Prompt Template Manager
 * Handles structured updates to agent prompts to prevent corruption
 * and enable precise evolution.
 */

export interface PromptTemplate {
  systemInstruction: string;
  dynamicContext: string[];
  inputMarker: string;
  footer: string;
}

export class PromptManager {
  /**
   * Safely updates a prompt template without corrupting markers.
   */
  static updateTemplate(current: string, proposed: string, type: 'enhance' | 'simplify'): string {
    if (type === 'simplify') {
      // Logic to reduce verbosity while preserving core markers
      const lines = current.split('\n').filter(l => l.trim() && !l.includes('{{input}}'));
      const simplified = lines.slice(0, Math.ceil(lines.length * 0.8)).join('\n');
      return `${simplified}\n\nInput: {{input}}`;
    }
    
    if (type === 'enhance') {
      // Inject high-quality directives before the input marker
      const directive = 'IMPORTANT: Focus on quality over speed. Each output should be unique, engaging, and strictly aligned with brand voice.\\n\\n';
      return current.replace('Input: {{input}}', `${directive}Input: {{input}}`);
    }

    return proposed;
  }

  /**
   * Validates that a prompt still contains essential markers.
   */
  static validateMarkers(prompt: string): boolean {
    return prompt.includes('{{input}}');
  }
}
