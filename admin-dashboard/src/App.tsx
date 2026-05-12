import React, { useState, useEffect } from 'react';
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
  Zap
} from 'lucide-react';
import { storeSecureCredential, getSecureCredential, listAllKVKeys, getRawValue } from './lib/puter-bridge';

// --- Configuration ---

const PLATFORM_GROUPS = [
  {
    id: 'social',
    name: 'Social Media',
    icon: <Twitter className="w-5 h-5" />,
    platforms: [
      { id: 'twitter', name: 'X (Twitter)', keys: ['twitter_api_key'] },
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
    ]
  },
  {
    id: 'blogging',
    name: 'Blogging & Editorial',
    icon: <Globe className="w-5 h-5" />,
    platforms: [
      { id: 'wordpress', name: 'WordPress', keys: ['wordpress_api_url', 'wordpress_username', 'wordpress_application_password'] },
      { id: 'medium', name: 'Medium', keys: ['medium_integration_token', 'medium_user_id'] },
    ]
  },
  {
    id: 'newsletters',
    name: 'Newsletters',
    icon: <Mail className="w-5 h-5" />,
    platforms: [
      { id: 'mailchimp', name: 'Mailchimp', keys: ['mailchimp_api_key', 'mailchimp_list_id', 'mailchimp_server_prefix'] },
      { id: 'klaviyo', name: 'Klaviyo', keys: ['klaviyo_api_key'] },
      { id: 'convertkit', name: 'ConvertKit', keys: ['convertkit_api_key'] },
    ]
  },
  {
    id: 'commerce',
    name: 'E-commerce',
    icon: <ShoppingCart className="w-5 h-5" />,
    platforms: [
      { id: 'shopify', name: 'Shopify', keys: ['shopify_store_url', 'shopify_access_token'] },
      { id: 'etsy', name: 'Etsy', keys: ['etsy_api_key'] },
      { id: 'amazon', name: 'Amazon', keys: ['amazon_api_key', 'amazon_access_key', 'amazon_secret_key'] },
    ]
  },
  {
    id: 'ai_media',
    name: 'AI & Media',
    icon: <Video className="w-5 h-5" />,
    platforms: [
      { id: 'fal_ltx', name: 'Fal/LTX', keys: ['fal_key', 'ltx_key', 'ltx_endpoint', 'ltx_open_endpoint'] },
      { id: 'elevenlabs', name: 'ElevenLabs', keys: ['elevenlabs_api_key'] },
    ]
  },
  {
    id: 'system',
    name: 'System',
    icon: <Settings className="w-5 h-5" />,
    platforms: [
      { id: 'core', name: 'Core System', keys: ['app_master_secret', 'app_master_salt'] },
    ]
  }
];

// --- Components ---

const Card = ({ children, title, icon }: { children: React.ReactNode; title: string; icon: React.ReactNode }) => (
  <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden mb-6">
    <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center gap-3">
      <span className="text-slate-500">{icon}</span>
      <h3 className="font-semibold text-slate-800">{title}</h3>
    </div>
    <div className="p-6">{children}</div>
  </div>
);

const InputField = ({ label, value, onChange, type = 'text', error }: any) => (
  <div className="flex flex-col gap-1.5 mb-4">
    <label className="text-sm font-medium text-slate-700">{label}</label>
    <input
      type={type}
      value={value || ''}
      onChange={(e) => onChange(e.target.value)}
      className={`px-3 py-2 rounded-lg border text-sm transition-all focus:ring-2 focus:ring-blue-500 outline-none 
        ${error ? 'border-red-500 bg-red-50' : 'border-slate-200 focus:border-blue-500 bg-white'}`}
      placeholder={`Enter ${label.toLowerCase()}...`}
    />
    {error && <span className="text-xs text-red-500">{error}</span>}
  </div>
);

// --- Main App ---

export default function AdminDashboard() {
  const [puterReady, setPuterReady] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null); // ID of platform being saved
  const [status, setStatus] = useState<{type: 'success' | 'error', msg: string} | null>(null);

  useEffect(() => {
    const initPuter = async () => {
      const checkPuter = () => {
        if (typeof window !== 'undefined' && (window as any).puter) {
          setPuterReady(true);
          return true;
        }
        return false;
      };

      if (!checkPuter()) {
        const interval = setInterval(() => {
          if (checkPuter()) clearInterval(interval);
        }, 500);
        return () => clearInterval(interval);
      }
    };
    initPuter();
  }, []);

  useEffect(() => {
    if (puterReady) {
      loadAllSecrets();
    }
  }, [puterReady]);

  async function loadAllSecrets() {
    try {
      setLoading(true);
      const allKeys = await listAllKVKeys();
      const newValues: Record<string, string> = {};

      for (const key of allKeys) {
        if (key.startsWith('cred_')) {
          const realKey = key.replace('cred_', '');
          try {
            newValues[realKey] = await getSecureCredential(realKey);
          } catch {
            // If decryption fails or not found, leave empty
          }
        } else {
          newValues[key] = await getRawValue(key) || '';
        }
      }
      setValues(newValues);
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
      for (const key of keys) {
        const val = values[key];
        if (val) {
          await storeSecureCredential(key, val);
        }
      }
      setStatus({ type: 'success', msg: 'Platform secrets updated successfully!' });
      // Refresh to ensure sync
      await loadAllSecrets();
    } catch (err: any) {
      setStatus({ type: 'error', msg: err.message || 'Failed to save platform secrets' });
    } finally {
      setSaving(null);
      setTimeout(() => setStatus(null), 3000);
    }
  }

  async function handleSaveAll() {
    setSaving('all');
    setStatus(null);
    try {
      for (const group of PLATFORM_GROUPS) {
        for (const platform of group.platforms) {
          for (const key of platform.keys) {
            const val = values[key];
            if (val) {
              await storeSecureCredential(key, val);
            }
          }
        }
      }
      setStatus({ type: 'success', msg: 'All secrets updated successfully!' });
      await loadAllSecrets();
    } catch (err: any) {
      setStatus({ type: 'error', msg: err.message || 'Failed to save all secrets' });
    } finally {
      setSaving(null);
      setTimeout(() => setStatus(null), 3000);
    }
  }

  if (!puterReady) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-10 h-10 text-blue-600 animate-spin" />
          <p className="text-slate-600 font-medium">Connecting to Puter Vault...</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-10 h-10 text-blue-600 animate-spin" />
          <p className="text-slate-600 font-medium">Loading NexusAI Vault...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-blue-600 p-2 rounded-lg">
              <ShieldCheck className="text-white w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900">NexusAI Admin Vault</h1>
              <p className="text-xs text-slate-500">Secure Secret Management</p>
            </div>
          </div>
          
          <button
            onClick={handleSaveAll}
            disabled={saving === 'all'}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white px-4 py-2 rounded-lg font-semibold transition-all shadow-sm shadow-blue-200"
          >
            {saving === 'all' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save All Changes
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-10">
        {/* Status Toasts */}
        {status && (
          <div className={`fixed top-20 right-6 z-50 flex items-center gap-3 px-6 py-4 rounded-xl shadow-xl animate-in fade-in slide-in-from-top-4 duration-300 ${
            status.type === 'success' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-red-50 text-red-800 border border-red-200'
          }`}>
            {status.type === 'success' ? <CheckCircle2 className="w-5 h-5 text-emerald-500" /> : <AlertCircle className="w-5 h-5 text-red-500" />}
            <span className="font-medium">{status.msg}</span>
          </div>
        )}

        {/* Platform Groups */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {PLATFORM_GROUPS.map(group => (
            <div key={group.id} className="space-y-4">
              <div className="flex items-center gap-2 px-2">
                <span className="text-slate-400">{group.icon}</span>
                <h2 className="text-sm font-bold uppercase tracking-wider text-slate.500">{group.name}</h2>
              </div>

              {group.platforms.map(platform => (
                <Card key={platform.id} title={platform.name} icon={
                  platform.id === 'twitter' ? <Twitter className="w-4 h-4 text-blue-400" /> :
                  platform.id === 'linkedin' ? <Linkedin className="w-4 h-4 text-blue-700" /> :
                  platform.id === 'instagram' ? <Instagram className="w-4 h-4 text-pink-500" /> :
                  platform.id === 'facebook' ? <Facebook className="w-4 h-4 text-blue-600" /> :
                  platform.id === 'youtube' ? <Youtube className="w-4 h-4 text-red-600" /> :
                  platform.id === 'mailchimp' ? <Mail className="w-4 h-4 text-yellow-500" /> :
                  platform.id === 'shopify' ? <ShoppingCart className="w-4 h-4 text-green-600" /> :
                  <Layers className="w-4 h-4 text-slate-400" />
                }>
                  <div className="space-y-1">
                    {platform.keys.map(key => (
                      <InputField
                        key={key}
                        label={key.replace(/_/g, ' ').toUpperCase()}
                        value={values[key] || ''}
                        onChange={(val: string) => setValues({ ...values, [key]: val })}
                        type="password"
                      />
                    ))}
                  </div>
                  <div className="mt-4 pt-4 border-t border-slate-100 flex justify-end">
                    <button
                      onClick={() => handleSavePlatform(platform.id, platform.keys)}
                      disabled={saving === platform.id}
                      className="text-sm font-semibold text-blue-600 hover:text-blue-700 disabled:text-blue-300 flex items-center gap-1.5"
                    >
                      {saving === platform.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                      Save {platform.name}
                    </button>
                  </div>
                </Card>
              ))})
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
