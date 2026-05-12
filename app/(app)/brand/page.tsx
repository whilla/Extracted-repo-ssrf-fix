'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/context/AuthContext';
import { GlassCard } from '@/components/nexus/GlassCard';
import { NeonButton } from '@/components/nexus/NeonButton';
import { LoadingPulse } from '@/components/nexus/LoadingPulse';
import { loadBrandKit, saveBrandKit } from '@/lib/services/memoryService';
import { toast } from 'sonner';

export default function BrandKitPage() {
  const { user } = useAuth();
  const [brandKit, setBrandKit] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState<any>({});

  useEffect(() => {
    const fetchBrandKit = async () => {
      try {
        const brand = await loadBrandKit();
        setBrandKit(brand);
        setFormData(brand || {});
      } catch (error) {
        console.error('[v0] Brand kit load error:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchBrandKit();
  }, []);

  const handleInputChange = (field: string, value: any) => {
    setFormData((prev: Record<string, any>) => ({
      ...prev,
      [field]: value
    }));
  };

  const handleArrayField = (field: string, index: number, value: string) => {
    setFormData((prev: Record<string, any>) => {
      const arr = [...(prev[field] || [])];
      arr[index] = value;
      return {
        ...prev,
        [field]: arr
      };
    });
  };

  const addArrayField = (field: string) => {
    setFormData((prev: Record<string, any>) => ({
      ...prev,
      [field]: [...(prev[field] || []), '']
    }));
  };

  const removeArrayField = (field: string, index: number) => {
    setFormData((prev: Record<string, any>) => ({
      ...prev,
      [field]: prev[field].filter((_: any, i: number) => i !== index)
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveBrandKit(formData);
      setBrandKit(formData);
      toast.success('Brand kit saved successfully!');
    } catch (error) {
      console.error('[v0] Save error:', error);
      toast.error('Failed to save brand kit');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <LoadingPulse />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-bg-primary via-bg-primary to-violet-900/20 p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">Brand Kit</h1>
          <p className="text-gray-400">Define your brand identity and content guidelines</p>
        </div>

        {/* Form */}
        <div className="space-y-6">
          {/* Brand Basics */}
          <GlassCard className="p-8">
            <h2 className="text-2xl font-bold text-cyan mb-6">Brand Basics</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-white mb-2">Brand Name</label>
                <input
                  type="text"
                  value={formData.brandName || ''}
                  onChange={(e) => handleInputChange('brandName', e.target.value)}
                  className="w-full px-4 py-2 bg-bg-glass border border-border rounded-lg text-white focus:outline-none focus:border-cyan transition-colors"
                  placeholder="Your brand name"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-white mb-2">Niche / Industry</label>
                <input
                  type="text"
                  value={formData.niche || ''}
                  onChange={(e) => handleInputChange('niche', e.target.value)}
                  className="w-full px-4 py-2 bg-bg-glass border border-border rounded-lg text-white focus:outline-none focus:border-cyan transition-colors"
                  placeholder="e.g., Tech, Fashion, Fitness"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-white mb-2">Target Audience</label>
                <input
                  type="text"
                  value={formData.targetAudience || ''}
                  onChange={(e) => handleInputChange('targetAudience', e.target.value)}
                  className="w-full px-4 py-2 bg-bg-glass border border-border rounded-lg text-white focus:outline-none focus:border-cyan transition-colors"
                  placeholder="e.g., Entrepreneurs aged 25-40"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-white mb-2">Unique Selling Point</label>
                <textarea
                  value={formData.uniqueSellingPoint || ''}
                  onChange={(e) => handleInputChange('uniqueSellingPoint', e.target.value)}
                  className="w-full px-4 py-2 bg-bg-glass border border-border rounded-lg text-white focus:outline-none focus:border-cyan transition-colors min-h-24"
                  placeholder="What makes your brand unique?"
                />
              </div>
            </div>
          </GlassCard>

          {/* Voice & Tone */}
          <GlassCard className="p-8">
            <h2 className="text-2xl font-bold text-violet mb-6">Voice & Tone</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-white mb-2">Tone</label>
                <select
                  value={formData.tone || 'professional'}
                  onChange={(e) => handleInputChange('tone', e.target.value)}
                  className="w-full px-4 py-2 bg-bg-glass border border-border rounded-lg text-white focus:outline-none focus:border-cyan transition-colors"
                >
                  <option value="professional">Professional</option>
                  <option value="casual">Casual</option>
                  <option value="humorous">Humorous</option>
                  <option value="inspirational">Inspirational</option>
                  <option value="educational">Educational</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-white mb-2">Content Pillars (Topics you post about)</label>
                <div className="space-y-2">
                  {(formData.contentPillars || []).map((pillar: string, idx: number) => (
                    <div key={idx} className="flex gap-2">
                      <input
                        type="text"
                        value={pillar}
                        onChange={(e) => handleArrayField('contentPillars', idx, e.target.value)}
                        className="flex-1 px-4 py-2 bg-bg-glass border border-border rounded-lg text-white focus:outline-none focus:border-cyan transition-colors"
                        placeholder={`Pillar ${idx + 1}`}
                      />
                      <button
                        onClick={() => removeArrayField('contentPillars', idx)}
                        className="px-3 py-2 bg-error/20 text-error rounded-lg hover:bg-error/30 transition-colors"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                  <button
                    onClick={() => addArrayField('contentPillars')}
                    className="w-full px-4 py-2 bg-cyan/10 border border-cyan/50 text-cyan rounded-lg hover:bg-cyan/20 transition-colors text-sm font-semibold"
                  >
                    + Add Pillar
                  </button>
                </div>
              </div>
            </div>
          </GlassCard>

          {/* Avoid Topics */}
          <GlassCard className="p-8">
            <h2 className="text-2xl font-bold text-warning mb-6">Content Guidelines</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-white mb-2">Topics to Avoid</label>
                <div className="space-y-2">
                  {(formData.avoidTopics || []).map((topic: string, idx: number) => (
                    <div key={idx} className="flex gap-2">
                      <input
                        type="text"
                        value={topic}
                        onChange={(e) => handleArrayField('avoidTopics', idx, e.target.value)}
                        className="flex-1 px-4 py-2 bg-bg-glass border border-border rounded-lg text-white focus:outline-none focus:border-cyan transition-colors"
                        placeholder="Topic to avoid"
                      />
                      <button
                        onClick={() => removeArrayField('avoidTopics', idx)}
                        className="px-3 py-2 bg-error/20 text-error rounded-lg hover:bg-error/30 transition-colors"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                  <button
                    onClick={() => addArrayField('avoidTopics')}
                    className="w-full px-4 py-2 bg-cyan/10 border border-cyan/50 text-cyan rounded-lg hover:bg-cyan/20 transition-colors text-sm font-semibold"
                  >
                    + Add Topic
                  </button>
                </div>
              </div>
            </div>
          </GlassCard>

          {/* Save Button */}
          <div className="flex gap-4">
            <NeonButton
              onClick={handleSave}
              disabled={saving}
              className="flex-1"
            >
              {saving ? 'Saving...' : 'Save Brand Kit'}
            </NeonButton>
          </div>
        </div>
      </div>
    </div>
  );
}
