'use client';

import { useState, useEffect } from 'react';
import { GlassCard } from '@/components/nexus/GlassCard';
import { NeonButton } from '@/components/nexus/NeonButton';
import { LoadingPulse } from '@/components/nexus/LoadingPulse';
import { StatusBadge } from '@/components/nexus/StatusBadge';
import Link from 'next/link';
import { loadDraft, loadSchedule, removeFromSchedule } from '@/lib/services/memoryService';
import type { ScheduledPost } from '@/lib/types';

export default function CalendarPage() {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [posts, setPosts] = useState<ScheduledPost[]>([]);
  const [draftPreviewByPostId, setDraftPreviewByPostId] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSchedule = async () => {
      try {
        const schedule = await loadSchedule();
        setPosts(schedule || []);
        const previewEntries = await Promise.all(
          (schedule || []).map(async (post) => {
            const draft = await loadDraft(post.draftId);
            const latest = draft?.versions?.[draft.versions.length - 1]?.text?.trim();
            const preview = latest || `Draft ${post.draftId.slice(0, 8)}`;
            return [post.id, preview] as const;
          })
        );
        setDraftPreviewByPostId(Object.fromEntries(previewEntries));
      } catch (error) {
        console.error('[v0] Schedule load error:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchSchedule();
  }, []);

  const handleCancel = async (postId: string) => {
    try {
      await removeFromSchedule(postId);
      const schedule = await loadSchedule();
      setPosts(schedule || []);
      const previewEntries = await Promise.all(
        (schedule || []).map(async (post) => {
          const draft = await loadDraft(post.draftId);
          const latest = draft?.versions?.[draft.versions.length - 1]?.text?.trim();
          const preview = latest || `Draft ${post.draftId.slice(0, 8)}`;
          return [post.id, preview] as const;
        })
      );
      setDraftPreviewByPostId(Object.fromEntries(previewEntries));
    } catch (error) {
      console.error('Failed to cancel scheduled post:', error);
    }
  };

  const getDaysInMonth = (date: Date) => {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  };

  const getFirstDayOfMonth = (date: Date) => {
    return new Date(date.getFullYear(), date.getMonth(), 1).getDay();
  };

  const days = Array.from({ length: getDaysInMonth(currentMonth) }, (_, i) => i + 1);
  const firstDay = getFirstDayOfMonth(currentMonth);
  const emptyDays = Array.from({ length: firstDay }, (_, i) => null);

  const monthName = currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  const getPostsForDate = (day: number) => {
    const dateStr = `${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return posts.filter(p => p.scheduledAt?.startsWith(dateStr));
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-bg-primary via-bg-primary to-violet-900/20 p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">Content Calendar</h1>
          <p className="text-gray-400">Schedule and manage your posts</p>
        </div>

        {/* Month Navigation */}
        <div className="flex items-center justify-between mb-8">
          <button
            onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1))}
            className="px-4 py-2 text-cyan hover:text-cyan/80 transition-colors"
          >
            ← Previous
          </button>
          <h2 className="text-2xl font-bold text-white">{monthName}</h2>
          <button
            onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1))}
            className="px-4 py-2 text-cyan hover:text-cyan/80 transition-colors"
          >
            Next →
          </button>
        </div>

        {/* Calendar Grid */}
        <GlassCard className="p-8 mb-8">
          <div className="grid grid-cols-7 gap-2 mb-4">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
              <div key={day} className="text-center text-cyan font-semibold text-sm py-2">
                {day}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-2">
            {emptyDays.map((_, idx) => (
              <div key={`empty-${idx}`} className="aspect-square" />
            ))}
            {days.map(day => {
              const dayPosts = getPostsForDate(day);
              return (
                <div
                  key={day}
                  className="aspect-square p-2 bg-bg-glass rounded-lg border border-border hover:border-cyan/50 transition-colors"
                >
                  <div className="text-sm font-semibold text-white mb-1">{day}</div>
                  <div className="space-y-1">
                    {dayPosts.slice(0, 2).map((post) => (
                      <div key={post.id} className="text-xs bg-violet/20 text-violet px-2 py-1 rounded truncate">
                        {post.platforms?.[0] || 'Post'}
                      </div>
                    ))}
                    {dayPosts.length > 2 && (
                      <div className="text-xs text-gray-400">+{dayPosts.length - 2} more</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </GlassCard>

        {/* Scheduled Posts List */}
        <div>
          <h2 className="text-2xl font-bold text-white mb-6">Scheduled Posts</h2>
          {loading ? (
            <LoadingPulse />
          ) : posts.length === 0 ? (
            <GlassCard className="p-8 text-center">
              <p className="text-gray-400 mb-4">No posts scheduled yet</p>
              <Link href="/studio">
                <NeonButton>Create First Post</NeonButton>
              </Link>
            </GlassCard>
          ) : (
            <div className="space-y-4">
              {posts.map((post) => (
                <GlassCard key={post.id} className="p-6">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-white mb-2">
                        {(draftPreviewByPostId[post.id] || 'Scheduled draft').substring(0, 100)}...
                      </h3>
                      <div className="flex items-center gap-4 flex-wrap mb-4">
                        {post.platforms?.map((platform) => (
                          <StatusBadge key={platform} status={"scheduled" as any} label={platform} />
                        ))}
                      </div>
                      <p className="text-sm text-gray-400">
                        Scheduled for: {new Date(post.scheduledAt).toLocaleString()}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Link
                        href="/drafts"
                        className="px-4 py-2 text-cyan hover:text-cyan/80 transition-colors text-sm"
                      >
                        Edit
                      </Link>
                      <button
                        onClick={() => {
                          void handleCancel(post.id);
                        }}
                        className="px-4 py-2 text-error hover:text-error/80 transition-colors text-sm"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                </GlassCard>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
