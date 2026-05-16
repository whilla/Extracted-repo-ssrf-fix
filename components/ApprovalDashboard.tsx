'use client';

import React, { useState, useMemo } from 'react';
import {
  CheckCircle2,
  XCircle,
  Clock,
  BarChart3,
  CheckCheck,
  X,
  MessageSquare,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  TrendingUp,
  Timer,
  Inbox,
} from 'lucide-react';
import { GlassCard } from '@/components/nexus/GlassCard';
import type { ApprovalItem } from '@/lib/services/approvalQueueService';

interface ApprovalDashboardProps {
  items: ApprovalItem[];
  onApprove: (id: string, feedback?: string) => void;
  onReject: (id: string, feedback?: string) => void;
  onBulkApprove: (ids: string[]) => void;
  onBulkReject: (ids: string[], feedback?: string) => void;
}

type Tab = 'pending' | 'approved' | 'rejected';

export function ApprovalDashboard({
  items,
  onApprove,
  onReject,
  onBulkApprove,
  onBulkReject,
}: ApprovalDashboardProps) {
  const [activeTab, setActiveTab] = useState<Tab>('pending');
  const [selectedItem, setSelectedItem] = useState<ApprovalItem | null>(null);
  const [feedback, setFeedback] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [bulkFeedback, setBulkFeedback] = useState('');
  const [showBulkFeedback, setShowBulkFeedback] = useState(false);

  const filteredItems = useMemo(
    () => items.filter((item) => item.status === activeTab),
    [items, activeTab]
  );

  const stats = useMemo(() => {
    const pending = items.filter((i) => i.status === 'pending').length;
    const approved = items.filter((i) => i.status === 'approved').length;
    const rejected = items.filter((i) => i.status === 'rejected').length;
    const total = approved + rejected;
    const approvalRate = total > 0 ? ((approved / total) * 100).toFixed(1) : '0.0';
    const avgReviewTime = '2.4h';
    return { pending, approved, rejected, approvalRate, avgReviewTime };
  }, [items]);

  const toggleSelection = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedIds(next);
  };

  const toggleExpand = (id: string) => {
    const next = new Set(expandedItems);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setExpandedItems(next);
  };

  const selectAll = () => {
    if (selectedIds.size === filteredItems.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredItems.map((i) => i.id)));
    }
  };

  const handleApprove = (id: string) => {
    onApprove(id, feedback || undefined);
    setSelectedItem(null);
    setFeedback('');
  };

  const handleReject = (id: string) => {
    onReject(id, feedback || undefined);
    setSelectedItem(null);
    setFeedback('');
  };

  const handleBulkApprove = () => {
    onBulkApprove(Array.from(selectedIds));
    setSelectedIds(new Set());
  };

  const handleBulkReject = () => {
    onBulkReject(Array.from(selectedIds), bulkFeedback || undefined);
    setSelectedIds(new Set());
    setBulkFeedback('');
    setShowBulkFeedback(false);
  };

  const getPriorityColor = (priority?: string) => {
    switch (priority) {
      case 'high':
        return 'bg-red-500/20 text-red-400 border-red-500/30';
      case 'medium':
        return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
      case 'low':
        return 'bg-green-500/20 text-green-400 border-green-500/30';
      default:
        return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
    }
  };

  const getPlatformIcon = (platform: string) => {
    switch (platform.toLowerCase()) {
      case 'twitter':
      case 'x':
        return '𝕏';
      case 'linkedin':
        return 'in';
      case 'facebook':
        return 'f';
      case 'instagram':
        return '📷';
      default:
        return platform.charAt(0).toUpperCase();
    }
  };

  const formatTimestamp = (timestamp?: string) => {
    if (!timestamp) return 'N/A';
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    if (diffHours < 1) return 'Just now';
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  const truncateContent = (content: string, length: number) => {
    return content.length > length ? `${content.substring(0, length)}...` : content;
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <GlassCard variant="bordered" padding="md">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-yellow-500/20">
              <Clock className="w-5 h-5 text-yellow-400" />
            </div>
            <div>
              <p className="text-sm text-gray-400">Pending</p>
              <p className="text-2xl font-bold">{stats.pending}</p>
            </div>
          </div>
        </GlassCard>

        <GlassCard variant="bordered" padding="md">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-green-500/20">
              <CheckCircle2 className="w-5 h-5 text-green-400" />
            </div>
            <div>
              <p className="text-sm text-gray-400">Approved</p>
              <p className="text-2xl font-bold">{stats.approved}</p>
            </div>
          </div>
        </GlassCard>

        <GlassCard variant="bordered" padding="md">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-500/20">
              <TrendingUp className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <p className="text-sm text-gray-400">Approval Rate</p>
              <p className="text-2xl font-bold">{stats.approvalRate}%</p>
            </div>
          </div>
        </GlassCard>

        <GlassCard variant="bordered" padding="md">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-purple-500/20">
              <Timer className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <p className="text-sm text-gray-400">Avg Review Time</p>
              <p className="text-2xl font-bold">{stats.avgReviewTime}</p>
            </div>
          </div>
        </GlassCard>
      </div>

      <GlassCard variant="elevated" padding="lg">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <Inbox className="w-5 h-5" />
            <h2 className="text-lg font-semibold">Approval Queue</h2>
          </div>
          <div className="flex gap-1 p-1 rounded-lg bg-gray-800/50">
            {(['pending', 'approved', 'rejected'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => {
                  setActiveTab(tab);
                  setSelectedIds(new Set());
                }}
                className={`px-4 py-2 text-sm rounded-md transition-colors ${
                  activeTab === tab
                    ? 'bg-blue-500 text-white'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {activeTab === 'pending' && selectedIds.size > 0 && (
          <div className="mb-4 p-4 rounded-lg bg-blue-500/10 border border-blue-500/20">
            <div className="flex items-center justify-between">
              <span className="text-sm text-blue-300">
                {selectedIds.size} item{selectedIds.size > 1 ? 's' : ''} selected
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleBulkApprove}
                  className="flex items-center gap-2 px-3 py-1.5 text-sm rounded-md bg-green-500/20 text-green-400 hover:bg-green-500/30 transition-colors"
                >
                  <CheckCheck className="w-4 h-4" />
                  Bulk Approve
                </button>
                <button
                  onClick={() => setShowBulkFeedback(!showBulkFeedback)}
                  className="flex items-center gap-2 px-3 py-1.5 text-sm rounded-md bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors"
                >
                  <XCircle className="w-4 h-4" />
                  Bulk Reject
                </button>
              </div>
            </div>
            {showBulkFeedback && (
              <div className="mt-3 flex gap-2">
                <input
                  type="text"
                  value={bulkFeedback}
                  onChange={(e) => setBulkFeedback(e.target.value)}
                  placeholder="Optional rejection reason..."
                  className="flex-1 px-3 py-2 text-sm rounded-md bg-gray-800/50 border border-gray-700 focus:border-blue-500 focus:outline-none"
                />
                <button
                  onClick={handleBulkReject}
                  className="px-4 py-2 text-sm rounded-md bg-red-500 text-white hover:bg-red-600 transition-colors"
                >
                  Confirm Reject
                </button>
              </div>
            )}
          </div>
        )}

        <div className="space-y-2">
          {filteredItems.length === 0 ? (
            <div className="py-12 text-center text-gray-500">
              <AlertCircle className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>No {activeTab} items</p>
            </div>
          ) : (
            filteredItems.map((item) => (
              <div
                key={item.id}
                className={`p-4 rounded-lg border transition-all ${
                  selectedItem?.id === item.id
                    ? 'border-blue-500/50 bg-blue-500/5'
                    : 'border-gray-700/50 hover:border-gray-600/50'
                }`}
              >
                <div className="flex items-start gap-3">
                  {activeTab === 'pending' && (
                    <input
                      type="checkbox"
                      checked={selectedIds.has(item.id)}
                      onChange={() => toggleSelection(item.id)}
                      className="mt-1 w-4 h-4 rounded border-gray-600 bg-gray-800 text-blue-500 focus:ring-blue-500"
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="flex items-center justify-center w-6 h-6 rounded-full bg-gray-700 text-xs font-medium">
                        {getPlatformIcon(item.platform)}
                      </span>
                      <span className="text-sm font-medium truncate">
                        {item.platform}
                      </span>
                      <span
                        className={`px-2 py-0.5 text-xs rounded-full border ${getPriorityColor(item.priority)}`}
                      >
                        {item.priority || 'medium'}
                      </span>
                      <span className="ml-auto text-xs text-gray-500">
                        {formatTimestamp(item.createdAt)}
                      </span>
                      <button
                        onClick={() => toggleExpand(item.id)}
                        className="text-gray-500 hover:text-gray-300"
                      >
                        {expandedItems.has(item.id) ? (
                          <ChevronUp className="w-4 h-4" />
                        ) : (
                          <ChevronDown className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                    <p className="text-sm text-gray-300">
                      {expandedItems.has(item.id)
                        ? item.content
                        : truncateContent(item.content, 120)}
                    </p>
                    {item.metadata?.score !== undefined && (
                      <div className="mt-2 flex items-center gap-1 text-xs text-gray-500">
                        <BarChart3 className="w-3 h-3" />
                        Score: {String(item.metadata.score)}
                      </div>
                    )}
                  </div>
                </div>

                {activeTab === 'pending' && (
                  <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-700/50">
                    <button
                      onClick={() => setSelectedItem(item)}
                      className="flex items-center gap-1 px-3 py-1.5 text-xs rounded-md bg-gray-700/50 hover:bg-gray-700 transition-colors"
                    >
                      <MessageSquare className="w-3 h-3" />
                      Review
                    </button>
                    <button
                      onClick={() => handleApprove(item.id)}
                      className="flex items-center gap-1 px-3 py-1.5 text-xs rounded-md bg-green-500/20 text-green-400 hover:bg-green-500/30 transition-colors"
                    >
                      <CheckCircle2 className="w-3 h-3" />
                      Approve
                    </button>
                    <button
                      onClick={() => handleReject(item.id)}
                      className="flex items-center gap-1 px-3 py-1.5 text-xs rounded-md bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors"
                    >
                      <XCircle className="w-3 h-3" />
                      Reject
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </GlassCard>

      {selectedItem && (
        <GlassCard variant="bordered" padding="lg">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h3 className="text-lg font-semibold">Review Item</h3>
              <div className="flex items-center gap-2 mt-1">
                <span className="flex items-center justify-center w-5 h-5 rounded-full bg-gray-700 text-xs font-medium">
                  {getPlatformIcon(selectedItem.platform)}
                </span>
                <span className="text-sm text-gray-400">{selectedItem.platform}</span>
                <span
                  className={`px-2 py-0.5 text-xs rounded-full border ${getPriorityColor(selectedItem.priority)}`}
                >
                  {selectedItem.priority || 'medium'}
                </span>
              </div>
            </div>
            <button
              onClick={() => {
                setSelectedItem(null);
                setFeedback('');
              }}
              className="p-1 rounded-md hover:bg-gray-700/50 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-4 rounded-lg bg-gray-800/50 mb-4">
            <p className="text-sm whitespace-pre-wrap">{selectedItem.content}</p>
          </div>

          {selectedItem.metadata?.score !== undefined && (
            <div className="mb-4 flex items-center gap-2 text-sm text-gray-400">
              <BarChart3 className="w-4 h-4" />
              Score: {String(selectedItem.metadata.score)}
            </div>
          )}

          <div className="mb-4">
            <label className="block text-sm font-medium mb-2">Feedback</label>
            <textarea
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder="Add optional feedback..."
              rows={3}
              className="w-full px-3 py-2 text-sm rounded-lg bg-gray-800/50 border border-gray-700 focus:border-blue-500 focus:outline-none resize-none"
            />
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => handleApprove(selectedItem.id)}
              className="flex items-center gap-2 px-4 py-2 text-sm rounded-lg bg-green-500 text-white hover:bg-green-600 transition-colors"
            >
              <CheckCircle2 className="w-4 h-4" />
              Approve
            </button>
            <button
              onClick={() => handleReject(selectedItem.id)}
              className="flex items-center gap-2 px-4 py-2 text-sm rounded-lg bg-red-500 text-white hover:bg-red-600 transition-colors"
            >
              <XCircle className="w-4 h-4" />
              Reject
            </button>
          </div>
        </GlassCard>
      )}
    </div>
  );
}
