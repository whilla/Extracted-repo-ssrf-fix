// Export Reports Service
import type { Platform } from '@/lib/types';

export interface ReportData {
  title: string;
  dateRange: { start: string; end: string };
  summary: ReportSummary;
  platforms: PlatformReport[];
  topContent: ContentPerformance[];
  growth: GrowthMetrics;
  recommendations: string[];
}

export interface ReportSummary {
  totalPosts: number;
  totalEngagement: number;
  avgEngagementRate: number;
  totalReach: number;
  followerGrowth: number;
  bestPerformingPlatform: Platform;
}

export interface PlatformReport {
  platform: Platform;
  posts: number;
  engagement: number;
  reach: number;
  engagementRate: number;
  topPost: string;
  growth: number;
}

export interface ContentPerformance {
  content: string;
  platform: Platform;
  engagement: number;
  reach: number;
  date: string;
}

export interface GrowthMetrics {
  followers: { current: number; previous: number; change: number };
  engagement: { current: number; previous: number; change: number };
  reach: { current: number; previous: number; change: number };
}

// Generate CSV export
export function generateCSV(data: ReportData): string {
  const lines: string[] = [];
  
  // Header
  lines.push(`"${data.title}"`);
  lines.push(`"Report Period: ${data.dateRange.start} to ${data.dateRange.end}"`);
  lines.push('');
  
  // Summary
  lines.push('"SUMMARY"');
  lines.push('"Metric","Value"');
  lines.push(`"Total Posts",${data.summary.totalPosts}`);
  lines.push(`"Total Engagement",${data.summary.totalEngagement}`);
  lines.push(`"Avg Engagement Rate","${data.summary.avgEngagementRate.toFixed(2)}%"`);
  lines.push(`"Total Reach",${data.summary.totalReach}`);
  lines.push(`"Follower Growth","${data.summary.followerGrowth >= 0 ? '+' : ''}${data.summary.followerGrowth}"`);
  lines.push(`"Best Platform","${data.summary.bestPerformingPlatform}"`);
  lines.push('');
  
  // Platform breakdown
  lines.push('"PLATFORM BREAKDOWN"');
  lines.push('"Platform","Posts","Engagement","Reach","Engagement Rate","Growth"');
  for (const platform of data.platforms) {
    lines.push(`"${platform.platform}",${platform.posts},${platform.engagement},${platform.reach},"${platform.engagementRate.toFixed(2)}%","${platform.growth >= 0 ? '+' : ''}${platform.growth}%"`);
  }
  lines.push('');
  
  // Top content
  lines.push('"TOP PERFORMING CONTENT"');
  lines.push('"Content","Platform","Engagement","Reach","Date"');
  for (const content of data.topContent) {
    const escapedContent = content.content.replace(/"/g, '""').substring(0, 100);
    lines.push(`"${escapedContent}...","${content.platform}",${content.engagement},${content.reach},"${content.date}"`);
  }
  lines.push('');
  
  // Recommendations
  lines.push('"RECOMMENDATIONS"');
  for (const rec of data.recommendations) {
    lines.push(`"${rec.replace(/"/g, '""')}"`);
  }
  
  return lines.join('\n');
}

// Generate JSON export
export function generateJSON(data: ReportData): string {
  return JSON.stringify(data, null, 2);
}

// Generate HTML report
export function generateHTML(data: ReportData): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${data.title}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 40px; max-width: 1200px; margin: 0 auto; color: #1a1a1a; }
    h1 { font-size: 2rem; margin-bottom: 8px; }
    .subtitle { color: #666; margin-bottom: 32px; }
    .section { margin-bottom: 40px; }
    .section h2 { font-size: 1.25rem; color: #333; margin-bottom: 16px; padding-bottom: 8px; border-bottom: 2px solid #e5e5e5; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; }
    .card { background: #f9f9f9; border-radius: 8px; padding: 20px; }
    .card .label { font-size: 0.875rem; color: #666; margin-bottom: 4px; }
    .card .value { font-size: 1.5rem; font-weight: 600; }
    .card .change { font-size: 0.875rem; margin-top: 4px; }
    .card .change.positive { color: #22c55e; }
    .card .change.negative { color: #ef4444; }
    table { width: 100%; border-collapse: collapse; margin-top: 16px; }
    th, td { text-align: left; padding: 12px; border-bottom: 1px solid #e5e5e5; }
    th { font-weight: 600; color: #666; font-size: 0.875rem; text-transform: uppercase; }
    .content-preview { max-width: 300px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .recommendations { list-style: none; }
    .recommendations li { padding: 12px 0; border-bottom: 1px solid #e5e5e5; }
    .recommendations li:last-child { border-bottom: none; }
    .footer { margin-top: 40px; text-align: center; color: #999; font-size: 0.875rem; }
  </style>
</head>
<body>
  <h1>${data.title}</h1>
  <p class="subtitle">Report Period: ${data.dateRange.start} to ${data.dateRange.end}</p>
  
  <div class="section">
    <h2>Summary</h2>
    <div class="grid">
      <div class="card">
        <div class="label">Total Posts</div>
        <div class="value">${data.summary.totalPosts}</div>
      </div>
      <div class="card">
        <div class="label">Total Engagement</div>
        <div class="value">${data.summary.totalEngagement.toLocaleString()}</div>
      </div>
      <div class="card">
        <div class="label">Avg Engagement Rate</div>
        <div class="value">${data.summary.avgEngagementRate.toFixed(2)}%</div>
      </div>
      <div class="card">
        <div class="label">Total Reach</div>
        <div class="value">${data.summary.totalReach.toLocaleString()}</div>
      </div>
      <div class="card">
        <div class="label">Follower Growth</div>
        <div class="value">${data.summary.followerGrowth >= 0 ? '+' : ''}${data.summary.followerGrowth}</div>
        <div class="change ${data.summary.followerGrowth >= 0 ? 'positive' : 'negative'}">
          ${data.summary.followerGrowth >= 0 ? '↑' : '↓'} this period
        </div>
      </div>
      <div class="card">
        <div class="label">Best Platform</div>
        <div class="value" style="text-transform: capitalize;">${data.summary.bestPerformingPlatform}</div>
      </div>
    </div>
  </div>
  
  <div class="section">
    <h2>Platform Breakdown</h2>
    <table>
      <thead>
        <tr>
          <th>Platform</th>
          <th>Posts</th>
          <th>Engagement</th>
          <th>Reach</th>
          <th>Rate</th>
          <th>Growth</th>
        </tr>
      </thead>
      <tbody>
        ${data.platforms.map(p => `
        <tr>
          <td style="text-transform: capitalize;">${p.platform}</td>
          <td>${p.posts}</td>
          <td>${p.engagement.toLocaleString()}</td>
          <td>${p.reach.toLocaleString()}</td>
          <td>${p.engagementRate.toFixed(2)}%</td>
          <td class="${p.growth >= 0 ? 'positive' : 'negative'}">${p.growth >= 0 ? '+' : ''}${p.growth}%</td>
        </tr>
        `).join('')}
      </tbody>
    </table>
  </div>
  
  <div class="section">
    <h2>Top Performing Content</h2>
    <table>
      <thead>
        <tr>
          <th>Content</th>
          <th>Platform</th>
          <th>Engagement</th>
          <th>Reach</th>
          <th>Date</th>
        </tr>
      </thead>
      <tbody>
        ${data.topContent.map(c => `
        <tr>
          <td class="content-preview">${c.content.substring(0, 50)}...</td>
          <td style="text-transform: capitalize;">${c.platform}</td>
          <td>${c.engagement.toLocaleString()}</td>
          <td>${c.reach.toLocaleString()}</td>
          <td>${c.date}</td>
        </tr>
        `).join('')}
      </tbody>
    </table>
  </div>
  
  <div class="section">
    <h2>Recommendations</h2>
    <ul class="recommendations">
      ${data.recommendations.map(r => `<li>${r}</li>`).join('')}
    </ul>
  </div>
  
  <div class="footer">
    Generated by NexusAI on ${new Date().toLocaleDateString()}
  </div>
</body>
</html>`;
}

// Download helper
export function downloadFile(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Export as CSV
export function exportCSV(data: ReportData, filename?: string): void {
  const csv = generateCSV(data);
  downloadFile(csv, filename || `nexus-report-${Date.now()}.csv`, 'text/csv');
}

// Export as JSON
export function exportJSON(data: ReportData, filename?: string): void {
  const json = generateJSON(data);
  downloadFile(json, filename || `nexus-report-${Date.now()}.json`, 'application/json');
}

// Export as HTML
export function exportHTML(data: ReportData, filename?: string): void {
  const html = generateHTML(data);
  downloadFile(html, filename || `nexus-report-${Date.now()}.html`, 'text/html');
}

// Export as PDF (uses print dialog)
export function exportPDF(data: ReportData): void {
  const html = generateHTML(data);
  const printWindow = window.open('', '_blank');
  if (printWindow) {
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.onload = () => {
      printWindow.print();
    };
  }
}

// Generate a zero-state report scaffold until live analytics are available
export function generateMockReport(): ReportData {
  const now = new Date();
  const start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  return {
    title: 'Social Media Performance Report',
    dateRange: {
      start: start.toLocaleDateString(),
      end: now.toLocaleDateString(),
    },
    summary: {
      totalPosts: 0,
      totalEngagement: 0,
      avgEngagementRate: 0,
      totalReach: 0,
      followerGrowth: 0,
      bestPerformingPlatform: 'instagram',
    },
    platforms: [],
    topContent: [],
    growth: {
      followers: { current: 0, previous: 0, change: 0 },
      engagement: { current: 0, previous: 0, change: 0 },
      reach: { current: 0, previous: 0, change: 0 },
    },
    recommendations: [
      'Publish content consistently to start building an analytics baseline.',
      'Connect a publishing provider to sync platform metrics into future reports.',
      'Use hashtag and posting-time analytics after your first published campaigns.',
    ],
  };
}
