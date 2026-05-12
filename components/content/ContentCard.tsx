'use client';

import { useState } from 'react';
import { GlassCard } from '@/components/nexus/GlassCard';
import { StatusBadge } from '@/components/nexus/StatusBadge';
import { NeonButton } from '@/components/nexus/NeonButton';
import { deleteDraft, saveDraft } from '@/lib/services/memoryService';
import type { ContentDraft } from '@/lib/types';
import { Calendar, Trash2, Edit2, Copy, MoreVertical, Image as ImageIcon, Eye } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ContentPreview } from './ContentPreview';

interface ContentCardProps {
  draft: ContentDraft;
  currentVersion?: { v: number; text: string; imageUrl?: string; score?: number; createdAt: string };
  onUpdate?: () => void;
  onSchedule?: (draft: ContentDraft) => void;
  onDelete?: () => void;
  onDuplicate?: () => void;
}

export function ContentCard({ draft, currentVersion, onUpdate, onSchedule, onDelete, onDuplicate }: ContentCardProps) {
  const [showMenu, setShowMenu] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const latestVersion = currentVersion || draft.versions[draft.versions.length - 1];
  const statusMap: Record<string, 'success' | 'warning' | 'error' | 'info' | 'pending'> = {
    draft: 'pending',
    approved: 'info',
    scheduled: 'warning',
    published: 'success',
    failed: 'error',
  };

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this draft?')) return;
    
    setIsDeleting(true);
    try {
      if (onDelete) {
        await onDelete();
      } else {
        await deleteDraft(draft.id);
        onUpdate?.();
      }
    } catch (error) {
      console.error('Delete error:', error);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(latestVersion.text);
    // Could add a toast notification here
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <GlassCard className="relative group">
      {/* Preview modal */}
      {showPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setShowPreview(false)}>
          <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <ContentPreview
              content={latestVersion.text}
              title={draft.title}
              mediaUrls={draft.mediaUrls}
              onClose={() => setShowPreview(false)}
            />
          </div>
        </div>
      )}
      {/* Status Badge */}
      <div className="flex items-center justify-between mb-3">
        <StatusBadge status={statusMap[draft.status]} label={draft.status} />
        <span className="text-xs text-muted-foreground">{formatDate(draft.updated)}</span>
      </div>

      {/* Image Preview */}
      {latestVersion.imageUrl && (
        <div className="relative mb-3 rounded-lg overflow-hidden aspect-video bg-muted">
          <img
            src={latestVersion.imageUrl}
            alt="Generated content"
            className="w-full h-full object-cover"
          />
          <div className="absolute bottom-2 left-2">
            <span className="px-2 py-1 rounded-full bg-background/80 backdrop-blur-sm text-xs">
              AI Generated
            </span>
          </div>
        </div>
      )}

      {/* Content Preview */}
      <p className="text-sm line-clamp-3 mb-3">
        {latestVersion.text}
      </p>

      {/* Platforms */}
      <div className="flex flex-wrap gap-1 mb-3">
        {draft.platforms.map((platform) => (
          <span
            key={platform}
            className={cn(
              'px-2 py-0.5 rounded-full text-xs capitalize',
              'bg-muted text-muted-foreground'
            )}
          >
            {platform}
          </span>
        ))}
      </div>

      {/* Version indicator */}
      {draft.versions.length > 1 && (
        <p className="text-xs text-muted-foreground mb-3">
          v{latestVersion.v} of {draft.versions.length} versions
        </p>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setShowPreview(true)}
          className="p-2 rounded-lg hover:bg-muted/50 transition-colors"
          aria-label="Preview content"
        >
          <Eye className="w-4 h-4 text-nexus-cyan" />
        </button>
        {draft.status === 'draft' && onSchedule && (
          <NeonButton
            variant="secondary"
            size="sm"
            onClick={() => onSchedule(draft)}
            icon={<Calendar className="w-3 h-3" />}
          >
            Schedule
          </NeonButton>
        )}
        
        <button
          onClick={handleCopy}
          className="p-2 rounded-lg hover:bg-muted/50 transition-colors"
          aria-label="Copy content"
        >
          <Copy className="w-4 h-4 text-muted-foreground" />
        </button>

        {/* Menu */}
        <div className="relative ml-auto">
          <button
            onClick={() => setShowMenu(!showMenu)}
            className="p-2 rounded-lg hover:bg-muted/50 transition-colors"
            aria-label="More options"
          >
            <MoreVertical className="w-4 h-4 text-muted-foreground" />
          </button>

          {showMenu && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => setShowMenu(false)}
              />
              <div className="absolute right-0 bottom-full mb-2 w-40 glass-card rounded-lg p-1 z-20">
                <button
                  onClick={() => {
                    setShowMenu(false);
                    setShowPreview(true);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-muted/50 text-sm"
                >
                  <Eye className="w-4 h-4" />
                  Preview
                </button>
                <button
                  onClick={() => {
                    setShowMenu(false);
                    handleCopy();
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-muted/50 text-sm"
                >
                  <Copy className="w-4 h-4" />
                  Copy text
                </button>
                <button
                  onClick={() => {
                    setShowMenu(false);
                    handleDelete();
                  }}
                  disabled={isDeleting}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-destructive/20 text-sm text-destructive"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </GlassCard>
  );
}
