'use client';

import { useState, useCallback, useMemo, useEffect } from 'react';
import { GlassCard } from '@/components/nexus/GlassCard';
import { StatusBadge } from '@/components/nexus/StatusBadge';
import { loadQueuedPostJobs, type QueuedPostJob } from '@/lib/services/postQueueService';
import { getBulkPosts, type BulkPost, updateBulkPostStatus } from '@/lib/services/bulkScheduleService';
import { updateQueuedPostJob } from '@/lib/services/postQueueService';
import type { Platform } from '@/lib/types';
import { cn } from '@/lib/utils';
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  Twitter,
  Instagram,
  Linkedin,
  Facebook,
  Youtube,
  MessageSquare,
  Pin,
  Video,
  Send,
  AlertCircle,
  Clock,
  CheckCircle2,
  FileText,
  X,
  ExternalLink,
  MoreHorizontal,
  Globe,
  Mail,
  PenTool,
  BookOpen,
  Ghost,
  MessageCircle,
  Smartphone,
  Globe2,
} from 'lucide-react';

type CalendarPost = {
  id: string;
  text: string;
  platforms: Platform[];
  scheduledAt?: string;
  status: 'draft' | 'scheduled' | 'published' | 'failed';
  mediaUrl?: string;
  error?: string;
  source: 'queue' | 'bulk';
  raw: QueuedPostJob | BulkPost;
};

const platformIcons: Record<Platform, React.ElementType> = {
  twitter: Twitter,
  instagram: Instagram,
  linkedin: Linkedin,
  facebook: Facebook,
  youtube: Youtube,
  threads: MessageSquare,
  pinterest: Pin,
  tiktok: Video,
  discord: MessageCircle,
  reddit: Globe2,
  whatsapp: Smartphone,
  telegram: Send,
  snapchat: Smartphone,
  wordpress: BookOpen,
  medium: PenTool,
  ghost: Ghost,
  substack: Mail,
  mailchimp: Mail,
  klaviyo: Mail,
  convertkit: Mail,
  general: Globe,
};

const platformColors: Record<Platform, string> = {
  twitter: 'text-sky-400',
  instagram: 'text-pink-400',
  linkedin: 'text-blue-500',
  facebook: 'text-blue-600',
  youtube: 'text-red-500',
  threads: 'text-white',
  pinterest: 'text-red-600',
  tiktok: 'text-white',
  discord: 'text-indigo-400',
  reddit: 'text-orange-500',
  whatsapp: 'text-green-500',
  telegram: 'text-sky-500',
  snapchat: 'text-yellow-400',
  wordpress: 'text-blue-300',
  medium: 'text-gray-300',
  ghost: 'text-teal-400',
  substack: 'text-orange-400',
  mailchimp: 'text-yellow-500',
  klaviyo: 'text-blue-400',
  convertkit: 'text-violet-400',
  general: 'text-muted-foreground',
};

const statusColors: Record<string, string> = {
  draft: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
  scheduled: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  published: 'bg-green-500/20 text-green-400 border-green-500/30',
  failed: 'bg-red-500/20 text-red-400 border-red-500/30',
  queued: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  processing: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
  posted: 'bg-green-500/20 text-green-400 border-green-500/30',
  pending: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
};

const statusIcons: Record<string, React.ElementType> = {
  draft: FileText,
  scheduled: Clock,
  published: CheckCircle2,
  failed: AlertCircle,
  queued: Clock,
  processing: Clock,
  posted: CheckCircle2,
  pending: Clock,
};

function normalizePost(raw: QueuedPostJob | BulkPost, source: 'queue' | 'bulk'): CalendarPost {
  const statusMap: Record<string, CalendarPost['status']> = {
    queued: 'scheduled',
    processing: 'scheduled',
    posted: 'published',
    failed: 'failed',
    pending: 'scheduled',
    scheduled: 'scheduled',
    published: 'published',
    draft: 'draft',
  };

  const isQueued = 'attempts' in raw;

  return {
    id: raw.id,
    text: isQueued ? raw.text : raw.content,
    platforms: raw.platforms,
    scheduledAt: raw.scheduledAt || (isQueued ? raw.createdAt : undefined),
    status: statusMap[raw.status] || 'draft',
    mediaUrl: isQueued ? raw.mediaUrl : (raw as BulkPost).imageUrl,
    error: isQueued ? raw.lastError : (raw as BulkPost).error,
    source,
    raw,
  };
}

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 1).getDay();
}

function formatDateKey(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function formatDisplayDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function formatTime(dateStr: string | undefined): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function ContentCalendar() {
  const today = new Date();
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [posts, setPosts] = useState<CalendarPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [selectedPost, setSelectedPost] = useState<CalendarPost | null>(null);
  const [draggedPost, setDraggedPost] = useState<CalendarPost | null>(null);
  const [dragOverDay, setDragOverDay] = useState<string | null>(null);

  const loadPosts = useCallback(async () => {
    setLoading(true);
    try {
      const [queueJobs, bulkPostsData] = await Promise.all([
        loadQueuedPostJobs(),
        getBulkPosts(),
      ]);

      const normalized: CalendarPost[] = [
        ...queueJobs.map((j) => normalizePost(j, 'queue')),
        ...bulkPostsData.map((p) => normalizePost(p, 'bulk')),
      ].filter((p) => p.scheduledAt);

      setPosts(normalized);
    } catch (error) {
      console.error('[ContentCalendar] Failed to load posts:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPosts();
  }, [loadPosts]);

  const postsByDay = useMemo(() => {
    const map: Record<string, CalendarPost[]> = {};
    for (const post of posts) {
      if (!post.scheduledAt) continue;
      const date = new Date(post.scheduledAt);
      const key = formatDateKey(date.getFullYear(), date.getMonth(), date.getDate());
      if (!map[key]) map[key] = [];
      map[key].push(post);
    }
    for (const key of Object.keys(map)) {
      map[key].sort((a, b) => new Date(a.scheduledAt || 0).getTime() - new Date(b.scheduledAt || 0).getTime());
    }
    return map;
  }, [posts]);

  const monthPosts = useMemo(() => {
    const map: Record<string, CalendarPost[]> = {};
    for (const [key, dayPosts] of Object.entries(postsByDay)) {
      const [y, m] = key.split('-').map(Number);
      if (y === currentYear && m === currentMonth + 1) {
        map[key] = dayPosts;
      }
    }
    return map;
  }, [postsByDay, currentYear, currentMonth]);

  const selectedDayPosts = useMemo(() => {
    if (!selectedDay) return [];
    return postsByDay[selectedDay] || [];
  }, [selectedDay, postsByDay]);

  const daysInMonth = getDaysInMonth(currentYear, currentMonth);
  const firstDay = getFirstDayOfMonth(currentYear, currentMonth);
  const prevMonthDays = getDaysInMonth(currentYear, currentMonth - 1);

  const monthName = new Date(currentYear, currentMonth).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });

  const prevMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear((y) => y - 1);
    } else {
      setCurrentMonth((m) => m - 1);
    }
  };

  const nextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear((y) => y + 1);
    } else {
      setCurrentMonth((m) => m + 1);
    }
  };

  const goToToday = () => {
    setCurrentMonth(today.getMonth());
    setCurrentYear(today.getFullYear());
  };

  const handleDragStart = (post: CalendarPost) => {
    setDraggedPost(post);
  };

  const handleDragOver = (e: React.DragEvent, dayKey: string) => {
    e.preventDefault();
    setDragOverDay(dayKey);
  };

  const handleDragLeave = () => {
    setDragOverDay(null);
  };

  const handleDrop = async (e: React.DragEvent, dayKey: string) => {
    e.preventDefault();
    setDragOverDay(null);

    if (!draggedPost) return;

    const [year, month, day] = dayKey.split('-').map(Number);
    const originalDate = new Date(draggedPost.scheduledAt || Date.now());
    const newDate = new Date(year, month - 1, day, originalDate.getHours(), originalDate.getMinutes());

    try {
      if (draggedPost.source === 'queue') {
        await updateQueuedPostJob(draggedPost.id, {
          scheduledAt: newDate.toISOString(),
        });
      } else {
        await updateBulkPostStatus(draggedPost.id, (draggedPost.raw as BulkPost).status);
        const bulkPosts = await getBulkPosts();
        const updated = bulkPosts.map((p) =>
          p.id === draggedPost.id
            ? { ...p, scheduledAt: newDate.toISOString() }
            : p
        );
        const { writeFile, PATHS } = await import('@/lib/services/puterService');
        await writeFile(`${PATHS.drafts}/bulk_posts.json`, updated);
      }

      setPosts((prev) =>
        prev.map((p) =>
          p.id === draggedPost.id ? { ...p, scheduledAt: newDate.toISOString() } : p
        )
      );
    } catch (error) {
      console.error('[ContentCalendar] Failed to reschedule:', error);
    }

    setDraggedPost(null);
  };

  const calendarDays: { day: number; currentMonth: boolean; dateKey: string }[] = [];

  for (let i = firstDay - 1; i >= 0; i--) {
    const d = prevMonthDays - i;
    const m = currentMonth === 0 ? 11 : currentMonth - 1;
    const y = currentMonth === 0 ? currentYear - 1 : currentYear;
    calendarDays.push({
      day: d,
      currentMonth: false,
      dateKey: formatDateKey(y, m, d),
    });
  }

  for (let d = 1; d <= daysInMonth; d++) {
    calendarDays.push({
      day: d,
      currentMonth: true,
      dateKey: formatDateKey(currentYear, currentMonth, d),
    });
  }

  const remaining = 42 - calendarDays.length;
  for (let d = 1; d <= remaining; d++) {
    const m = currentMonth === 11 ? 0 : currentMonth + 1;
    const y = currentMonth === 11 ? currentYear + 1 : currentYear;
    calendarDays.push({
      day: d,
      currentMonth: false,
      dateKey: formatDateKey(y, m, d),
    });
  }

  const isToday = (dateKey: string) => {
    const todayKey = formatDateKey(today.getFullYear(), today.getMonth(), today.getDate());
    return dateKey === todayKey;
  };

  if (loading) {
    return (
      <GlassCard className="min-h-[600px] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <CalendarIcon className="w-8 h-8 text-muted-foreground animate-pulse" />
          <span className="text-sm text-muted-foreground">Loading calendar...</span>
        </div>
      </GlassCard>
    );
  }

  return (
    <div className="space-y-4">
      <GlassCard padding="lg">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <CalendarIcon className="w-5 h-5 text-nexus-cyan" />
            <h2 className="text-lg font-semibold">{monthName}</h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={goToToday}
              className="px-3 py-1.5 text-xs rounded-lg bg-muted hover:bg-muted/80 transition-colors"
            >
              Today
            </button>
            <button
              onClick={prevMonth}
              className="p-2 rounded-lg hover:bg-muted/50 transition-colors"
              aria-label="Previous month"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={nextMonth}
              className="p-2 rounded-lg hover:bg-muted/50 transition-colors"
              aria-label="Next month"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-px mb-2">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
            <div
              key={day}
              className="text-center text-xs font-medium text-muted-foreground py-2"
            >
              {day}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-px">
          {calendarDays.map((dayInfo, idx) => {
            const dayPosts = monthPosts[dayInfo.dateKey] || [];
            const today = isToday(dayInfo.dateKey);
            const isDragOver = dragOverDay === dayInfo.dateKey;

            return (
              <div
                key={idx}
                className={cn(
                  'min-h-[90px] p-1.5 border border-border/30 rounded-lg transition-colors relative',
                  !dayInfo.currentMonth && 'opacity-40',
                  today && 'bg-muted/30',
                  isDragOver && 'bg-nexus-cyan/10 border-nexus-cyan/50',
                  'hover:bg-muted/20 cursor-pointer'
                )}
                onClick={() => setSelectedDay(dayInfo.dateKey)}
                onDragOver={(e) => handleDragOver(e, dayInfo.dateKey)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, dayInfo.dateKey)}
              >
                <div className="flex items-center justify-between mb-1">
                  <span
                    className={cn(
                      'text-xs font-medium w-6 h-6 flex items-center justify-center rounded-full',
                      today && 'bg-nexus-cyan text-black font-bold'
                    )}
                  >
                    {dayInfo.day}
                  </span>
                  {dayPosts.length > 0 && (
                    <span className="text-[10px] text-muted-foreground">
                      {dayPosts.length}
                    </span>
                  )}
                </div>

                <div className="space-y-1">
                  {dayPosts.slice(0, 3).map((post) => {
                    const StatusIcon = statusIcons[post.status] || FileText;
                    return (
                      <div
                        key={post.id}
                        draggable
                        onDragStart={() => handleDragStart(post)}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedPost(post);
                        }}
                        className={cn(
                          'px-1.5 py-0.5 rounded text-[10px] truncate cursor-grab active:cursor-grabbing border transition-opacity hover:opacity-80',
                          statusColors[post.status] || statusColors.draft
                        )}
                        title={post.text.slice(0, 100)}
                      >
                        <div className="flex items-center gap-1">
                          <StatusIcon className="w-2.5 h-2.5 shrink-0" />
                          <span className="truncate">{post.text.slice(0, 20)}</span>
                        </div>
                      </div>
                    );
                  })}
                  {dayPosts.length > 3 && (
                    <div className="text-[10px] text-muted-foreground pl-1.5">
                      +{dayPosts.length - 3} more
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </GlassCard>

      {selectedDay && (
        <GlassCard padding="lg">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold">
              {formatDisplayDate(new Date(selectedDay + 'T00:00:00'))}
            </h3>
            <button
              onClick={() => setSelectedDay(null)}
              className="p-1 rounded-lg hover:bg-muted/50 transition-colors"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {selectedDayPosts.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              No posts scheduled for this day
            </div>
          ) : (
            <div className="space-y-2">
              {selectedDayPosts.map((post) => {
                const StatusIcon = statusIcons[post.status] || FileText;
                return (
                  <div
                    key={post.id}
                    onClick={() => setSelectedPost(post)}
                    className="p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors cursor-pointer group"
                  >
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5">
                        <StatusIcon
                          className={cn(
                            'w-4 h-4',
                            post.status === 'published' && 'text-green-400',
                            post.status === 'scheduled' && 'text-amber-400',
                            post.status === 'failed' && 'text-red-400',
                            post.status === 'draft' && 'text-gray-400'
                          )}
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm line-clamp-2 mb-2">{post.text}</p>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs text-muted-foreground">
                            {formatTime(post.scheduledAt)}
                          </span>
                          <div className="flex items-center gap-1">
                            {post.platforms.map((platform) => {
                              const Icon = platformIcons[platform] || Globe;
                              return (
                                <Icon
                                  key={platform}
                                  className={cn('w-3.5 h-3.5', platformColors[platform])}
                                />
                              );
                            })}
                          </div>
                          <StatusBadge
                            status={post.status}
                            label={post.status}
                            size="sm"
                          />
                        </div>
                      </div>
                      <ExternalLink className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                    {post.error && (
                      <p className="text-xs text-red-400 mt-2 ml-7">{post.error}</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </GlassCard>
      )}

      {selectedPost && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={() => setSelectedPost(null)}
        >
          <div
            className="w-full max-w-lg max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <GlassCard padding="lg">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-2">
                  <StatusBadge
                    status={selectedPost.status}
                    label={selectedPost.status}
                    size="sm"
                  />
                  <span className="text-xs text-muted-foreground">
                    {formatDisplayDate(new Date(selectedPost.scheduledAt || Date.now()))}
                  </span>
                </div>
                <button
                  onClick={() => setSelectedPost(null)}
                  className="p-1 rounded-lg hover:bg-muted/50 transition-colors"
                  aria-label="Close"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="mb-4">
                <p className="text-sm whitespace-pre-wrap">{selectedPost.text}</p>
              </div>

              {selectedPost.mediaUrl && (
                <div className="mb-4 rounded-lg overflow-hidden">
                  <img
                    src={selectedPost.mediaUrl}
                    alt="Post media"
                    className="w-full h-auto max-h-64 object-cover"
                  />
                </div>
              )}

              <div className="space-y-3">
                <div>
                  <span className="text-xs text-muted-foreground mb-1.5 block">Platforms</span>
                  <div className="flex items-center gap-2 flex-wrap">
                    {selectedPost.platforms.map((platform) => {
                      const Icon = platformIcons[platform] || Globe;
                      return (
                        <div
                          key={platform}
                          className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-muted/50"
                        >
                          <Icon className={cn('w-3.5 h-3.5', platformColors[platform])} />
                          <span className="text-xs capitalize">{platform}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">
                    Scheduled: {formatTime(selectedPost.scheduledAt)}
                  </span>
                </div>

                {selectedPost.error && (
                  <div className="flex items-start gap-2 p-2 rounded-lg bg-red-500/10 border border-red-500/20">
                    <AlertCircle className="w-3.5 h-3.5 text-red-400 mt-0.5 shrink-0" />
                    <span className="text-xs text-red-400">{selectedPost.error}</span>
                  </div>
                )}

                <div className="flex items-center gap-2 pt-2 border-t border-border/30">
                  <MoreHorizontal className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">
                    Source: {selectedPost.source === 'queue' ? 'Post Queue' : 'Bulk Schedule'}
                  </span>
                </div>
              </div>
            </GlassCard>
          </div>
        </div>
      )}
    </div>
  );
}
