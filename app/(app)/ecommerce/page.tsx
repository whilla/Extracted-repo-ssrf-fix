'use client';

import { useState, useEffect } from 'react';
import { GlassCard } from '@/components/nexus/GlassCard';
import { NeonButton } from '@/components/nexus/NeonButton';
import { kvGet, kvSet } from '@/lib/services/puterService';
import { toast } from 'sonner';
import {
  ShoppingCart,
  Package,
  Store,
  Globe,
  Tag,
  DollarSign,
  Upload,
  CheckCircle2,
  XCircle,
  Loader2,
  ExternalLink,
} from 'lucide-react';

interface ProviderStatus {
  configured: boolean;
  testing: boolean;
  lastTest?: 'success' | 'error';
  lastTestMessage?: string;
}

export default function EcommercePage() {
  const [shopify, setShopify] = useState<ProviderStatus>({ configured: false, testing: false });
  const [etsy, setEtsy] = useState<ProviderStatus>({ configured: false, testing: false });
  const [amazon, setAmazon] = useState<ProviderStatus>({ configured: false, testing: false });
  const [loading, setLoading] = useState(true);
  const [shopifyUrl, setShopifyUrl] = useState('');
  const [shopifyToken, setShopifyToken] = useState('');
  const [etsyKey, setEtsyKey] = useState('');
  const [etsySecret, setEtsySecret] = useState('');
  const [amazonAccessKey, setAmazonAccessKey] = useState('');
  const [amazonSecretKey, setAmazonSecretKey] = useState('');
  const [amazonRegion, setAmazonRegion] = useState('us-east-1');
  const [publishing, setPublishing] = useState<string | null>(null);

  useEffect(() => {
    loadCredentials();
  }, []);

  async function loadCredentials() {
    try {
      const [su, st, ek, es, aak, ask, ar] = await Promise.all([
        kvGet('shopify_store_url'),
        kvGet('shopify_access_token'),
        kvGet('etsy_api_key'),
        kvGet('etsy_api_secret'),
        kvGet('amazon_access_key'),
        kvGet('amazon_secret_key'),
        kvGet('amazon_region'),
      ]);
      setShopifyUrl(su || '');
      setShopifyToken(st || '');
      setEtsyKey(ek || '');
      setEtsySecret(es || '');
      setAmazonAccessKey(aak || '');
      setAmazonSecretKey(ask || '');
      setAmazonRegion(ar || 'us-east-1');
      setShopify(prev => ({ ...prev, configured: !!(su && st) }));
      setEtsy(prev => ({ ...prev, configured: !!(ek && es) }));
      setAmazon(prev => ({ ...prev, configured: !!(aak && ask) }));
    } catch {
      toast.error('Failed to load credentials');
    } finally {
      setLoading(false);
    }
  }

  async function saveCredentials(provider: 'shopify' | 'etsy' | 'amazon') {
    try {
      if (provider === 'shopify') {
        await kvSet('shopify_store_url', shopifyUrl);
        await kvSet('shopify_access_token', shopifyToken);
        setShopify(prev => ({ ...prev, configured: !!(shopifyUrl && shopifyToken) }));
        toast.success('Shopify credentials saved');
      } else if (provider === 'etsy') {
        await kvSet('etsy_api_key', etsyKey);
        await kvSet('etsy_api_secret', etsySecret);
        setEtsy(prev => ({ ...prev, configured: !!(etsyKey && etsySecret) }));
        toast.success('Etsy credentials saved');
      } else {
        await kvSet('amazon_access_key', amazonAccessKey);
        await kvSet('amazon_secret_key', amazonSecretKey);
        await kvSet('amazon_region', amazonRegion);
        setAmazon(prev => ({ ...prev, configured: !!(amazonAccessKey && amazonSecretKey) }));
        toast.success('Amazon credentials saved');
      }
    } catch {
      toast.error('Failed to save credentials');
    }
  }

  async function testConnection(provider: 'shopify' | 'etsy' | 'amazon') {
    const setter = provider === 'shopify' ? setShopify : provider === 'etsy' ? setEtsy : setAmazon;
    setter(prev => ({ ...prev, testing: true }));
    try {
      const res = await fetch(`/api/ecommerce/${provider}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'test' }),
      });
      const data = await res.json();
      setter(prev => ({
        ...prev,
        testing: false,
        lastTest: res.ok ? 'success' : 'error',
        lastTestMessage: data.message || data.error,
      }));
      toast[res.ok ? 'success' : 'error'](data.message || data.error);
    } catch {
      setter(prev => ({ ...prev, testing: false, lastTest: 'error', lastTestMessage: 'Connection failed' }));
      toast.error('Connection test failed');
    }
  }

  async function publishProduct(provider: 'shopify' | 'etsy' | 'amazon') {
    setPublishing(provider);
    try {
      const res = await fetch(`/api/ecommerce/${provider}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'publish',
          title: 'Test Product',
          description: 'Published from NexusAI',
          price: '29.99',
        }),
      });
      const data = await res.json();
      toast[res.ok ? 'success' : 'error'](data.message || data.error);
    } catch {
      toast.error('Publishing failed');
    } finally {
      setPublishing(null);
    }
  }

  function StatusIcon({ status }: { status: ProviderStatus }) {
    if (status.testing) return <Loader2 className="h-4 w-4 animate-spin text-blue-400" />;
    if (status.lastTest === 'success') return <CheckCircle2 className="h-4 w-4 text-green-400" />;
    if (status.lastTest === 'error') return <XCircle className="h-4 w-4 text-red-400" />;
    return status.configured ? <CheckCircle2 className="h-4 w-4 text-green-400" /> : <XCircle className="h-4 w-4 text-gray-500" />;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-blue-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">E-Commerce Publishing</h1>
        <p className="text-gray-400 mt-1">Publish products to Shopify, Etsy, and Amazon</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {/* Shopify */}
        <GlassCard>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Store className="h-5 w-5 text-green-400" />
                <h2 className="font-semibold text-white">Shopify</h2>
              </div>
              <StatusIcon status={shopify} />
            </div>

            <div className="space-y-2">
              <label className="text-sm text-gray-400">Store URL</label>
              <input
                type="text"
                value={shopifyUrl}
                onChange={e => setShopifyUrl(e.target.value)}
                placeholder="mystore.myshopify.com"
                className="w-full bg-gray-800/50 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:border-blue-500 focus:outline-none"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm text-gray-400">Access Token</label>
              <input
                type="password"
                value={shopifyToken}
                onChange={e => setShopifyToken(e.target.value)}
                placeholder="shpat_..."
                className="w-full bg-gray-800/50 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:border-blue-500 focus:outline-none"
              />
            </div>

            <div className="flex gap-2">
              <NeonButton
                size="sm"
                onClick={() => saveCredentials('shopify')}
                className="flex-1"
              >
                Save
              </NeonButton>
              <NeonButton
                size="sm"
                variant="secondary"
                onClick={() => testConnection('shopify')}
                disabled={shopify.testing}
              >
                Test
              </NeonButton>
            </div>

            {shopify.lastTestMessage && (
              <p className="text-xs text-gray-500">{shopify.lastTestMessage}</p>
            )}

            <NeonButton
              size="sm"
              variant="outline"
              onClick={() => publishProduct('shopify')}
              disabled={publishing !== null || !shopify.configured}
              className="w-full"
            >
              {publishing === 'shopify' ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              Publish Test Product
            </NeonButton>
          </div>
        </GlassCard>

        {/* Etsy */}
        <GlassCard>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Tag className="h-5 w-5 text-orange-400" />
                <h2 className="font-semibold text-white">Etsy</h2>
              </div>
              <StatusIcon status={etsy} />
            </div>

            <div className="space-y-2">
              <label className="text-sm text-gray-400">API Key</label>
              <input
                type="password"
                value={etsyKey}
                onChange={e => setEtsyKey(e.target.value)}
                placeholder="Etsy API Key"
                className="w-full bg-gray-800/50 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:border-blue-500 focus:outline-none"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm text-gray-400">API Secret</label>
              <input
                type="password"
                value={etsySecret}
                onChange={e => setEtsySecret(e.target.value)}
                placeholder="Etsy API Secret"
                className="w-full bg-gray-800/50 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:border-blue-500 focus:outline-none"
              />
            </div>

            <div className="flex gap-2">
              <NeonButton
                size="sm"
                onClick={() => saveCredentials('etsy')}
                className="flex-1"
              >
                Save
              </NeonButton>
              <NeonButton
                size="sm"
                variant="secondary"
                onClick={() => testConnection('etsy')}
                disabled={etsy.testing}
              >
                Test
              </NeonButton>
            </div>

            {etsy.lastTestMessage && (
              <p className="text-xs text-gray-500">{etsy.lastTestMessage}</p>
            )}

            <NeonButton
              size="sm"
              variant="outline"
              onClick={() => publishProduct('etsy')}
              disabled={publishing !== null || !etsy.configured}
              className="w-full"
            >
              {publishing === 'etsy' ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              Publish Test Listing
            </NeonButton>
          </div>
        </GlassCard>

        {/* Amazon */}
        <GlassCard>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Globe className="h-5 w-5 text-yellow-400" />
                <h2 className="font-semibold text-white">Amazon</h2>
              </div>
              <StatusIcon status={amazon} />
            </div>

            <div className="space-y-2">
              <label className="text-sm text-gray-400">Access Key ID</label>
              <input
                type="password"
                value={amazonAccessKey}
                onChange={e => setAmazonAccessKey(e.target.value)}
                placeholder="AKIA..."
                className="w-full bg-gray-800/50 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:border-blue-500 focus:outline-none"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm text-gray-400">Secret Access Key</label>
              <input
                type="password"
                value={amazonSecretKey}
                onChange={e => setAmazonSecretKey(e.target.value)}
                placeholder="Secret Key"
                className="w-full bg-gray-800/50 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:border-blue-500 focus:outline-none"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm text-gray-400">Region</label>
              <select
                value={amazonRegion}
                onChange={e => setAmazonRegion(e.target.value)}
                className="w-full bg-gray-800/50 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:border-blue-500 focus:outline-none"
              >
                <option value="us-east-1">US East (N. Virginia)</option>
                <option value="us-west-2">US West (Oregon)</option>
                <option value="eu-west-1">EU (Ireland)</option>
                <option value="ap-southeast-1">Asia Pacific (Singapore)</option>
              </select>
            </div>

            <div className="flex gap-2">
              <NeonButton
                size="sm"
                onClick={() => saveCredentials('amazon')}
                className="flex-1"
              >
                Save
              </NeonButton>
              <NeonButton
                size="sm"
                variant="secondary"
                onClick={() => testConnection('amazon')}
                disabled={amazon.testing}
              >
                Test
              </NeonButton>
            </div>

            {amazon.lastTestMessage && (
              <p className="text-xs text-gray-500">{amazon.lastTestMessage}</p>
            )}

            <NeonButton
              size="sm"
              variant="outline"
              onClick={() => publishProduct('amazon')}
              disabled={publishing !== null || !amazon.configured}
              className="w-full"
            >
              {publishing === 'amazon' ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              Publish Test Listing
            </NeonButton>
          </div>
        </GlassCard>
      </div>

      <GlassCard>
        <h2 className="font-semibold text-white mb-4">Quick Stats</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center">
            <p className="text-2xl font-bold text-green-400">
              {[shopify, etsy, amazon].filter(p => p.configured).length}/3
            </p>
            <p className="text-xs text-gray-400">Providers Configured</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-blue-400">3</p>
            <p className="text-xs text-gray-400">Platforms Supported</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-purple-400">API</p>
            <p className="text-xs text-gray-400">Integration Mode</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-yellow-400">
              {publishing ? 'Active' : 'Idle'}
            </p>
            <p className="text-xs text-gray-400">Publish Status</p>
          </div>
        </div>
      </GlassCard>
    </div>
  );
}
