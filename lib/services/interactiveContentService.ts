import { logger } from '@/lib/utils/logger';

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function safeEvaluate(expr: string): number {
  const tokens = expr.match(/(\d+\.?\d*|[+\-*/()%])/g);
  if (!tokens) throw new Error('Invalid formula');
  for (const t of tokens) {
    if (!/^\d/.test(t) && !'+-*/()%'.includes(t)) {
      throw new Error('Invalid token: ' + t);
    }
  }
  return Function('"use strict"; return (' + expr + ')')();
}

function safeCalculate(formula: string, values: Record<string, number>): number {
  let safe = formula;
  for (const [key, val] of Object.entries(values)) {
    safe = safe.replace(new RegExp(`\\b${key}\\b`, 'g'), String(val));
  }
  if (!/^[\d\s+\-*/.()%]+$/.test(safe)) {
    throw new Error('Invalid formula');
  }
  return safeEvaluate(safe);
}

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

      const maxVal = Math.max(...params.data.map(d => d.value), 1);
      const infographicHtml = `
        <div class="infographic" data-layout="${params.layout || 'bar'}" style="font-family: system-ui, sans-serif; padding: 20px; background: #f8fafc; border-radius: 12px;">
          <h2 style="margin: 0 0 20px; font-size: 1.5rem; color: #1e293b;">${escapeHtml(params.title)}</h2>
          <div class="chart-container" style="display: flex; align-items: flex-end; gap: 12px; height: 200px; padding: 10px 0;">
            ${params.data.map(item => `
              <div style="flex: 1; display: flex; flex-direction: column; align-items: center; height: 100%; justify-content: flex-end;">
                <span style="font-size: 0.75rem; color: #475569; margin-bottom: 4px;">${escapeHtml(String(item.value))}%</span>
                <div style="width: 100%; min-height: 4px; background: ${item.color || '#3b82f6'}; border-radius: 4px 4px 0 0; height: ${(item.value / maxVal) * 160}px; transition: height 0.3s ease;"></div>
                <span style="font-size: 0.75rem; color: #64748b; margin-top: 4px; text-align: center;">${escapeHtml(item.label)}</span>
              </div>
            `).join('')}
          </div>
        </div>
      `;

      return {
        success: true,
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

      const gameId = `game_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const gameHtml = `
        <div id="${escapeHtml(gameId)}" style="font-family: system-ui, sans-serif; padding: 20px; background: #f8fafc; border-radius: 12px; text-align: center;">
          <h3 style="margin: 0 0 12px; color: #1e293b;">${escapeHtml(params.theme)}</h3>
          <div style="font-size: 2rem; font-weight: bold; color: #3b82f6;">Score: <span class="gscore">0</span></div>
          <div class="garea" style="margin: 16px 0; padding: 20px; background: white; border-radius: 8px; min-height: 60px; display: flex; align-items: center; justify-content: center; font-size: 1.1rem; color: #475569;">Click Start to play!</div>
          <div style="display: flex; gap: 8px; justify-content: center;">
            <button class="gstart" style="padding: 8px 20px; background: #3b82f6; color: white; border: none; border-radius: 6px; cursor: pointer;">Start</button>
            <button class="greset" style="padding: 8px 20px; background: #94a3b8; color: white; border: none; border-radius: 6px; cursor: pointer;">Reset</button>
          </div>
          <script>
            (function(){
              var el = document.getElementById('${gameId}');
              if (!el) return;
              var score = 0;
              var running = false;
              var interval = null;
              var scoreEl = el.querySelector('.gscore');
              var areaEl = el.querySelector('.garea');
              el.querySelector('.gstart').onclick = function() {
                if (running) return;
                running = true;
                areaEl.textContent = 'Playing... click fast!';
                interval = setInterval(function() {
                  score++;
                  scoreEl.textContent = score;
                }, 100);
              };
              el.querySelector('.greset').onclick = function() {
                running = false;
                if (interval) clearInterval(interval);
                interval = null;
                score = 0;
                scoreEl.textContent = '0';
                areaEl.textContent = 'Click Start to play!';
              };
            })();
          </script>
        </div>
      `;

      return {
        success: true,
        html: gameHtml,
      };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  static async generateCalculator(config: CalculatorConfig): Promise<InteractiveContentResult> {
    try {
      logger.info('[InteractiveContentService] Generating calculator', config as any);

      const calcId = `calc_${Date.now()}`;
      const inputHtml = config.inputs.map(input => `
        <div style="margin-bottom: 10px;">
          <label style="display: block; font-size: 0.875rem; color: #475569; margin-bottom: 4px;">${escapeHtml(input.label)}</label>
          <input type="number" class="cinput" name="${escapeHtml(input.name)}" value="${escapeHtml(String(input.defaultValue))}" data-name="${escapeHtml(input.name)}" style="width: 100%; padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 1rem;" />
        </div>
      `).join('');

      const calculatorHtml = `
        <div id="${escapeHtml(calcId)}" style="font-family: system-ui, sans-serif; padding: 20px; background: #f8fafc; border-radius: 12px; max-width: 400px;">
          <h3 style="margin: 0 0 16px; color: #1e293b; text-transform: capitalize;">${escapeHtml(config.type)} Calculator</h3>
          <div class="inputs">${inputHtml}</div>
          <div style="margin: 12px 0; padding: 12px; background: white; border-radius: 8px; text-align: center;">
            <span style="font-size: 0.875rem; color: #64748b;">Result:</span>
            <span class="cresult" style="font-size: 1.5rem; font-weight: bold; color: #3b82f6; margin-left: 8px;">0</span>
          </div>
          <button class="ccalc" style="width: 100%; padding: 10px; background: #3b82f6; color: white; border: none; border-radius: 6px; font-size: 1rem; cursor: pointer;">Calculate</button>
          <script>
            (function(){
              var el = document.getElementById('${calcId}');
              if (!el) return;
              var formula = ${JSON.stringify(config.formula)};
              function safeCalculate(f, vals) {
                for (var k in vals) {
                  if (vals.hasOwnProperty(k)) {
                    f = f.split(k).join(String(vals[k]));
                  }
                }
                var allowed = '0123456789.+-*/()% ';
                for (var i = 0; i < f.length; i++) {
                  if (allowed.indexOf(f[i]) === -1) throw new Error('Invalid formula');
                }
                for (var ci = 0; ci < f.length; ci++) {
                  var ch = f[ci];
                  if ('0123456789.+-*/()% '.indexOf(ch) === -1) throw new Error('Invalid formula');
                }
                return new Function('"use strict"; return (' + f + ')')();
              }
              el.querySelector('.ccalc').onclick = function() {
                var inputs = el.querySelectorAll('.cinput');
                var values = {};
                inputs.forEach(function(inp) { values[inp.name] = parseFloat(inp.value) || 0; });
                try {
                  var result = safeCalculate(formula, values);
                  el.querySelector('.cresult').textContent = isNaN(result) ? 'Invalid formula' : result.toFixed(2);
                } catch(e) {
                  el.querySelector('.cresult').textContent = 'Error: ' + e.message;
                }
              };
            })();
          </script>
        </div>
      `;

      return {
        success: true,
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

      const quizId = `quiz_${Date.now()}`;
      const questionsHtml = params.questions.map((q, i) => `
        <div class="qblock" data-idx="${i}" style="margin-bottom: 16px; padding: 12px; background: white; border-radius: 8px;">
          <p style="margin: 0 0 8px; font-weight: 500; color: #1e293b;">${i + 1}. ${escapeHtml(q.question)}</p>
          ${q.options.map((opt, j) => `
            <label style="display: block; padding: 6px 0; cursor: pointer; color: #475569;">
              <input type="radio" name="q${quizId}_${i}" value="${escapeHtml(String(j))}" style="margin-right: 8px;" />
              ${escapeHtml(opt)}
            </label>
          `).join('')}
        </div>
      `).join('');

      const quizHtml = `
        <div id="${quizId}" style="font-family: system-ui, sans-serif; padding: 20px; background: #f8fafc; border-radius: 12px; max-width: 600px;">
          <h2 style="margin: 0 0 16px; color: #1e293b;">${escapeHtml(params.title)}</h2>
          ${questionsHtml}
          <div class="qresult" style="margin: 12px 0; padding: 12px; background: white; border-radius: 8px; display: none; text-align: center; font-size: 1.1rem; font-weight: 600; color: #059669;"></div>
          <button class="qsubmit" style="width: 100%; padding: 10px; background: #3b82f6; color: white; border: none; border-radius: 6px; font-size: 1rem; cursor: pointer;">Submit</button>
          <script>
            (function(){
              var el = document.getElementById('${quizId}');
              if (!el) return;
              var correctEncoded = '${params.questions.map(q => String.fromCharCode(65 + q.correctIndex)).join('')}';
              el.querySelector('.qsubmit').onclick = function() {
                var score = 0;
                for (var ci = 0; ci < correctEncoded.length; ci++) {
                  var c = correctEncoded.charCodeAt(ci) - 65;
                  var sel = el.querySelector('input[name="q${quizId}_' + ci + '"]:checked');
                  if (sel && parseInt(sel.value) === c) score++;
                }
                var resEl = el.querySelector('.qresult');
                resEl.style.display = 'block';
                resEl.textContent = 'Score: ' + score + '/' + correctEncoded.length + ' (' + Math.round(score/correctEncoded.length*100) + '%)';
                ${params.showResults ? `
                el.querySelectorAll('.qblock').forEach(function(b, i) {
                  var opts = b.querySelectorAll('input[type="radio"]');
                  opts.forEach(function(o, j) {
                    if (j === (correctEncoded.charCodeAt(i) - 65)) o.parentElement.style.color = '#059669';
                  });
                });
                ` : ''}
              };
            })();
          </script>
        </div>
      `;

      return {
        success: true,
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

      const pollId = `poll_${Date.now()}`;
      const pollHtml = `
        <div id="${pollId}" style="font-family: system-ui, sans-serif; padding: 20px; background: #f8fafc; border-radius: 12px; max-width: 400px;">
          <h3 style="margin: 0 0 12px; color: #1e293b;">${escapeHtml(params.question)}</h3>
          ${params.options.map((opt, i) => `
            <label style="display: block; padding: 8px 0; cursor: pointer; color: #475569;">
              <input type="${params.allowMultiple ? 'checkbox' : 'radio'}" name="poll_${pollId}" value="${i}" style="margin-right: 8px;" />
              ${escapeHtml(opt)}
            </label>
          `).join('')}
          <div class="presults" style="display: none; margin: 12px 0;">
            ${params.options.map((opt, i) => `
              <div style="margin-bottom: 8px;">
                <span style="font-size: 0.875rem; color: #475569;">${escapeHtml(opt)}</span>
                <div style="background: #e2e8f0; border-radius: 4px; height: 20px; overflow: hidden;">
                  <div class="pbar" data-idx="${i}" style="height: 100%; background: #3b82f6; border-radius: 4px; width: 0%; transition: width 0.3s ease;"></div>
                </div>
                <span class="pct" data-idx="${i}" style="font-size: 0.75rem; color: #64748b;">0%</span>
              </div>
            `).join('')}
          </div>
          <button class="pvote" style="width: 100%; padding: 10px; background: #3b82f6; color: white; border: none; border-radius: 6px; font-size: 1rem; cursor: pointer;">Vote</button>
          <script>
            (function(){
              var el = document.getElementById('${pollId}');
              if (!el) return;
              var counts = new Array(${params.options.length}).fill(0);
              el.querySelector('.pvote').onclick = function() {
                var selected = el.querySelectorAll('input[name="poll_${pollId}"]:checked');
                if (selected.length === 0) return;
                selected.forEach(function(s) { counts[parseInt(s.value)]++; });
                el.querySelector('.presults').style.display = 'block';
                var total = counts.reduce(function(a,b) { return a+b; }, 0);
                el.querySelectorAll('.pbar').forEach(function(bar) {
                  var idx = parseInt(bar.getAttribute('data-idx'));
                  var pct = Math.round((counts[idx] / total) * 100);
                  bar.style.width = pct + '%';
                });
                el.querySelectorAll('.pct').forEach(function(p) {
                  var idx = parseInt(p.getAttribute('data-idx'));
                  var pct = Math.round((counts[idx] / total) * 100);
                  p.textContent = pct + '%';
                });
              };
            })();
          </script>
        </div>
      `;

      return {
        success: true,
        html: pollHtml,
      };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }
}