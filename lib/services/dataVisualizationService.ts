import { logger } from '@/lib/utils/logger';

export type ChartType = 'bar' | 'line' | 'pie' | 'area' | 'scatter' | 'donut' | 'radar';

export interface DataVisualizationParams {
  csvData: string;
  chartType: ChartType;
  title?: string;
  xAxisLabel?: string;
  yAxisLabel?: string;
  colors?: string[];
  animated?: boolean;
}

export interface DataVisualizationResult {
  success: boolean;
  embedUrl?: string;
  html?: string;
  chartData?: any;
  error?: string;
}

export interface ParsedCSV {
  headers: string[];
  rows: { [key: string]: string | number }[];
}

export class DataVisualizationService {
  private static parseCSV(csv: string): ParsedCSV {
    const lines = csv.trim().split('\n');
    const headers = lines[0].split(',').map(h => h.trim());
    
    const rows: { [key: string]: string | number }[] = [];
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.trim());
      const row: { [key: string]: string | number } = {};
      headers.forEach((h, j) => {
        const val = values[j];
        row[h] = isNaN(Number(val)) ? val : Number(val);
      });
      rows.push(row);
    }
    
    return { headers, rows };
  }

  private static generateChartColors(count: number): string[] {
    const defaultColors = [
      '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
      '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1'
    ];
    return Array(count).fill(0).map((_, i) => defaultColors[i % defaultColors.length]);
  }

  static async generateFromCSV(params: DataVisualizationParams): Promise<DataVisualizationResult> {
    try {
      logger.info('[DataVisualizationService] Generating chart from CSV', { chartType: params.chartType });

      const parsed = this.parseCSV(params.csvData);
      
      if (parsed.headers.length < 2) {
        return { success: false, error: 'CSV must have at least 2 columns' };
      }

      const xAxis = parsed.headers[0];
      const yAxis = parsed.headers[1];
      const colors = params.colors || this.generateChartColors(parsed.rows.length);

      const timestamp = Date.now();
      const chartId = `chart_${timestamp}`;

      const chartHtml = this.generateChartHTML({
        chartId,
        chartType: params.chartType,
        title: params.title || 'Data Visualization',
        xAxis: params.xAxisLabel || xAxis,
        yAxis: params.yAxisLabel || yAxis,
        data: parsed,
        colors,
        animated: params.animated ?? true,
      });

      return {
        success: true,
        embedUrl: `https://embed.nexusai.io/chart/${timestamp}`,
        html: chartHtml,
        chartData: { headers: parsed.headers, rows: parsed.rows },
      };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  private static generateChartHTML(config: {
    chartId: string;
    chartType: ChartType;
    title: string;
    xAxis: string;
    yAxis: string;
    data: ParsedCSV;
    colors: string[];
    animated: boolean;
  }): string {
    const labels = config.data.rows.map(r => String(Object.values(r)[0]));
    const values = config.data.rows.map(r => Number(Object.values(r)[1]));

    return `
      <div class="data-viz" id="${config.chartId}">
        <h3>${config.title}</h3>
        <canvas id="${config.chartId}_canvas"></canvas>
        <script>
          (function() {
            const ctx = document.getElementById('${config.chartId}_canvas').getContext('2d');
            const labels = ${JSON.stringify(labels)};
            const values = ${JSON.stringify(values)};
            const colors = ${JSON.stringify(config.colors)};
            
            new Chart(ctx, {
              type: '${config.chartType}',
              data: {
                labels: labels,
                datasets: [{
                  label: '${config.yAxis}',
                  data: values,
                  backgroundColor: colors,
                  borderColor: colors,
                  borderWidth: 1,
                  ${config.chartType === 'line' || config.chartType === 'area' ? 'fill: true,' : ''}
                }]
              },
              options: {
                responsive: true,
                animation: ${config.animated},
                plugins: {
                  legend: { display: true },
                  title: { display: false }
                },
                scales: {
                  x: { title: { display: true, text: '${config.xAxis}' }},
                  y: { title: { display: true, text: '${config.yAxis}' }}
                }
              }
            });
          })();
        </script>
      </div>
    `;
  }

  static async generateComparisonChart(params: {
    csvData: string;
    title: string;
    categories: string[];
  }): Promise<DataVisualizationResult> {
    try {
      const parsed = this.parseCSV(params.csvData);
      const colors = this.generateChartColors(params.categories.length);

      const timestamp = Date.now();
      const chartId = `comparison_${timestamp}`;

      const chartHtml = `
        <div class="comparison-chart" id="${chartId}">
          <h3>${params.title}</h3>
          <canvas id="${chartId}_canvas"></canvas>
          <script>
            (function() {
              const ctx = document.getElementById('${chartId}_canvas').getContext('2d');
              new Chart(ctx, {
                type: 'bar',
                data: {
                  labels: ${JSON.stringify(parsed.headers.slice(1))},
                  datasets: ${JSON.stringify(params.categories.map((cat, i) => ({
                    label: cat,
                    data: parsed.rows.find(r => Object.values(r)[0] === cat) ? 
                      Object.values(parsed.rows.find(r => Object.values(r)[0] === cat)!).slice(1) : [],
                    backgroundColor: colors[i]
                  })))}
                },
                options: { responsive: true }
              });
            })();
          </script>
        </div>
      `;

      return {
        success: true,
        embedUrl: `https://embed.nexusai.io/comparison/${timestamp}`,
        html: chartHtml,
      };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }
}