'use client';

import { useState, useEffect } from 'react';
import { GlassCard } from '@/components/nexus/GlassCard';
import { NeonButton } from '@/components/nexus/NeonButton';
import { StatusBadge } from '@/components/nexus/StatusBadge';
import { PLATFORM_LIST } from '@/lib/constants/platforms';
import { getConnectedPlatforms } from '@/lib/services/publishService';
import { kvGet, kvSet, kvDelete } from '@/lib/services/puterService';
import { sanitizeApiKey } from '@/lib/services/providerCredentialUtils';
import {
  Twitter,
  Instagram,
  Linkedin,
  Facebook,
  Youtube,
  ExternalLink,
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Link2,
  Unlink,
  Music2,
  AtSign,
  Image,
} from 'lucide-react';

type ConnectionStatus = 'connected' | 'disconnected' | 'error' | 'checking';

interface PlatformConnection {
  platform: string;
  status: ConnectionStatus;
  username?: string;
  lastChecked?: string;
  error?: string;
}

const PLATFORM_ICONS: Record<string, React.ComponentType<{ className?: string; style?: React.CSSProperties }>> = {
  twitter: Twitter,
  instagram: Instagram,
  linkedin: Linkedin,
  facebook: Facebook,
  youtube: Youtube,
  tiktok: Music2,
  threads: AtSign,
  pinterest: Image,
};

export default function SocialHubPage() {
  const [connections, setConnections] = useState<PlatformConnection[]>([]);
  const [ayrshareKey, setAyrshareKey] = useState('');
  const [isCheckingConnections, setIsCheckingConnections] = useState(false);
  const [showKeyInput, setShowKeyInput] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  useEffect(() => {
    loadConnections();
  }, []);

  const loadConnections = async () => {
    setIsCheckingConnections(true);
    setConnectionError(null);
    
    // Initialize all platforms as disconnected
    const initialConnections: PlatformConnection[] = PLATFORM_LIST.map(p => ({
      platform: p.id,
      status: 'checking' as ConnectionStatus,
    }));
    setConnections(initialConnections);

    // Check if Ayrshare key exists
    const key = await kvGet('ayrshare_key');
    if (key) {
      setAyrshareKey('••••••••' + key.slice(-4));
      
      // Check actual connections via Ayrshare
      try {
        const { details } = await getConnectedPlatforms();
        const updatedConnections = initialConnections.map(conn => {
          const platformDetails = details[conn.platform as keyof typeof details];
          return {
            ...conn,
            status: platformDetails?.connected ? 'connected' : 'disconnected' as ConnectionStatus,
            username: platformDetails?.username,
            lastChecked: new Date().toISOString(),
          };
        });
        setConnections(updatedConnections);
      } catch (error) {
        const message = error instanceof Error
          ? error.message
          : 'Failed to check connection status.';
        setConnectionError(message);
        setConnections(
          initialConnections.map(conn => ({
            ...conn,
            status: 'error' as ConnectionStatus,
            error: message,
          }))
        );
      }
    } else {
      setConnectionError(null);
      setConnections(
        initialConnections.map(conn => ({
          ...conn,
          status: 'disconnected' as ConnectionStatus,
        }))
      );
    }
    
    setIsCheckingConnections(false);
  };

  const handleSaveAyrshareKey = async (key: string) => {
    const sanitizedKey = sanitizeApiKey(key);
    if (!sanitizedKey) return;
    
    await kvSet('ayrshare_key', sanitizedKey);
    setAyrshareKey('••••••••' + sanitizedKey.slice(-4));
    setConnectionError(null);
    setShowKeyInput(false);
    await loadConnections();
  };

  const handleRemoveAyrshareKey = async () => {
    await kvDelete('ayrshare_key');
    setAyrshareKey('');
    setConnectionError(null);
    setConnections(
      connections.map(conn => ({
        ...conn,
        status: 'disconnected' as ConnectionStatus,
        username: undefined,
      }))
    );
  };

  const getStatusIcon = (status: ConnectionStatus) => {
    switch (status) {
      case 'connected':
        return <CheckCircle2 className="w-5 h-5 text-nexus-success" />;
      case 'disconnected':
        return <XCircle className="w-5 h-5 text-muted-foreground" />;
      case 'error':
        return <AlertCircle className="w-5 h-5 text-nexus-error" />;
      case 'checking':
        return <RefreshCw className="w-5 h-5 text-nexus-cyan animate-spin" />;
    }
  };

  const connectedCount = connections.filter(c => c.status === 'connected').length;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-foreground">Social Hub</h1>
        <p className="text-muted-foreground mt-2">
          Connect and manage your social media platforms
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <GlassCard className="p-6">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-xl bg-nexus-cyan/10">
              <Link2 className="w-6 h-6 text-nexus-cyan" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{connectedCount}</p>
              <p className="text-sm text-muted-foreground">Connected</p>
            </div>
          </div>
        </GlassCard>
        
        <GlassCard className="p-6">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-xl bg-nexus-violet/10">
              <Unlink className="w-6 h-6 text-nexus-violet" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">
                {PLATFORM_LIST.length - connectedCount}
              </p>
              <p className="text-sm text-muted-foreground">Not Connected</p>
            </div>
          </div>
        </GlassCard>
        
        <GlassCard className="p-6">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-xl bg-nexus-success/10">
              <CheckCircle2 className="w-6 h-6 text-nexus-success" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">
                {connectionError ? 'Error' : ayrshareKey ? 'Active' : 'Inactive'}
              </p>
              <p className="text-sm text-muted-foreground">Ayrshare Status</p>
            </div>
          </div>
        </GlassCard>
      </div>

      {/* Ayrshare Connection */}
      <GlassCard className="p-6">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h2 className="text-xl font-semibold text-foreground">Ayrshare Integration</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Connect your Ayrshare account to publish to all platforms with one API
            </p>
          </div>
          <NeonButton
            variant="ghost"
            size="sm"
            onClick={() => window.open('https://ayrshare.com', '_blank', 'noopener,noreferrer')}
          >
            <ExternalLink className="w-4 h-4 mr-2" />
            Get API Key
          </NeonButton>
        </div>

        {connectionError && (
          <div className="mb-6 rounded-xl border border-nexus-error/30 bg-nexus-error/10 px-4 py-3 text-sm text-nexus-error">
            Ayrshare verification failed: {connectionError}
          </div>
        )}

        {showKeyInput ? (
          <div className="space-y-4">
            <AyrshareKeyInput
              onSave={handleSaveAyrshareKey}
              onCancel={() => setShowKeyInput(false)}
            />
          </div>
        ) : ayrshareKey ? (
          <div className="flex items-center justify-between p-4 rounded-lg bg-nexus-success/10 border border-nexus-success/20">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="w-5 h-5 text-nexus-success" />
              <div>
                <p className="font-medium text-foreground">API Key Connected</p>
                <p className="text-sm text-muted-foreground">{ayrshareKey}</p>
              </div>
            </div>
            <div className="flex gap-2">
              <NeonButton variant="ghost" size="sm" onClick={() => setShowKeyInput(true)}>
                Update
              </NeonButton>
              <NeonButton variant="ghost" size="sm" onClick={handleRemoveAyrshareKey}>
                Remove
              </NeonButton>
            </div>
          </div>
        ) : (
          <NeonButton onClick={() => setShowKeyInput(true)}>
            <Link2 className="w-4 h-4 mr-2" />
            Connect Ayrshare
          </NeonButton>
        )}
      </GlassCard>

      {/* Platform Connections */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-foreground">Platform Connections</h2>
          <NeonButton
            variant="ghost"
            size="sm"
            onClick={loadConnections}
            disabled={isCheckingConnections}
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${isCheckingConnections ? 'animate-spin' : ''}`} />
            Refresh
          </NeonButton>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {PLATFORM_LIST.map(platform => {
            const connection = connections.find(c => c.platform === platform.id);
            const Icon = (PLATFORM_ICONS[platform.id] || Link2) as React.ComponentType<any>;
            
            return (
              <GlassCard key={platform.id} className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div
                      className="p-3 rounded-xl"
                      style={{ backgroundColor: `${platform.color}20` }}
                    >
                      <Icon className="w-6 h-6" style={{ color: platform.color }} />
                    </div>
                    <div>
                      <h3 className="font-medium text-foreground">{platform.name}</h3>
                      {connection?.username && (
                        <p className="text-sm text-muted-foreground">@{connection.username}</p>
                      )}
                      {connection?.error && (
                        <p className="text-sm text-nexus-error">{connection.error}</p>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-3">
                    {getStatusIcon(connection?.status || 'disconnected')}
                    <StatusBadge
                      status={connection?.status === 'connected' ? 'success' : 
                              connection?.status === 'error' ? 'error' : 'neutral'}
                    >
                      {connection?.status === 'connected' ? 'Connected' :
                       connection?.status === 'checking' ? 'Checking...' :
                       connection?.status === 'error' ? 'Error' : 'Not Connected'}
                    </StatusBadge>
                  </div>
                </div>
              </GlassCard>
            );
          })}
        </div>

        {!ayrshareKey && (
          <GlassCard className="p-6 mt-4 text-center">
            <p className="text-muted-foreground">
              Connect your Ayrshare account above to link your social media platforms.
              <br />
              <a
                href="https://ayrshare.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-nexus-cyan hover:underline"
              >
                Learn more about Ayrshare
              </a>
            </p>
          </GlassCard>
        )}
      </div>

      {/* Connection Instructions */}
      <GlassCard className="p-6">
        <h2 className="text-xl font-semibold text-foreground mb-4">How to Connect</h2>
        <div className="space-y-4">
          <div className="flex gap-4">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-nexus-cyan/20 flex items-center justify-center text-nexus-cyan font-bold">
              1
            </div>
            <div>
              <h3 className="font-medium text-foreground">Create Ayrshare Account</h3>
              <p className="text-sm text-muted-foreground">
                Sign up for a free account at ayrshare.com
              </p>
            </div>
          </div>
          <div className="flex gap-4">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-nexus-cyan/20 flex items-center justify-center text-nexus-cyan font-bold">
              2
            </div>
            <div>
              <h3 className="font-medium text-foreground">Connect Social Accounts</h3>
              <p className="text-sm text-muted-foreground">
                Link your Twitter, Instagram, LinkedIn, etc. on the Ayrshare dashboard
              </p>
            </div>
          </div>
          <div className="flex gap-4">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-nexus-cyan/20 flex items-center justify-center text-nexus-cyan font-bold">
              3
            </div>
            <div>
              <h3 className="font-medium text-foreground">Copy API Key</h3>
              <p className="text-sm text-muted-foreground">
                Get your API key from Ayrshare settings and paste it above
              </p>
            </div>
          </div>
          <div className="flex gap-4">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-nexus-success/20 flex items-center justify-center text-nexus-success font-bold">
              4
            </div>
            <div>
              <h3 className="font-medium text-foreground">Start Publishing</h3>
              <p className="text-sm text-muted-foreground">
                You can now publish to all connected platforms from NexusAI
              </p>
            </div>
          </div>
        </div>
      </GlassCard>
    </div>
  );
}

// Ayrshare Key Input Component
function AyrshareKeyInput({
  onSave,
  onCancel,
}: {
  onSave: (key: string) => void;
  onCancel: () => void;
}) {
  const [key, setKey] = useState('');

  return (
    <div className="space-y-4">
      <input
        type="password"
        value={key}
        onChange={e => setKey(e.target.value)}
        placeholder="Paste your Ayrshare API key..."
        className="w-full px-4 py-3 rounded-lg bg-background/50 border border-border focus:border-nexus-cyan focus:ring-1 focus:ring-nexus-cyan outline-none transition-colors"
      />
      <div className="flex gap-3">
        <NeonButton onClick={() => onSave(key)} disabled={!key.trim()}>
          Save API Key
        </NeonButton>
        <NeonButton variant="ghost" onClick={onCancel}>
          Cancel
        </NeonButton>
      </div>
    </div>
  );
}
