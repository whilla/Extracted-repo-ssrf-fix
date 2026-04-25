'use client';

import { useState } from 'react';
import { GlassCard } from '@/components/nexus/GlassCard';
import { NeonButton } from '@/components/nexus/NeonButton';
import { StatusBadge } from '@/components/nexus/StatusBadge';
import { saveDraft, loadBrandKit } from '@/lib/services/memoryService';
import { regenerateContent, editContentText } from '@/lib/services/contentEngine';
import { publishDraft } from '@/lib/services/publishService';
import { createApprovalRequest, runSafetyChecks } from '@/lib/services/publishSafetyService';
import type { ContentDraft } from '@/lib/types';
import { 
  Check, 
  X, 
  RefreshCw, 
  Edit2, 
  Calendar, 
  Send,
  Image as ImageIcon,
  Sparkles
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface ApprovalGateProps {
  draft: ContentDraft;
  onApprove: () => void;
  onEdit: (draft: ContentDraft) => void;
  onReject: () => void;
}

export function ApprovalGate({ draft, onApprove, onEdit, onReject }: ApprovalGateProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedText, setEditedText] = useState('');
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [showScheduler, setShowScheduler] = useState(false);
  const [scheduleDate, setScheduleDate] = useState('');
  const [scheduleTime, setScheduleTime] = useState('');

  const latestVersion = draft.versions[draft.versions.length - 1];

  const handleEdit = () => {
    setEditedText(latestVersion.text);
    setIsEditing(true);
  };

  const handleSaveEdit = async () => {
    if (!editedText.trim()) return;

    try {
      const updatedDraft = await editContentText(draft, editedText.trim());
      onEdit(updatedDraft);
      setIsEditing(false);
    } catch (error) {
      console.error('Edit error:', error);
    }
  };

  const handleRegenerate = async (what: 'text' | 'image' | 'both') => {
    setIsRegenerating(true);
    try {
      const updatedDraft = await regenerateContent(draft, what);
      onEdit(updatedDraft);
    } catch (error) {
      console.error('Regenerate error:', error);
      alert(`Failed to regenerate: ${(error as Error).message}`);
    } finally {
      setIsRegenerating(false);
    }
  };

  const handleApprove = async () => {
    draft.status = 'approved';
    await saveDraft(draft);
    onApprove();
  };

  const handlePublishNow = async () => {
    setIsPublishing(true);
    try {
      const brandKit = await loadBrandKit();
      const safety = await runSafetyChecks(latestVersion.text, draft.platforms, brandKit);
      if (!safety.passed || safety.requiresHumanReview) {
        await createApprovalRequest(
          draft.id,
          latestVersion.text,
          draft.platforms,
          undefined,
          latestVersion.imageUrl,
          latestVersion.imagePrompt || latestVersion.text.slice(0, 160)
        );
        draft.status = 'approved';
        await saveDraft(draft);
        alert('Content was sent to the approval queue before publishing.');
        onApprove();
      } else {
        const result = await publishDraft(draft, true);
        if (result.success) {
          draft.status = 'published';
          draft.publishedAt = new Date().toISOString();
          await saveDraft(draft);
          onApprove();
        } else {
          alert(`Publishing failed: ${Object.values(result.errors || {}).join(', ')}`);
        }
      }
    } catch (error) {
      console.error('Publish error:', error);
      alert(`Publishing failed: ${(error as Error).message}`);
    } finally {
      setIsPublishing(false);
    }
  };

  const handleSchedule = async () => {
    if (!scheduleDate || !scheduleTime) {
      alert('Please select a date and time');
      return;
    }

    const scheduledAt = new Date(`${scheduleDate}T${scheduleTime}`).toISOString();
    
    setIsPublishing(true);
    try {
      const brandKit = await loadBrandKit();
      const safety = await runSafetyChecks(latestVersion.text, draft.platforms, brandKit);
      if (!safety.passed || safety.requiresHumanReview) {
        await createApprovalRequest(
          draft.id,
          latestVersion.text,
          draft.platforms,
          scheduledAt,
          latestVersion.imageUrl,
          latestVersion.imagePrompt || latestVersion.text.slice(0, 160)
        );
        draft.status = 'approved';
        draft.scheduledAt = scheduledAt;
        await saveDraft(draft);
        alert('Content was sent to the approval queue before scheduling.');
        onApprove();
      } else {
        const result = await publishDraft({ ...draft, scheduledAt }, false);
        if (result.success) {
          draft.status = 'scheduled';
          draft.scheduledAt = scheduledAt;
          await saveDraft(draft);
          onApprove();
        } else {
          alert(`Scheduling failed: ${Object.values(result.errors || {}).join(', ')}`);
        }
      }
    } catch (error) {
      console.error('Schedule error:', error);
      alert(`Scheduling failed: ${(error as Error).message}`);
    } finally {
      setIsPublishing(false);
      setShowScheduler(false);
    }
  };

  return (
    <GlassCard variant="bordered" padding="lg" className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[var(--nexus-cyan)] to-[var(--nexus-violet)] flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-background" />
          </div>
          <div>
            <h3 className="font-semibold">Review Generated Content</h3>
            <p className="text-sm text-muted-foreground">
              Human approval required before publishing
            </p>
          </div>
        </div>
        <StatusBadge status="warning" label="Pending Review" />
      </div>

      {/* Content Preview */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Text */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium">Post Text</h4>
            <div className="flex gap-1">
              <button
                onClick={handleEdit}
                className="p-1.5 rounded hover:bg-muted/50 transition-colors"
                aria-label="Edit text"
              >
                <Edit2 className="w-4 h-4 text-muted-foreground" />
              </button>
              <button
                onClick={() => handleRegenerate('text')}
                disabled={isRegenerating}
                className="p-1.5 rounded hover:bg-muted/50 transition-colors"
                aria-label="Regenerate text"
              >
                <RefreshCw className={cn('w-4 h-4 text-muted-foreground', isRegenerating && 'animate-spin')} />
              </button>
            </div>
          </div>

          {isEditing ? (
            <div className="space-y-2">
              <textarea
                value={editedText}
                onChange={(e) => setEditedText(e.target.value)}
                rows={6}
                className="w-full px-4 py-3 rounded-lg bg-input border border-border focus:border-[var(--nexus-cyan)] focus:outline-none focus:ring-1 focus:ring-[var(--nexus-cyan)] resize-none text-sm"
              />
              <div className="flex gap-2">
                <NeonButton size="sm" onClick={handleSaveEdit}>
                  Save
                </NeonButton>
                <NeonButton variant="ghost" size="sm" onClick={() => setIsEditing(false)}>
                  Cancel
                </NeonButton>
              </div>
            </div>
          ) : (
            <div className="p-4 rounded-lg bg-muted/30 border border-border">
              <p className="text-sm whitespace-pre-wrap">{latestVersion.text}</p>
            </div>
          )}

          {/* Platforms */}
          <div className="flex flex-wrap gap-2">
            {draft.platforms.map((platform) => (
              <span
                key={platform}
                className="px-3 py-1 rounded-full bg-muted text-xs capitalize"
              >
                {platform}
              </span>
            ))}
          </div>
        </div>

        {/* Image */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium">Generated Image</h4>
            {latestVersion.imageUrl && (
              <button
                onClick={() => handleRegenerate('image')}
                disabled={isRegenerating}
                className="p-1.5 rounded hover:bg-muted/50 transition-colors"
                aria-label="Regenerate image"
              >
                <RefreshCw className={cn('w-4 h-4 text-muted-foreground', isRegenerating && 'animate-spin')} />
              </button>
            )}
          </div>

          {latestVersion.imageUrl ? (
            <div className="rounded-lg overflow-hidden border border-border">
              <img
                src={latestVersion.imageUrl}
                alt="Generated content"
                className="w-full aspect-square object-cover"
              />
            </div>
          ) : (
            <div className="rounded-lg border border-border bg-muted/30 aspect-square flex items-center justify-center">
              <div className="text-center">
                <ImageIcon className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">No image generated</p>
                <NeonButton
                  variant="ghost"
                  size="sm"
                  onClick={() => handleRegenerate('image')}
                  disabled={isRegenerating}
                  className="mt-2"
                >
                  Generate Image
                </NeonButton>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Scheduler */}
      {showScheduler && (
        <div className="p-4 rounded-lg bg-muted/30 border border-border space-y-4">
          <h4 className="font-medium">Schedule Post</h4>
          <div className="flex flex-wrap gap-4">
            <div>
              <label className="block text-sm text-muted-foreground mb-1">Date</label>
              <input
                type="date"
                value={scheduleDate}
                onChange={(e) => setScheduleDate(e.target.value)}
                min={new Date().toISOString().split('T')[0]}
                className="px-4 py-2 rounded-lg bg-input border border-border focus:border-[var(--nexus-cyan)] focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-sm text-muted-foreground mb-1">Time</label>
              <input
                type="time"
                value={scheduleTime}
                onChange={(e) => setScheduleTime(e.target.value)}
                className="px-4 py-2 rounded-lg bg-input border border-border focus:border-[var(--nexus-cyan)] focus:outline-none"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <NeonButton onClick={handleSchedule} loading={isPublishing}>
              <Calendar className="w-4 h-4 mr-2" />
              Schedule
            </NeonButton>
            <NeonButton variant="ghost" onClick={() => setShowScheduler(false)}>
              Cancel
            </NeonButton>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-3 pt-4 border-t border-border">
        <NeonButton onClick={handleApprove} icon={<Check className="w-4 h-4" />}>
          Approve & Save
        </NeonButton>
        
        <NeonButton
          variant="secondary"
          onClick={handlePublishNow}
          loading={isPublishing && !showScheduler}
          icon={<Send className="w-4 h-4" />}
        >
          Publish Now
        </NeonButton>

        <NeonButton
          variant="ghost"
          onClick={() => setShowScheduler(!showScheduler)}
          icon={<Calendar className="w-4 h-4" />}
        >
          Schedule
        </NeonButton>

        <div className="flex-1" />

        <NeonButton variant="danger" onClick={onReject} icon={<X className="w-4 h-4" />}>
          Discard
        </NeonButton>
      </div>
    </GlassCard>
  );
}
