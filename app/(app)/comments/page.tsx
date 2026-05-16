'use client';

import { useState, useEffect } from 'react';
import { GlassCard } from '@/components/nexus/GlassCard';
import { NeonButton } from '@/components/nexus/NeonButton';
import {
  MessageSquare,
  ThumbsUp,
  ThumbsDown,
  Reply,
  Send,
  Sparkles,
  RefreshCw,
  Filter,
  ChevronDown,
  CheckCircle2,
  Clock,
  AlertCircle,
} from 'lucide-react';

interface Comment {
  id: string;
  platform: string;
  author: string;
  avatar?: string;
  content: string;
  timestamp: string;
  sentiment: 'positive' | 'negative' | 'neutral';
  likes: number;
  replied: boolean;
  replySuggestion?: string;
}

type FilterType = 'all' | 'positive' | 'negative' | 'neutral' | 'unreplied';

const PLATFORM_COLORS: Record<string, string> = {
  twitter: '#1DA1F2',
  instagram: '#E4405F',
  youtube: '#FF0000',
  linkedin: '#0A66C2',
  facebook: '#1877F2',
  tiktok: '#000000',
  threads: '#000000',
};

export default function CommentsPage() {
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterType>('all');
  const [replyText, setReplyText] = useState<Record<string, string>>({});
  const [generatingReply, setGeneratingReply] = useState<string | null>(null);
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);

  const filters: { value: FilterType; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { value: 'all', label: 'All Comments', icon: MessageSquare },
    { value: 'positive', label: 'Positive', icon: ThumbsUp },
    { value: 'negative', label: 'Negative', icon: ThumbsDown },
    { value: 'neutral', label: 'Neutral', icon: MessageSquare },
    { value: 'unreplied', label: 'Unreplied', icon: Clock },
  ];

  useEffect(() => {
    loadComments();
  }, []);

  const loadComments = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/social/comments');
      if (response.ok) {
        const data = await response.json();
        setComments(data.comments || generateSampleComments());
      } else {
        setComments(generateSampleComments());
      }
    } catch {
      setComments(generateSampleComments());
    } finally {
      setLoading(false);
    }
  };

  const generateSampleComments = (): Comment[] => [
    {
      id: '1',
      platform: 'twitter',
      author: '@techuser123',
      content: 'This is amazing content! Love the insights on AI trends.',
      timestamp: new Date(Date.now() - 3600000).toISOString(),
      sentiment: 'positive',
      likes: 12,
      replied: false,
      replySuggestion: 'Thank you so much! Glad you found it valuable. Stay tuned for more AI insights!',
    },
    {
      id: '2',
      platform: 'youtube',
      author: 'CreatorFan99',
      content: 'The video quality could be better, but the content is solid.',
      timestamp: new Date(Date.now() - 7200000).toISOString(),
      sentiment: 'neutral',
      likes: 5,
      replied: false,
      replySuggestion: 'Thanks for the feedback! We are working on improving video quality in our next uploads.',
    },
    {
      id: '3',
      platform: 'instagram',
      author: '@designlover',
      content: 'Not impressed. Expected more actionable tips.',
      timestamp: new Date(Date.now() - 10800000).toISOString(),
      sentiment: 'negative',
      likes: 2,
      replied: true,
    },
    {
      id: '4',
      platform: 'linkedin',
      author: 'Sarah Johnson',
      content: 'Great analysis! Sharing this with my team.',
      timestamp: new Date(Date.now() - 14400000).toISOString(),
      sentiment: 'positive',
      likes: 28,
      replied: false,
      replySuggestion: 'Thank you Sarah! Happy to discuss how your team can apply these insights.',
    },
    {
      id: '5',
      platform: 'tiktok',
      author: '@viralcreator',
      content: 'This trend is everywhere now!',
      timestamp: new Date(Date.now() - 18000000).toISOString(),
      sentiment: 'neutral',
      likes: 45,
      replied: true,
    },
  ];

  const filteredComments = comments.filter((comment) => {
    switch (filter) {
      case 'positive':
        return comment.sentiment === 'positive';
      case 'negative':
        return comment.sentiment === 'negative';
      case 'neutral':
        return comment.sentiment === 'neutral';
      case 'unreplied':
        return !comment.replied;
      default:
        return true;
    }
  });

  const generateAIReply = async (commentId: string) => {
    setGeneratingReply(commentId);
    try {
      const response = await fetch('/api/social/reply-suggestion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ commentId }),
      });

      if (response.ok) {
        const data = await response.json();
        setReplyText((prev) => ({ ...prev, [commentId]: data.suggestion || '' }));
      }
    } catch {
      const comment = comments.find((c) => c.id === commentId);
      if (comment?.replySuggestion) {
        setReplyText((prev) => ({ ...prev, [commentId]: comment.replySuggestion || '' }));
      }
    } finally {
      setGeneratingReply(null);
    }
  };

  const sendReply = async (commentId: string) => {
    const text = replyText[commentId];
    if (!text) return;

    try {
      const response = await fetch('/api/social/reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ commentId, text }),
      });

      if (response.ok) {
        setComments((prev) =>
          prev.map((c) => (c.id === commentId ? { ...c, replied: true } : c))
        );
        setReplyText((prev) => ({ ...prev, [commentId]: '' }));
      }
    } catch {
      setComments((prev) =>
        prev.map((c) => (c.id === commentId ? { ...c, replied: true } : c))
      );
      setReplyText((prev) => ({ ...prev, [commentId]: '' }));
    }
  };

  const timeAgo = (timestamp: string) => {
    const now = Date.now();
    const then = new Date(timestamp).getTime();
    const diff = now - then;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
  };

  const sentimentIcon = (sentiment: string) => {
    switch (sentiment) {
      case 'positive':
        return <ThumbsUp className="w-4 h-4 text-green-400" />;
      case 'negative':
        return <ThumbsDown className="w-4 h-4 text-red-400" />;
      default:
        return <MessageSquare className="w-4 h-4 text-gray-400" />;
    }
  };

  const ActiveFilterIcon = filters.find((f) => f.value === filter)?.icon || MessageSquare;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Comment Replies</h1>
          <p className="text-sm text-gray-400 mt-1">
            AI-powered reply suggestions for your social media comments
          </p>
        </div>
        <div className="flex items-center gap-2">
          <NeonButton variant="secondary" onClick={loadComments} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </NeonButton>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative">
          <button
            onClick={() => setShowFilterDropdown(!showFilterDropdown)}
            className="flex items-center gap-2 px-3 py-2 bg-gray-800 rounded-lg text-sm hover:bg-gray-700 transition-colors"
          >
            <ActiveFilterIcon className="w-4 h-4" />
            {filters.find((f) => f.value === filter)?.label}
            <ChevronDown className="w-3 h-3" />
          </button>
          {showFilterDropdown && (
            <div className="absolute top-full left-0 mt-1 bg-gray-800 rounded-lg shadow-xl border border-gray-700 z-10 min-w-[180px]">
              {filters.map((f) => {
                const Icon = f.icon;
                return (
                  <button
                    key={f.value}
                    onClick={() => {
                      setFilter(f.value);
                      setShowFilterDropdown(false);
                    }}
                    className={`flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-gray-700 transition-colors ${
                      filter === f.value ? 'bg-gray-700' : ''
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {f.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <span className="text-sm text-gray-400">
          {filteredComments.length} comment{filteredComments.length !== 1 ? 's' : ''}
        </span>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="w-6 h-6 animate-spin text-gray-400" />
        </div>
      ) : filteredComments.length === 0 ? (
        <GlassCard>
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <MessageSquare className="w-12 h-12 text-gray-500 mb-4" />
            <p className="text-gray-400">No comments match the current filter</p>
            <button
              onClick={() => setFilter('all')}
              className="mt-2 text-sm text-blue-400 hover:text-blue-300"
            >
              Show all comments
            </button>
          </div>
        </GlassCard>
      ) : (
        <div className="space-y-4">
          {filteredComments.map((comment) => (
            <GlassCard key={comment.id}>
              <div className="space-y-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold"
                      style={{ backgroundColor: PLATFORM_COLORS[comment.platform] || '#666' }}
                    >
                      {comment.author.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="font-medium text-sm">{comment.author}</p>
                      <p className="text-xs text-gray-400">
                        {comment.platform} &middot; {timeAgo(comment.timestamp)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {sentimentIcon(comment.sentiment)}
                    {comment.replied && (
                      <CheckCircle2 className="w-4 h-4 text-green-400" />
                    )}
                    <span className="text-xs text-gray-400 flex items-center gap-1">
                      <ThumbsUp className="w-3 h-3" /> {comment.likes}
                    </span>
                  </div>
                </div>

                <p className="text-sm text-gray-300 pl-11">{comment.content}</p>

                {!comment.replied && (
                  <div className="pl-11 space-y-2">
                    {!replyText[comment.id] && (
                      <button
                        onClick={() => generateAIReply(comment.id)}
                        disabled={generatingReply === comment.id}
                        className="flex items-center gap-2 text-xs text-purple-400 hover:text-purple-300 transition-colors disabled:opacity-50"
                      >
                        <Sparkles className="w-3 h-3" />
                        {generatingReply === comment.id
                          ? 'Generating suggestion...'
                          : 'Generate AI reply suggestion'}
                      </button>
                    )}

                    {replyText[comment.id] && (
                      <div className="space-y-2">
                        <textarea
                          value={replyText[comment.id]}
                          onChange={(e) =>
                            setReplyText((prev) => ({
                              ...prev,
                              [comment.id]: e.target.value,
                            }))
                          }
                          className="w-full bg-gray-900 border border-gray-700 rounded-lg p-2 text-sm resize-none focus:outline-none focus:border-purple-500"
                          rows={2}
                          placeholder="Type your reply..."
                        />
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => sendReply(comment.id)}
                            className="flex items-center gap-1 px-3 py-1 bg-purple-600 hover:bg-purple-500 rounded text-xs font-medium transition-colors"
                          >
                            <Send className="w-3 h-3" />
                            Send Reply
                          </button>
                          <button
                            onClick={() =>
                              setReplyText((prev) => ({ ...prev, [comment.id]: '' }))
                            }
                            className="text-xs text-gray-400 hover:text-gray-300"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {comment.replied && (
                  <div className="pl-11 flex items-center gap-2 text-xs text-green-400">
                    <CheckCircle2 className="w-3 h-3" />
                    Replied
                  </div>
                )}
              </div>
            </GlassCard>
          ))}
        </div>
      )}
    </div>
  );
}
