'use client';

import { useState, useEffect } from 'react';
import { GlassCard } from '@/components/nexus/GlassCard';
import { NeonButton } from '@/components/nexus/NeonButton';
import { LoadingPulse } from '@/components/nexus/LoadingPulse';
import { StatusBadge } from '@/components/nexus/StatusBadge';
import { 
  Cpu, 
  Key, 
  Check, 
  X, 
  Eye, 
  EyeOff, 
  Zap, 
  Globe, 
  Server,
  Sparkles,
  ChevronDown,
  ChevronUp,
  TestTube,
  Loader2,
  ShieldOff,
} from 'lucide-react';
import { kvDelete, kvGet, kvSet } from '@/lib/services/puterService';
import { AI_PROVIDERS, callCustomProvider, type AIProvider } from '@/lib/services/godModeEngine';
import { AVAILABLE_MODELS } from '@/lib/services/aiService';
import {
  isPuterFallbackDisabled,
  resolveProviderForModel,
  setPuterFallbackDisabled,
} from '@/lib/services/providerControl';

interface ProviderStatus {
  provider: AIProvider;
  hasKey: boolean;
  isConnected: boolean;
  lastTested: string | null;
  error: string | null;
}

export default function ProvidersPage() {
  const [providers, setProviders] = useState<ProviderStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedProvider, setExpandedProvider] = useState<string | null>(null);
  const [testingProvider, setTestingProvider] = useState<string | null>(null);
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const [keyInputs, setKeyInputs] = useState<Record<string, string>>({});
  const [currentChatModel, setCurrentChatModel] = useState('gpt-4o');
  const [disablePuterRouting, setDisablePuterRouting] = useState(false);
  const [routingBusy, setRoutingBusy] = useState(false);

  useEffect(() => {
    void loadProviderStatus();
  }, []);

  const loadProviderStatus = async () => {
    setLoading(true);
    const [savedModel, fallbackDisabled] = await Promise.all([
      kvGet('ai_model'),
      isPuterFallbackDisabled(),
    ]);
    const statuses: ProviderStatus[] = [];

    for (const provider of AI_PROVIDERS) {
      let hasKey = !provider.requiresKey;
      
      if (provider.requiresKey && provider.keyName) {
        const key = await kvGet(provider.keyName);
        hasKey = !!key;
        if (key) {
          setKeyInputs(prev => ({ ...prev, [provider.id]: key }));
        }
      }

      statuses.push({
        provider,
        hasKey,
        isConnected: false,
        lastTested: null,
        error: null,
      });
    }

    setProviders(statuses);
    if (typeof savedModel === 'string' && AVAILABLE_MODELS.some((model) => model.model === savedModel)) {
      setCurrentChatModel(savedModel);
    } else {
      setCurrentChatModel('gpt-4o');
    }
    setDisablePuterRouting(fallbackDisabled);
    setLoading(false);
  };

  const handleChatModelChange = async (model: string) => {
    setCurrentChatModel(model);
    setRoutingBusy(true);
    try {
      await Promise.all([
        kvSet('ai_model', model),
        kvSet('default_model', model),
      ]);
    } finally {
      setRoutingBusy(false);
    }
  };

  const handleDisablePuterFallbackChange = async (disabled: boolean) => {
    setDisablePuterRouting(disabled);
    setRoutingBusy(true);
    try {
      await setPuterFallbackDisabled(disabled);
    } finally {
      setRoutingBusy(false);
    }
  };

  const saveKey = async (providerId: string) => {
    const provider = AI_PROVIDERS.find(p => p.id === providerId);
    if (!provider || !provider.keyName) return;

    const key = keyInputs[providerId];
    if (key) {
      await kvSet(provider.keyName, key);
      await loadProviderStatus();
    }
  };

  const removeKey = async (providerId: string) => {
    const provider = AI_PROVIDERS.find(p => p.id === providerId);
    if (!provider || !provider.keyName) return;

    await kvDelete(provider.keyName);
    setKeyInputs(prev => ({ ...prev, [providerId]: '' }));
    await loadProviderStatus();
  };

  const testProvider = async (providerId: string) => {
    setTestingProvider(providerId);
    
    const provider = AI_PROVIDERS.find(p => p.id === providerId);
    if (!provider) {
      setTestingProvider(null);
      return;
    }

    try {
      const testModel = provider.models[0];
      await callCustomProvider(providerId, testModel, [
        { role: 'user', content: 'Say "Hello from NexusAI!" in exactly those words.' }
      ]);

      setProviders(prev => prev.map(p => 
        p.provider.id === providerId 
          ? { ...p, isConnected: true, lastTested: new Date().toISOString(), error: null }
          : p
      ));
    } catch (error) {
      setProviders(prev => prev.map(p => 
        p.provider.id === providerId 
          ? { ...p, isConnected: false, lastTested: new Date().toISOString(), error: (error as Error).message }
          : p
      ));
    }

    setTestingProvider(null);
  };

  const getProviderIcon = (providerId: string) => {
    switch (providerId) {
      case 'puter': return <Sparkles className="w-5 h-5" />;
      case 'openrouter': return <Globe className="w-5 h-5" />;
      case 'groq': return <Zap className="w-5 h-5" />;
      case 'nvidia': return <Cpu className="w-5 h-5" />;
      case 'ollama': return <Server className="w-5 h-5" />;
      default: return <Cpu className="w-5 h-5" />;
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        <LoadingPulse text="Loading providers..." />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">AI Providers</h1>
        <p className="text-foreground/60 mt-1">
          Connect multiple AI providers to power the Nexus Agent with diverse capabilities
        </p>
      </div>

      <GlassCard className="p-5 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Chat Routing</h2>
            <p className="text-sm text-foreground/60 mt-1">
              Control which provider drives chat by default and whether Puter can still be used as an automatic fallback.
            </p>
          </div>
          <StatusBadge
            status={disablePuterRouting ? 'warning' : 'info'}
            size="sm"
          >
            {disablePuterRouting ? 'Puter Fallback Off' : 'Puter Fallback Available'}
          </StatusBadge>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground/80">
              Active chat model
            </label>
            <select
              value={currentChatModel}
              onChange={(e) => void handleChatModelChange(e.target.value)}
              disabled={routingBusy}
              className="w-full rounded-lg border border-white/10 bg-background/50 px-4 py-2.5 text-sm text-foreground focus:outline-none focus:border-nexus-cyan/50 disabled:opacity-60"
            >
              {AVAILABLE_MODELS.map((model) => (
                <option key={model.model} value={model.model} className="bg-background text-foreground">
                  {model.name} ({model.provider})
                </option>
              ))}
            </select>
            <p className="text-xs text-foreground/50">
              Active provider: {resolveProviderForModel(currentChatModel, AVAILABLE_MODELS)}
            </p>
          </div>

          <div className="space-y-3 rounded-xl border border-white/10 bg-white/5 p-4">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 rounded-lg bg-yellow-500/15 p-2 text-yellow-300">
                <ShieldOff className="w-4 h-4" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-foreground">Disable Puter fallback after manual switch</p>
                <p className="text-xs text-foreground/60 mt-1">
                  When enabled, chat stays on your selected provider and will not route back into Puter automatically.
                </p>
              </div>
              <label className="inline-flex cursor-pointer items-center">
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={disablePuterRouting}
                  disabled={routingBusy}
                  onChange={(e) => void handleDisablePuterFallbackChange(e.target.checked)}
                />
                <span
                  className={`relative h-6 w-11 rounded-full transition-colors ${
                    disablePuterRouting ? 'bg-[var(--nexus-cyan)]' : 'bg-white/15'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
                      disablePuterRouting ? 'translate-x-5' : 'translate-x-0.5'
                    }`}
                  />
                </span>
              </label>
            </div>
            <p className="text-xs text-foreground/50">
              {disablePuterRouting
                ? 'Manual chat provider choice is locked in until you re-enable Puter fallback.'
                : 'Chat may still route into Puter if your selected provider fails.'}
            </p>
          </div>
        </div>
      </GlassCard>

      {/* Provider cards */}
      <div className="grid gap-4">
        {providers.map((status) => (
          <GlassCard key={status.provider.id} className="overflow-hidden">
            {/* Header row */}
            <button
              onClick={() => setExpandedProvider(
                expandedProvider === status.provider.id ? null : status.provider.id
              )}
              className="w-full p-4 flex items-center gap-4 hover:bg-white/5 transition-colors"
            >
              <div className="w-10 h-10 rounded-lg bg-nexus-cyan/10 flex items-center justify-center text-nexus-cyan">
                {getProviderIcon(status.provider.id)}
              </div>

              <div className="flex-1 text-left">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-foreground">{status.provider.name}</h3>
                  <StatusBadge 
                    status={status.isConnected ? 'success' : status.hasKey ? 'warning' : 'default'}
                    size="sm"
                  >
                    {status.isConnected ? 'Connected' : status.hasKey ? 'Configured' : 'Not Configured'}
                  </StatusBadge>
                </div>
                <p className="text-sm text-foreground/60">
                  {status.provider.models.length} models available
                </p>
              </div>

              <div className="flex items-center gap-2">
                {status.provider.requiresKey && (
                  <div className="text-foreground/40">
                    <Key className="w-4 h-4" />
                  </div>
                )}
                {expandedProvider === status.provider.id ? (
                  <ChevronUp className="w-5 h-5 text-foreground/40" />
                ) : (
                  <ChevronDown className="w-5 h-5 text-foreground/40" />
                )}
              </div>
            </button>

            {/* Expanded content */}
            {expandedProvider === status.provider.id && (
              <div className="border-t border-white/10 p-4 space-y-4">
                {/* API Key input */}
                {status.provider.requiresKey && (
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground/80">
                      API Key
                    </label>
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <input
                          type={showKeys[status.provider.id] ? 'text' : 'password'}
                          value={keyInputs[status.provider.id] || ''}
                          onChange={(e) => setKeyInputs(prev => ({ 
                            ...prev, 
                            [status.provider.id]: e.target.value 
                          }))}
                          placeholder={`Enter your ${status.provider.name} API key`}
                          className="w-full px-4 py-2 bg-background/50 border border-white/10 rounded-lg text-foreground placeholder-foreground/40 focus:outline-none focus:border-nexus-cyan/50 pr-10"
                        />
                        <button
                          onClick={() => setShowKeys(prev => ({ 
                            ...prev, 
                            [status.provider.id]: !prev[status.provider.id] 
                          }))}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-foreground/40 hover:text-foreground/60"
                        >
                          {showKeys[status.provider.id] ? (
                            <EyeOff className="w-4 h-4" />
                          ) : (
                            <Eye className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                      <NeonButton
                        onClick={() => saveKey(status.provider.id)}
                        variant="secondary"
                        size="sm"
                      >
                        Save
                      </NeonButton>
                      {status.hasKey && (
                        <NeonButton
                          onClick={() => removeKey(status.provider.id)}
                          variant="ghost"
                          size="sm"
                        >
                          <X className="w-4 h-4" />
                        </NeonButton>
                      )}
                    </div>
                  </div>
                )}

                {/* Models list */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground/80">
                    Available Models
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {status.provider.models.map((model) => (
                      <span
                        key={model}
                        className="px-2 py-1 bg-white/5 rounded text-xs text-foreground/70 font-mono"
                      >
                        {model}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Test connection */}
                <div className="flex items-center justify-between pt-2">
                  <div className="text-sm text-foreground/60">
                    {status.lastTested && (
                      <span>
                        Last tested: {new Date(status.lastTested).toLocaleTimeString()}
                        {status.error && (
                          <span className="text-red-400 ml-2">Error: {status.error}</span>
                        )}
                      </span>
                    )}
                    {!status.lastTested && status.hasKey && (
                      <span>Key saved. Run a live test to verify connectivity.</span>
                    )}
                    {!status.provider.requiresKey && !status.lastTested && (
                      <span>Built-in provider. Run a live test to verify runtime availability.</span>
                    )}
                  </div>
                  <NeonButton
                    onClick={() => testProvider(status.provider.id)}
                    disabled={
                      testingProvider === status.provider.id ||
                      (status.provider.requiresKey && !status.hasKey)
                    }
                    variant="secondary"
                    size="sm"
                  >
                    {testingProvider === status.provider.id ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Testing...
                      </>
                    ) : (
                      <>
                        <TestTube className="w-4 h-4 mr-2" />
                        Test Connection
                      </>
                    )}
                  </NeonButton>
                </div>

                {/* Provider-specific notes */}
                {status.provider.id === 'ollama' && (
                  <div className="p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg text-sm text-yellow-200">
                    <strong>Note:</strong> Ollama runs locally on your machine. Make sure Ollama is running 
                    and accessible at <code className="bg-black/20 px-1 rounded">localhost:11434</code>.
                    Enable CORS in Ollama settings for browser access.
                  </div>
                )}

                {status.provider.id === 'openrouter' && (
                  <div className="p-3 bg-nexus-cyan/10 border border-nexus-cyan/20 rounded-lg text-sm text-nexus-cyan">
                    <strong>Tip:</strong> OpenRouter provides access to 100+ models from different providers 
                    with a single API key. Great for experimenting with different models.
                  </div>
                )}

                {status.provider.id === 'groq' && (
                  <div className="p-3 bg-nexus-violet/10 border border-nexus-violet/20 rounded-lg text-sm text-nexus-violet">
                    <strong>Speed:</strong> Groq offers the fastest inference speeds available, 
                    perfect for real-time content generation and chat.
                  </div>
                )}
              </div>
            )}
          </GlassCard>
        ))}
      </div>

      {/* Music API Keys section */}
      <div className="mt-8">
        <h2 className="text-xl font-semibold text-foreground mb-4">Music Generation APIs</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <MusicAPIKeyCard
            name="Mubert"
            keyName="mubert_key"
            description="AI-generated royalty-free music"
            website="https://mubert.com/render/api"
          />
          <MusicAPIKeyCard
            name="Suno"
            keyName="suno_key"
            description="AI music with custom lyrics"
            website="https://suno.ai"
          />
        </div>
      </div>
    </div>
  );
}

// Music API Key Card component
function MusicAPIKeyCard({ 
  name, 
  keyName, 
  description, 
  website 
}: { 
  name: string; 
  keyName: string; 
  description: string;
  website: string;
}) {
  const [hasKey, setHasKey] = useState(false);
  const [keyInput, setKeyInput] = useState('');
  const [showKey, setShowKey] = useState(false);

  useEffect(() => {
    const loadKey = async () => {
      const key = await kvGet(keyName);
      if (key) {
        setHasKey(true);
        setKeyInput(key);
      }
    };
    loadKey();
  }, [keyName]);

  const saveKey = async () => {
    if (keyInput) {
      await kvSet(keyName, keyInput);
      setHasKey(true);
    }
  };

  const removeKey = async () => {
    await kvDelete(keyName);
    setKeyInput('');
    setHasKey(false);
  };

  return (
    <GlassCard className="p-4">
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="font-semibold text-foreground">{name}</h3>
          <p className="text-sm text-foreground/60">{description}</p>
        </div>
        <StatusBadge status={hasKey ? 'success' : 'default'} size="sm">
          {hasKey ? 'Configured' : 'Not Set'}
        </StatusBadge>
      </div>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <input
            type={showKey ? 'text' : 'password'}
            value={keyInput}
            onChange={(e) => setKeyInput(e.target.value)}
            placeholder={`${name} API key`}
            className="w-full px-3 py-2 bg-background/50 border border-white/10 rounded-lg text-sm text-foreground placeholder-foreground/40 focus:outline-none focus:border-nexus-cyan/50 pr-10"
          />
          <button
            onClick={() => setShowKey(!showKey)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-foreground/40 hover:text-foreground/60"
          >
            {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
        <NeonButton onClick={saveKey} variant="secondary" size="sm">
          Save
        </NeonButton>
        {hasKey && (
          <NeonButton onClick={removeKey} variant="ghost" size="sm">
            <X className="w-4 h-4" />
          </NeonButton>
        )}
      </div>

      <a 
        href={website} 
        target="_blank" 
        rel="noopener noreferrer"
        className="text-xs text-nexus-cyan hover:underline mt-2 inline-block"
      >
        Get API key
      </a>
    </GlassCard>
  );
}
