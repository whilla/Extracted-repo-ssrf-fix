'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Key,
  Save,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ShieldCheck,
  Globe,
  Mail,
  ShoppingCart,
  Video,
  Twitter,
  Linkedin,
  Instagram,
  Facebook,
  Youtube,
  MessageCircle,
  Send,
  Settings,
  Layers,
  Zap,
  Copy,
  Eye,
  EyeOff,
} from 'lucide-react';

const PLATFORM_GROUPS = [
  {
    id: 'social',
    name: 'Social Media',
    icon: <Twitter className="w-5 h-5" />,
    platforms: [
      { id: 'twitter', name: 'X (Twitter)', keys: ['twitter_api_key', 'twitter_api_secret', 'twitter_access_token', 'twitter_access_secret'] },
      { id: 'linkedin', name: 'LinkedIn', keys: ['linkedin_access_token', 'linkedin_person_id'] },
      { id: 'instagram', name: 'Instagram', keys: ['instagram_access_token', 'instagram_business_account_id'] },
      { id: 'facebook', name: 'Facebook', keys: ['facebook_access_token', 'facebook_page_id'] },
      { id: 'tiktok', name: 'TikTok', keys: ['tiktok_access_token'] },
      { id: 'threads', name: 'Threads', keys: ['threads_access_token', 'threads_user_id'] },
      { id: 'pinterest', name: 'Pinterest', keys: ['pinterest_access_token', 'pinterest_board_id'] },
      { id: 'twitch', name: 'Twitch', keys: ['twitch_access_token', 'twitch_channel_id'] },
      { id: 'discord', name: 'Discord', keys: ['discord_webhook_url'] },
      { id: 'reddit', name: 'Reddit', keys: ['reddit_access_token', 'reddit_client_id'] },
      { id: 'whatsapp', name: 'WhatsApp', keys: ['whatsapp_token', 'whatsapp_phone_id', 'whatsapp_broadcast_list'] },
      { id: 'telegram', name: 'Telegram', keys: ['telegram_bot_token', 'telegram_chat_id'] },
      { id: 'snapchat', name: 'Snapchat', keys: ['snapchat_access_token'] },
    ],
  },
  {
    id: 'blogging',
    name: 'Blogging & Editorial',
    icon: <Globe className="w-5 h-5" />,
    platforms: [
      { id: 'wordpress', name: 'WordPress', keys: ['wordpress_api_url', 'wordpress_username', 'wordpress_application_password'] },
      { id: 'medium', name: 'Medium', keys: ['medium_integration_token', 'medium_user_id'] },
      { id: 'ghost', name: 'Ghost', keys: ['ghost_api_url', 'ghost_admin_api_key'] },
      { id: 'substack', name: 'Substack', keys: ['substack_api_key', 'substack_newsletter_id'] },
    ],
  },
  {
    id: 'newsletters',
    name: 'Newsletters',
    icon: <Mail className="w-5 h-5" />,
    platforms: [
      { id: 'mailchimp', name: 'Mailchimp', keys: ['mailchimp_api_key', 'mailchimp_list_id', 'mailchimp_server_prefix'] },
      { id: 'klaviyo', name: 'Klaviyo', keys: ['klaviyo_api_key', 'klaviyo_template_id', 'klaviyo_list_id'] },
      { id: 'convertkit', name: 'ConvertKit', keys: ['convertkit_api_key'] },
    ],
  },
  {
    id: 'commerce',
    name: 'E-commerce',
    icon: <ShoppingCart className="w-5 h-5" />,
    platforms: [
      { id: 'shopify', name: 'Shopify', keys: ['shopify_store_url', 'shopify_access_token'] },
      { id: 'etsy', name: 'Etsy', keys: ['etsy_api_key', 'etsy_shop_id'] },
      { id: 'amazon', name: 'Amazon', keys: ['amazon_access_key', 'amazon_secret_key', 'amazon_associate_tag'] },
    ],
  },
  {
    id: 'ai_media',
    name: 'AI & Media',
    icon: <Video className="w-5 h-5" />,
    platforms: [
      { id: 'openai', name: 'OpenAI', keys: ['openai_api_key'] },
      { id: 'anthropic', name: 'Anthropic', keys: ['anthropic_api_key'] },
      { id: 'fal_ltx', name: 'Fal/LTX', keys: ['fal_key', 'ltx_key', 'ltx_endpoint'] },
      { id: 'elevenlabs', name: 'ElevenLabs', keys: ['elevenlabs_api_key'] },
      { id: 'replicate', name: 'Replicate', keys: ['replicate_api_key'] },
      { id: 'stability', name: 'Stability AI', keys: ['stability_api_key'] },
      { id: 'ideogram', name: 'Ideogram', keys: ['ideogram_api_key'] },
    ],
  },
  {
    id: 'system',
    name: 'System',
    icon: <Settings className="w-5 h-5" />,
    platforms: [
      { id: 'core', name: 'Core System', keys: ['app_master_secret', 'app_master_salt'] },
      { id: 'ipstack', name: 'Geo-IP (IPStack)', keys: ['ipstack_api_key'] },
      { id: 'n8n', name: 'N8N Automation', keys: ['n8n_url', 'n8n_api_key', 'n8n_bridge_secret'] },
      { id: 'sentry', name: 'Sentry Monitoring', keys: ['sentry_dsn', 'sentry_auth_token'] },
    ],
  },
];

const PLATFORM_ICONS: Record<string, React.ReactNode> = {
  twitter: <Twitter className="w-4 h-4 text-blue-400" />,
  linkedin: <Linkedin className="w-4 h-4 text-blue-700" />,
  instagram: <Instagram className="w-4 h-4 text-pink-500" />,
  facebook: <Facebook className="w-4 h-4 text-blue-600" />,
  youtube: <Youtube className="w-4 h-4 text-red-600" />,
  mailchimp: <Mail className="w-4 h-4 text-yellow-500" />,
  shopify: <ShoppingCart className="w-4 h-4 text-green-600" />,
  discord: <MessageCircle className="w-4 h-4 text-indigo-400" />,
  reddit: <MessageCircle className="w-4 h-4 text-orange-500" />,
  whatsapp: <Send className="w-4 h-4 text-green-500" />,
  telegram: <Send className="w-4 h-4 text-blue-400" />,
  tiktok: <Video className="w-4 h-4 text-white" />,
  wordpress: <Globe className="w-4 h-4 text-blue-500" />,
  medium: <Globe className="w-4 h-4 text-black" />,
  klaviyo: <Mail className="w-4 h-4 text-purple-500" />,
  convertkit: <Mail className="w-4 h-4 text-orange-400" />,
  etsy: <ShoppingCart className="w-4 h-4 text-orange-600" />,
  amazon: <ShoppingCart className="w-4 h-4 text-yellow-600" />,
  openai: <Zap className="w-4 h-4 text-green-400" />,
  anthropic: <Zap className="w-4 h-4 text-purple-400" />,
  elevenlabs: <Video className="w-4 h-4 text-cyan-400" />,
  replicate: <Zap className="w-4 h-4 text-yellow-400" />,
  ipstack: <Globe className="w-4 h-4 text-teal-400" />,
  n8n: <Layers className="w-4 h-4 text-red-400" />,
  sentry: <ShieldCheck className="w-4 h-4 text-red-500" />,
};

export default function AdminVaultPage() {
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [status, setStatus] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    loadAllSecrets();
  }, []);

  async function loadAllSecrets() {
    try {
      setLoading(true);
      const res = await fetch('/api/credentials');
      if (res.ok) {
        const data = await res.json();
        setValues(data.configured || {});
      }
    } catch (err) {
      console.error('Failed to load secrets:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleSavePlatform(platformId: string, keys: string[]) {
    setSaving(platformId);
    setStatus(null);
    try {
      const credentials: Record<string, string> = {};
      for (const key of keys) {
        const val = values[key];
        if (val && !val.startsWith('****')) {
          credentials[key] = val;
        }
      }

      const res = await fetch('/api/credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credentials }),
      });

      if (!res.ok) {
        throw new Error('Failed to save credentials');
      }

      setStatus({ type: 'success', msg: `${platformId} credentials updated successfully!` });
      await loadAllSecrets();
    } catch (err: any) {
      setStatus({ type: 'error', msg: err.message || 'Failed to save credentials' });
    } finally {
      setSaving(null);
      setTimeout(() => setStatus(null), 3000);
    }
  }

  async function handleSaveAll() {
    setSaving('all');
    setStatus(null);
    try {
      const credentials: Record<string, string> = {};
      for (const group of PLATFORM_GROUPS) {
        for (const platform of group.platforms) {
          for (const key of platform.keys) {
            const val = values[key];
            if (val && !val.startsWith('****')) {
              credentials[key] = val;
            }
          }
        }
      }

      const res = await fetch('/api/credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credentials }),
      });

      if (!res.ok) {
        throw new Error('Failed to save credentials');
      }

      setStatus({ type: 'success', msg: 'All credentials updated successfully!' });
      await loadAllSecrets();
    } catch (err: any) {
      setStatus({ type: 'error', msg: err.message || 'Failed to save credentials' });
    } finally {
      setSaving(null);
      setTimeout(() => setStatus(null), 3000);
    }
  }

  const toggleVisibility = useCallback((key: string) => {
    setVisibleKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  const copyToClipboard = useCallback((value: string) => {
    navigator.clipboard.writeText(value);
  }, []);

  const filteredGroups = PLATFORM_GROUPS.map((group) => ({
    ...group,
    platforms: group.platforms.filter((platform) => {
      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase();
      return (
        platform.name.toLowerCase().includes(q) ||
        platform.keys.some((k) => k.toLowerCase().includes(q))
      );
    }),
  })).filter((group) => group.platforms.length > 0);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-10 h-10 text-nexus-cyan animate-spin" />
          <p className="text-muted-foreground font-medium">Loading credential vault...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      <header className="bg-card border-b border-border sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-nexus-cyan/10 p-2 rounded-lg">
              <ShieldCheck className="text-nexus-cyan w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-foreground">Credential Vault</h1>
              <p className="text-xs text-muted-foreground">Secure API key management</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <input
              type="text"
              placeholder="Search credentials..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-muted/50 border border-border rounded-lg px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-nexus-cyan/50 w-64"
            />
            <button
              onClick={handleSaveAll}
              disabled={saving === 'all'}
              className="flex items-center gap-2 bg-nexus-cyan hover:bg-nexus-cyan/90 disabled:bg-nexus-cyan/50 text-black px-4 py-2 rounded-lg font-semibold transition-all"
            >
              {saving === 'all' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save All
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {status && (
          <div
            className={`fixed top-20 right-6 z-50 flex items-center gap-3 px-6 py-4 rounded-xl shadow-xl animate-in fade-in slide-in-from-top-4 duration-300 ${
              status.type === 'success'
                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                : 'bg-red-500/10 text-red-400 border border-red-500/20'
            }`}
          >
            {status.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5" />
            ) : (
              <AlertCircle className="w-5 h-5" />
            )}
            <span className="font-medium">{status.msg}</span>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {filteredGroups.map((group) => (
            <div key={group.id} className="space-y-4">
              <div className="flex items-center gap-2 px-2">
                <span className="text-muted-foreground">{group.icon}</span>
                <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">{group.name}</h2>
              </div>

              {group.platforms.map((platform) => (
                <div
                  key={platform.id}
                  className="bg-card rounded-xl border border-border overflow-hidden"
                >
                  <div className="px-6 py-4 border-b border-border bg-muted/30 flex items-center gap-3">
                    <span className="text-muted-foreground">
                      {PLATFORM_ICONS[platform.id] || <Layers className="w-4 h-4 text-muted-foreground" />}
                    </span>
                    <h3 className="font-semibold text-foreground">{platform.name}</h3>
                  </div>

                  <div className="p-6 space-y-4">
                    {platform.keys.map((key) => {
                      const isVisible = visibleKeys.has(key);
                      const value = values[key] || '';
                      const isMasked = value.startsWith('****');
                      const isConfigured = value.length >= 8;

                      return (
                        <div key={key} className="space-y-1.5">
                          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                            {key.replace(/_/g, ' ')}
                          </label>
                          <div className="relative">
                            <input
                              type={isVisible ? 'text' : 'password'}
                              value={value}
                              onChange={(e) =>
                                setValues({ ...values, [key]: e.target.value })
                              }
                              className="w-full bg-muted/50 border border-border rounded-lg px-3 py-2 pr-20 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-nexus-cyan/50"
                              placeholder={`Enter ${key.replace(/_/g, ' ')}...`}
                            />
                            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                              {value && (
                                <>
                                  {!isMasked && (
                                    <>
                                      <button
                                        onClick={() => toggleVisibility(key)}
                                        className="p-1 text-muted-foreground hover:text-foreground transition-colors"
                                        title={isVisible ? 'Hide' : 'Show'}
                                      >
                                        {isVisible ? (
                                          <EyeOff className="w-4 h-4" />
                                        ) : (
                                          <Eye className="w-4 h-4" />
                                        )}
                                      </button>
                                      <button
                                        onClick={() => copyToClipboard(value)}
                                        className="p-1 text-muted-foreground hover:text-foreground transition-colors"
                                        title="Copy"
                                      >
                                        <Copy className="w-4 h-4" />
                                      </button>
                                    </>
                                  )}
                                </>
                              )}
                              {isConfigured && (
                                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="px-6 py-3 border-t border-border bg-muted/20 flex justify-end">
                    <button
                      onClick={() => handleSavePlatform(platform.id, platform.keys)}
                      disabled={saving === platform.id}
                      className="text-sm font-semibold text-nexus-cyan hover:text-nexus-cyan/80 disabled:text-muted-foreground flex items-center gap-1.5 transition-colors"
                    >
                      {saving === platform.id ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <Save className="w-3 h-3" />
                      )}
                      Save {platform.name}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
