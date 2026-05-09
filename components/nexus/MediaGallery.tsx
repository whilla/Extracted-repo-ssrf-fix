'use client';

import { useState, useRef, useEffect } from 'react';
import { GlassCard } from './GlassCard';

export type MediaType = 'image' | 'video' | 'audio' | 'music' | 'document' | 'text';

export interface MediaAsset {
  id: string;
  type: MediaType;
  name: string;
  url: string;
  thumbnail?: string;
  duration?: number;
  size?: number;
  createdAt: string;
  metadata?: {
    prompt?: string;
    provider?: string;
    model?: string;
    dimensions?: string;
    format?: string;
  };
}

interface MediaGalleryProps {
  assets: MediaAsset[];
  onSelect?: (asset: MediaAsset) => void;
  onDelete?: (id: string) => void;
  onDownload?: (asset: MediaAsset) => void;
  loading?: boolean;
}

export function MediaGallery({ assets, onSelect, onDelete, onDownload, loading }: MediaGalleryProps) {
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [selectedAsset, setSelectedAsset] = useState<MediaAsset | null>(null);
  const [filter, setFilter] = useState<MediaType | 'all'>('all');

  const filteredAssets = filter === 'all' ? assets : assets.filter(a => a.type === filter);

  const formatDuration = (seconds?: number) => {
    if (!seconds) return '--:--';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatSize = (bytes?: number) => {
    if (!bytes) return '--';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getTypeIcon = (type: MediaType) => {
    switch (type) {
      case 'image': return '🖼️';
      case 'video': return '🎬';
      case 'audio': return '🎙️';
      case 'music': return '🎵';
      case 'document': return '📄';
      case 'text': return '📝';
    }
  };

  const getTypeLabel = (type: MediaType) => {
    return type.charAt(0).toUpperCase() + type.slice(1);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex gap-2">
          {(['all', 'image', 'video', 'audio', 'music', 'document'] as const).map(type => (
            <button
              key={type}
              onClick={() => setFilter(type)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                filter === type 
                  ? 'bg-violet/30 text-violet border border-violet/50' 
                  : 'bg-bg-glass text-gray-400 border border-border hover:text-white'
              }`}
            >
              {type === 'all' ? 'All' : getTypeIcon(type as MediaType) + ' ' + (type === 'all' ? 'All' : getTypeLabel(type as MediaType))}
            </button>
          ))}
        </div>

        <div className="flex gap-2 ml-auto">
          <button
            onClick={() => setViewMode('grid')}
            className={`p-2 rounded-lg ${viewMode === 'grid' ? 'bg-violet/20 text-violet' : 'bg-bg-glass text-gray-400'}`}
          >
            ⊞
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={`p-2 rounded-lg ${viewMode === 'list' ? 'bg-violet/20 text-violet' : 'bg-bg-glass text-gray-400'}`}
          >
            ☰
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-32">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-violet"></div>
        </div>
      ) : filteredAssets.length === 0 ? (
        <GlassCard className="p-8 text-center">
          <p className="text-gray-400">No media assets found</p>
          <p className="text-sm text-gray-500 mt-2">Generate content using the agent tools</p>
        </GlassCard>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {filteredAssets.map(asset => (
            <MediaCard
              key={asset.id}
              asset={asset}
              onClick={() => {
                setSelectedAsset(asset);
                onSelect?.(asset);
              }}
              onDelete={() => onDelete?.(asset.id)}
              formatDuration={formatDuration}
              formatSize={formatSize}
            />
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {filteredAssets.map(asset => (
            <MediaListItem
              key={asset.id}
              asset={asset}
              onClick={() => {
                setSelectedAsset(asset);
                onSelect?.(asset);
              }}
              onDelete={() => onDelete?.(asset.id)}
              onDownload={() => onDownload?.(asset)}
              formatDuration={formatDuration}
              formatSize={formatSize}
              getTypeIcon={getTypeIcon}
            />
          ))}
        </div>
      )}

      {selectedAsset && (
        <MediaViewer
          asset={selectedAsset}
          onClose={() => setSelectedAsset(null)}
          onDownload={() => onDownload?.(selectedAsset)}
          formatDuration={formatDuration}
          formatSize={formatSize}
        />
      )}
    </div>
  );
}

function MediaCard({ 
  asset, 
  onClick, 
  onDelete,
  formatDuration,
  formatSize 
}: { 
  asset: MediaAsset; 
  onClick: () => void;
  onDelete?: () => void;
  formatDuration: (s?: number) => string;
  formatSize: (b?: number) => string;
}) {
  return (
    <GlassCard 
      className="p-0 overflow-hidden cursor-pointer group relative"
      onClick={onClick}
    >
      <div className="aspect-square bg-bg-secondary relative">
        {asset.type === 'image' && (
          <img 
            src={asset.thumbnail || asset.url} 
            alt={asset.name}
            className="w-full h-full object-cover"
          />
        )}
        {asset.type === 'video' && asset.thumbnail && (
          <video 
            src={asset.url}
            poster={asset.thumbnail}
            className="w-full h-full object-cover"
          />
        )}
        {asset.type === 'video' && !asset.thumbnail && (
          <div className="w-full h-full flex items-center justify-center text-4xl">🎬</div>
        )}
        {asset.type === 'audio' && (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-violet/20 to-fuchsia/20">
            <div className="text-4xl">🎙️</div>
          </div>
        )}
        {asset.type === 'music' && (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-amber/20 to-orange/20">
            <div className="text-4xl animate-pulse">🎵</div>
          </div>
        )}
        {asset.type === 'document' && (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-blue/20 to-cyan/20">
            <div className="text-4xl">📄</div>
          </div>
        )}
        {asset.type === 'text' && (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-green/20 to-emerald/20">
            <div className="text-4xl">📝</div>
          </div>
        )}

        <div className="absolute top-2 left-2 px-2 py-1 bg-black/60 rounded text-xs text-white backdrop-blur-sm">
          {asset.type.toUpperCase()}
        </div>

        {asset.duration && (
          <div className="absolute bottom-2 right-2 px-2 py-1 bg-black/60 rounded text-xs text-white backdrop-blur-sm">
            {formatDuration(asset.duration)}
          </div>
        )}

        {onDelete && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="absolute top-2 right-2 w-6 h-6 bg-red/80 rounded-full text-white text-xs opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red"
          >
            ✕
          </button>
        )}
      </div>

      <div className="p-2">
        <p className="text-sm text-white truncate font-medium">{asset.name}</p>
        <p className="text-xs text-gray-500">{formatSize(asset.size)} • {new Date(asset.createdAt).toLocaleDateString()}</p>
      </div>
    </GlassCard>
  );
}

function MediaListItem({ 
  asset, 
  onClick, 
  onDelete,
  onDownload,
  formatDuration,
  formatSize,
  getTypeIcon
}: { 
  asset: MediaAsset; 
  onClick: () => void;
  onDelete?: () => void;
  onDownload?: () => void;
  formatDuration: (s?: number) => string;
  formatSize: (b?: number) => string;
  getTypeIcon: (t: MediaType) => string;
}) {
  return (
    <GlassCard className="p-3 flex items-center gap-4 cursor-pointer hover:bg-white/5" onClick={onClick}>
      <div className="w-16 h-16 rounded-lg overflow-hidden flex-shrink-0 bg-bg-secondary">
        {asset.type === 'image' ? (
          <img src={asset.thumbnail || asset.url} alt={asset.name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-2xl">
            {getTypeIcon(asset.type)}
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-white font-medium truncate">{asset.name}</p>
        <p className="text-sm text-gray-500">
          {asset.type} • {formatSize(asset.size)} • {formatDuration(asset.duration)}
        </p>
      </div>

      <div className="flex gap-2">
        {onDownload && (
          <button
            onClick={(e) => { e.stopPropagation(); onDownload(); }}
            className="p-2 hover:bg-violet/20 rounded-lg text-violet"
          >
            ↓
          </button>
        )}
        {onDelete && (
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="p-2 hover:bg-red/20 rounded-lg text-red"
          >
            ✕
          </button>
        )}
      </div>
    </GlassCard>
  );
}

function MediaViewer({ 
  asset, 
  onClose, 
  onDownload,
  formatDuration,
  formatSize 
}: { 
  asset: MediaAsset; 
  onClose: () => void;
  onDownload?: () => void;
  formatDuration: (s?: number) => string;
  formatSize: (b?: number) => string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    return () => {
      if (videoRef.current) videoRef.current.pause();
      if (audioRef.current) audioRef.current.pause();
    };
  }, []);

  return (
    <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="relative max-w-4xl w-full max-h-[90vh] bg-bg-card rounded-xl overflow-hidden" onClick={e => e.stopPropagation()}>
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-10 w-8 h-8 bg-black/50 rounded-full text-white hover:bg-black/70"
        >
          ✕
        </button>

        {asset.type === 'image' && (
          <img src={asset.url} alt={asset.name} className="w-full h-auto max-h-[70vh] object-contain" />
        )}

        {asset.type === 'video' && (
          <video
            ref={videoRef}
            src={asset.url}
            poster={asset.thumbnail}
            controls
            className="w-full h-auto max-h-[70vh]"
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
          />
        )}

        {asset.type === 'audio' && (
          <div className="p-8 text-center">
            <div className="w-32 h-32 mx-auto mb-6 rounded-full bg-gradient-to-br from-violet to-fuchsia flex items-center justify-center text-6xl animate-pulse">
              🎙️
            </div>
            <audio ref={audioRef} src={asset.url} controls className="w-full" />
          </div>
        )}

        {asset.type === 'music' && (
          <div className="p-8">
            <div className="w-48 h-48 mx-auto mb-6 rounded-xl bg-gradient-to-br from-amber to-orange flex items-center justify-center text-6xl shadow-lg">
              🎵
            </div>
            <audio ref={audioRef} src={asset.url} controls className="w-full" />
          </div>
        )}

        {asset.type === 'document' && (
          <iframe 
            src={asset.url} 
            className="w-full h-[70vh]"
            title={asset.name}
          />
        )}

        {asset.type === 'text' && (
          <div className="p-6 max-h-[70vh] overflow-auto">
            <pre className="whitespace-pre-wrap text-gray-300 font-mono text-sm">{asset.url}</pre>
          </div>
        )}

        <div className="p-4 border-t border-border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-white font-medium">{asset.name}</p>
              <p className="text-sm text-gray-500">
                {asset.type} • {formatSize(asset.size)} • {formatDuration(asset.duration)}
              </p>
              {asset.metadata?.prompt && (
                <p className="text-xs text-gray-400 mt-2 line-clamp-2">Prompt: {asset.metadata.prompt}</p>
              )}
              {asset.metadata?.provider && (
                <p className="text-xs text-gray-500 mt-1">Provider: {asset.metadata.provider} {asset.metadata.model ? `(${asset.metadata.model})` : ''}</p>
              )}
            </div>

            {onDownload && (
              <button
                onClick={onDownload}
                className="px-4 py-2 bg-violet/20 text-violet border border-violet/50 rounded-lg hover:bg-violet/30"
              >
                Download
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default MediaGallery;