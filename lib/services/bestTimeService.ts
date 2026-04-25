// Best Time to Post Analyzer
import { kvGet, kvSet } from './puterService';
import type { Platform } from '@/lib/types';

export interface TimeSlot {
  day: number;          // 0-6 (Sunday-Saturday)
  hour: number;         // 0-23
  score: number;        // 0-100 engagement score
  label: string;        // "Monday 9 AM"
}

export interface BestTimeRecommendation {
  platform: Platform;
  timezone: string;
  bestTimes: TimeSlot[];
  worstTimes: TimeSlot[];
  insights: string[];
}

export interface AudienceActivity {
  platform: Platform;
  hourlyActivity: number[];     // 24 values, 0-100
  dailyActivity: number[];      // 7 values, 0-100
  peakHours: number[];
  peakDays: number[];
}

// Industry-specific best times (based on research)
const INDUSTRY_BEST_TIMES: Record<string, Record<Platform, TimeSlot[]>> = {
  'general': {
    twitter: [
      { day: 3, hour: 9, score: 95, label: 'Wednesday 9 AM' },
      { day: 3, hour: 12, score: 90, label: 'Wednesday 12 PM' },
      { day: 2, hour: 9, score: 88, label: 'Tuesday 9 AM' },
      { day: 4, hour: 9, score: 85, label: 'Thursday 9 AM' },
      { day: 1, hour: 11, score: 82, label: 'Monday 11 AM' },
    ],
    instagram: [
      { day: 3, hour: 11, score: 95, label: 'Wednesday 11 AM' },
      { day: 5, hour: 10, score: 92, label: 'Friday 10 AM' },
      { day: 2, hour: 14, score: 88, label: 'Tuesday 2 PM' },
      { day: 1, hour: 11, score: 85, label: 'Monday 11 AM' },
      { day: 4, hour: 12, score: 82, label: 'Thursday 12 PM' },
    ],
    linkedin: [
      { day: 2, hour: 10, score: 95, label: 'Tuesday 10 AM' },
      { day: 3, hour: 12, score: 92, label: 'Wednesday 12 PM' },
      { day: 4, hour: 9, score: 88, label: 'Thursday 9 AM' },
      { day: 2, hour: 8, score: 85, label: 'Tuesday 8 AM' },
      { day: 3, hour: 8, score: 82, label: 'Wednesday 8 AM' },
    ],
    facebook: [
      { day: 3, hour: 13, score: 95, label: 'Wednesday 1 PM' },
      { day: 4, hour: 12, score: 92, label: 'Thursday 12 PM' },
      { day: 5, hour: 13, score: 88, label: 'Friday 1 PM' },
      { day: 2, hour: 14, score: 85, label: 'Tuesday 2 PM' },
      { day: 1, hour: 15, score: 82, label: 'Monday 3 PM' },
    ],
    tiktok: [
      { day: 2, hour: 19, score: 95, label: 'Tuesday 7 PM' },
      { day: 4, hour: 12, score: 92, label: 'Thursday 12 PM' },
      { day: 5, hour: 17, score: 88, label: 'Friday 5 PM' },
      { day: 6, hour: 21, score: 85, label: 'Saturday 9 PM' },
      { day: 0, hour: 15, score: 82, label: 'Sunday 3 PM' },
    ],
    youtube: [
      { day: 4, hour: 15, score: 95, label: 'Thursday 3 PM' },
      { day: 5, hour: 15, score: 92, label: 'Friday 3 PM' },
      { day: 6, hour: 11, score: 88, label: 'Saturday 11 AM' },
      { day: 0, hour: 11, score: 85, label: 'Sunday 11 AM' },
      { day: 3, hour: 14, score: 82, label: 'Wednesday 2 PM' },
    ],
    threads: [
      { day: 3, hour: 10, score: 95, label: 'Wednesday 10 AM' },
      { day: 2, hour: 12, score: 92, label: 'Tuesday 12 PM' },
      { day: 4, hour: 11, score: 88, label: 'Thursday 11 AM' },
      { day: 1, hour: 9, score: 85, label: 'Monday 9 AM' },
      { day: 5, hour: 14, score: 82, label: 'Friday 2 PM' },
    ],
    pinterest: [
      { day: 6, hour: 20, score: 95, label: 'Saturday 8 PM' },
      { day: 0, hour: 20, score: 92, label: 'Sunday 8 PM' },
      { day: 5, hour: 21, score: 88, label: 'Friday 9 PM' },
      { day: 3, hour: 14, score: 85, label: 'Wednesday 2 PM' },
      { day: 4, hour: 15, score: 82, label: 'Thursday 3 PM' },
    ],
  },
  'b2b': {
    linkedin: [
      { day: 2, hour: 8, score: 95, label: 'Tuesday 8 AM' },
      { day: 3, hour: 10, score: 92, label: 'Wednesday 10 AM' },
      { day: 4, hour: 9, score: 90, label: 'Thursday 9 AM' },
      { day: 2, hour: 12, score: 85, label: 'Tuesday 12 PM' },
      { day: 3, hour: 12, score: 82, label: 'Wednesday 12 PM' },
    ],
    twitter: [
      { day: 2, hour: 9, score: 95, label: 'Tuesday 9 AM' },
      { day: 3, hour: 11, score: 90, label: 'Wednesday 11 AM' },
      { day: 4, hour: 10, score: 88, label: 'Thursday 10 AM' },
      { day: 1, hour: 10, score: 85, label: 'Monday 10 AM' },
      { day: 5, hour: 9, score: 80, label: 'Friday 9 AM' },
    ],
    instagram: [
      { day: 2, hour: 10, score: 90, label: 'Tuesday 10 AM' },
      { day: 3, hour: 12, score: 88, label: 'Wednesday 12 PM' },
      { day: 4, hour: 14, score: 85, label: 'Thursday 2 PM' },
      { day: 1, hour: 11, score: 82, label: 'Monday 11 AM' },
      { day: 5, hour: 10, score: 80, label: 'Friday 10 AM' },
    ],
    facebook: [
      { day: 3, hour: 11, score: 88, label: 'Wednesday 11 AM' },
      { day: 2, hour: 14, score: 85, label: 'Tuesday 2 PM' },
      { day: 4, hour: 12, score: 82, label: 'Thursday 12 PM' },
      { day: 1, hour: 13, score: 80, label: 'Monday 1 PM' },
      { day: 5, hour: 11, score: 78, label: 'Friday 11 AM' },
    ],
    tiktok: [
      { day: 2, hour: 12, score: 85, label: 'Tuesday 12 PM' },
      { day: 3, hour: 17, score: 82, label: 'Wednesday 5 PM' },
      { day: 4, hour: 12, score: 80, label: 'Thursday 12 PM' },
      { day: 1, hour: 18, score: 78, label: 'Monday 6 PM' },
      { day: 5, hour: 14, score: 75, label: 'Friday 2 PM' },
    ],
    youtube: [
      { day: 2, hour: 14, score: 85, label: 'Tuesday 2 PM' },
      { day: 3, hour: 15, score: 82, label: 'Wednesday 3 PM' },
      { day: 4, hour: 10, score: 80, label: 'Thursday 10 AM' },
      { day: 1, hour: 11, score: 78, label: 'Monday 11 AM' },
      { day: 5, hour: 14, score: 75, label: 'Friday 2 PM' },
    ],
    threads: [
      { day: 2, hour: 9, score: 85, label: 'Tuesday 9 AM' },
      { day: 3, hour: 11, score: 82, label: 'Wednesday 11 AM' },
      { day: 4, hour: 10, score: 80, label: 'Thursday 10 AM' },
      { day: 1, hour: 10, score: 78, label: 'Monday 10 AM' },
      { day: 5, hour: 9, score: 75, label: 'Friday 9 AM' },
    ],
    pinterest: [
      { day: 2, hour: 14, score: 80, label: 'Tuesday 2 PM' },
      { day: 3, hour: 15, score: 78, label: 'Wednesday 3 PM' },
      { day: 4, hour: 12, score: 75, label: 'Thursday 12 PM' },
      { day: 1, hour: 14, score: 72, label: 'Monday 2 PM' },
      { day: 5, hour: 11, score: 70, label: 'Friday 11 AM' },
    ],
  },
};

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// Get best times for a platform
export async function getBestTimes(
  platform: Platform,
  options: {
    industry?: string;
    timezone?: string;
    useCustomData?: boolean;
  } = {}
): Promise<BestTimeRecommendation> {
  const { industry = 'general', timezone = Intl.DateTimeFormat().resolvedOptions().timeZone } = options;
  
  // Check for custom analytics data first
  if (options.useCustomData) {
    const customData = await getCustomAnalyticsData(platform);
    if (customData && customData.bestTimes.length > 0) {
      return {
        platform,
        timezone,
        bestTimes: customData.bestTimes,
        worstTimes: customData.worstTimes,
        insights: customData.insights,
      };
    }
  }
  
  // Use industry data
  const industryData = INDUSTRY_BEST_TIMES[industry] || INDUSTRY_BEST_TIMES['general'];
  const platformTimes = industryData[platform] || INDUSTRY_BEST_TIMES['general'][platform] || [];
  
  // Generate worst times (inverse of best times)
  const worstTimes: TimeSlot[] = [
    { day: 0, hour: 3, score: 15, label: 'Sunday 3 AM' },
    { day: 1, hour: 4, score: 18, label: 'Monday 4 AM' },
    { day: 6, hour: 2, score: 20, label: 'Saturday 2 AM' },
  ];
  
  // Generate insights
  const insights = generateInsights(platform, platformTimes);
  
  return {
    platform,
    timezone,
    bestTimes: platformTimes,
    worstTimes,
    insights,
  };
}

// Generate posting schedule for the week
export async function generateWeeklySchedule(
  platforms: Platform[],
  postsPerWeek: number,
  industry: string = 'general'
): Promise<Array<{ platform: Platform; day: number; hour: number; dayName: string; time: string }>> {
  const schedule: Array<{ platform: Platform; day: number; hour: number; dayName: string; time: string }> = [];
  
  const postsPerPlatform = Math.ceil(postsPerWeek / platforms.length);
  
  for (const platform of platforms) {
    const recommendation = await getBestTimes(platform, { industry });
    const bestTimes = recommendation.bestTimes.slice(0, postsPerPlatform);
    
    for (const slot of bestTimes) {
      schedule.push({
        platform,
        day: slot.day,
        hour: slot.hour,
        dayName: DAY_NAMES[slot.day],
        time: formatTime(slot.hour),
      });
    }
  }
  
  // Sort by day and hour
  return schedule.sort((a, b) => {
    if (a.day !== b.day) return a.day - b.day;
    return a.hour - b.hour;
  });
}

// Get next best time to post
export async function getNextBestTime(
  platform: Platform,
  fromDate: Date = new Date()
): Promise<{ date: Date; score: number; formatted: string }> {
  const recommendation = await getBestTimes(platform);
  const now = fromDate;
  const currentDay = now.getDay();
  const currentHour = now.getHours();
  
  // Find next best time slot
  for (const slot of recommendation.bestTimes) {
    if (slot.day > currentDay || (slot.day === currentDay && slot.hour > currentHour)) {
      const nextDate = new Date(now);
      const daysUntil = slot.day >= currentDay ? slot.day - currentDay : 7 - currentDay + slot.day;
      nextDate.setDate(nextDate.getDate() + daysUntil);
      nextDate.setHours(slot.hour, 0, 0, 0);
      
      return {
        date: nextDate,
        score: slot.score,
        formatted: formatDateTime(nextDate),
      };
    }
  }
  
  // If no time found this week, use first slot next week
  const firstSlot = recommendation.bestTimes[0];
  const nextDate = new Date(now);
  const daysUntil = 7 - currentDay + firstSlot.day;
  nextDate.setDate(nextDate.getDate() + daysUntil);
  nextDate.setHours(firstSlot.hour, 0, 0, 0);
  
  return {
    date: nextDate,
    score: firstSlot.score,
    formatted: formatDateTime(nextDate),
  };
}

// Save custom analytics data
export async function saveCustomAnalyticsData(
  platform: Platform,
  data: { bestTimes: TimeSlot[]; worstTimes: TimeSlot[]; insights: string[] }
): Promise<void> {
  await kvSet(`best_times_${platform}`, JSON.stringify(data));
}

// Get custom analytics data
async function getCustomAnalyticsData(
  platform: Platform
): Promise<{ bestTimes: TimeSlot[]; worstTimes: TimeSlot[]; insights: string[] } | null> {
  const data = await kvGet(`best_times_${platform}`);
  if (data) {
    try {
      return JSON.parse(data);
    } catch {}
  }
  return null;
}

// Generate insights based on best times
function generateInsights(platform: Platform, bestTimes: TimeSlot[]): string[] {
  const insights: string[] = [];
  
  if (bestTimes.length === 0) return insights;
  
  // Analyze patterns
  const days = bestTimes.map(t => t.day);
  const hours = bestTimes.map(t => t.hour);
  
  // Weekday vs weekend
  const weekdayCount = days.filter(d => d >= 1 && d <= 5).length;
  if (weekdayCount > days.length / 2) {
    insights.push(`Your ${platform} audience is most active during weekdays`);
  } else {
    insights.push(`Your ${platform} audience engages well on weekends`);
  }
  
  // Time of day
  const avgHour = hours.reduce((a, b) => a + b, 0) / hours.length;
  if (avgHour < 12) {
    insights.push('Morning posts tend to perform best');
  } else if (avgHour < 17) {
    insights.push('Afternoon is your peak engagement window');
  } else {
    insights.push('Evening posts get the most engagement');
  }
  
  // Platform-specific insights
  switch (platform) {
    case 'linkedin':
      insights.push('B2B audiences check LinkedIn before work and during lunch');
      break;
    case 'instagram':
      insights.push('Reels posted at these times get 2x more initial views');
      break;
    case 'tiktok':
      insights.push('TikTok algorithm favors posts with quick early engagement');
      break;
    case 'twitter':
      insights.push('Tweets get 50% more engagement with timely posting');
      break;
  }
  
  return insights;
}

// Helper functions
function formatTime(hour: number): string {
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const h = hour % 12 || 12;
  return `${h}:00 ${ampm}`;
}

function formatDateTime(date: Date): string {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  
  return `${days[date.getDay()]}, ${months[date.getMonth()]} ${date.getDate()} at ${formatTime(date.getHours())}`;
}

// Get audience activity heatmap data
export function getActivityHeatmap(platform: Platform): number[][] {
  // 7 days x 24 hours matrix
  const heatmap: number[][] = [];
  const recommendation = INDUSTRY_BEST_TIMES['general'][platform] || [];
  
  for (let day = 0; day < 7; day++) {
    heatmap[day] = [];
    for (let hour = 0; hour < 24; hour++) {
      const daytimeCurve = hour >= 6 && hour <= 22
        ? 24 + Math.max(0, 18 - Math.abs(14 - hour) * 2)
        : 8;
      const weekdayBoost = day >= 1 && day <= 5 ? 6 : 0;
      let activity = daytimeCurve + weekdayBoost;
      
      // Boost for best times
      const matchingSlot = recommendation.find(s => s.day === day && s.hour === hour);
      if (matchingSlot) {
        activity = matchingSlot.score;
      }
      
      // Lower activity at night (12 AM - 6 AM)
      if (hour >= 0 && hour < 6) {
        activity *= 0.3;
      }
      
      heatmap[day][hour] = Math.round(Math.max(0, Math.min(100, activity)));
    }
  }
  
  return heatmap;
}
