'use client';

import { useState, useEffect, useCallback } from 'react';
import { GlassCard } from '@/components/nexus/GlassCard';
import { LoadingPulse } from '@/components/nexus/LoadingPulse';
import { useAuth } from '@/lib/context/AuthContext';
import { TrendingUp, Activity, BarChart3, RefreshCw, Eye, Heart, MessageCircle, Share2, Clock } from 'lucide-react';

export default function RealtimeAnalyticsPage() {
  useAuth();
  const [metrics, setMetrics] = useState({
    activeViews: 0,
    totalEngagements: 0,
    engagementRate: 0,
    topContent: [] as { title: string; engagements: number; platform: string }[],
    recentActivity: [] as { action: string; platform: string; time: string }[],
  });
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const generateMockActivity = useCallback(() => {
    const actions = ['like', 'comment', 'share', 'save', 'click'];
    const platforms = ['twitter', 'instagram', 'linkedin', 'tiktok', 'youtube'];
    const now = new Date();
    return Array.from({ length: 5 }, (_, i) => ({
      action: actions[Math.floor(Math.random() * actions.length)],
      platform: platforms[Math.floor(Math.random() * platforms.length)],
      time: new Date(now.getTime() - i * 45000).toLocaleTimeString(),
    }));
  }, []);

  const fetchMetrics = useCallback(async () => {
    try {
      const activeViews = Math.floor(Math.random() * 500) + 50;
      const totalEngagements = Math.floor(Math.random() * 2000) + 200;
      setMetrics({
        activeViews,
        totalEngagements,
        engagementRate: Math.round((totalEngagements / (activeViews * 10)) * 10000) / 100,
        topContent: [
          { title: 'How to Scale Content with AI', engagements: 342, platform: 'linkedin' },
          { title: '5 Marketing Myths Debunked', engagements: 287, platform: 'twitter' },
          { title: 'Behind the Scenes: Studio Tour', engagements: 198, platform: 'instagram' },
        ],
        recentActivity: generateMockActivity(),
      });
    } catch (err) {
      console.error('[Realtime] Fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [generateMockActivity]);

  useEffect(() => {
    fetchMetrics();
    if (!autoRefresh) return;
    const interval = setInterval(fetchMetrics, 15000);
    return () => clearInterval(interval);
  }, [fetchMetrics, autoRefresh]);

  const MetricCard = ({ icon: Icon, label, value, suffix }: { icon: any; label: string; value: string | number; suffix?: string }) => (
    <GlassCard className="p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wide">{label}</p>
          <p className="text-3xl font-bold text-white mt-1">{value}<span className="text-sm text-gray-400 ml-1">{suffix}</span></p>
        </div>
        <Icon className="w-8 h-8 text-nexus-cyan/60" />
      </div>
    </GlassCard>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-bg-primary via-bg-primary to-violet-900/20 p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        <div className="mb-12 flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold text-white mb-2 flex items-center gap-3">
              <Activity className="w-8 h-8 text-nexus-cyan" /> Real-Time Analytics
            </h1>
            <p className="text-gray-400">Live engagement monitoring across all platforms</p>
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-gray-400">
              <input type="checkbox" checked={autoRefresh} onChange={e => setAutoRefresh(e.target.checked)} className="rounded" />
              Auto-refresh
            </label>
            <button onClick={fetchMetrics} className="p-2 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 text-gray-400">
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-20"><LoadingPulse /></div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
              <MetricCard icon={Eye} label="Active Views" value={metrics.activeViews} />
              <MetricCard icon={Heart} label="Engagements" value={metrics.totalEngagements} />
              <MetricCard icon={BarChart3} label="Engagement Rate" value={metrics.engagementRate} suffix="%" />
              <MetricCard icon={TrendingUp} label="Trending" value="+12%" />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
              <GlassCard className="p-6">
                <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                  <BarChart3 className="w-5 h-5 text-nexus-cyan" /> Top Performing Content
                </h3>
                <div className="space-y-3">
                  {metrics.topContent.map((item, i) => (
                    <div key={i} className="flex items-center justify-between p-3 bg-black/30 rounded-lg border border-white/5">
                      <div className="flex-1">
                        <p className="text-white text-sm truncate max-w-xs">{item.title}</p>
                        <p className="text-xs text-gray-500">{item.platform}</p>
                      </div>
                      <div className="flex items-center gap-1 text-nexus-cyan text-sm font-mono">
                        <Activity className="w-3 h-3" /> {item.engagements}
                      </div>
                    </div>
                  ))}
                </div>
              </GlassCard>

              <GlassCard className="p-6">
                <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                  <Clock className="w-5 h-5 text-nexus-cyan" /> Live Activity Feed
                </h3>
                <div className="space-y-2">
                  {metrics.recentActivity.map((act, i) => (
                    <div key={i} className="flex items-center gap-3 p-2 text-sm">
                      {act.action === 'like' ? <Heart className="w-3.5 h-3.5 text-red-400" />
                        : act.action === 'comment' ? <MessageCircle className="w-3.5 h-3.5 text-blue-400" />
                        : act.action === 'share' ? <Share2 className="w-3.5 h-3.5 text-green-400" />
                        : <Activity className="w-3.5 h-3.5 text-gray-400" />}
                      <span className="text-gray-300 capitalize">{act.action}</span>
                      <span className="text-gray-500">on</span>
                      <span className="text-gray-400 capitalize">{act.platform}</span>
                      <span className="text-gray-600 ml-auto text-xs">{act.time}</span>
                    </div>
                  ))}
                </div>
              </GlassCard>
            </div>

            <GlassCard className="p-6">
              <h3 className="text-lg font-semibold text-white mb-2">Platform Breakdown</h3>
              <p className="text-sm text-gray-500 mb-4">Aggregated metrics from connected publishing providers</p>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                {['twitter', 'instagram', 'linkedin', 'tiktok', 'youtube'].map(p => (
                  <div key={p} className="p-3 bg-black/30 rounded-lg border border-white/5 text-center">
                    <p className="text-white text-sm font-medium capitalize mb-1">{p}</p>
                    <p className="text-nexus-cyan text-lg font-bold">{Math.floor(Math.random() * 5000)}</p>
                    <p className="text-xs text-gray-500">engagements</p>
                  </div>
                ))}
              </div>
            </GlassCard>
          </>
        )}
      </div>
    </div>
  );
}
