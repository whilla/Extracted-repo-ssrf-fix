import { marketingInsightsService } from './marketingInsightsService';
import { loadBrandKit } from './memoryService';
import { kvGet } from './puterService';
import { logger } from '@/lib/utils/logger';

/**
 * AutomationBot
 * A background worker that executes periodic strategy loops, 
 * like weekly a performance analysis and strategic report generation.
 */
export class AutomationBot {
  private static instance: AutomationBot;
  private isRunning = false;
  private _intervalId: NodeJS.Timeout | null = null;

  private constructor() {}

  public static getInstance(): AutomationBot {
    if (!AutomationBot.instance) {
      AutomationBot.instance = new AutomationBot();
    }
    return AutomationBot.instance;
  }

  /**
   * Start the background automation loop.
   */
  async start() {
    if (this.isRunning) return;
    this.isRunning = true;
    
    // In a real environment, this would be a CRON job (e.g., via n8n or a GitHub Action)
    // Here we implement a long-running interval for demonstration.
    this._intervalId = setInterval(() => this.runWeeklyStrategyLoop(), 604800000); // Every 7 days
    
    console.log('[AutomationBot] Background strategic loops activated.');
  }

  /**
   * Stop the background automation loop.
   */
  stop(): void {
    if (this._intervalId) {
      clearInterval(this._intervalId);
      this._intervalId = null;
    }
    this.isRunning = false;
    console.log('[AutomationBot] Background loops stopped.');
  }

  /**
   * Executes the full loop: Analytics -> Insights -> Strategic Report -> Notification
   */
  async runWeeklyStrategyLoop() {
    try {
      logger.info('[AutomationBot] Starting weekly strategy synthesis...');
      
      const brandKit = await loadBrandKit();
      if (!brandKit) return;

      const strategicReport = await marketingInsightsService.generateStrategicReport(brandKit);
      
      // Save the report to the user's documents via Puter
      const reportPath = `/insights/weekly-report-${new Date().toISOString().split('T')[0]}.json`;
      await puterService.writeFile(reportPath, JSON.stringify({
        report: strategicReport,
        generatedAt: new Date().toISOString(),
        brandKit
      }, null, 2));

      logger.info(`[AutomationBot] Weekly report generated and saved to ${reportPath}`);
      
      // Optionally trigger a notification via notificationService
    } catch (error) {
      logger.error('[AutomationBot] Weekly strategy loop failed:', error);
    }
  }
}

export const automationBot = AutomationBot.getInstance();
