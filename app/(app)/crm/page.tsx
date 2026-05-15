'use client';

import { useState, useEffect, useCallback } from 'react';
import { useApiLoading } from '@/context/ApiLoadingContext';
import { GlassCard } from '@/components/nexus/GlassCard';
import { NeonButton } from '@/components/nexus/NeonButton';
import { LoadingPulse } from '@/components/nexus/LoadingPulse';
import { StatsSkeleton } from '@/components/crm/StatsSkeleton';
import { CustomerTableSkeleton } from '@/components/crm/CustomerTableSkeleton';
import { SegmentsSkeleton } from '@/components/crm/SegmentsSkeleton';
import { StatusBadge } from '@/components/nexus/StatusBadge';
import { toast } from 'sonner';
import {
  Users,
  UserPlus,
  Target,
  TrendingUp,
  Mail,
  Tag,
  Star,
  Activity,
  Search,
  Filter,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

interface CRMSegment {
  id: string;
  name: string;
  customerCount: number;
  engagementScore: number;
  criteria?: Record<string, any>;
}

interface CRMCustomer {
  id: string;
  email: string;
  name: string;
  source?: string;
  tags: string[];
  lifecycleStage: string;
  score: number;
  lastContact?: string;
}

interface CRMStats {
  totalContacts: number;
  byStage: Record<string, number>;
  avgScore: number;
  topSources: string[];
}

const STAGE_STATUS: Record<string, string> = {
  lead: 'warning',
  prospect: 'info',
  customer: 'success',
  advocate: 'active',
};

export default function CRMPage() {
  const [segments, setSegments] = useState<CRMSegment[]>([]);
  const [customers, setCustomers] = useState<CRMCustomer[]>([]);
  const [stats, setStats] = useState<CRMStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'customers' | 'segments'>('overview');
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddCustomer, setShowAddCustomer] = useState(false);
  const [showAddSegment, setShowAddSegment] = useState(false);

  const [newCustomer, setNewCustomer] = useState({
    name: '',
    email: '',
    source: 'website',
    tags: '',
  });

  const [newSegment, setNewSegment] = useState({
    name: '',
    criteria: '',
  });

  const { startLoading, stopLoading } = useApiLoading();

  const fetchCRMData = useCallback(async () => {
    try {
      setLoading(true);
      startLoading();
      const [segmentsRes, customersRes, statsRes] = await Promise.allSettled([
        fetch('/api/crm?type=get_segments'),
        fetch('/api/crm/customer?type=customers'),
        fetch('/api/crm/customer?type=aggregate'),
      ]);

      if (segmentsRes.status === 'fulfilled' && segmentsRes.value.ok) {
        const data = await segmentsRes.value.json();
        setSegments(data.segments || []);
      }

      if (customersRes.status === 'fulfilled' && customersRes.value.ok) {
        const data = await customersRes.value.json();
        setCustomers(data.data || []);
      }

      if (statsRes.status === 'fulfilled' && statsRes.value.ok) {
        const data = await statsRes.value.json();
        setStats(data.data || null);
      }
    } catch (error) {
      console.error('[CRM] Fetch error:', error);
      toast.error('Failed to load CRM data');
    } finally {
      setLoading(false);
      stopLoading();
    }
  }, []);

  useEffect(() => {
    fetchCRMData();
  }, [fetchCRMData]);

  const handleAddCustomer = async () => {
    if (!newCustomer.name || !newCustomer.email) {
      toast.error('Name and email are required');
      return;
    }
    try {
      const res = await fetch('/api/crm/customer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'create',
          email: newCustomer.email,
          name: newCustomer.name,
          source: newCustomer.source,
          tags: newCustomer.tags.split(',').map(t => t.trim()).filter(Boolean),
        }),
      });
      if (res.ok) {
        toast.success('Customer added');
        setNewCustomer({ name: '', email: '', source: 'website', tags: '' });
        setShowAddCustomer(false);
        fetchCRMData();
      } else {
        toast.error('Failed to add customer');
      }
    } catch {
      toast.error('Failed to add customer');
    }
  };

  const handleAddSegment = async () => {
    if (!newSegment.name) {
      toast.error('Segment name is required');
      return;
    }
    try {
      const res = await fetch('/api/crm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'create_segment',
          name: newSegment.name,
          criteria: newSegment.criteria ? JSON.parse(newSegment.criteria) : {},
        }),
      });
      if (res.ok) {
        toast.success('Segment created');
        setNewSegment({ name: '', criteria: '' });
        setShowAddSegment(false);
        fetchCRMData();
      } else {
        toast.error('Failed to create segment');
      }
    } catch {
      toast.error('Failed to create segment');
    }
  };

  const filteredCustomers = customers.filter(c =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.tags.some(t => t.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-bg-primary via-bg-primary to-violet-900/20 p-4 md:p-8">
        <GlassCard className="p-6 mb-6">
          <h1 className="text-2xl font-bold text-foreground mb-6">Customer Relationship Management</h1>
          
          {/* Tabs skeleton */}
          <div className="flex gap-2 mb-6">
            <Skeleton className="h-8 w-24" />
            <Skeleton className="h-8 w-24" />
            <Skeleton className="h-8 w-24" />
          </div>
          
          {/* Content based on active tab */}
          <StatsSkeleton />
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div>
              <div className="flex items-center justify-between mb-4">
                <Skeleton className="h-6 w-32" />
                <Skeleton className="h-8 w-24" />
              </div>
              <CustomerTableSkeleton />
            </div>
            
            <div>
              <div className="flex items-center justify-between mb-4">
                <Skeleton className="h-6 w-32" />
                <Skeleton className="h-8 w-24" />
              </div>
              <SegmentsSkeleton />
            </div>
          </div>
        </GlassCard>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-bg-primary via-bg-primary to-violet-900/20 p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold text-white mb-2">CRM Dashboard</h1>
            <p className="text-gray-400">Manage audience segments, track customers, and analyze engagement</p>
          </div>
          <div className="flex gap-3">
            <NeonButton onClick={() => setShowAddCustomer(true)}>
              <UserPlus className="w-4 h-4 mr-2" />
              Add Customer
            </NeonButton>
            <NeonButton variant="secondary" onClick={() => setShowAddSegment(true)}>
              <Target className="w-4 h-4 mr-2" />
              New Segment
            </NeonButton>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-8">
          {(['overview', 'customers', 'segments'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === tab
                  ? 'bg-cyan/20 text-cyan border border-cyan/30'
                  : 'bg-white/5 text-gray-400 hover:text-white hover:bg-white/10'
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <GlassCard className="p-6">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-lg bg-cyan/20 flex items-center justify-center">
                    <Users className="w-5 h-5 text-cyan" />
                  </div>
                  <span className="text-sm text-gray-400">Total Contacts</span>
                </div>
                <p className="text-3xl font-bold text-white">{stats?.totalContacts || customers.length || 0}</p>
              </GlassCard>

              <GlassCard className="p-6">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-lg bg-green/20 flex items-center justify-center">
                    <TrendingUp className="w-5 h-5 text-green-400" />
                  </div>
                  <span className="text-sm text-gray-400">Avg Score</span>
                </div>
                <p className="text-3xl font-bold text-white">{stats?.avgScore ? stats.avgScore.toFixed(1) : '0.0'}</p>
              </GlassCard>

              <GlassCard className="p-6">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-lg bg-violet/20 flex items-center justify-center">
                    <Target className="w-5 h-5 text-violet" />
                  </div>
                  <span className="text-sm text-gray-400">Segments</span>
                </div>
                <p className="text-3xl font-bold text-white">{segments.length}</p>
              </GlassCard>

              <GlassCard className="p-6">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-lg bg-yellow/20 flex items-center justify-center">
                    <Activity className="w-5 h-5 text-yellow-400" />
                  </div>
                  <span className="text-sm text-gray-400">Top Source</span>
                </div>
                <p className="text-xl font-bold text-white truncate">
                  {stats?.topSources?.[0] || 'N/A'}
                </p>
              </GlassCard>
            </div>

            {/* Stage Breakdown */}
            <GlassCard className="p-6">
              <h2 className="text-lg font-semibold text-white mb-4">Lifecycle Stages</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {Object.entries(stats?.byStage || {}).map(([stage, count]) => (
                  <div key={stage} className="bg-white/5 rounded-lg p-4 text-center">
                    <StatusBadge status={STAGE_STATUS[stage] || 'neutral'}>
                      {stage}
                    </StatusBadge>
                    <p className="text-2xl font-bold text-white mt-2">{count}</p>
                  </div>
                ))}
                {(!stats?.byStage || Object.keys(stats.byStage).length === 0) && (
                  <div className="col-span-full text-center text-gray-500 py-8">
                    No stage data available. Add customers to see breakdowns.
                  </div>
                )}
              </div>
            </GlassCard>

            {/* Recent Customers */}
            <GlassCard className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-white">Recent Customers</h2>
                <button
                  onClick={() => setActiveTab('customers')}
                  className="text-sm text-cyan hover:text-cyan-300 transition-colors"
                >
                  View all →
                </button>
              </div>
              {customers.slice(0, 5).map(customer => (
                <div
                  key={customer.id}
                  className="flex items-center justify-between py-3 border-b border-white/5 last:border-0"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-cyan/20 flex items-center justify-center text-cyan text-sm font-bold">
                      {customer.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="text-white font-medium text-sm">{customer.name}</p>
                      <p className="text-gray-500 text-xs">{customer.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={STAGE_STATUS[customer.lifecycleStage] || 'neutral'}>
                      {customer.lifecycleStage}
                    </StatusBadge>
                    <span className="text-sm text-gray-400">{customer.score}</span>
                  </div>
                </div>
              ))}
              {customers.length === 0 && (
                <div className="text-center text-gray-500 py-8">
                  No customers yet. Add your first customer above.
                </div>
              )}
            </GlassCard>
          </div>
        )}

        {/* Customers Tab */}
        {activeTab === 'customers' && (
          <div className="space-y-4">
            <GlassCard className="p-4">
              <div className="flex gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="Search by name, email, or tag..."
                    className="w-full pl-10 pr-4 py-2 bg-black/40 border border-gray-700/50 rounded-lg text-white placeholder:text-gray-500 focus:outline-none focus:border-cyan-500/50"
                  />
                </div>
                <Filter className="w-5 h-5 text-gray-400 mt-2.5" />
              </div>
            </GlassCard>

            <GlassCard className="p-0 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-white/5">
                    <tr>
                      <th className="text-left text-xs font-medium text-gray-400 uppercase px-4 py-3">Customer</th>
                      <th className="text-left text-xs font-medium text-gray-400 uppercase px-4 py-3">Source</th>
                      <th className="text-left text-xs font-medium text-gray-400 uppercase px-4 py-3">Stage</th>
                      <th className="text-left text-xs font-medium text-gray-400 uppercase px-4 py-3">Score</th>
                      <th className="text-left text-xs font-medium text-gray-400 uppercase px-4 py-3">Tags</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCustomers.map(customer => (
                      <tr key={customer.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-cyan/20 flex items-center justify-center text-cyan text-sm font-bold">
                              {customer.name.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <p className="text-white text-sm font-medium">{customer.name}</p>
                              <p className="text-gray-500 text-xs">{customer.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-gray-400 text-sm capitalize">{customer.source || '—'}</td>
                        <td className="px-4 py-3">
                          <StatusBadge status={STAGE_STATUS[customer.lifecycleStage] || 'neutral'}>
                            {customer.lifecycleStage}
                          </StatusBadge>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1">
                            <Star className="w-3 h-3 text-yellow-400" />
                            <span className="text-white text-sm">{customer.score}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1">
                            {customer.tags.map(tag => (
                              <span key={tag} className="text-xs bg-white/10 text-gray-300 px-2 py-0.5 rounded">
                                {tag}
                              </span>
                            ))}
                            {customer.tags.length === 0 && <span className="text-gray-500 text-xs">—</span>}
                          </div>
                        </td>
                      </tr>
                    ))}
                    {filteredCustomers.length === 0 && (
                      <tr>
                        <td colSpan={5} className="text-center text-gray-500 py-12">
                          {searchQuery ? 'No customers match your search.' : 'No customers yet. Add your first customer.'}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </GlassCard>
          </div>
        )}

        {/* Segments Tab */}
        {activeTab === 'segments' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {segments.map(segment => (
              <GlassCard key={segment.id} className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className="w-10 h-10 rounded-lg bg-violet/20 flex items-center justify-center">
                    <Target className="w-5 h-5 text-violet" />
                  </div>
                  <StatusBadge status="active">
                    {segment.customerCount} contacts
                  </StatusBadge>
                </div>
                <h3 className="text-lg font-semibold text-white mb-1">{segment.name}</h3>
                <div className="flex items-center gap-2 mb-3">
                  <Activity className="w-4 h-4 text-gray-400" />
                  <span className="text-sm text-gray-400">Engagement score: {segment.engagementScore}</span>
                </div>
                {segment.criteria && Object.keys(segment.criteria).length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-3">
                    {Object.entries(segment.criteria).map(([key, value]) => (
                      <span key={key} className="text-xs bg-white/5 text-gray-400 px-2 py-1 rounded">
                        {key}: {String(value)}
                      </span>
                    ))}
                  </div>
                )}
              </GlassCard>
            ))}
            {segments.length === 0 && (
              <div className="col-span-full">
                <GlassCard className="p-12 text-center">
                  <Target className="w-12 h-12 text-gray-600 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-white mb-2">No segments yet</h3>
                  <p className="text-gray-400 mb-4">Create your first audience segment to start organizing contacts</p>
                  <NeonButton onClick={() => setShowAddSegment(true)}>Create Segment</NeonButton>
                </GlassCard>
              </div>
            )}
          </div>
        )}

        {/* Add Customer Modal */}
        {showAddCustomer && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <GlassCard className="w-full max-w-md p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-white">Add Customer</h3>
                <button onClick={() => setShowAddCustomer(false)} className="text-gray-400 hover:text-white">
                  <ChevronUp className="w-5 h-5 rotate-90" />
                </button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="text-sm text-gray-400 block mb-1">Name *</label>
                  <input
                    type="text"
                    value={newCustomer.name}
                    onChange={e => setNewCustomer(s => ({ ...s, name: e.target.value }))}
                    className="w-full px-3 py-2 bg-black/40 border border-gray-700/50 rounded-lg text-white focus:outline-none focus:border-cyan-500/50"
                    placeholder="John Doe"
                  />
                </div>
                <div>
                  <label className="text-sm text-gray-400 block mb-1">Email *</label>
                  <input
                    type="email"
                    value={newCustomer.email}
                    onChange={e => setNewCustomer(s => ({ ...s, email: e.target.value }))}
                    className="w-full px-3 py-2 bg-black/40 border border-gray-700/50 rounded-lg text-white focus:outline-none focus:border-cyan-500/50"
                    placeholder="john@example.com"
                  />
                </div>
                <div>
                  <label className="text-sm text-gray-400 block mb-1">Source</label>
                  <select
                    value={newCustomer.source}
                    onChange={e => setNewCustomer(s => ({ ...s, source: e.target.value }))}
                    className="w-full px-3 py-2 bg-black/40 border border-gray-700/50 rounded-lg text-white focus:outline-none focus:border-cyan-500/50"
                  >
                    <option value="website">Website</option>
                    <option value="instagram">Instagram</option>
                    <option value="tiktok">TikTok</option>
                    <option value="linkedin">LinkedIn</option>
                    <option value="twitter">Twitter/X</option>
                    <option value="youtube">YouTube</option>
                    <option value="referral">Referral</option>
                    <option value="event">Event</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="text-sm text-gray-400 block mb-1">Tags (comma-separated)</label>
                  <input
                    type="text"
                    value={newCustomer.tags}
                    onChange={e => setNewCustomer(s => ({ ...s, tags: e.target.value }))}
                    className="w-full px-3 py-2 bg-black/40 border border-gray-700/50 rounded-lg text-white focus:outline-none focus:border-cyan-500/50"
                    placeholder="vip, newsletter, engaged"
                  />
                </div>
                <div className="flex gap-3 pt-2">
                  <NeonButton variant="secondary" className="flex-1" onClick={() => setShowAddCustomer(false)}>
                    Cancel
                  </NeonButton>
                  <NeonButton className="flex-1" onClick={handleAddCustomer}>
                    Add Customer
                  </NeonButton>
                </div>
              </div>
            </GlassCard>
          </div>
        )}

        {/* Add Segment Modal */}
        {showAddSegment && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <GlassCard className="w-full max-w-md p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-white">Create Segment</h3>
                <button onClick={() => setShowAddSegment(false)} className="text-gray-400 hover:text-white">
                  <ChevronUp className="w-5 h-5 rotate-90" />
                </button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="text-sm text-gray-400 block mb-1">Segment Name *</label>
                  <input
                    type="text"
                    value={newSegment.name}
                    onChange={e => setNewSegment(s => ({ ...s, name: e.target.value }))}
                    className="w-full px-3 py-2 bg-black/40 border border-gray-700/50 rounded-lg text-white focus:outline-none focus:border-cyan-500/50"
                    placeholder="High-Value Customers"
                  />
                </div>
                <div>
                  <label className="text-sm text-gray-400 block mb-1">Criteria (JSON)</label>
                  <textarea
                    value={newSegment.criteria}
                    onChange={e => setNewSegment(s => ({ ...s, criteria: e.target.value }))}
                    className="w-full px-3 py-2 bg-black/40 border border-gray-700/50 rounded-lg text-white focus:outline-none focus:border-cyan-500/50 h-24"
                    placeholder='{"engagementScore": 80, "source": "instagram"}'
                  />
                </div>
                <div className="flex gap-3 pt-2">
                  <NeonButton variant="secondary" className="flex-1" onClick={() => setShowAddSegment(false)}>
                    Cancel
                  </NeonButton>
                  <NeonButton className="flex-1" onClick={handleAddSegment}>
                    Create Segment
                  </NeonButton>
                </div>
              </div>
            </GlassCard>
          </div>
        )}
      </div>
    </div>
  );
}
