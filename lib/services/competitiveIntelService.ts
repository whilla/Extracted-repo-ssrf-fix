'use client';

import { aiService } from './aiService';
import { multiAgentService } from './multiAgentService';
import { browserTools } from './browserToolsWrapper'; // We'll create this wrapper next
import { kvGet, kvSet } from './puterService';

export interface CompetitorAnalysis {
  brandName: string;
  url: string;
  valueProposition: string;
  contentThemes: string[];
  perceivedWeaknesses: string[];
  strategicGaps: string[];
  swot: {
    strengths: string[];
    weaknesses: string[];
    opportunities: string[];
    threats: string[];
  };
}

/**
 * CompetitiveIntelService performs deep analysis of rival brands
 * to identify content and strategic gaps.
 */
export const competitiveIntelService = {
  /**
   * Performs a full strategic audit of a competitor.
   */
  async analyzeCompetitor(url: string): Promise<CompetitorAnalysis> {
    console.log(`[CompetitiveIntelService] Starting audit for: ${url}`);

    // 1. Data Acquisition: Use browser tools to get raw page content
    // We'll use the browser-content tool to get clean markdown
    const rawContent = await this.fetchCompetitorData(url);

    // 2. Strategic Analysis: Use the AI Swarm to perform a deep audit
    const analysis = await this.performStrategicAudit(url, rawContent);

    // 3. Cache results for 7 days to avoid redundant scraping
    await kvSet(`intel_${url}`, JSON.stringify({
      analysis,
      timestamp: new Date().toISOString()
    }));

    return analysis;
  },

  /**
   * Uses the browser-tools skill to extract readable content from the target URL.
   */
  async fetchCompetitorData(url: string): Promise<string> {
    try {
      // We invoke the browser-content.js script from the skills directory
      const { stdout } = await this.executeBrowserTool('browser-content.js', url);
      return stdout;
    } catch (error) {
      console.error('[CompetitiveIntelService] Fetch failed:', error);
      throw new Error(`Failed to acquire competitor data from ${url}`);
    }
  },

  /**
   * Uses a specialized AI prompt chain to turn raw HTML/Markdown into strategic intel.
   */
  async performStrategicAudit(url: string, content: string): Promise<CompetitorAnalysis> {
    const systemPrompt = `
      You are a World-Class Competitive Strategist and Market Analyst. 
      Your goal is to dismantle a competitor's online presence to find "Strategic Gaps" that our brand can exploit.
      
      Analyze the provided content for:
      1. The Value Proposition: What are they actually promising the customer?
      2. Content Themes: What topics do they dominate? What is their "voice"?
      3. Perceived Weaknesses: Where is their messaging vague, outdated, or too generic?
      4. Strategic Gaps: What are they NOT talking about that the audience cares about?
      5. Full SWOT Analysis.

      Return a strict JSON object matching the CompetitorAnalysis interface.
    `;

    const userPrompt = `Analyze this competitor data from ${url}:\n\n${content}`;

    const response = await aiService.chat([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ]);

    const cleaned = response.replace(/```json|```/g, '').trim();
    return JSON.parse(cleaned) as CompetitorAnalysis;
  },

  /**
   * Helper to execute browser-tool scripts from the skills directory.
   */
  async executeBrowserTool(tool: string, args: string): Promise<{ stdout: string }> {
    const { exec } = require('child_process');
    const { promisify } = require('util');
    const execPromise = promisify(exec);
    
    const { stdout } = await execPromise(`node /root/.pi/agent/skills/browser-tools/${tool} "${args}"`);
    return { stdout };
  }
};
