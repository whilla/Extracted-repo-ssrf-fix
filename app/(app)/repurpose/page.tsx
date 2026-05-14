'use client';

import { useState } from 'react';
import { GlassCard } from '@/components/nexus/GlassCard';
import { NeonButton } from '@/components/nexus/NeonButton';
import { useAuth } from '@/lib/context/AuthContext';
import { Repeat, Plus, Save, Copy, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

type TransformRule = {
  id: string;
  name: string;
  sourceFormat: string;
  targetFormat: string;
  promptTemplate: string;
  platform: string;
};

export default function RepurposePage() {
  useAuth();
  const [templates, setTemplates] = useState<TransformRule[]>([]);
  const [showEditor, setShowEditor] = useState(false);
  const [editing, setEditing] = useState<TransformRule>({
    id: '', name: '', sourceFormat: 'blog_post', targetFormat: 'twitter_thread',
    promptTemplate: 'Rewrite this {{source}} as a {{target}} for {{platform}}:\n\n{{content}}',
    platform: 'twitter',
  });

  const handleSave = () => {
    if (!editing.name) { toast.error('Template name required'); return; }
    if (editing.id) {
      setTemplates(prev => prev.map(t => t.id === editing.id ? editing : t));
      toast.success('Template updated');
    } else {
      setTemplates(prev => [...prev, { ...editing, id: `rule_${Date.now()}` }]);
      toast.success('Template created');
    }
    setShowEditor(false);
  };

  const handleDelete = (id: string) => {
    setTemplates(prev => prev.filter(t => t.id !== id));
    toast.success('Template deleted');
  };

  const handleClone = (t: TransformRule) => {
    setEditing({ ...t, id: '', name: `${t.name} (copy)` });
    setShowEditor(true);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-bg-primary via-bg-primary to-violet-900/20 p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        <div className="mb-12">
          <h1 className="text-4xl font-bold text-white mb-2 flex items-center gap-3">
            <Repeat className="w-8 h-8 text-nexus-cyan" /> Content Repurposing
          </h1>
          <p className="text-gray-400">Define reusable transformation rules to adapt content across platforms</p>
        </div>

        <div className="flex justify-end mb-6">
          <NeonButton onClick={() => { setEditing({ id: '', name: '', sourceFormat: 'blog_post', targetFormat: 'twitter_thread', promptTemplate: 'Rewrite this {{source}} as a {{target}} for {{platform}}:\n\n{{content}}', platform: 'twitter' }); setShowEditor(true); }}>
            <Plus className="w-4 h-4" /> New Template
          </NeonButton>
        </div>

        {showEditor && (
          <GlassCard className="p-6 mb-6">
            <h3 className="text-lg font-semibold text-white mb-4">{editing.id ? 'Edit' : 'New'} Template</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="text-sm text-gray-400 block mb-1">Name</label>
                <input className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-white text-sm" value={editing.name} onChange={e => setEditing(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Blog to Twitter" />
              </div>
              <div>
                <label className="text-sm text-gray-400 block mb-1">Source Format</label>
                <select className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-white text-sm" value={editing.sourceFormat} onChange={e => setEditing(p => ({ ...p, sourceFormat: e.target.value }))}>
                  <option value="blog_post">Blog Post</option>
                  <option value="video_script">Video Script</option>
                  <option value="newsletter">Newsletter</option>
                  <option value="podcast">Podcast Transcript</option>
                  <option value="social_post">Social Post</option>
                </select>
              </div>
              <div>
                <label className="text-sm text-gray-400 block mb-1">Target Format</label>
                <select className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-white text-sm" value={editing.targetFormat} onChange={e => setEditing(p => ({ ...p, targetFormat: e.target.value }))}>
                  <option value="twitter_thread">Twitter Thread</option>
                  <option value="linkedin_post">LinkedIn Post</option>
                  <option value="instagram_caption">Instagram Caption</option>
                  <option value="tiktok_script">TikTok Script</option>
                  <option value="newsletter">Newsletter</option>
                </select>
              </div>
              <div>
                <label className="text-sm text-gray-400 block mb-1">Target Platform</label>
                <select className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-white text-sm" value={editing.platform} onChange={e => setEditing(p => ({ ...p, platform: e.target.value }))}>
                  <option value="twitter">Twitter/X</option>
                  <option value="linkedin">LinkedIn</option>
                  <option value="instagram">Instagram</option>
                  <option value="tiktok">TikTok</option>
                  <option value="youtube">YouTube</option>
                </select>
              </div>
            </div>
            <div className="mb-4">
              <label className="text-sm text-gray-400 block mb-1">Prompt Template</label>
              <textarea className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-white text-sm h-24 font-mono" value={editing.promptTemplate} onChange={e => setEditing(p => ({ ...p, promptTemplate: e.target.value }))} />
              <p className="text-xs text-gray-500 mt-1">Use {'{{source}}'}, {'{{target}}'}, {'{{platform}}'}, {'{{content}}'} as variables</p>
            </div>
            <div className="flex gap-3">
              <NeonButton onClick={handleSave}><Save className="w-4 h-4" /> Save Template</NeonButton>
              <NeonButton onClick={() => setShowEditor(false)} variant="secondary">Cancel</NeonButton>
            </div>
          </GlassCard>
        )}

        <GlassCard className="p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Saved Templates</h3>
          {templates.length === 0 ? (
            <p className="text-sm text-gray-500">No templates yet. Create one to automate content repurposing.</p>
          ) : (
            <div className="space-y-3">
              {templates.map(t => (
                <div key={t.id} className="flex items-center justify-between p-3 bg-black/30 rounded-lg border border-white/5">
                  <div className="flex-1">
                    <p className="text-white text-sm font-medium">{t.name}</p>
                    <p className="text-xs text-gray-500">{t.sourceFormat} → {t.targetFormat} on {t.platform}</p>
                  </div>
                  <div className="flex gap-2">
                    <NeonButton size="sm" onClick={() => handleClone(t)}><Copy className="w-3 h-3" /></NeonButton>
                    <NeonButton size="sm" onClick={() => handleDelete(t.id)}><Trash2 className="w-3 h-3" /></NeonButton>
                  </div>
                </div>
              ))}
            </div>
          )}
        </GlassCard>
      </div>
    </div>
  );
}
