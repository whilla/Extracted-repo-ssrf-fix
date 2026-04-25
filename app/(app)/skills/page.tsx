'use client';

import { useState, useEffect } from 'react';
import { GlassCard } from '@/components/nexus/GlassCard';
import { NeonButton } from '@/components/nexus/NeonButton';
import { loadSkill, saveSkill } from '@/lib/services/memoryService';
import { DEFAULT_APP_AGENT_SKILLS } from '@/lib/services/agentSkillService';
import {
  Sparkles,
  Plus,
  Pencil,
  Trash2,
  Copy,
  ToggleLeft,
  ToggleRight,
  BookOpen,
  MessageSquare,
  Lightbulb,
  Zap,
  Heart,
  TrendingUp,
  Target,
} from 'lucide-react';

interface Skill {
  id: string;
  name: string;
  description: string;
  prompt: string;
  category: string;
  enabled: boolean;
  createdAt: string;
  usageCount: number;
}

const SKILL_CATEGORIES = [
  { id: 'hooks', name: 'Hooks', icon: Zap },
  { id: 'storytelling', name: 'Storytelling', icon: BookOpen },
  { id: 'conversion', name: 'Conversion', icon: Target },
  { id: 'engagement', name: 'Engagement', icon: Heart },
  { id: 'growth', name: 'Growth', icon: TrendingUp },
  { id: 'custom', name: 'Custom', icon: Sparkles },
];

const DEFAULT_SKILLS: Omit<Skill, 'id' | 'createdAt' | 'usageCount'>[] = DEFAULT_APP_AGENT_SKILLS.map((skill) => ({
  ...skill,
  category: SKILL_CATEGORIES.some((entry) => entry.id === skill.category) ? skill.category : 'custom',
}));

export default function SkillsPage() {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [isEditing, setIsEditing] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [editForm, setEditForm] = useState<Partial<Skill>>({});

  useEffect(() => {
    fetchSkills();
  }, []);

  const fetchSkills = async () => {
    try {
      const savedSkills = await loadSkill('all_skills');
      if (savedSkills && Array.isArray(savedSkills)) {
        setSkills(savedSkills);
      } else {
        // Initialize with default skills
        const initialSkills: Skill[] = DEFAULT_SKILLS.map((skill, index) => ({
          ...skill,
          id: `skill_${index}_${Date.now()}`,
          createdAt: new Date().toISOString(),
          usageCount: 0,
        }));
        setSkills(initialSkills);
        await saveSkill('all_skills', initialSkills);
      }
    } catch (error) {
      console.error('Error loading skills:', error);
    }
  };

  const persistSkills = async (updatedSkills: Skill[]) => {
    setSkills(updatedSkills);
    await saveSkill('all_skills', updatedSkills);
  };

  const handleCreateSkill = async () => {
    if (!editForm.name || !editForm.prompt) return;

    const newSkill: Skill = {
      id: `skill_${Date.now()}`,
      name: editForm.name,
      description: editForm.description || '',
      prompt: editForm.prompt,
      category: editForm.category || 'custom',
      enabled: true,
      createdAt: new Date().toISOString(),
      usageCount: 0,
    };

    await persistSkills([...skills, newSkill]);
    setIsCreating(false);
    setEditForm({});
  };

  const handleUpdateSkill = async () => {
    if (!isEditing || !editForm.name || !editForm.prompt) return;

    const updatedSkills = skills.map(skill =>
      skill.id === isEditing
        ? {
            ...skill,
            name: editForm.name!,
            description: editForm.description || '',
            prompt: editForm.prompt!,
            category: editForm.category || skill.category,
          }
        : skill
    );

    await persistSkills(updatedSkills);
    setIsEditing(null);
    setEditForm({});
  };

  const handleDeleteSkill = async (id: string) => {
    const updatedSkills = skills.filter(skill => skill.id !== id);
    await persistSkills(updatedSkills);
  };

  const handleToggleSkill = async (id: string) => {
    const updatedSkills = skills.map(skill =>
      skill.id === id ? { ...skill, enabled: !skill.enabled } : skill
    );
    await persistSkills(updatedSkills);
  };

  const handleDuplicateSkill = async (skill: Skill) => {
    const duplicate: Skill = {
      ...skill,
      id: `skill_${Date.now()}`,
      name: `${skill.name} (Copy)`,
      createdAt: new Date().toISOString(),
      usageCount: 0,
    };
    await persistSkills([...skills, duplicate]);
  };

  const startEditing = (skill: Skill) => {
    setIsEditing(skill.id);
    setEditForm({
      name: skill.name,
      description: skill.description,
      prompt: skill.prompt,
      category: skill.category,
    });
  };

  const filteredSkills =
    selectedCategory === 'all'
      ? skills
      : skills.filter(s => s.category === selectedCategory);

  const enabledCount = skills.filter(s => s.enabled).length;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">AI Skills</h1>
          <p className="text-muted-foreground mt-2">
            Custom prompts and techniques for content generation
          </p>
        </div>
        <NeonButton onClick={() => setIsCreating(true)}>
          <Plus className="w-4 h-4 mr-2" />
          New Skill
        </NeonButton>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <GlassCard className="p-6">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-xl bg-nexus-cyan/10">
              <Sparkles className="w-6 h-6 text-nexus-cyan" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{skills.length}</p>
              <p className="text-sm text-muted-foreground">Total Skills</p>
            </div>
          </div>
        </GlassCard>
        
        <GlassCard className="p-6">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-xl bg-nexus-success/10">
              <ToggleRight className="w-6 h-6 text-nexus-success" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{enabledCount}</p>
              <p className="text-sm text-muted-foreground">Enabled</p>
            </div>
          </div>
        </GlassCard>
        
        <GlassCard className="p-6">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-xl bg-nexus-violet/10">
              <Lightbulb className="w-6 h-6 text-nexus-violet" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">
                {skills.reduce((acc, s) => acc + s.usageCount, 0)}
              </p>
              <p className="text-sm text-muted-foreground">Total Uses</p>
            </div>
          </div>
        </GlassCard>
      </div>

      {/* Category Filter */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setSelectedCategory('all')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            selectedCategory === 'all'
              ? 'bg-nexus-cyan text-black'
              : 'bg-card hover:bg-card/80 text-foreground border border-border'
          }`}
        >
          All Skills
        </button>
        {SKILL_CATEGORIES.map(category => {
          const Icon = category.icon;
          return (
            <button
              key={category.id}
              onClick={() => setSelectedCategory(category.id)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
                selectedCategory === category.id
                  ? 'bg-nexus-cyan text-black'
                  : 'bg-card hover:bg-card/80 text-foreground border border-border'
              }`}
            >
              <Icon className="w-4 h-4" />
              {category.name}
            </button>
          );
        })}
      </div>

      {/* Create/Edit Form */}
      {(isCreating || isEditing) && (
        <GlassCard className="p-6">
          <h2 className="text-xl font-semibold text-foreground mb-4">
            {isCreating ? 'Create New Skill' : 'Edit Skill'}
          </h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                Skill Name
              </label>
              <input
                type="text"
                value={editForm.name || ''}
                onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                placeholder="e.g., Viral Hook Generator"
                className="w-full px-4 py-3 rounded-lg bg-background/50 border border-border focus:border-nexus-cyan focus:ring-1 focus:ring-nexus-cyan outline-none transition-colors"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                Description
              </label>
              <input
                type="text"
                value={editForm.description || ''}
                onChange={e => setEditForm({ ...editForm, description: e.target.value })}
                placeholder="What does this skill do?"
                className="w-full px-4 py-3 rounded-lg bg-background/50 border border-border focus:border-nexus-cyan focus:ring-1 focus:ring-nexus-cyan outline-none transition-colors"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                Category
              </label>
              <select
                value={editForm.category || 'custom'}
                onChange={e => setEditForm({ ...editForm, category: e.target.value })}
                className="w-full px-4 py-3 rounded-lg bg-background/50 border border-border focus:border-nexus-cyan focus:ring-1 focus:ring-nexus-cyan outline-none transition-colors"
              >
                {SKILL_CATEGORIES.map(cat => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                Prompt Template
              </label>
              <p className="text-xs text-muted-foreground mb-2">
                Use {'{topic}'}, {'{content}'}, {'{audience}'} as variables
              </p>
              <textarea
                value={editForm.prompt || ''}
                onChange={e => setEditForm({ ...editForm, prompt: e.target.value })}
                placeholder="Enter the AI prompt template..."
                rows={5}
                className="w-full px-4 py-3 rounded-lg bg-background/50 border border-border focus:border-nexus-cyan focus:ring-1 focus:ring-nexus-cyan outline-none transition-colors resize-none"
              />
            </div>
            <div className="flex gap-3">
              <NeonButton
                onClick={isCreating ? handleCreateSkill : handleUpdateSkill}
                disabled={!editForm.name || !editForm.prompt}
              >
                {isCreating ? 'Create Skill' : 'Save Changes'}
              </NeonButton>
              <NeonButton
                variant="ghost"
                onClick={() => {
                  setIsCreating(false);
                  setIsEditing(null);
                  setEditForm({});
                }}
              >
                Cancel
              </NeonButton>
            </div>
          </div>
        </GlassCard>
      )}

      {/* Skills Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filteredSkills.map(skill => {
          const category = SKILL_CATEGORIES.find(c => c.id === skill.category);
          const CategoryIcon = category?.icon || Sparkles;

          return (
            <GlassCard
              key={skill.id}
              className={`p-6 ${!skill.enabled ? 'opacity-50' : ''}`}
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-nexus-cyan/10">
                    <CategoryIcon className="w-5 h-5 text-nexus-cyan" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground">{skill.name}</h3>
                    <p className="text-sm text-muted-foreground">{skill.description}</p>
                  </div>
                </div>
                <button
                  onClick={() => handleToggleSkill(skill.id)}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  {skill.enabled ? (
                    <ToggleRight className="w-6 h-6 text-nexus-success" />
                  ) : (
                    <ToggleLeft className="w-6 h-6" />
                  )}
                </button>
              </div>

              <div className="p-3 rounded-lg bg-background/30 mb-4">
                <p className="text-sm text-muted-foreground font-mono line-clamp-3">
                  {skill.prompt}
                </p>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-1 rounded text-xs bg-card text-muted-foreground">
                    {category?.name || 'Custom'}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Used {skill.usageCount} times
                  </span>
                </div>

                <div className="flex gap-1">
                  <button
                    onClick={() => startEditing(skill)}
                    className="p-2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDuplicateSkill(skill)}
                    className="p-2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDeleteSkill(skill.id)}
                    className="p-2 text-muted-foreground hover:text-nexus-error transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </GlassCard>
          );
        })}
      </div>

      {filteredSkills.length === 0 && (
        <GlassCard className="p-12 text-center">
          <MessageSquare className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-foreground mb-2">No Skills Found</h3>
          <p className="text-muted-foreground mb-4">
            {selectedCategory === 'all'
              ? 'Create your first AI skill to enhance content generation.'
              : 'No skills in this category yet.'}
          </p>
          <NeonButton onClick={() => setIsCreating(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Create Skill
          </NeonButton>
        </GlassCard>
      )}
    </div>
  );
}
