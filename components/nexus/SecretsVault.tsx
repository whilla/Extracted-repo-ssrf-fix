'use client';

import React, { useState, useEffect } from 'react';
import { CredentialVaultService } from '@/lib/services/credentialVaultService';
import { NeonButton } from './NeonButton';
import { GlassCard } from './GlassCard';
import { PageHeader } from './PageHeader';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Lock, Eye, EyeOff, Save, Trash2, ShieldCheck } from 'lucide-react';

interface SecretField {
  key: string;
  label: string;
  value: string;
  isVisible: boolean;
}

interface SecretGroup {
  id: string;
  name: string;
  keys: string[];
}

const PLATFORM_GROUPS: SecretGroup[] = [
  { id: 'social', name: 'Social Media', keys: ['twitter_api_key', 'twitter_api_secret', 'linkedin_access_token', 'facebook_access_token', 'instagram_access_token', 'tiktok_access_token'] },
  { id: 'ecommerce', name: 'E-Commerce', keys: ['shopify_access_token', 'shopify_store_url', 'amazon_api_key', 'amazon_associate_tag', 'etsy_api_key'] },
  { id: 'newsletter', name: 'Newsletters', keys: ['mailchimp_api_key', 'klaviyo_api_key', 'convertkit_api_key'] },
  { id: 'blogging', name: 'Blogging Platforms', keys: ['wordpress_app_password', 'medium_token', 'ghost_admin_api_key'] },
];

export function SecretsVault() {
  const [loading, setLoading] = useState(true);
  const [groupSecrets, setGroupSecrets] = useState<Record<string, SecretField[]>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);

  useEffect(() => {
    loadAllSecrets();
  }, []);

  async function loadAllSecrets() {
    setLoading(true);
    try {
      const newGroupSecrets: Record<string, SecretField[]> = {};
      
      for (const group of PLATFORM_GROUPS) {
        const secrets = await CredentialVaultService.getSecretsByGroup(group.id, group.keys);
        newGroupSecrets[group.id] = group.keys.map(key => ({
          key,
          label: key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
          value: secrets[key] || '',
          isVisible: false
        }));
      }
      
      setGroupSecrets(newGroupSecrets);
    } catch (e) {
      toast.error('Failed to load vault credentials');
    } finally {
      setLoading(false);
    }
  }

  async function handleUpdateSecret(groupId: string, key: string, newValue: string) {
    setSavingKey(key);
    try {
      await CredentialVaultService.setSecret(key, newValue);
      
      // Update local state
      setGroupSecrets(prev => ({
        ...prev,
        [groupId]: prev[groupId].map(f => f.key === key ? { ...f, value: newValue } : f)
      }));
      
      toast.success(`Secret ${key} updated and encrypted`);
    } catch (e) {
      toast.error('Failed to save secret');
    } finally {
      setSavingKey(null);
    }
  }

  async function handleRemoveSecret(groupId: string, key: string) {
    if (!confirm(`Are you sure you want to remove ${key}?`)) return;
    
    try {
      await CredentialVaultService.deleteSecret(key);
      setGroupSecrets(prev => ({
        ...prev,
        [groupId]: prev[groupId].map(f => f.key === key ? { ...f, value: '' } : f)
      }));
      toast.success('Secret removed');
    } catch (e) {
      toast.error('Failed to remove secret');
    }
  }

  function toggleVisibility(groupId: string, key: string) {
    setGroupSecrets(prev => ({
      ...prev,
      [groupId]: prev[groupId].map(f => f.key === key ? { ...f, isVisible: !f.isVisible } : f)
    }));
  }

  if (loading) return <div className="flex justify-center p-12"><LoadingPulse /></div>;

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center gap-3 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
        <ShieldCheck className="w-5 h-5" />
        <p className="text-sm font-medium">
          All credentials are encrypted using AES-GCM (SEC_V2) before being stored. 
          They are never stored in plain text.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {PLATFORM_GROUPS.map(group => (
          <GlassCard key={group.id} className="p-6 space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold flex items-center gap-2">
                <Lock className="w-4 h-4 text-purple-400" />
                {group.name}
              </h3>
            </div>

            <div className="space-y-4">
              {(groupSecrets[group.id] || []).map(field => (
                <div key={field.key} className="space-y-2">
                  <Label className="text-xs text-muted-foreground ml-1">{field.label}</Label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Input 
                        type={field.isVisible ? 'text' : 'password'} 
                        value={field.value}
                        onChange={(e) => handleUpdateSecret(group.id, field.key, e.target.value)}
                        className="pr-10"
                        placeholder="Enter key..."
                      />
                      <button 
                        onClick={() => toggleVisibility(group.id, field.key)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {field.isVisible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    <NeonButton 
                      size="sm" 
                      variant="ghost"
                      onClick={() => handleRemoveSecret(group.id, field.key)}
                      disabled={savingKey === field.key}
                    >
                      <Trash2 className="w-4 h-4" />
                    </NeonButton>
                  </div>
                </div>
              ))}
            </div>
          </GlassCard>
        ))}
      </div>
    </div>
  );
}

function LoadingPulse() {
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="w-8 h-8 border-4 border-purple-500/30 border-t-purple-500 rounded-full animate-spin" />
      <p className="text-xs text-muted-foreground animate-pulse">Decrypting Vault...</p>
    </div>
  );
}
