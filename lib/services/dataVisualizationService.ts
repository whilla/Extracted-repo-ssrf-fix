import { logger } from '@/lib/utils/logger';
import { kvGet, kvSet } from '@/lib/services/puterService';

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
  chartId?: string;
  error?: string;
}

export interface ParsedCSV {
  headers: string[];
  rows: { [key: string]: string | number }[];
}

export interface PersistedChart {
  id: string;
  chartType: ChartType;
  title: string;
  csvData: string;
  html: string;
  createdAt: string;
}

export class DataVisualizationService {
  private static CHARTS_KEY = 'data_visualization_charts';

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

  private static async loadPersistedCharts(): Promise<PersistedChart[]> {
    try {
      const data = await kvGet(this.CHARTS_KEY);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  }

  private static async savePersistedCharts(charts: PersistedChart[]): Promise<void> {
    await kvSet(this.CHARTS_KEY, JSON.stringify(charts.slice(-100)));
  }

  static async getChart(chartId: string): Promise<PersistedChart | null> {
    const charts = await this.loadPersistedCharts();
    return charts.find(c => c.id === chartId) || null;
  }

  static async listCharts(): Promise<PersistedChart[]> {
    return this.loadPersistedCharts();
  }

  static async deleteChart(chartId: string): Promise<boolean> {
    const charts = await this.loadPersistedCharts();
    const filtered = charts.filter(c => c.id !== chartId);
    if (filtered.length === charts.length) return false;
    await this.savePersistedCharts(filtered);
    return true;
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

      const chartId = `chart_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

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

      const chart: PersistedChart = {
        id: chartId,
        chartType: params.chartType,
        title: params.title || 'Data Visualization',
        csvData: params.csvData,
        html: chartHtml,
        createdAt: new Date().toISOString(),
      };

      const charts = await this.loadPersistedCharts();
      charts.push(chart);
      await this.savePersistedCharts(charts);

      return {
        success: true,
        embedUrl: `/charts/${chartId}`,
        html: chartHtml,
        chartId,
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
        <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
        <script>
          (function() {
            var ctx = document.getElementById('${config.chartId}_canvas');
            if (!ctx) return;
            var chartCtx = ctx.getContext('2d');
            var labels = ${JSON.stringify(labels)};
            var values = ${JSON.stringify(values)};
            var colors = ${JSON.stringify(config.colors)};
            
            new Chart(chartCtx, {
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

      const chartId = `comparison_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

      const chartHtml = `
        <div class="comparison-chart" id="${chartId}">
          <h3>${params.title}</h3>
          <canvas id="${chartId}_canvas"></canvas>
          <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
          <script>
            (function() {
              var ctx = document.getElementById('${chartId}_canvas');
              if (!ctx) return;
              var chartCtx = ctx.getContext('2d');
              new Chart(chartCtx, {
                type: 'bar',
                data: {
                  labels: ${JSON.stringify(parsed.headers.slice(1))},
                  datasets: ${JSON.stringify(params.categories.map((cat, i) => {
                    const row = parsed.rows.find(r => Object.values(r)[0] === cat);
                    return {
                      label: cat,
                      data: row ? Object.values(row).slice(1).map(v => Number(v)) : [],
                      backgroundColor: colors[i]
                    };
                  }))}
                },
                options: { responsive: true }
              });
            })();
          </script>
        </div>
      `;

      const chart: PersistedChart = {
        id: chartId,
        chartType: 'bar',
        title: params.title,
        csvData: params.csvData,
        html: chartHtml,
        createdAt: new Date().toISOString(),
      };

      const charts = await this.loadPersistedCharts();
      charts.push(chart);
      await this.savePersistedCharts(charts);

      return {
        success: true,
        embedUrl: `/charts/${chartId}`,
        html: chartHtml,
        chartId,
      };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }
}
