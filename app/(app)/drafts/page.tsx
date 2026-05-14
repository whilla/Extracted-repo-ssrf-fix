'use client';

import { useState, useEffect } from 'react';
import { GlassCard } from '@/components/nexus/GlassCard';
import { NeonButton } from '@/components/nexus/NeonButton';
import { StatusBadge } from '@/components/nexus/StatusBadge';
import { ContentCard } from '@/components/content/ContentCard';
import { draftsService } from '@/lib/services/draftsService';
import { PLATFORMS } from '@/lib/constants/platforms';
import type { ContentDraft, Platform } from '@/lib/types';
import {
  FileText,
  Search,
  Filter,
  Grid,
  List,
  Clock,
  CheckCircle2,
  Calendar as CalendarIcon,
  Send,
  Trash2,
  Plus,
} from 'lucide-react';
import Link from 'next/link';

type ViewMode = 'grid' | 'list';
type FilterStatus = 'all' | 'draft' | 'approved' | 'scheduled' | 'published';

export default function DraftsPage() {
  const [drafts, setDrafts] = useState<ContentDraft[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [filterPlatform, setFilterPlatform] = useState<Platform | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [stats, setStats] = useState({
    total: 0,
    drafts: 0,
    approved: 0,
    scheduled: 0,
    published: 0,
    averageVersions: 0,
  });

  useEffect(() => {
    loadDrafts();
  }, []);

  const loadDrafts = async () => {
    setIsLoading(true);
    try {
      const allDrafts = await draftsService.getAllDrafts();
      const draftStats = await draftsService.getStats();
      setDrafts(allDrafts);
      setStats(draftStats);
    } catch (error) {
      console.error('Error loading drafts:', error);
    }
    setIsLoading(false);
  };

  const handleDelete = async (id: string) => {
    await draftsService.deleteDraft(id);
    await loadDrafts();
  };

  const handleDuplicate = async (draft: ContentDraft) => {
    await draftsService.duplicateDraft(draft.id);
    await loadDrafts();
  };

  // Filter drafts
  const filteredDrafts = drafts.filter(draft => {
    if (filterStatus !== 'all' && draft.status !== filterStatus) return false;
    if (filterPlatform !== 'all' && !draft.platforms.includes(filterPlatform)) return false;
    if (searchQuery) {
      const currentVersion = draftsService.getCurrentVersion(draft);
      if (!currentVersion?.text.toLowerCase().includes(searchQuery.toLowerCase())) {
        return false;
      }
    }
    return true;
  });

  const getStatusIcon = (status: ContentDraft['status']) => {
    switch (status) {
      case 'draft':
        return <FileText className="w-4 h-4" />;
      case 'approved':
        return <CheckCircle2 className="w-4 h-4" />;
      case 'scheduled':
        return <CalendarIcon className="w-4 h-4" />;
      case 'published':
        return <Send className="w-4 h-4" />;
      default:
        return <Clock className="w-4 h-4" />;
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Content Drafts</h1>
          <p className="text-muted-foreground mt-2">
            Manage all your content drafts and versions
          </p>
        </div>
        <Link href="/studio">
          <NeonButton>
            <Plus className="w-4 h-4 mr-2" />
            New Draft
          </NeonButton>
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <GlassCard className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-nexus-cyan/10">
              <FileText className="w-5 h-5 text-nexus-cyan" />
            </div>
            <div>
              <p className="text-xl font-bold text-foreground">{stats.total}</p>
              <p className="text-xs text-muted-foreground">Total</p>
            </div>
          </div>
        </GlassCard>
        
        <GlassCard className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-nexus-warning/10">
              <Clock className="w-5 h-5 text-nexus-warning" />
            </div>
            <div>
              <p className="text-xl font-bold text-foreground">{stats.drafts}</p>
              <p className="text-xs text-muted-foreground">Drafts</p>
            </div>
          </div>
        </GlassCard>
        
        <GlassCard className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-nexus-success/10">
              <CheckCircle2 className="w-5 h-5 text-nexus-success" />
            </div>
            <div>
              <p className="text-xl font-bold text-foreground">{stats.approved}</p>
              <p className="text-xs text-muted-foreground">Approved</p>
            </div>
          </div>
        </GlassCard>
        
        <GlassCard className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-nexus-violet/10">
              <CalendarIcon className="w-5 h-5 text-nexus-violet" />
            </div>
            <div>
              <p className="text-xl font-bold text-foreground">{stats.scheduled}</p>
              <p className="text-xs text-muted-foreground">Scheduled</p>
            </div>
          </div>
        </GlassCard>
        
        <GlassCard className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-500/10">
              <Send className="w-5 h-5 text-blue-500" />
            </div>
            <div>
              <p className="text-xl font-bold text-foreground">{stats.published}</p>
              <p className="text-xs text-muted-foreground">Published</p>
            </div>
          </div>
        </GlassCard>
      </div>

      {/* Filters */}
      <GlassCard className="p-4">
        <div className="flex flex-col md:flex-row gap-4">
          {/* Search */}
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search drafts..."
              className="w-full pl-10 pr-4 py-2 rounded-lg bg-background/50 border border-border focus:border-nexus-cyan focus:ring-1 focus:ring-nexus-cyan outline-none transition-colors"
            />
          </div>

          {/* Status filter */}
          <div className="flex items-center gap-2">
            <Filter className="w-5 h-5 text-muted-foreground" />
            <select
              value={filterStatus}
              onChange={e => setFilterStatus(e.target.value as FilterStatus)}
              className="px-3 py-2 rounded-lg bg-background/50 border border-border focus:border-nexus-cyan outline-none"
            >
              <option value="all">All Status</option>
              <option value="draft">Drafts</option>
              <option value="approved">Approved</option>
              <option value="scheduled">Scheduled</option>
              <option value="published">Published</option>
            </select>
          </div>

          {/* Platform filter */}
          <select
            value={filterPlatform}
            onChange={e => setFilterPlatform(e.target.value as Platform | 'all')}
            className="px-3 py-2 rounded-lg bg-background/50 border border-border focus:border-nexus-cyan outline-none"
          >
            <option value="all">All Platforms</option>
            {Object.values(PLATFORMS).map(p => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>

          {/* View mode */}
          <div className="flex items-center border border-border rounded-lg overflow-hidden">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-2 ${viewMode === 'grid' ? 'bg-nexus-cyan text-black' : 'hover:bg-muted/50'}`}
            >
              <Grid className="w-5 h-5" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-2 ${viewMode === 'list' ? 'bg-nexus-cyan text-black' : 'hover:bg-muted/50'}`}
            >
              <List className="w-5 h-5" />
            </button>
          </div>
        </div>
      </GlassCard>

      {/* Drafts Grid/List */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => (
            <GlassCard key={i} className="p-6 animate-pulse">
              <div className="h-4 bg-muted rounded w-3/4 mb-4" />
              <div className="h-20 bg-muted rounded mb-4" />
              <div className="h-4 bg-muted rounded w-1/2" />
            </GlassCard>
          ))}
        </div>
      ) : filteredDrafts.length === 0 ? (
        <GlassCard className="p-12 text-center">
          <FileText className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-foreground mb-2">No Drafts Found</h3>
          <p className="text-muted-foreground mb-4">
            {searchQuery || filterStatus !== 'all' || filterPlatform !== 'all'
              ? 'No drafts match your filters. Try adjusting your search.'
              : 'Start creating content to see your drafts here.'}
          </p>
          <Link href="/studio">
            <NeonButton>
              <Plus className="w-4 h-4 mr-2" />
              Create Content
            </NeonButton>
          </Link>
        </GlassCard>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredDrafts.map(draft => {
            const currentVersion = draftsService.getCurrentVersion(draft);
            return (
              <ContentCard
                key={draft.id}
                draft={draft}
                currentVersion={currentVersion}
                onDelete={() => handleDelete(draft.id)}
                onDuplicate={() => handleDuplicate(draft)}
              />
            );
          })}
        </div>
      ) : (
        <div className="space-y-2">
          {filteredDrafts.map(draft => {
            const currentVersion = draftsService.getCurrentVersion(draft);
            return (
              <GlassCard key={draft.id} className="p-4">
                <div className="flex items-center gap-4">
                  <div className="flex-shrink-0">
                    {getStatusIcon(draft.status)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-foreground truncate">
                      {currentVersion?.text.slice(0, 100)}...
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <StatusBadge
                        status={(
                          draft.status === 'published' ? 'success' :
                          draft.status === 'scheduled' ? 'info' :
                          draft.status === 'approved' ? 'warning' : 'neutral'
                        ) as any}
                      >
                        {draft.status}
                      </StatusBadge>
                      <span className="text-xs text-muted-foreground">
                        v{draft.currentVersion} - {new Date(draft.updated).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {draft.platforms.map(p => {
                      const platform = Object.values(PLATFORMS).find(pl => pl.id === p);
                      return (
                        <span
                          key={p}
                          className="w-6 h-6 rounded-full flex items-center justify-center text-xs"
                          style={{ backgroundColor: `${platform?.color}20`, color: platform?.color }}
                        >
                          {p[0].toUpperCase()}
                        </span>
                      );
                    })}
                  </div>
                  <button
                    onClick={() => handleDelete(draft.id)}
                    className="p-2 text-muted-foreground hover:text-nexus-error transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </GlassCard>
            );
          })}
        </div>
      )}
    </div>
  );
}
