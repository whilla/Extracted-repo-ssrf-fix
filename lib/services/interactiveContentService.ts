import { logger } from '@/lib/utils/logger';

export type InteractiveContentType = 'infographic' | 'mini_game' | 'calculator' | 'quiz' | 'poll';

export interface InteractiveContentParams {
  type: InteractiveContentType;
  title: string;
  data?: Record<string, any>;
  theme?: 'dark' | 'light' | 'brand';
  colors?: string[];
}

export interface InteractiveContentResult {
  success: boolean;
  embedUrl?: string;
  html?: string;
  error?: string;
}

export interface QuizQuestion {
  question: string;
  options: string[];
  correctIndex: number;
}

export interface CalculatorConfig {
  type: 'roi' | 'cost' | 'savings' | 'custom';
  inputs: { name: string; label: string; defaultValue: number }[];
  formula: string;
}

export class InteractiveContentService {
  static async generateInfographic(params: {
    title: string;
    data: { label: string; value: number; color?: string }[];
    layout?: 'bar' | 'pie' | 'line' | 'comparison';
  }): Promise<InteractiveContentResult> {
    try {
      logger.info('[InteractiveContentService] Generating infographic', params);

      const timestamp = Date.now();
      const infographicHtml = `
        <div class="infographic" data-layout="${params.layout || 'bar'}">
          <h2>${params.title}</h2>
          <div class="chart-container">
            ${params.data.map((item, i) => `
              <div class="chart-bar" style="height: ${item.value}%; background: ${item.color || '#3b82f6'}">
                <span class="label">${item.label}</span>
                <span class="value">${item.value}%</span>
              </div>
            `).join('')}
          </div>
        </div>
      `;

      return {
        success: true,
        embedUrl: `https://embed.nexusai.io/infographic/${timestamp}`,
        html: infographicHtml,
      };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  static async generateMiniGame(params: {
    gameType: 'memory' | 'quiz' | 'clicker' | 'slider';
    theme: string;
    rounds?: number;
  }): Promise<InteractiveContentResult> {
    try {
      logger.info('[InteractiveContentService] Generating mini game', params);

      const timestamp = Date.now();
      const gameHtml = `
        <div class="mini-game" data-type="${params.gameType}" data-theme="${params.theme}">
          <div class="game-header">
            <h3>${params.theme}</h3>
            <div class="score">Score: <span id="score">0</span></div>
          </div>
          <div class="game-area" id="game-area"></div>
          <div class="game-controls">
            <button onclick="startGame()">Start</button>
            <button onclick="resetGame()">Reset</button>
          </div>
        </div>
      `;

      return {
        success: true,
        embedUrl: `https://embed.nexusai.io/game/${timestamp}`,
        html: gameHtml,
      };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  static async generateCalculator(config: CalculatorConfig): Promise<InteractiveContentResult> {
    try {
      logger.info('[InteractiveContentService] Generating calculator', config as any);

      const timestamp = Date.now();
      const calculatorHtml = `
        <div class="calculator" data-type="${config.type}">
          <h3>${config.type.toUpperCase()} Calculator</h3>
          <div class="inputs">
            ${config.inputs.map(input => `
              <div class="input-group">
                <label>${input.label}</label>
                <input type="number" name="${input.name}" value="${input.defaultValue}" />
              </div>
            `).join('')}
          </div>
          <div class="result">
            <label>Result</label>
            <span id="result">0</span>
          </div>
          <button onclick="calculate()">Calculate</button>
        </div>
      `;

      return {
        success: true,
        embedUrl: `https://embed.nexusai.io/calculator/${timestamp}`,
        html: calculatorHtml,
      };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  static async generateQuiz(params: {
    title: string;
    questions: QuizQuestion[];
    showResults?: boolean;
  }): Promise<InteractiveContentResult> {
    try {
      logger.info('[InteractiveContentService] Generating quiz', params);

      const timestamp = Date.now();
      const quizHtml = `
        <div class="quiz" data-id="${timestamp}">
          <h2>${params.title}</h2>
          ${params.questions.map((q, i) => `
            <div class="question" data-index="${i}">
              <p>${q.question}</p>
              <div class="options">
                ${q.options.map((opt, j) => `
                  <label>
                    <input type="radio" name="q${i}" value="${j}" />
                    ${opt}
                  </label>
                `).join('')}
              </div>
            </div>
          `).join('')}
          ${params.showResults ? '<div class="results"></div>' : ''}
          <button onclick="submitQuiz()">Submit</button>
        </div>
      `;

      return {
        success: true,
        embedUrl: `https://embed.nexusai.io/quiz/${timestamp}`,
        html: quizHtml,
      };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  static async generatePoll(params: {
    question: string;
    options: string[];
    allowMultiple?: boolean;
    showResults?: boolean;
  }): Promise<InteractiveContentResult> {
    try {
      logger.info('[InteractiveContentService] Generating poll', params);

      const timestamp = Date.now();
      const pollHtml = `
        <div class="poll" data-id="${timestamp}">
          <h3>${params.question}</h3>
          <div class="options">
            ${params.options.map((opt, i) => `
              <label>
                <input type="${params.allowMultiple ? 'checkbox' : 'radio'}" name="poll" value="${i}" />
                ${opt}
              </label>
            `).join('')}
          </div>
          ${params.showResults ? `
            <div class="results">
              ${params.options.map(opt => `<div class="result-bar"><span>${opt}</span></div>`).join('')}
            </div>
          ` : ''}
          <button onclick="submitPoll()">Vote</button>
        </div>
      `;

      return {
        success: true,
        embedUrl: `https://embed.nexusai.io/poll/${timestamp}`,
        html: pollHtml,
      };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }
}