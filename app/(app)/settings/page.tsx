'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/context/AuthContext';
import { GlassCard } from '@/components/nexus/GlassCard';
import { NeonButton } from '@/components/nexus/NeonButton';
import { StatusBadge } from '@/components/nexus/StatusBadge';
import { kvDelete, kvGet, kvSet } from '@/lib/services/puterService';
import { saveProviderAccount, verifyProviderKey } from '@/lib/services/accountService';
import { sanitizeApiKey, sanitizeStoredValueForKey } from '@/lib/services/providerCredentialUtils';
import { setActiveChatModel } from '@/lib/services/providerControl';
import {
  Brain,
  Zap,
  Cloud,
  Server,
  Sparkles,
  Music,
  Share2,
  Mic,
  Eye,
  EyeOff,
  ExternalLink,
  CheckCircle2,
  Lock,
  ShoppingCart,
  Shield,
  Users,
  Gamepad2,
  BarChart3,
  Cuboid,
  TrendingUp,
  Link2,
  XCircle,
  Loader2,
} from 'lucide-react';
import { toast } from 'sonner';

import { SecretsVault } from '@/components/nexus/SecretsVault';
import { CRMTabContent } from '@/components/settings/CRMTabContent';

const SOCIAL_PLATFORMS = [
  { id: 'twitter', name: 'X (Twitter)', icon: '𝕏', color: 'bg-gray-800' },
  { id: 'linkedin', name: 'LinkedIn', icon: 'in', color: 'bg-blue-700' },
  { id: 'facebook', name: 'Facebook', icon: 'f', color: 'bg-blue-600' },
  { id: 'instagram', name: 'Instagram', icon: '📷', color: 'bg-pink-600' },
  { id: 'tiktok', name: 'TikTok', icon: '♪', color: 'bg-black' },
  { id: 'reddit', name: 'Reddit', icon: '🤖', color: 'bg-orange-600' },
  { id: 'discord', name: 'Discord', icon: '💬', color: 'bg-indigo-600' },
  { id: 'telegram', name: 'Telegram', icon: '✈', color: 'bg-sky-500' },
  { id: 'youtube', name: 'YouTube', icon: '▶', color: 'bg-red-600' },
  { id: 'pinterest', name: 'Pinterest', icon: '📌', color: 'bg-red-500' },
  { id: 'threads', name: 'Threads', icon: '@', color: 'bg-gray-900' },
  { id: 'whatsapp', name: 'WhatsApp', icon: '📱', color: 'bg-green-600' },
  { id: 'snapchat', name: 'Snapchat', icon: '👻', color: 'bg-yellow-400' },
];

function SocialConnections() {
  const [connections, setConnections] = useState<Record<string, { connected: boolean }>>({});
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/social/connections')
      .then((r) => r.json())
      .then((data) => {
        if (data.success) setConnections(data.connections);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const handleConnect = (platform: string) => {
    setConnecting(platform);
    window.location.href = `/api/social/oauth?platform=${platform}`;
  };

  const handleDisconnect = async (platform: string) => {
    try {
      const res = await fetch(`/api/social/oauth?platform=${platform}`, { method: 'DELETE' });
      if (res.ok) {
        setConnections((prev) => ({ ...prev, [platform]: { connected: false } }));
        toast.success(`${platform} disconnected`);
      }
    } catch {
      toast.error('Failed to disconnect');
    }
  };

  if (loading) {
    return <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Loading connections...</div>;
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
      {SOCIAL_PLATFORMS.map((platform) => {
        const isConnected = connections[platform.id]?.connected;
        return (
          <div
            key={platform.id}
            className={`flex items-center gap-3 p-3 rounded-lg border transition-all ${
              isConnected ? 'border-nexus-cyan/30 bg-nexus-cyan/5' : 'border-border bg-muted/20'
            }`}
          >
            <div className={`w-8 h-8 rounded-full ${platform.color} flex items-center justify-center text-white text-xs font-bold`}>
              {platform.icon}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground truncate">{platform.name}</p>
              <p className="text-xs text-muted-foreground">{isConnected ? 'Connected' : 'Not connected'}</p>
            </div>
            {isConnected ? (
              <button
                onClick={() => handleDisconnect(platform.id)}
                className="p-1.5 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded transition-colors"
                title="Disconnect"
              >
                <XCircle className="w-4 h-4" />
              </button>
            ) : (
              <button
                onClick={() => handleConnect(platform.id)}
                disabled={connecting === platform.id}
                className="px-2 py-1 text-xs font-medium text-nexus-cyan hover:text-nexus-cyan/80 border border-nexus-cyan/30 rounded hover:bg-nexus-cyan/10 transition-colors disabled:opacity-50"
              >
                {connecting === platform.id ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Connect'}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

// All supported AI providers
const AI_PROVIDERS = [
  {
    id: 'puter',
    name: 'Puter AI (Built-in)',
    description: 'GPT-4o, Claude via Puter - No key required',
    models: ['gpt-4o', 'gpt-4o-mini', 'claude-sonnet-4-5', 'claude-opus-4'],
    keyRequired: false,
    docsUrl: 'https://puter.com',
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    description: 'Access 100+ models including Llama, Mistral, Qwen',
    models: ['openai/gpt-4o', 'anthropic/claude-3-opus', 'meta-llama/llama-3.1-405b', 'mistralai/mixtral-8x22b'],
    keyRequired: true,
    docsUrl: 'https://openrouter.ai/keys',
  },
  {
    id: 'githubmodels',
    name: 'GitHub Models',
    description: 'GitHub-hosted access to GPT, Claude, Llama, Mistral and more',
    models: ['openai/gpt-4o', 'meta-llama/Llama-3.3-70B-Instruct', 'mistral-ai/Mistral-Large-2411'],
    keyRequired: true,
    docsUrl: 'https://github.com/marketplace/models',
  },
  {
    id: 'bytez',
    name: 'Bytez',
    description: 'Hosted open-source LLM access with API key routing',
    models: ['Qwen/Qwen3-4B', 'meta-llama/Llama-3.3-70B-Instruct', 'deepseek-ai/DeepSeek-V3'],
    keyRequired: true,
    docsUrl: 'https://www.bytez.com',
  },
  {
    id: 'poe',
    name: 'Poe',
    description: 'Poe API access for frontier chat models',
    models: ['Claude-Sonnet-4.6', 'GPT-4o', 'Gemini-2.5-Pro'],
    keyRequired: true,
    docsUrl: 'https://creator.poe.com/docs/server-bots/poe-api-bots',
  },
  {
    id: 'groq',
    name: 'Groq',
    description: 'Ultra-fast inference - Llama, Mixtral at lightning speed',
    models: ['llama-3.1-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768'],
    keyRequired: true,
    docsUrl: 'https://console.groq.com/keys',
  },
  {
    id: 'gemini',
    name: 'Google Gemini',
    description: 'Gemini Pro with 1M context window',
    models: ['gemini-1.5-pro', 'gemini-1.5-flash'],
    keyRequired: true,
    docsUrl: 'https://aistudio.google.com/app/apikey',
  },
  {
    id: 'nvidia',
    name: 'NVIDIA NIM',
    description: 'Enterprise-grade Llama 3.1 405B',
    models: ['meta/llama-3.1-405b-instruct', 'meta/llama-3.1-70b-instruct'],
    keyRequired: true,
    docsUrl: 'https://build.nvidia.com/explore/discover',
  },
  {
    id: 'together',
    name: 'Together AI',
    description: 'Fast open-source model inference',
    models: ['meta-llama/Llama-3-70b-chat-hf', 'mistralai/Mixtral-8x7B-Instruct-v0.1'],
    keyRequired: true,
    docsUrl: 'https://api.together.xyz/settings/api-keys',
  },
  {
    id: 'fireworks',
    name: 'Fireworks AI',
    description: 'Production-ready model serving',
    models: ['accounts/fireworks/models/llama-v3p1-70b-instruct'],
    keyRequired: true,
    docsUrl: 'https://fireworks.ai/api-keys',
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    description: 'Advanced reasoning with DeepSeek V3',
    models: ['deepseek-chat', 'deepseek-coder'],
    keyRequired: true,
    docsUrl: 'https://platform.deepseek.com',
  },
  {
    id: 'ollama',
    name: 'Ollama (Local)',
    description: 'Run models locally on your machine',
    models: ['llama3', 'mistral', 'codellama', 'phi3'],
    keyRequired: false,
    docsUrl: 'https://ollama.ai',
    needsUrl: true,
  },
];

function parseArraySetting(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return value.split(',').map(s => s.trim()).filter(Boolean);
  }
}

export default function SettingsPage() {
  const { user, logout } = useAuth();
  const [settings, setSettings] = useState({
    aiModel: 'gpt-4o',
    imageProvider: 'puter',
    videoProvider: 'ltx23',
    elevenLabsKey: '',
    speechifyKey: '',
    playhtKey: '',
    resembleKey: '',
    ayrshareKey: '',
    sunoKey: '',
    udioKey: '',
    beatovenKey: '',
    soundrawKey: '',
    // AI Providers
    geminiKey: '',
    openrouterKey: '',
    githubModelsKey: '',
    bytezKey: '',
    poeKey: '',
    groqKey: '',
    nvidiaKey: '',
    togetherKey: '',
    fireworksKey: '',
    deepseekKey: '',
    ollamaUrl: 'http://localhost:11434',
    // Image Providers
    stabilityKey: '',
    leonardoKey: '',
    ideogramKey: '',
    falKey: '',
    ltxEndpoint: 'fal-ai/ltx-2.3/text-to-video/fast',
    ltxOpenEndpoint: '',
    // APILayer Discovery
    mediaStackKey: '',
    serpStackKey: '',
    userStackKey: '',
    ipStackKey: '',
    numVerifyKey: '',
    // E-Commerce
    shopifyStoreUrl: '',
    shopifyAccessToken: '',
    amazonApiKey: '',
    amazonSecretKey: '',
    amazonSellerId: '',
    amazonAssociateTag: '',
    amazonRegion: 'us-east-1',
    etsyApiKey: '',
    etsyShopId: '',
    // Compliance
    complianceRegions: [] as string[],
    blockedTopics: [] as string[],
    blockedWords: [] as string[],
  });
  const [saving, setSaving] = useState(false);
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const [providerValidation, setProviderValidation] = useState<Record<string, { status: 'idle' | 'checking' | 'valid' | 'invalid'; message?: string }>>({});
  const [activeTab, setActiveTab] = useState<'ai' | 'publishing' | 'audio' | 'image' | 'discovery' | 'secrets' | 'ecommerce' | 'compliance' | 'crm' | 'interactive' | 'dataviz' | 'spatial' | 'predictive'>('ai');

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const [
          aiModel,
          imageProvider,
          videoProvider,
          ayrshareKey,
          elevenLabsKey,
          speechifyKey,
          playhtKey,
          resembleKey,
          sunoKey,
          udioKey,
          beatovenKey,
          soundrawKey,
          geminiKey,
          openrouterKey,
          githubModelsKey,
          bytezKey,
          poeKey,
          groqKey,
          nvidiaKey,
          togetherKey,
          fireworksKey,
          deepseekKey,
          ollamaUrl,
          stabilityKey,
          leonardoKey,
          ideogramKey,
          falKey,
          ltxEndpoint,
          ltxOpenEndpoint,
          mediaStackKey,
          serpStackKey,
          userStackKey,
          ipStackKey,
          numVerifyKey,
          shopifyStoreUrl,
          shopifyAccessToken,
          amazonApiKey,
          amazonSecretKey,
          amazonSellerId,
          amazonAssociateTag,
          amazonRegion,
          etsyApiKey,
          etsyShopId,
          complianceRegions,
          blockedTopics,
          blockedWords,
        ] = await Promise.all([
          kvGet('ai_model'),
          kvGet('image_provider'),
          kvGet('video_provider'),
          kvGet('ayrshare_key'),
          kvGet('elevenlabs_key'),
          kvGet('speechify_key'),
          kvGet('playht_key'),
          kvGet('resemble_key'),
          kvGet('suno_key'),
          kvGet('udio_key'),
          kvGet('beatoven_key'),
          kvGet('soundraw_key'),
          kvGet('gemini_key'),
          kvGet('openrouter_key'),
          kvGet('github_models_key'),
          kvGet('bytez_key'),
          kvGet('poe_key'),
          kvGet('groq_key'),
          kvGet('nvidia_key'),
          kvGet('together_key'),
          kvGet('fireworks_key'),
          kvGet('deepseek_key'),
          kvGet('ollama_url'),
          kvGet('stability_key'),
          kvGet('leonardo_key'),
          kvGet('ideogram_key'),
          kvGet('fal_key'),
          kvGet('ltx_endpoint'),
          kvGet('ltx_open_endpoint'),
          kvGet('mediastack_key'),
          kvGet('serpstack_key'),
          kvGet('userstack_key'),
          kvGet('ipstack_key'),
          kvGet('numverify_key'),
          kvGet('shopify_store_url'),
          kvGet('shopify_access_token'),
          kvGet('amazon_api_key'),
          kvGet('amazon_secret_key'),
          kvGet('amazon_seller_id'),
          kvGet('amazon_associate_tag'),
          kvGet('amazon_region'),
          kvGet('etsy_api_key'),
          kvGet('etsy_shop_id'),
          kvGet('compliance_regions'),
          kvGet('blocked_topics'),
          kvGet('blocked_words'),
        ]);

        setSettings({
          aiModel: aiModel || 'gpt-4o',
          imageProvider: imageProvider || 'puter',
          videoProvider: videoProvider || 'ltx23',
          ayrshareKey: ayrshareKey || '',
          elevenLabsKey: elevenLabsKey || '',
          speechifyKey: speechifyKey || '',
          playhtKey: playhtKey || '',
          resembleKey: resembleKey || '',
          sunoKey: sunoKey || '',
          udioKey: udioKey || '',
          beatovenKey: beatovenKey || '',
          soundrawKey: soundrawKey || '',
          geminiKey: geminiKey || '',
          openrouterKey: openrouterKey || '',
          githubModelsKey: githubModelsKey || '',
          bytezKey: bytezKey || '',
          poeKey: poeKey || '',
          groqKey: groqKey || '',
          nvidiaKey: nvidiaKey || '',
          togetherKey: togetherKey || '',
          fireworksKey: fireworksKey || '',
          deepseekKey: deepseekKey || '',
          ollamaUrl: ollamaUrl || 'http://localhost:11434',
          stabilityKey: stabilityKey || '',
          leonardoKey: leonardoKey || '',
          ideogramKey: ideogramKey || '',
          falKey: falKey || '',
          ltxEndpoint: ltxEndpoint || 'fal-ai/ltx-2.3/text-to-video/fast',
          ltxOpenEndpoint: ltxOpenEndpoint || '',
          mediaStackKey: mediaStackKey || '',
          serpStackKey: serpStackKey || '',
          userStackKey: userStackKey || '',
          ipStackKey: ipStackKey || '',
          numVerifyKey: numVerifyKey || '',
          shopifyStoreUrl: shopifyStoreUrl || '',
          shopifyAccessToken: shopifyAccessToken || '',
          amazonApiKey: amazonApiKey || '',
          amazonSecretKey: amazonSecretKey || '',
          amazonSellerId: amazonSellerId || '',
          amazonAssociateTag: amazonAssociateTag || '',
          amazonRegion: amazonRegion || 'us-east-1',
          etsyApiKey: etsyApiKey || '',
          etsyShopId: etsyShopId || '',
          complianceRegions: parseArraySetting(complianceRegions),
          blockedTopics: parseArraySetting(blockedTopics),
          blockedWords: parseArraySetting(blockedWords),
        });
      } catch (error) {
        console.error('Settings load error:', error);
      }
    };

    loadSettings();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const syncStoredValue = (key: string, value: string | string[]) => {
        const stringValue = Array.isArray(value) ? value.join(',') : value;
        const trimmed = sanitizeStoredValueForKey(key, stringValue);
        return trimmed ? kvSet(key, trimmed) : kvDelete(key);
      };

      const storedSettings: Array<[string, string | string[] | undefined]> = [
        ['elevenlabs_key', settings.elevenLabsKey],
        ['speechify_key', settings.speechifyKey],
        ['playht_key', settings.playhtKey],
        ['resemble_key', settings.resembleKey],
        ['suno_key', settings.sunoKey],
        ['udio_key', settings.udioKey],
        ['beatoven_key', settings.beatovenKey],
        ['soundraw_key', settings.soundrawKey],
        ['ayrshare_key', settings.ayrshareKey],
        ['gemini_key', settings.geminiKey],
        ['openrouter_key', settings.openrouterKey],
        ['github_models_key', settings.githubModelsKey],
        ['bytez_key', settings.bytezKey],
        ['poe_key', settings.poeKey],
        ['groq_key', settings.groqKey],
        ['nvidia_key', settings.nvidiaKey],
        ['together_key', settings.togetherKey],
        ['fireworks_key', settings.fireworksKey],
        ['deepseek_key', settings.deepseekKey],
        ['ollama_url', settings.ollamaUrl],
        ['stability_key', settings.stabilityKey],
        ['leonardo_key', settings.leonardoKey],
        ['ideogram_key', settings.ideogramKey],
        ['fal_key', settings.falKey],
        ['ltx_endpoint', settings.ltxEndpoint],
        ['ltx_open_endpoint', settings.ltxOpenEndpoint],
        ['mediastack_key', settings.mediaStackKey],
        ['serpstack_key', settings.serpStackKey],
        ['userstack_key', settings.userStackKey],
        ['ipstack_key', settings.ipStackKey],
        ['numverify_key', settings.numVerifyKey],
        ['shopify_store_url', settings.shopifyStoreUrl],
        ['shopify_access_token', settings.shopifyAccessToken],
        ['amazon_api_key', settings.amazonApiKey],
        ['amazon_secret_key', settings.amazonSecretKey],
        ['amazon_seller_id', settings.amazonSellerId],
        ['amazon_associate_tag', settings.amazonAssociateTag],
        ['amazon_region', settings.amazonRegion],
        ['etsy_api_key', settings.etsyApiKey],
        ['etsy_shop_id', settings.etsyShopId],
        ['compliance_regions', settings.complianceRegions],
        ['blocked_topics', settings.blockedTopics],
        ['blocked_words', settings.blockedWords],
      ];

      const savePromises = [
        setActiveChatModel(settings.aiModel),
        kvSet('image_provider', settings.imageProvider),
        kvSet('video_provider', settings.videoProvider),
        ...storedSettings.map(([key, value]) => value !== undefined ? syncStoredValue(key, value) : Promise.resolve()),
      ];
      
      await Promise.all(savePromises);

      await Promise.all([
        validateAndPersistProvider('openrouter', settings.openrouterKey),
        validateAndPersistProvider('githubmodels', settings.githubModelsKey),
        validateAndPersistProvider('bytez', settings.bytezKey),
        validateAndPersistProvider('poe', settings.poeKey),
        validateAndPersistProvider('groq', settings.groqKey),
        validateAndPersistProvider('gemini', settings.geminiKey),
        validateAndPersistProvider('deepseek', settings.deepseekKey),
        validateAndPersistProvider('suno', settings.sunoKey),
      ]);

      toast.success('Settings saved successfully!');
    } catch (error) {
      console.error('Save error:', error);
      toast.error('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const toggleKeyVisibility = (key: string) => {
    setShowKeys(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const validateAndPersistProvider = async (providerId: string, apiKey: string) => {
    const sanitizedApiKey = sanitizeApiKey(apiKey);
    if (!sanitizedApiKey) return;

    setProviderValidation(prev => ({
      ...prev,
      [providerId]: { status: 'checking', message: 'Checking key...' },
    }));

    const verification = await verifyProviderKey(providerId, sanitizedApiKey);
    if (!verification.valid) {
      setProviderValidation(prev => ({
        ...prev,
        [providerId]: { status: 'invalid', message: verification.error || 'Invalid key' },
      }));
      return;
    }

    await saveProviderAccount({
      provider: providerId,
      apiKey: sanitizedApiKey,
      status: 'active',
      tier: 'free',
      lastVerified: new Date().toISOString(),
    });

    setProviderValidation(prev => ({
      ...prev,
      [providerId]: { status: 'valid', message: 'Key verified and saved' },
    }));
  };

  const getKeyForProvider = (providerId: string): string => {
    const keyMap: Record<string, string> = {
      gemini: settings.geminiKey,
      openrouter: settings.openrouterKey,
      githubmodels: settings.githubModelsKey,
      bytez: settings.bytezKey,
      poe: settings.poeKey,
      groq: settings.groqKey,
      nvidia: settings.nvidiaKey,
      together: settings.togetherKey,
      fireworks: settings.fireworksKey,
      deepseek: settings.deepseekKey,
    };
    return keyMap[providerId] || '';
  };

  const setKeyForProvider = (providerId: string, value: string) => {
    const keyMap: Record<string, keyof typeof settings> = {
      gemini: 'geminiKey',
      openrouter: 'openrouterKey',
      githubmodels: 'githubModelsKey',
      bytez: 'bytezKey',
      poe: 'poeKey',
      groq: 'groqKey',
      nvidia: 'nvidiaKey',
      together: 'togetherKey',
      fireworks: 'fireworksKey',
      deepseek: 'deepseekKey',
    };
    const key = keyMap[providerId];
    if (key) {
      setSettings(prev => ({ ...prev, [key]: value }));
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-foreground">Settings</h1>
        <p className="text-muted-foreground mt-2">
          Configure your NexusAI account, AI providers, and integrations
        </p>
      </div>

      {/* Account Card */}
      <GlassCard className="p-6">
        <h2 className="text-xl font-semibold text-foreground mb-4">Account</h2>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-nexus-cyan to-nexus-violet flex items-center justify-center text-lg font-bold text-background">
              {user?.username?.[0]?.toUpperCase() || 'U'}
            </div>
            <div>
              <p className="font-medium text-foreground">{user?.username}</p>
              <p className="text-sm text-muted-foreground">Signed in with Puter</p>
            </div>
          </div>
          <NeonButton variant="ghost" onClick={logout}>
            Sign Out
          </NeonButton>
        </div>
      </GlassCard>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-border pb-2 overflow-x-auto">
        {[
          { id: 'ai', label: 'AI Providers', icon: Brain },
          { id: 'publishing', label: 'Publishing', icon: Share2 },
          { id: 'audio', label: 'Audio & Music', icon: Music },
          { id: 'image', label: 'Image & Video', icon: Sparkles },
          { id: 'discovery', label: 'Nexus Discovery', icon: Zap },
          { id: 'interactive', label: 'Interactive', icon: Gamepad2 },
          { id: 'dataviz', label: 'Data Viz', icon: BarChart3 },
          { id: 'spatial', label: 'Spatial', icon: Cuboid },
          { id: 'predictive', label: 'Predictive', icon: TrendingUp },
          { id: 'ecommerce', label: 'E-Commerce', icon: ShoppingCart },
          { id: 'compliance', label: 'Compliance', icon: Shield },
          { id: 'crm', label: 'CRM', icon: Users },
          { id: 'secrets', label: 'Credential Vault', icon: Lock },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as typeof activeTab)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
              activeTab === tab.id
                ? 'bg-nexus-cyan/20 text-nexus-cyan'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* AI Providers Tab */}
      {activeTab === 'ai' && (
        <div className="space-y-4">
          {/* Primary Model Selector */}
          <GlassCard className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <Sparkles className="w-5 h-5 text-nexus-violet" />
              <h3 className="text-lg font-semibold text-foreground">Primary AI Model</h3>
            </div>
            <select
              value={settings.aiModel}
              onChange={(e) => setSettings(prev => ({ ...prev, aiModel: e.target.value }))}
              className="w-full px-4 py-3 rounded-lg bg-background/50 border border-border focus:border-nexus-cyan focus:ring-1 focus:ring-nexus-cyan outline-none transition-colors"
            >
              <optgroup label="Puter AI (No Key Required)">
                <option value="gpt-4o">GPT-4o (Recommended)</option>
                <option value="gpt-4o-mini">GPT-4o Mini (Faster)</option>
                <option value="claude-sonnet-4-5">Claude Sonnet</option>
                <option value="claude-opus-4">Claude Opus</option>
              </optgroup>
              <optgroup label="Custom Providers (Requires API Key)">
                <option value="gemini-1.5-pro">Gemini Pro (Google)</option>
                <option value="openrouter/auto">OpenRouter Auto</option>
                <option value="openai/gpt-4o">GPT-4o (GitHub Models)</option>
                <option value="Claude-Sonnet-4.6">Claude Sonnet 4.6 (Poe)</option>
                <option value="Qwen/Qwen3-4B">Qwen 3 4B (Bytez)</option>
                <option value="llama-3.3-70b-versatile">Llama 3.3 70B (Groq)</option>
                <option value="meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo">Llama 3.1 70B (Together)</option>
                <option value="accounts/fireworks/models/llama-v3p1-70b-instruct">Llama 3.1 70B (Fireworks)</option>
              </optgroup>
            </select>
            <p className="text-sm text-muted-foreground mt-2">
              This model will be used for content generation by default. You can switch models per task.
            </p>
          </GlassCard>

          {/* Provider Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {AI_PROVIDERS.map(provider => {
              const hasKey = provider.id === 'puter' || provider.id === 'ollama' 
                ? true 
                : !!getKeyForProvider(provider.id);
              const validation = providerValidation[provider.id];
              
              return (
                <GlassCard key={provider.id} className="p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      {provider.id === 'puter' ? (
                        <Cloud className="w-5 h-5 text-nexus-cyan" />
                      ) : provider.id === 'ollama' ? (
                        <Server className="w-5 h-5 text-nexus-success" />
                      ) : (
                        <Zap className="w-5 h-5 text-nexus-violet" />
                      )}
                      <div>
                        <h4 className="font-medium text-foreground">{provider.name}</h4>
                        <p className="text-xs text-muted-foreground">{provider.description}</p>
                      </div>
                    </div>
                    {hasKey && (
                      <CheckCircle2 className="w-5 h-5 text-nexus-success" />
                    )}
                  </div>

                  {provider.keyRequired && (
                    <div className="mt-3">
                      <div className="flex gap-2">
                        <input
                          type={showKeys[provider.id] ? 'text' : 'password'}
                          value={getKeyForProvider(provider.id)}
                          onChange={(e) => setKeyForProvider(provider.id, e.target.value)}
                          placeholder={`Enter ${provider.name} API key...`}
                          className="flex-1 px-3 py-2 text-sm rounded-lg bg-background/50 border border-border focus:border-nexus-cyan outline-none"
                        />
                        <button
                          onClick={() => toggleKeyVisibility(provider.id)}
                          className="p-2 text-muted-foreground hover:text-foreground"
                        >
                          {showKeys[provider.id] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                      <a
                        href={provider.docsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-xs text-nexus-cyan hover:underline mt-2"
                      >
                        Get API Key <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  )}

                  {provider.needsUrl && (
                    <div className="mt-3">
                      <input
                        type="text"
                        value={settings.ollamaUrl}
                        onChange={(e) => setSettings(prev => ({ ...prev, ollamaUrl: e.target.value }))}
                        placeholder="http://localhost:11434"
                        className="w-full px-3 py-2 text-sm rounded-lg bg-background/50 border border-border focus:border-nexus-cyan outline-none"
                      />
                      <p className="text-xs text-muted-foreground mt-1">Local Ollama server URL</p>
                    </div>
                  )}

                  <div className="flex flex-wrap gap-1 mt-3">
                    {provider.models.slice(0, 3).map(model => (
                      <span key={model} className="px-2 py-0.5 text-xs rounded-full bg-background/50 text-muted-foreground">
                        {model.split('/').pop()}
                      </span>
                    ))}
                    {provider.models.length > 3 && (
                      <span className="px-2 py-0.5 text-xs rounded-full bg-background/50 text-muted-foreground">
                        +{provider.models.length - 3} more
                      </span>
                    )}
                  </div>

                  {validation && validation.status !== 'idle' && (
                    <p className={`text-xs mt-3 ${
                      validation.status === 'valid'
                        ? 'text-nexus-success'
                        : validation.status === 'invalid'
                        ? 'text-destructive'
                        : 'text-muted-foreground'
                    }`}>
                      {validation.message}
                    </p>
                  )}
                </GlassCard>
              );
            })}
          </div>
        </div>
      )}

      {/* Publishing Tab */}
      {activeTab === 'publishing' && (
        <div className="space-y-4">
          <GlassCard className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <Share2 className="w-5 h-5 text-nexus-success" />
              <div>
                <h3 className="text-lg font-semibold text-foreground">Ayrshare</h3>
                <p className="text-sm text-muted-foreground">Publish to all social platforms with one API</p>
              </div>
            </div>
            
            <div className="flex gap-2">
              <input
                type={showKeys['ayrshare'] ? 'text' : 'password'}
                value={settings.ayrshareKey}
                onChange={(e) => setSettings(prev => ({ ...prev, ayrshareKey: e.target.value }))}
                placeholder="Enter Ayrshare API key..."
                className="flex-1 px-4 py-3 rounded-lg bg-background/50 border border-border focus:border-nexus-cyan outline-none"
              />
              <button
                onClick={() => toggleKeyVisibility('ayrshare')}
                className="p-3 text-muted-foreground hover:text-foreground"
              >
                {showKeys['ayrshare'] ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
            
            <div className="flex items-center gap-4 mt-4">
              <StatusBadge status={settings.ayrshareKey ? 'success' : 'neutral'}>
                {settings.ayrshareKey ? 'Connected' : 'Not Connected'}
              </StatusBadge>
              <a
                href="https://ayrshare.com"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-sm text-nexus-cyan hover:underline"
              >
                Get API Key <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </GlassCard>

          <GlassCard className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <Link2 className="w-5 h-5 text-nexus-cyan" />
              <div>
                <h3 className="text-lg font-semibold text-foreground">Direct Platform Connections</h3>
                <p className="text-sm text-muted-foreground">Connect social platforms via OAuth for native publishing</p>
              </div>
            </div>

            <SocialConnections />
          </GlassCard>
        </div>
      )}

      {/* Audio Tab */}
      {activeTab === 'audio' && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground mb-4">
            Configure voice and music providers. All providers offer free tiers.
          </p>
          
          {/* Voice Providers Section */}
          <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <Mic className="w-5 h-5 text-nexus-warning" />
            Voice Providers
          </h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* ElevenLabs */}
            <GlassCard className="p-5">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h4 className="font-medium text-foreground">ElevenLabs</h4>
                  <p className="text-xs text-muted-foreground">10K chars/mo free</p>
                </div>
                {settings.elevenLabsKey && <CheckCircle2 className="w-5 h-5 text-nexus-success" />}
              </div>
              <div className="flex gap-2">
                <input
                  type={showKeys['elevenlabs'] ? 'text' : 'password'}
                  value={settings.elevenLabsKey}
                  onChange={(e) => setSettings(prev => ({ ...prev, elevenLabsKey: e.target.value }))}
                  placeholder="API key..."
                  className="flex-1 px-3 py-2 text-sm rounded-lg bg-background/50 border border-border focus:border-nexus-cyan outline-none"
                />
                <button onClick={() => toggleKeyVisibility('elevenlabs')} className="p-2 text-muted-foreground hover:text-foreground">
                  {showKeys['elevenlabs'] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <a href="https://elevenlabs.io/sign-up" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-nexus-cyan hover:underline mt-2">
                Get free API key <ExternalLink className="w-3 h-3" />
              </a>
            </GlassCard>
            
            {/* Speechify */}
            <GlassCard className="p-5">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h4 className="font-medium text-foreground">Speechify</h4>
                  <p className="text-xs text-muted-foreground">10K chars/mo free</p>
                </div>
                {settings.speechifyKey && <CheckCircle2 className="w-5 h-5 text-nexus-success" />}
              </div>
              <div className="flex gap-2">
                <input
                  type={showKeys['speechify'] ? 'text' : 'password'}
                  value={settings.speechifyKey}
                  onChange={(e) => setSettings(prev => ({ ...prev, speechifyKey: e.target.value }))}
                  placeholder="API key..."
                  className="flex-1 px-3 py-2 text-sm rounded-lg bg-background/50 border border-border focus:border-nexus-cyan outline-none"
                />
                <button onClick={() => toggleKeyVisibility('speechify')} className="p-2 text-muted-foreground hover:text-foreground">
                  {showKeys['speechify'] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <a href="https://speechify.com/api" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-nexus-cyan hover:underline mt-2">
                Get free API key <ExternalLink className="w-3 h-3" />
              </a>
            </GlassCard>
            
            {/* Play.ht */}
            <GlassCard className="p-5">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h4 className="font-medium text-foreground">Play.ht</h4>
                  <p className="text-xs text-muted-foreground">12.5K chars/mo free</p>
                </div>
                {settings.playhtKey && <CheckCircle2 className="w-5 h-5 text-nexus-success" />}
              </div>
              <div className="flex gap-2">
                <input
                  type={showKeys['playht'] ? 'text' : 'password'}
                  value={settings.playhtKey}
                  onChange={(e) => setSettings(prev => ({ ...prev, playhtKey: e.target.value }))}
                  placeholder="API key..."
                  className="flex-1 px-3 py-2 text-sm rounded-lg bg-background/50 border border-border focus:border-nexus-cyan outline-none"
                />
                <button onClick={() => toggleKeyVisibility('playht')} className="p-2 text-muted-foreground hover:text-foreground">
                  {showKeys['playht'] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <a href="https://play.ht/signup" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-nexus-cyan hover:underline mt-2">
                Get free API key <ExternalLink className="w-3 h-3" />
              </a>
            </GlassCard>
            
            {/* Resemble AI */}
            <GlassCard className="p-5">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h4 className="font-medium text-foreground">Resemble AI</h4>
                  <p className="text-xs text-muted-foreground">1K chars/day free</p>
                </div>
                {settings.resembleKey && <CheckCircle2 className="w-5 h-5 text-nexus-success" />}
              </div>
              <div className="flex gap-2">
                <input
                  type={showKeys['resemble'] ? 'text' : 'password'}
                  value={settings.resembleKey}
                  onChange={(e) => setSettings(prev => ({ ...prev, resembleKey: e.target.value }))}
                  placeholder="API key..."
                  className="flex-1 px-3 py-2 text-sm rounded-lg bg-background/50 border border-border focus:border-nexus-cyan outline-none"
                />
                <button onClick={() => toggleKeyVisibility('resemble')} className="p-2 text-muted-foreground hover:text-foreground">
                  {showKeys['resemble'] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <a href="https://app.resemble.ai/signup" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-nexus-cyan hover:underline mt-2">
                Get free API key <ExternalLink className="w-3 h-3" />
              </a>
            </GlassCard>
          </div>

          {/* Music Providers Section */}
          <h3 className="text-lg font-semibold text-foreground flex items-center gap-2 mt-8">
            <Music className="w-5 h-5 text-nexus-violet" />
            Music Providers
          </h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Suno AI */}
            <GlassCard className="p-5">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h4 className="font-medium text-foreground">Suno AI</h4>
                  <p className="text-xs text-muted-foreground">Premium - requires subscription</p>
                </div>
                {settings.sunoKey && <CheckCircle2 className="w-5 h-5 text-nexus-success" />}
              </div>
              <div className="flex gap-2">
                <input
                  type={showKeys['suno'] ? 'text' : 'password'}
                  value={settings.sunoKey}
                  onChange={(e) => setSettings(prev => ({ ...prev, sunoKey: e.target.value }))}
                  placeholder="Cookie session (sunoid=...)"
                  className="flex-1 px-3 py-2 text-sm rounded-lg bg-background/50 border border-border focus:border-nexus-cyan outline-none"
                />
                <button onClick={() => toggleKeyVisibility('suno')} className="p-2 text-muted-foreground hover:text-foreground">
                  {showKeys['suno'] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <div className="text-xs text-muted-foreground mt-2">
                <a href="https://suno.com/subscribe" target="_blank" rel="noopener noreferrer" className="text-nexus-cyan hover:underline">
                  Subscribe
                </a>
                {' '}then use browser DevTools to copy cookie from suno.com
              </div>
              {providerValidation.suno && providerValidation.suno.status !== 'idle' && (
                <p className={`text-xs mt-3 ${
                  providerValidation.suno.status === 'valid'
                    ? 'text-nexus-success'
                    : providerValidation.suno.status === 'invalid'
                    ? 'text-destructive'
                    : 'text-muted-foreground'
                }`}>
                  {providerValidation.suno.message}
                </p>
              )}
            </GlassCard>
            
            {/* Udio - Easier to set up than Suno */}
            <GlassCard className="p-5 border-nexus-success/30">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h4 className="font-medium text-foreground flex items-center gap-2">
                    Udio 
                    <span className="text-xs bg-nexus-success/20 text-nexus-success px-2 py-0.5 rounded">EASY SETUP</span>
                  </h4>
                  <p className="text-xs text-muted-foreground">1200 credits/mo • Works like Suno!</p>
                </div>
                {settings.udioKey && <CheckCircle2 className="w-5 h-5 text-nexus-success" />}
              </div>
              <div className="flex gap-2">
                <input
                  type={showKeys['udio'] ? 'text' : 'password'}
                  value={settings.udioKey}
                  onChange={(e) => setSettings(prev => ({ ...prev, udioKey: e.target.value }))}
                  placeholder="Udio API key (from account page)"
                  className="flex-1 px-3 py-2 text-sm rounded-lg bg-background/50 border border-border focus:border-nexus-cyan outline-none"
                />
                <button onClick={() => toggleKeyVisibility('udio')} className="p-2 text-muted-foreground hover:text-foreground">
                  {showKeys['udio'] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <a href="https://www.udio.com/subscription" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-nexus-cyan hover:underline mt-2">
                Get API key <ExternalLink className="w-3 h-3" />
              </a>
              {providerValidation.udio && providerValidation.udio.status !== 'idle' && (
                <p className={`text-xs mt-2 ${
                  providerValidation.udio.status === 'valid' ? 'text-nexus-success' : 'text-destructive'
                }`}>
                  {providerValidation.udio.message}
                </p>
              )}
            </GlassCard>
            
            {/* Beatoven.ai */}
            <GlassCard className="p-5">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h4 className="font-medium text-foreground">Beatoven.ai</h4>
                  <p className="text-xs text-muted-foreground">15 min/mo free</p>
                </div>
                {settings.beatovenKey && <CheckCircle2 className="w-5 h-5 text-nexus-success" />}
              </div>
              <div className="flex gap-2">
                <input
                  type={showKeys['beatoven'] ? 'text' : 'password'}
                  value={settings.beatovenKey}
                  onChange={(e) => setSettings(prev => ({ ...prev, beatovenKey: e.target.value }))}
                  placeholder="API key..."
                  className="flex-1 px-3 py-2 text-sm rounded-lg bg-background/50 border border-border focus:border-nexus-cyan outline-none"
                />
                <button onClick={() => toggleKeyVisibility('beatoven')} className="p-2 text-muted-foreground hover:text-foreground">
                  {showKeys['beatoven'] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <a href="https://www.beatoven.ai" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-nexus-cyan hover:underline mt-2">
                Sign up free <ExternalLink className="w-3 h-3" />
              </a>
            </GlassCard>
            
            {/* Soundraw */}
            <GlassCard className="p-5">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h4 className="font-medium text-foreground">Soundraw</h4>
                  <p className="text-xs text-muted-foreground">Unlimited preview</p>
                </div>
                {settings.soundrawKey && <CheckCircle2 className="w-5 h-5 text-nexus-success" />}
              </div>
              <div className="flex gap-2">
                <input
                  type={showKeys['soundraw'] ? 'text' : 'password'}
                  value={settings.soundrawKey}
                  onChange={(e) => setSettings(prev => ({ ...prev, soundrawKey: e.target.value }))}
                  placeholder="API key..."
                  className="flex-1 px-3 py-2 text-sm rounded-lg bg-background/50 border border-border focus:border-nexus-cyan outline-none"
                />
                <button onClick={() => toggleKeyVisibility('soundraw')} className="p-2 text-muted-foreground hover:text-foreground">
                  {showKeys['soundraw'] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <a href="https://soundraw.io" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-nexus-cyan hover:underline mt-2">
                Sign up free <ExternalLink className="w-3 h-3" />
              </a>
            </GlassCard>
          </div>
          
          {/* Status Summary */}
          <GlassCard className="p-4 mt-4 bg-nexus-cyan/5 border-nexus-cyan/20">
            <p className="text-sm text-muted-foreground">
              <strong className="text-foreground">Tip:</strong> Without any API keys, NexusAI uses the built-in Web Speech API for voice and a royalty-free music library. Add provider keys above for premium quality.
            </p>
          </GlassCard>
        </div>
      )}

      {/* Image & Video Tab */}
      {activeTab === 'image' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <GlassCard className="p-5">
              <div className="flex items-center gap-3 mb-4">
                <Sparkles className="w-5 h-5 text-nexus-violet" />
                <h3 className="text-lg font-semibold text-foreground">Default Image Engine</h3>
              </div>
              <select
                value={settings.imageProvider}
                onChange={(e) => setSettings(prev => ({ ...prev, imageProvider: e.target.value }))}
                className="w-full px-4 py-3 rounded-lg bg-background/50 border border-border focus:border-nexus-cyan focus:ring-1 focus:ring-nexus-cyan outline-none transition-colors"
              >
                <option value="puter">Puter Image</option>
                <option value="stability">Stability XL</option>
                <option value="leonardo">Leonardo</option>
                <option value="ideogram">Ideogram</option>
              </select>
              <p className="text-xs text-muted-foreground mt-3">
                If the selected provider is not configured, image generation will fail instead of silently pretending it worked.
              </p>
            </GlassCard>

            <GlassCard className="p-5">
              <div className="flex items-center gap-3 mb-4">
                <Cloud className="w-5 h-5 text-nexus-cyan" />
                <h3 className="text-lg font-semibold text-foreground">Default Video Engine</h3>
              </div>
              <select
                value={settings.videoProvider}
                onChange={(e) => setSettings(prev => ({ ...prev, videoProvider: e.target.value }))}
                className="w-full px-4 py-3 rounded-lg bg-background/50 border border-border focus:border-nexus-cyan focus:ring-1 focus:ring-nexus-cyan outline-none transition-colors"
              >
                <option value="ltx23">LTX 2.3 Cloud</option>
                <option value="ltx23-open">LTX 2.3 Open</option>
              </select>
              <p className="text-xs text-muted-foreground mt-3">
                Cloud uses Fal-hosted LTX. Open uses your self-hosted endpoint.
              </p>
            </GlassCard>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Puter AI - Built-in */}
            <GlassCard className="p-5 border-nexus-success/30">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h4 className="font-medium text-foreground">Puter AI (DALL-E)</h4>
                  <p className="text-xs text-muted-foreground">Built-in, no key required</p>
                </div>
                <CheckCircle2 className="w-5 h-5 text-nexus-success" />
              </div>
              <p className="text-xs text-muted-foreground">
                Default image generation powered by DALL-E 3 through Puter. Already active.
              </p>
            </GlassCard>
            
            {/* Stability AI */}
            <GlassCard className="p-5">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h4 className="font-medium text-foreground">Stability AI</h4>
                  <p className="text-xs text-muted-foreground">25 free credits</p>
                </div>
                {settings.stabilityKey && <CheckCircle2 className="w-5 h-5 text-nexus-success" />}
              </div>
              <div className="flex gap-2">
                <input
                  type={showKeys['stability'] ? 'text' : 'password'}
                  value={settings.stabilityKey}
                  onChange={(e) => setSettings(prev => ({ ...prev, stabilityKey: e.target.value }))}
                  placeholder="API key..."
                  className="flex-1 px-3 py-2 text-sm rounded-lg bg-background/50 border border-border focus:border-nexus-cyan outline-none"
                />
                <button onClick={() => toggleKeyVisibility('stability')} className="p-2 text-muted-foreground hover:text-foreground">
                  {showKeys['stability'] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <a href="https://platform.stability.ai/signup" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-nexus-cyan hover:underline mt-2">
                Get API key <ExternalLink className="w-3 h-3" />
              </a>
            </GlassCard>
            
            {/* Leonardo AI */}
            <GlassCard className="p-5">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h4 className="font-medium text-foreground">Leonardo AI</h4>
                  <p className="text-xs text-muted-foreground">150 tokens/day free</p>
                </div>
                {settings.leonardoKey && <CheckCircle2 className="w-5 h-5 text-nexus-success" />}
              </div>
              <div className="flex gap-2">
                <input
                  type={showKeys['leonardo'] ? 'text' : 'password'}
                  value={settings.leonardoKey}
                  onChange={(e) => setSettings(prev => ({ ...prev, leonardoKey: e.target.value }))}
                  placeholder="API key..."
                  className="flex-1 px-3 py-2 text-sm rounded-lg bg-background/50 border border-border focus:border-nexus-cyan outline-none"
                />
                <button onClick={() => toggleKeyVisibility('leonardo')} className="p-2 text-muted-foreground hover:text-foreground">
                  {showKeys['leonardo'] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <a href="https://leonardo.ai" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-nexus-cyan hover:underline mt-2">
                Get API key <ExternalLink className="w-3 h-3" />
              </a>
            </GlassCard>
            
            {/* Ideogram */}
            <GlassCard className="p-5">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h4 className="font-medium text-foreground">Ideogram</h4>
                  <p className="text-xs text-muted-foreground">100 images/day free</p>
                </div>
                {settings.ideogramKey && <CheckCircle2 className="w-5 h-5 text-nexus-success" />}
              </div>
              <div className="flex gap-2">
                <input
                  type={showKeys['ideogram'] ? 'text' : 'password'}
                  value={settings.ideogramKey}
                  onChange={(e) => setSettings(prev => ({ ...prev, ideogramKey: e.target.value }))}
                  placeholder="API key..."
                  className="flex-1 px-3 py-2 text-sm rounded-lg bg-background/50 border border-border focus:border-nexus-cyan outline-none"
                />
                <button onClick={() => toggleKeyVisibility('ideogram')} className="p-2 text-muted-foreground hover:text-foreground">
                  {showKeys['ideogram'] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <a href="https://ideogram.ai" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-nexus-cyan hover:underline mt-2">
                Get API key <ExternalLink className="w-3 h-3" />
              </a>
            </GlassCard>
          </div>

          <div className="pt-4">
            <h3 className="text-lg font-semibold text-foreground mb-3">Video Generation</h3>
            <GlassCard className="p-5">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h4 className="font-medium text-foreground">LTX 2.3 Cloud + Open</h4>
                  <p className="text-xs text-muted-foreground">Cloud rendering and self-hosted rendering</p>
                </div>
                {settings.falKey && <CheckCircle2 className="w-5 h-5 text-nexus-success" />}
              </div>
              <div className="space-y-3">
                <div>
                  <p className="text-xs text-muted-foreground mb-2">Fal / cloud API key</p>
                  <div className="flex gap-2">
                    <input
                      type={showKeys['fal'] ? 'text' : 'password'}
                      value={settings.falKey}
                      onChange={(e) => setSettings(prev => ({ ...prev, falKey: e.target.value }))}
                      placeholder="Fal / LTX API key..."
                      className="flex-1 px-3 py-2 text-sm rounded-lg bg-background/50 border border-border focus:border-nexus-cyan outline-none"
                    />
                    <button onClick={() => toggleKeyVisibility('fal')} className="p-2 text-muted-foreground hover:text-foreground">
                      {showKeys['fal'] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <p className="text-xs text-muted-foreground mb-2">Cloud endpoint or model slug</p>
                  <input
                    type="text"
                    value={settings.ltxEndpoint}
                    onChange={(e) => setSettings(prev => ({ ...prev, ltxEndpoint: e.target.value }))}
                    placeholder="fal-ai/ltx-2.3/text-to-video/fast"
                    className="w-full px-3 py-2 text-sm rounded-lg bg-background/50 border border-border focus:border-nexus-cyan outline-none"
                  />
                </div>

                <div>
                  <p className="text-xs text-muted-foreground mb-2">Self-hosted open endpoint</p>
                  <input
                    type="url"
                    value={settings.ltxOpenEndpoint}
                    onChange={(e) => setSettings(prev => ({ ...prev, ltxOpenEndpoint: e.target.value }))}
                    placeholder="https://your-ltx-server.example.com/generate"
                    className="w-full px-3 py-2 text-sm rounded-lg bg-background/50 border border-border focus:border-nexus-cyan outline-none"
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-3">
                Use a Fal-style endpoint slug such as <code>fal-ai/ltx-2.3/text-to-video/fast</code> for cloud, or point the open endpoint at a reachable LTX 2.3 server URL.
              </p>
            </GlassCard>
          </div>
        </div>
      )}

      {/* Discovery Tab */}
      {activeTab === 'discovery' && (
        <GlassCard className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <Zap className="w-5 h-5 text-nexus-cyan" />
            <h3 className="text-lg font-semibold text-foreground">Nexus Discovery</h3>
          </div>
          <p className="text-sm text-muted-foreground mb-4">
            Nexus Discovery uses real-time trends and search data to inform content creation.
          </p>
          <p className="text-xs text-muted-foreground">
            Configure your MediaStack, SerpStack, and IPStack API keys in the Credential Vault to enable trend discovery.
          </p>
        </GlassCard>
      )}

      {/* Interactive Content Tab */}
      {activeTab === 'interactive' && (
        <div className="space-y-4">
          <GlassCard className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <Gamepad2 className="w-5 h-5 text-nexus-cyan" />
              <h3 className="text-lg font-semibold text-foreground">Interactive Content Builder</h3>
            </div>
            <p className="text-sm text-muted-foreground mb-6">
              Generate interactive content like infographics, quizzes, calculators, and polls for audience engagement.
            </p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {['infographic', 'mini_game', 'calculator', 'quiz', 'poll'].map(type => (
                <GlassCard key={type} className="p-3 text-center hover:bg-secondary/20 transition-colors cursor-pointer">
                  <p className="text-sm font-medium text-foreground capitalize">{type.replace('_', ' ')}</p>
                </GlassCard>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-4">
              Use the Interactive API (<code className="text-nexus-cyan">/api/interactive</code>) with type: infographic, mini_game, calculator, quiz, or poll
            </p>
          </GlassCard>
        </div>
      )}

      {/* Data Visualization Tab */}
      {activeTab === 'dataviz' && (
        <div className="space-y-4">
          <GlassCard className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <BarChart3 className="w-5 h-5 text-nexus-cyan" />
              <h3 className="text-lg font-semibold text-foreground">Data Visualization</h3>
            </div>
            <p className="text-sm text-muted-foreground mb-6">
              Create charts and visualizations from CSV data for presentations and reports.
            </p>
            <div className="grid grid-cols-3 md:grid-cols-7 gap-2">
              {['bar', 'line', 'pie', 'area', 'scatter', 'donut', 'radar'].map(type => (
                <GlassCard key={type} className="p-2 text-center hover:bg-secondary/20 transition-colors cursor-pointer">
                  <p className="text-xs font-medium text-foreground capitalize">{type}</p>
                </GlassCard>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-4">
              Use the Data Viz API (<code className="text-nexus-cyan">/api/data/visualization</code>) with csvData and chartType parameters
            </p>
          </GlassCard>
        </div>
      )}

      {/* Spatial Content Tab */}
      {activeTab === 'spatial' && (
        <div className="space-y-4">
          <GlassCard className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <Cuboid className="w-5 h-5 text-nexus-cyan" />
              <h3 className="text-lg font-semibold text-foreground">Spatial Content Creator</h3>
            </div>
            <p className="text-sm text-muted-foreground mb-6">
              Generate 3D models, VR environments, and AR filters for immersive experiences.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <GlassCard className="p-4">
                <h4 className="text-sm font-semibold text-foreground mb-2">3D Models</h4>
                <p className="text-xs text-muted-foreground">Generate 3D models from text prompts</p>
                <p className="text-xs text-nexus-cyan mt-2">POST /api/spatial/models</p>
              </GlassCard>
              <GlassCard className="p-4">
                <h4 className="text-sm font-semibold text-foreground mb-2">VR Environments</h4>
                <p className="text-xs text-muted-foreground">Create immersive VR spaces</p>
                <p className="text-xs text-nexus-cyan mt-2">POST /api/spatial/vr-environments</p>
              </GlassCard>
              <GlassCard className="p-4">
                <h4 className="text-sm font-semibold text-foreground mb-2">AR Filters</h4>
                <p className="text-xs text-muted-foreground">Build AR camera filters</p>
                <p className="text-xs text-nexus-cyan mt-2">POST /api/spatial/ar-filters</p>
              </GlassCard>
            </div>
          </GlassCard>
        </div>
      )}

      {/* Predictive Analytics Tab */}
      {activeTab === 'predictive' && (
        <div className="space-y-4">
          <GlassCard className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <TrendingUp className="w-5 h-5 text-nexus-cyan" />
              <h3 className="text-lg font-semibold text-foreground">Predictive Analytics</h3>
            </div>
            <p className="text-sm text-muted-foreground mb-6">
              Predict content performance before publishing and get optimal posting times.
            </p>
            <div className="space-y-3">
              <div className="p-4 rounded-lg bg-secondary/10 border border-border/50">
                <h4 className="text-sm font-semibold text-foreground mb-2">Viral Potential Prediction</h4>
                <p className="text-xs text-muted-foreground mb-2">Analyze content for engagement and reach prediction</p>
                <p className="text-xs text-nexus-cyan">POST /api/predictive</p>
              </div>
              <p className="text-xs text-muted-foreground">
                Provide content, platform, and hashtags to get engagement score, confidence level, and best posting times.
              </p>
            </div>
          </GlassCard>
        </div>
      )}

      {/* E-Commerce Tab */}
      {activeTab === 'ecommerce' && (
        <div className="space-y-4">
          <GlassCard className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <ShoppingCart className="w-5 h-5 text-nexus-cyan" />
              <h3 className="text-lg font-semibold text-foreground">E-Commerce Integrations</h3>
            </div>
            <p className="text-sm text-muted-foreground mb-6">
              Configure credentials for publishing content directly to e-commerce platforms.
            </p>

            {/* Shopify */}
            <div className="mb-6 p-4 rounded-lg bg-secondary/10 border border-border/50">
              <h4 className="text-sm font-semibold text-foreground mb-3">Shopify</h4>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">Store URL</label>
                  <input
                    type="url"
                    placeholder="https://your-store.myshopify.com"
                    value={settings.shopifyStoreUrl || ''}
                    onChange={e => setSettings(s => ({ ...s, shopifyStoreUrl: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-nexus-cyan/50"
                  />
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">Access Token</label>
                  <div className="relative">
                    <input
                      type={showKeys.shopify ? 'text' : 'password'}
                      placeholder="gpos_..."
                      value={settings.shopifyAccessToken || ''}
                      onChange={e => setSettings(s => ({ ...s, shopifyAccessToken: e.target.value }))}
                      className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-nexus-cyan/50 pr-10"
                    />
                    <button
                      onClick={() => setShowKeys(s => ({ ...s, shopify: !s.shopify }))}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showKeys.shopify ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Amazon */}
            <div className="mb-6 p-4 rounded-lg bg-secondary/10 border border-border/50">
              <h4 className="text-sm font-semibold text-foreground mb-3">Amazon PA-API (Product Advertising)</h4>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">API Key</label>
                  <div className="relative">
                    <input
                      type={showKeys.amazon ? 'text' : 'password'}
                      placeholder="AKIA..."
                      value={settings.amazonApiKey || ''}
                      onChange={e => setSettings(s => ({ ...s, amazonApiKey: e.target.value }))}
                      className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-nexus-cyan/50 pr-10"
                    />
                    <button
                      onClick={() => setShowKeys(s => ({ ...s, amazon: !s.amazon }))}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showKeys.amazon ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">Secret Key</label>
                  <div className="relative">
                    <input
                      type={showKeys.amazon ? 'text' : 'password'}
                      placeholder="..."
                      value={settings.amazonSecretKey || ''}
                      onChange={e => setSettings(s => ({ ...s, amazonSecretKey: e.target.value }))}
                      className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-nexus-cyan/50 pr-10"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">Associate Tag</label>
                  <input
                    type="text"
                    placeholder="yourtag-20"
                    value={settings.amazonAssociateTag || ''}
                    onChange={e => setSettings(s => ({ ...s, amazonAssociateTag: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-nexus-cyan/50"
                  />
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">Region</label>
                  <select
                    value={settings.amazonRegion || 'us-east-1'}
                    onChange={e => setSettings(s => ({ ...s, amazonRegion: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-nexus-cyan/50"
                  >
                    <option value="us-east-1">US East (N. Virginia)</option>
                    <option value="us-west-2">US West (Oregon)</option>
                    <option value="eu-west-1">EU (Ireland)</option>
                    <option value="eu-west-2">EU (London)</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Etsy */}
            <div className="p-4 rounded-lg bg-secondary/10 border border-border/50">
              <h4 className="text-sm font-semibold text-foreground mb-3">Etsy</h4>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">API Key</label>
                  <div className="relative">
                    <input
                      type={showKeys.etsy ? 'text' : 'password'}
                      placeholder="etsy-api-key"
                      value={settings.etsyApiKey || ''}
                      onChange={e => setSettings(s => ({ ...s, etsyApiKey: e.target.value }))}
                      className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-nexus-cyan/50 pr-10"
                    />
                    <button
                      onClick={() => setShowKeys(s => ({ ...s, etsy: !s.etsy }))}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showKeys.etsy ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">Shop ID</label>
                  <input
                    type="text"
                    placeholder="your-shop-id"
                    value={settings.etsyShopId || ''}
                    onChange={e => setSettings(s => ({ ...s, etsyShopId: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-nexus-cyan/50"
                  />
                </div>
              </div>
            </div>
          </GlassCard>
        </div>
      )}

      {/* Compliance Tab */}
      {activeTab === 'compliance' && (
        <div className="space-y-4">
          <GlassCard className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <Shield className="w-5 h-5 text-nexus-cyan" />
              <h3 className="text-lg font-semibold text-foreground">Content Compliance</h3>
            </div>
            <p className="text-sm text-muted-foreground mb-6">
              Configure regional content filtering and compliance rules for your content.
            </p>

            <div className="mb-6 p-4 rounded-lg bg-secondary/10 border border-border/50">
              <h4 className="text-sm font-semibold text-foreground mb-3">Filter Regions</h4>
              <p className="text-xs text-muted-foreground mb-3">
                Select regions to filter content against local laws and cultural sensitivities.
              </p>
              <div className="flex flex-wrap gap-2">
                {['us', 'eu', 'uk', 'ca', 'au', 'jp', 'cn', 'in', 'br', 'de', 'fr', 'es'].map(region => (
                  <button
                    key={region}
                    onClick={() => {
                      const regions = settings.complianceRegions || [];
                      const updated = regions.includes(region)
                        ? regions.filter(r => r !== region)
                        : [...regions, region];
                      setSettings(s => ({ ...s, complianceRegions: updated }));
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      (settings.complianceRegions || []).includes(region)
                        ? 'bg-nexus-cyan/20 text-nexus-cyan border border-nexus-cyan/30'
                        : 'bg-secondary/10 text-muted-foreground border border-border/50 hover:border-nexus-cyan/30'
                    }`}
                  >
                    {region.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            <div className="mb-6 p-4 rounded-lg bg-secondary/10 border border-border/50">
              <h4 className="text-sm font-semibold text-foreground mb-3">Blocked Topics</h4>
              <input
                type="text"
                placeholder="Comma-separated blocked topics"
                value={(settings.blockedTopics || []).join(', ')}
                onChange={e => setSettings(s => ({ ...s, blockedTopics: e.target.value.split(',').map(t => t.trim()).filter(Boolean) }))}
                className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-nexus-cyan/50"
              />
              <p className="text-xs text-muted-foreground mt-2">
                Content containing these topics will be flagged or blocked for selected regions.
              </p>
            </div>

            <div className="p-4 rounded-lg bg-secondary/10 border border-border/50">
              <h4 className="text-sm font-semibold text-foreground mb-3">Blocked Words</h4>
              <input
                type="text"
                placeholder="Comma-separated blocked words"
                value={(settings.blockedWords || []).join(', ')}
                onChange={e => setSettings(s => ({ ...s, blockedWords: e.target.value.split(',').map(t => t.trim()).filter(Boolean) }))}
                className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-nexus-cyan/50"
              />
              <p className="text-xs text-muted-foreground mt-2">
                Content containing these words will be flagged or modified for selected regions.
              </p>
            </div>
          </GlassCard>
        </div>
      )}

      {/* CRM Tab */}
      {activeTab === 'crm' && (
        <CRMTabContent />
      )}

      {/* Secrets Tab */}
      {activeTab === 'secrets' && (
        <SecretsVault />
      )}

      {/* Save Button */}
      <div className="flex justify-end">
        <NeonButton onClick={handleSave} disabled={saving}>
          {saving ? 'Saving...' : 'Save All Settings'}
        </NeonButton>
      </div>
    </div>
  );
}
