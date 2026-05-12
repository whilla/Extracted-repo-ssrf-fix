'use client';

import { useState, useEffect } from 'react';
import { GlassCard } from '@/components/nexus/GlassCard';
import { NeonButton } from '@/components/nexus/NeonButton';
import { LoadingPulse } from '@/components/nexus/LoadingPulse';
import { getTemplates, saveTemplate, deleteTemplate, createTemplateFromContent, type ContentTemplate } from '@/lib/services/templateService';
import { toast } from 'sonner';
import { FileText, Plus, Trash2, Copy, ExternalLink } from 'lucide-react';

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<ContentTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');

  useEffect(() => {
    const load = async () => {
      try {
        const t = await getTemplates();
        setTemplates(t);
      } catch {
        toast.error('Failed to load templates');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const categories = ['all', ...new Set(templates.map(t => t.category))];
  const filtered = filter === 'all' ? templates : templates.filter(t => t.category === filter);

  const handleDelete = async (id: string) => {
    setTemplates(templates.filter(t => t.id !== id));
    try {
      await deleteTemplate(id);
      toast.success('Template deleted');
    } catch {
      toast.error('Failed to delete template');
    }
  };

  const handleUseTemplate = (template: ContentTemplate) => {
    navigator.clipboard.writeText(template.structure);
    toast.success('Template structure copied to clipboard');
  };

  if (loading) return <LoadingPulse text="Loading templates..." />;

  return (
    <div className="min-h-screen bg-gradient-to-br from-bg-primary via-bg-primary to-violet-900/20 p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">Content Templates</h1>
          <p className="text-gray-400">Use pre-built templates to speed up content creation</p>
        </div>

        {templates.length === 0 ? (
          <GlassCard className="p-12 text-center">
            <FileText className="w-12 h-12 text-gray-500 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-white mb-2">No Templates Yet</h3>
            <p className="text-gray-400 mb-6">Default templates will appear once you generate your first content.</p>
            <NeonButton onClick={() => window.location.href = '/studio'}>
              Create Content
            </NeonButton>
          </GlassCard>
        ) : (
          <>
            <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
              {categories.map(cat => (
                <button
                  key={cat}
                  onClick={() => setFilter(cat)}
                  className={`px-4 py-1.5 rounded-full text-sm transition-colors ${
                    filter === cat
                      ? 'bg-nexus-cyan/20 text-nexus-cyan border border-nexus-cyan/30'
                      : 'bg-secondary/10 text-muted-foreground border border-border/50 hover:border-nexus-cyan/30'
                  }`}
                >
                  {cat === 'all' ? 'All' : cat.replace(/-/g, ' ')}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filtered.map(template => (
                <GlassCard key={template.id} className="p-5 flex flex-col">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="text-lg font-semibold text-white">{template.name}</h3>
                      <span className="text-xs text-nexus-cyan bg-nexus-cyan/10 px-2 py-0.5 rounded-full">
                        {template.category.replace(/-/g, ' ')}
                      </span>
                    </div>
                  </div>
                  <p className="text-sm text-gray-400 mb-3 flex-1">{template.description}</p>
                  <div className="mb-3">
                    <p className="text-xs text-gray-500 mb-1">Platforms: {template.platforms.join(', ')}</p>
                    <p className="text-xs text-gray-500">Placeholders: {template.placeholders.join(', ')}</p>
                  </div>
                  <pre className="text-xs text-gray-300 bg-black/20 p-3 rounded-lg mb-4 overflow-x-auto max-h-24">
                    {template.structure.slice(0, 200)}
                    {template.structure.length > 200 ? '...' : ''}
                  </pre>
                  <div className="flex gap-2 mt-auto">
                    <NeonButton size="sm" onClick={() => handleUseTemplate(template)}>
                      <Copy className="w-3 h-3 mr-1" /> Use
                    </NeonButton>
                    <button
                      onClick={() => handleDelete(template.id)}
                      className="p-2 text-red-400 hover:text-red-300 hover:bg-red-400/10 rounded-lg transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </GlassCard>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
