'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/context/AuthContext';
import { GlassCard } from '@/components/nexus/GlassCard';
import { NeonButton } from '@/components/nexus/NeonButton';
import { LoadingPulse } from '@/components/nexus/LoadingPulse';
import { saveBrandKit, setOnboardingComplete } from '@/lib/services/memoryService';
import { kvSet } from '@/lib/services/puterService';
import { setActiveChatModel } from '@/lib/services/providerControl';
import { sanitizeApiKey } from '@/lib/services/providerCredentialUtils';
import type { BrandKit, Platform } from '@/lib/types';
import { 
  Check, 
  ChevronRight, 
  ChevronLeft,
  Sparkles,
  Palette,
  Link2,
  Cpu
} from 'lucide-react';
import { cn } from '@/lib/utils';

const STEPS = [
  { id: 1, title: 'Welcome', icon: Sparkles },
  { id: 2, title: 'Brand Setup', icon: Palette },
  { id: 3, title: 'Connect', icon: Link2 },
  { id: 4, title: 'AI Model', icon: Cpu },
];

const TONE_OPTIONS = [
  { value: 'professional', label: 'Professional', description: 'Formal, authoritative, trustworthy' },
  { value: 'casual', label: 'Casual', description: 'Friendly, approachable, conversational' },
  { value: 'humorous', label: 'Humorous', description: 'Witty, playful, entertaining' },
  { value: 'inspirational', label: 'Inspirational', description: 'Motivating, uplifting, empowering' },
  { value: 'educational', label: 'Educational', description: 'Informative, clear, helpful' },
] as const;

const PLATFORM_OPTIONS: { id: Platform; name: string; color: string }[] = [
  { id: 'twitter', name: 'X (Twitter)', color: '#1DA1F2' },
  { id: 'instagram', name: 'Instagram', color: '#E4405F' },
  { id: 'linkedin', name: 'LinkedIn', color: '#0A66C2' },
  { id: 'tiktok', name: 'TikTok', color: '#00F2EA' },
  { id: 'facebook', name: 'Facebook', color: '#1877F2' },
  { id: 'threads', name: 'Threads', color: '#ffffff' },
];

const MODEL_OPTIONS = [
  { id: 'gpt-4o', name: 'GPT-4o', description: 'Best quality, recommended for most users' },
  { id: 'gpt-4o-mini', name: 'GPT-4o Mini', description: 'Faster and cheaper, good for testing' },
  { id: 'claude-sonnet-4-5', name: 'Claude Sonnet', description: 'Great for creative content' },
];
const ONBOARDING_AUTH_TIMEOUT = 15000;

function readOnboardingSearchState() {
  if (typeof window === 'undefined') {
    return {
      nextPath: '/onboarding',
      connectRequested: false,
      guestRouteRequested: false,
    };
  }

  const params = new URLSearchParams(window.location.search);
  return {
    nextPath: params.get('next') || '/onboarding',
    connectRequested: params.get('connect') === '1',
    guestRouteRequested: params.get('guest') === '1',
  };
}

function OnboardingContent() {
  const router = useRouter();
  const {
    isLoading,
    isAuthenticated,
    isGuest,
    onboardingComplete,
    login,
    enterGuestMode,
    refreshBrandKit,
    setOnboardingComplete: setAuthOnboardingComplete,
  } = useAuth();
  const [routeState, setRouteState] = useState(readOnboardingSearchState);
  const [isConnectingPuter, setIsConnectingPuter] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [authBootstrapExpired, setAuthBootstrapExpired] = useState(false);
  
  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Form state
  const [brandKit, setBrandKit] = useState<Partial<BrandKit>>({
    brandName: '',
    userName: '',
    agentName: '',
    niche: '',
    targetAudience: '',
    primaryColor: '#00F5FF',
    secondaryColor: '#BF5FFF',
    tone: 'professional',
    avoidTopics: [],
    contentPillars: [],
    contentPreferences: [],
    uniqueSellingPoint: '',
    language: 'en',
  });
  
  const [selectedPlatforms, setSelectedPlatforms] = useState<Platform[]>(['twitter', 'instagram']);
  const [ayrshareKey, setAyrshareKey] = useState('');
  const [selectedModel, setSelectedModel] = useState('gpt-4o');
  const [contentPillar, setContentPillar] = useState('');
  const canUseGuestFlow = isGuest || routeState.guestRouteRequested;

  // Redirect if already onboarded
  useEffect(() => {
    if (!isLoading && isAuthenticated && onboardingComplete) {
      router.push('/dashboard');
    }
  }, [isLoading, isAuthenticated, onboardingComplete, router]);

  // Redirect to login if not authenticated
  useEffect(() => {
    setRouteState(readOnboardingSearchState());
  }, []);

  useEffect(() => {
    if (!isLoading) {
      setAuthBootstrapExpired(false);
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setAuthBootstrapExpired(true);
      if (!isAuthenticated && !canUseGuestFlow) {
        enterGuestMode();
        setRouteState((current) => ({
          ...current,
          guestRouteRequested: true,
        }));
      }
    }, ONBOARDING_AUTH_TIMEOUT);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [canUseGuestFlow, enterGuestMode, isAuthenticated, isLoading]);

  const handleContinueAsGuest = () => {
    enterGuestMode();
    setRouteState((current) => ({
      ...current,
      guestRouteRequested: true,
    }));
    router.replace(`/onboarding?guest=1&next=${encodeURIComponent(routeState.nextPath)}`);
  };

  const handleConnectPuter = async () => {
    if (isConnectingPuter) return;

    setIsConnectingPuter(true);
    setConnectError(null);

    try {
      const success = await login();
      if (success) {
        setRouteState((current) => ({
          ...current,
          connectRequested: false,
          guestRouteRequested: false,
        }));
        router.replace(routeState.nextPath || '/onboarding');
      }
    } catch (error) {
      setConnectError(error instanceof Error ? error.message : 'Puter sign-in failed.');
    } finally {
      setIsConnectingPuter(false);
    }
  };

  const handleNext = () => {
    if (step < 4) {
      setStep(step + 1);
    }
  };

  const handleBack = () => {
    if (step > 1) {
      setStep(step - 1);
    }
  };

  const addContentPillar = () => {
    if (contentPillar.trim() && (brandKit.contentPillars?.length || 0) < 5) {
      setBrandKit({
        ...brandKit,
        contentPillars: [...(brandKit.contentPillars || []), contentPillar.trim()],
      });
      setContentPillar('');
    }
  };

  const removeContentPillar = (index: number) => {
    setBrandKit({
      ...brandKit,
      contentPillars: brandKit.contentPillars?.filter((_, i) => i !== index),
    });
  };

  const handleComplete = async () => {
    setIsSubmitting(true);
    
    try {
      // Save brand kit
      const completeBrandKit: BrandKit = {
        brandName: brandKit.brandName || 'My Brand',
        userName: brandKit.userName || 'User',
        agentName: brandKit.agentName || 'Nexus',
        niche: brandKit.niche || 'General',
        targetAudience: brandKit.targetAudience || 'General audience',
        primaryColor: brandKit.primaryColor || '#00F5FF',
        secondaryColor: brandKit.secondaryColor || '#BF5FFF',
        tone: brandKit.tone || 'professional',
        avoidTopics: brandKit.avoidTopics || [],
        contentPillars: brandKit.contentPillars || [],
        contentPreferences: brandKit.contentPreferences || [],
        uniqueSellingPoint: brandKit.uniqueSellingPoint || '',
        language: brandKit.language || 'en',
      };
      
      await saveBrandKit(completeBrandKit);
      
      // Save API keys if provided
      if (ayrshareKey) {
        const sanitizedAyrshareKey = sanitizeApiKey(ayrshareKey);
        if (sanitizedAyrshareKey) {
          await kvSet('ayrshare_key', sanitizedAyrshareKey);
        }
      }
      
      // Save selected model
      await setActiveChatModel(selectedModel);
      
      // Skip sample generation during onboarding - user can generate from dashboard
      // This prevents hanging if AI service isn't ready
      
      // Mark onboarding complete
      await setOnboardingComplete(true);
      setAuthOnboardingComplete(true);
      await refreshBrandKit();
      
      // Navigate to dashboard
      router.push('/dashboard');
    } catch (error) {
      console.error('Onboarding error:', error);
      setIsSubmitting(false);
    }
  };

  const shouldShowAuthFallback = authBootstrapExpired && !isAuthenticated && !canUseGuestFlow;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Background effects */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-[var(--nexus-cyan)]/10 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-[var(--nexus-violet)]/10 rounded-full blur-3xl" />
      </div>

      {/* Header */}
      <header className="relative p-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[var(--nexus-cyan)] to-[var(--nexus-violet)] flex items-center justify-center">
            <span className="text-background font-bold text-xl">N</span>
          </div>
          <span className="font-bold text-xl">NexusAI</span>
        </div>
      </header>

      {/* Progress */}
      <div className="relative px-6 py-4">
        <div className="flex items-center justify-center gap-2 max-w-xl mx-auto">
          {STEPS.map((s, index) => (
            <div key={s.id} className="flex items-center">
              <div
                className={cn(
                  'w-10 h-10 rounded-full flex items-center justify-center transition-all',
                  step === s.id
                    ? 'bg-gradient-to-br from-[var(--nexus-cyan)] to-[var(--nexus-violet)]'
                    : step > s.id
                    ? 'bg-[var(--nexus-success)]'
                    : 'bg-muted'
                )}
              >
                {step > s.id ? (
                  <Check className="w-5 h-5 text-background" />
                ) : (
                  <s.icon className={cn('w-5 h-5', step === s.id ? 'text-background' : 'text-muted-foreground')} />
                )}
              </div>
              {index < STEPS.length - 1 && (
                <div
                  className={cn(
                    'w-12 h-1 mx-2 rounded-full transition-all',
                    step > s.id ? 'bg-[var(--nexus-success)]' : 'bg-muted'
                  )}
                />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Content */}
      <main className="relative flex-1 flex items-center justify-center px-4 py-8">
        <GlassCard variant="elevated" className="w-full max-w-xl">
          {/* Step 1: Welcome */}
          {step === 1 && (
            <div className="text-center space-y-6">
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-[var(--nexus-cyan)] to-[var(--nexus-violet)] flex items-center justify-center mx-auto">
                <Sparkles className="w-10 h-10 text-background" />
              </div>
              <div>
                <h1 className="text-2xl font-bold mb-2">Welcome to NexusAI</h1>
                <p className="text-muted-foreground">
                  Let&apos;s set up your AI-powered social media assistant. 
                  This will only take a few minutes.
                </p>
                {isLoading && !authBootstrapExpired && (
                  <div className="mt-4">
                    <LoadingPulse size="sm" text="Checking your session..." />
                  </div>
                )}
                {(routeState.connectRequested || !isAuthenticated) && (
                  <div className="mt-4 space-y-3">
                    <p className="text-sm text-muted-foreground">
                      Connect Puter now or continue in guest mode. You can switch to a full Puter session later from inside the app.
                    </p>
                    <NeonButton onClick={handleConnectPuter} className="w-full" disabled={isConnectingPuter}>
                      {isConnectingPuter ? 'Connecting Puter...' : 'Connect Puter'}
                    </NeonButton>
                    <NeonButton variant="ghost" onClick={handleContinueAsGuest} className="w-full">
                      Continue In Guest Mode
                    </NeonButton>
                  </div>
                )}
                {connectError && (
                  <p className="text-sm text-destructive mt-3">
                    {connectError}
                  </p>
                )}
                {shouldShowAuthFallback && (
                  <p className="text-sm text-muted-foreground mt-3">
                    Auth bootstrap stalled, so onboarding is running in recovery mode. Guest mode is safe to use here.
                  </p>
                )}
              </div>
              <NeonButton onClick={handleNext} className="w-full">
                Get Started
                <ChevronRight className="w-4 h-4 ml-2" />
              </NeonButton>
            </div>
          )}

          {/* Step 2: Brand Setup */}
          {step === 2 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-bold mb-1">Brand Setup</h2>
                <p className="text-sm text-muted-foreground">Tell us about your brand to personalize content generation.</p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1.5">Brand Name</label>
                  <input
                    type="text"
                    value={brandKit.brandName}
                    onChange={(e) => setBrandKit({ ...brandKit, brandName: e.target.value })}
                    placeholder="Enter your brand name"
                    className="w-full px-4 py-2.5 rounded-lg bg-input border border-border focus:border-[var(--nexus-cyan)] focus:outline-none focus:ring-1 focus:ring-[var(--nexus-cyan)]"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1.5">Your Name</label>
                    <input
                      type="text"
                      value={brandKit.userName}
                      onChange={(e) => setBrandKit({ ...brandKit, userName: e.target.value })}
                      placeholder="Enter your name"
                      className="w-full px-4 py-2.5 rounded-lg bg-input border border-border focus:border-[var(--nexus-cyan)] focus:outline-none focus:ring-1 focus:ring-[var(--nexus-cyan)]"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1.5">Agent's Name</label>
                    <input
                      type="text"
                      value={brandKit.agentName}
                      onChange={(e) => setBrandKit({ ...brandKit, agentName: e.target.value })}
                      placeholder="e.g., Nexus, Nova, Aria"
                      className="w-full px-4 py-2.5 rounded-lg bg-input border border-border focus:border-[var(--nexus-cyan)] focus:outline-none focus:ring-1 focus:ring-[var(--nexus-cyan)]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1.5">Niche / Industry</label>
                  <input
                    type="text"
                    value={brandKit.niche}
                    onChange={(e) => setBrandKit({ ...brandKit, niche: e.target.value })}
                    placeholder="e.g., Tech, Fashion, Fitness"
                    className="w-full px-4 py-2.5 rounded-lg bg-input border border-border focus:border-[var(--nexus-cyan)] focus:outline-none focus:ring-1 focus:ring-[var(--nexus-cyan)]"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1.5">Target Audience</label>
                  <input
                    type="text"
                    value={brandKit.targetAudience}
                    onChange={(e) => setBrandKit({ ...brandKit, targetAudience: e.target.value })}
                    placeholder="e.g., Young professionals, Parents, Entrepreneurs"
                    className="w-full px-4 py-2.5 rounded-lg bg-input border border-border focus:border-[var(--nexus-cyan)] focus:outline-none focus:ring-1 focus:ring-[var(--nexus-cyan)]"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1.5">Unique Selling Point / Brand Vision</label>
                  <textarea
                    value={brandKit.uniqueSellingPoint}
                    onChange={(e) => setBrandKit({ ...brandKit, uniqueSellingPoint: e.target.value })}
                    placeholder="What makes your brand unique? Describe your vision and core values."
                    rows={3}
                    className="w-full px-4 py-2.5 rounded-lg bg-input border border-border focus:border-[var(--nexus-cyan)] focus:outline-none focus:ring-1 focus:ring-[var(--nexus-cyan)] resize-none"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1.5">Brand Tone</label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {TONE_OPTIONS.map((tone) => (
                      <button
                        key={tone.value}
                        onClick={() => setBrandKit({ ...brandKit, tone: tone.value })}
                        className={cn(
                          'p-3 rounded-lg border text-left transition-all',
                          brandKit.tone === tone.value
                            ? 'border-[var(--nexus-cyan)] bg-[var(--nexus-cyan)]/10'
                            : 'border-border hover:border-muted-foreground'
                        )}
                      >
                        <p className="font-medium text-sm">{tone.label}</p>
                        <p className="text-xs text-muted-foreground">{tone.description}</p>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1.5">
                    Content Pillars <span className="text-muted-foreground">(up to 5)</span>
                  </label>
                  <div className="flex gap-2 mb-2">
                    <input
                      type="text"
                      value={contentPillar}
                      onChange={(e) => setContentPillar(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addContentPillar())}
                      placeholder="e.g., Tips, Behind-the-scenes"
                      className="flex-1 px-4 py-2 rounded-lg bg-input border border-border focus:border-[var(--nexus-cyan)] focus:outline-none focus:ring-1 focus:ring-[var(--nexus-cyan)]"
                    />
                    <NeonButton variant="secondary" size="sm" onClick={addContentPillar}>
                      Add
                    </NeonButton>
                  </div>
                  {brandKit.contentPillars && brandKit.contentPillars.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {brandKit.contentPillars.map((pillar, index) => (
                        <span
                          key={index}
                          className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-muted text-sm"
                        >
                          {pillar}
                          <button
                            onClick={() => removeContentPillar(index)}
                            className="ml-1 text-muted-foreground hover:text-foreground"
                          >
                            &times;
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex gap-3">
                <NeonButton variant="ghost" onClick={handleBack} className="flex-1">
                  <ChevronLeft className="w-4 h-4 mr-2" />
                  Back
                </NeonButton>
                <NeonButton onClick={handleNext} className="flex-1">
                  Continue
                  <ChevronRight className="w-4 h-4 ml-2" />
                </NeonButton>
              </div>
            </div>
          )}

          {/* Step 3: Connect Platforms */}
          {step === 3 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-bold mb-1">Connect Platforms</h2>
                <p className="text-sm text-muted-foreground">
                  Connect your social accounts via Ayrshare to publish directly from NexusAI.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5">Select Platforms</label>
                <div className="grid grid-cols-2 gap-2">
                  {PLATFORM_OPTIONS.map((platform) => (
                    <button
                      key={platform.id}
                      onClick={() => {
                        setSelectedPlatforms(
                          selectedPlatforms.includes(platform.id)
                            ? selectedPlatforms.filter((p) => p !== platform.id)
                            : [...selectedPlatforms, platform.id]
                        );
                      }}
                      className={cn(
                        'p-3 rounded-lg border flex items-center gap-3 transition-all',
                        selectedPlatforms.includes(platform.id)
                          ? 'border-[var(--nexus-cyan)] bg-[var(--nexus-cyan)]/10'
                          : 'border-border hover:border-muted-foreground'
                      )}
                    >
                      <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center"
                        style={{ backgroundColor: `${platform.color}20` }}
                      >
                        <span style={{ color: platform.color }} className="font-bold text-sm">
                          {platform.name.charAt(0)}
                        </span>
                      </div>
                      <span className="font-medium text-sm">{platform.name}</span>
                      {selectedPlatforms.includes(platform.id) && (
                        <Check className="w-4 h-4 ml-auto text-[var(--nexus-cyan)]" />
                      )}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5">
                  Ayrshare API Key <span className="text-muted-foreground">(optional)</span>
                </label>
                <input
                  type="password"
                  value={ayrshareKey}
                  onChange={(e) => setAyrshareKey(e.target.value)}
                  placeholder="Enter your Ayrshare API key"
                  className="w-full px-4 py-2.5 rounded-lg bg-input border border-border focus:border-[var(--nexus-cyan)] focus:outline-none focus:ring-1 focus:ring-[var(--nexus-cyan)]"
                />
                <p className="text-xs text-muted-foreground mt-1.5">
                  Get your API key from{' '}
                  <a
                    href="https://ayrshare.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[var(--nexus-cyan)] hover:underline"
                  >
                    ayrshare.com
                  </a>
                  . You can add this later in Settings.
                </p>
              </div>

              <div className="flex gap-3">
                <NeonButton variant="ghost" onClick={handleBack} className="flex-1">
                  <ChevronLeft className="w-4 h-4 mr-2" />
                  Back
                </NeonButton>
                <NeonButton onClick={handleNext} className="flex-1">
                  Continue
                  <ChevronRight className="w-4 h-4 ml-2" />
                </NeonButton>
              </div>
            </div>
          )}

          {/* Step 4: AI Model */}
          {step === 4 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-bold mb-1">Choose AI Model</h2>
                <p className="text-sm text-muted-foreground">
                  Select your default AI model. You can change this anytime in Settings.
                </p>
              </div>

              <div className="space-y-2">
                {MODEL_OPTIONS.map((model) => (
                  <button
                    key={model.id}
                    onClick={() => setSelectedModel(model.id)}
                    className={cn(
                      'w-full p-4 rounded-lg border text-left transition-all',
                      selectedModel === model.id
                        ? 'border-[var(--nexus-cyan)] bg-[var(--nexus-cyan)]/10'
                        : 'border-border hover:border-muted-foreground'
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">{model.name}</p>
                        <p className="text-sm text-muted-foreground">{model.description}</p>
                      </div>
                      {selectedModel === model.id && (
                        <Check className="w-5 h-5 text-[var(--nexus-cyan)]" />
                      )}
                    </div>
                  </button>
                ))}
              </div>

              <div className="flex gap-3">
                <NeonButton variant="ghost" onClick={handleBack} className="flex-1">
                  <ChevronLeft className="w-4 h-4 mr-2" />
                  Back
                </NeonButton>
                <NeonButton 
                  onClick={handleComplete} 
                  loading={isSubmitting}
                  className="flex-1"
                >
                  {isSubmitting ? 'Completing...' : 'Complete Setup'}
                  {!isSubmitting && <Check className="w-4 h-4 ml-2" />}
                </NeonButton>
              </div>
            </div>
          )}
        </GlassCard>
      </main>
    </div>
  );
}

export default function OnboardingPage() {
  return <OnboardingContent />;
}
