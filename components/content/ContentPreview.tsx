'use client';

import { useState } from 'react';
import { GlassCard } from '@/components/nexus/GlassCard';

type Platform = 'twitter' | 'instagram' | 'linkedin' | 'facebook' | 'tiktok' | 'youtube';

interface ContentPreviewProps {
  content: string;
  title?: string;
  platform?: Platform;
  mediaUrls?: string[];
  onClose?: () => void;
}

const PLATFORM_STYLES: Record<Platform, { bg: string; text: string; accent: string; name: string; charLimit: number }> = {
  twitter: { bg: '#000000', text: '#e7e9ea', accent: '#1d9bf0', name: 'Twitter / X', charLimit: 280 },
  instagram: { bg: '#ffffff', text: '#262626', accent: '#e1306c', name: 'Instagram', charLimit: 2200 },
  linkedin: { bg: '#ffffff', text: '#191919', accent: '#0a66c2', name: 'LinkedIn', charLimit: 3000 },
  facebook: { bg: '#ffffff', text: '#1c1e21', accent: '#1877f2', name: 'Facebook', charLimit: 63206 },
  tiktok: { bg: '#121212', text: '#ffffff', accent: '#fe2c55', name: 'TikTok', charLimit: 2200 },
  youtube: { bg: '#0f0f0f', text: '#f1f1f1', accent: '#ff0000', name: 'YouTube', charLimit: 5000 },
};

function PlatformPreview({ content, title, platform, mediaUrls }: ContentPreviewProps) {
  const style = PLATFORM_STYLES[platform || 'twitter'];
  const charCount = content.length;
  const remaining = style.charLimit - charCount;
  const isOverLimit = remaining < 0;

  return (
    <div
      className="rounded-xl overflow-hidden border border-gray-700/50"
      style={{ background: style.bg, color: style.text }}
    >
      {/* Platform header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-700/30">
        <div className="w-8 h-8 rounded-full" style={{ background: style.accent }} />
        <div>
          <p className="text-sm font-semibold" style={{ color: style.text }}>{style.name}</p>
          <p className="text-xs opacity-60">{charCount} / {style.charLimit} chars</p>
        </div>
        {isOverLimit && (
          <span className="ml-auto text-xs font-medium text-red-400">
            {Math.abs(remaining)} over limit
          </span>
        )}
      </div>

      {/* Content body */}
      <div className="px-4 py-3">
        {platform === 'youtube' ? (
          <>
            <div className="rounded-lg overflow-hidden bg-gray-800/50 aspect-video mb-3 flex items-center justify-center">
              <div className="text-center">
                <span className="text-4xl opacity-30">▶</span>
                <p className="text-xs opacity-50 mt-1">Video thumbnail</p>
              </div>
            </div>
            <h3 className="text-base font-bold mb-1" style={{ color: style.text }}>{title || 'Video Title'}</h3>
            <div className="flex items-center gap-2 text-xs opacity-60 mb-2">
              <span>Your Channel</span>
              <span>•</span>
              <span>1.2K views</span>
              <span>•</span>
              <span>2 hours ago</span>
            </div>
            <p className="text-sm leading-relaxed whitespace-pre-wrap font-[system-ui]" style={{ color: style.text }}>
              {content}
            </p>
          </>
        ) : (
          <>
            {title && (
              <h3 className="text-base font-bold mb-2" style={{ color: style.text }}>{title}</h3>
            )}
            <p className="text-sm leading-relaxed whitespace-pre-wrap font-[system-ui]" style={{ color: style.text }}>
              {content}
            </p>
          </>
        )}
      </div>

      {/* Media preview */}
      {mediaUrls && mediaUrls.length > 0 && (
        <div className="px-4 pb-3">
          <div className="rounded-lg overflow-hidden bg-gray-800/50 aspect-video flex items-center justify-center">
            <span className="text-xs opacity-50">{mediaUrls.length} media item(s)</span>
          </div>
        </div>
      )}

      {/* Action bar */}
      <div className="flex items-center gap-6 px-4 py-2 border-t border-gray-700/30 text-sm opacity-60">
        <span>💬</span>
        <span>🔁</span>
        <span>❤️</span>
        <span>🔗</span>
      </div>

      {isOverLimit && (
        <div className="px-4 py-2 bg-red-500/10 border-t border-red-500/30">
          <p className="text-xs text-red-400">
            Content exceeds {style.name}&apos;s {style.charLimit} character limit by {Math.abs(remaining)} characters.
          </p>
        </div>
      )}
    </div>
  );
}

export function ContentPreview({ content, title, mediaUrls, onClose }: ContentPreviewProps) {
  const [selectedPlatform, setSelectedPlatform] = useState<Platform>('twitter');

  if (!content) return null;

  return (
    <GlassCard className="p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-white">Content Preview</h3>
        {onClose && (
          <button onClick={onClose} className="text-gray-400 hover:text-white text-sm">Close</button>
        )}
      </div>

      {/* Platform selector */}
      <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
        {(Object.keys(PLATFORM_STYLES) as Platform[]).map(p => (
          <button
            key={p}
            onClick={() => setSelectedPlatform(p)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
              selectedPlatform === p
                ? 'bg-nexus-cyan/20 text-nexus-cyan border border-nexus-cyan/30'
                : 'bg-secondary/10 text-muted-foreground border border-border/50 hover:border-nexus-cyan/30'
            }`}
          >
            {PLATFORM_STYLES[p].name}
          </button>
        ))}
      </div>

      {/* Preview */}
      <PlatformPreview
        content={content}
        title={title}
        platform={selectedPlatform}
        mediaUrls={mediaUrls}
      />
    </GlassCard>
  );
}
