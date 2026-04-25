'use client';

import { useState, useEffect } from 'react';
import { GlassCard } from '@/components/nexus/GlassCard';
import { NeonButton } from '@/components/nexus/NeonButton';
import { StatusBadge } from '@/components/nexus/StatusBadge';
import { 
  loadPendingApprovals, 
  approveContent, 
  rejectContent,
  loadApprovalHistory,
  type ApprovalRequest 
} from '@/lib/services/publishSafetyService';
import { useAuth } from '@/lib/context/AuthContext';
import { 
  CheckCircle2, 
  XCircle, 
  Clock, 
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Calendar,
  Eye,
} from 'lucide-react';

export default function ApprovalsPage() {
  const { user } = useAuth();
  const [pending, setPending] = useState<ApprovalRequest[]>([]);
  const [history, setHistory] = useState<ApprovalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [activeTab, setActiveTab] = useState<'pending' | 'history'>('pending');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [pendingData, historyData] = await Promise.all([
        loadPendingApprovals(),
        loadApprovalHistory(),
      ]);
      setPending(pendingData);
      setHistory(historyData);
    } catch (error) {
      console.error('Error loading approvals:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (requestId: string) => {
    const result = await approveContent(requestId, user?.username || 'admin');
    if (result) {
      await loadData();
    }
  };

  const handleReject = async (requestId: string) => {
    if (!rejectReason.trim()) {
      alert('Please provide a reason for rejection');
      return;
    }
    const result = await rejectContent(requestId, user?.username || 'admin', rejectReason);
    if (result) {
      setRejectReason('');
      setExpandedId(null);
      await loadData();
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 0.8) return 'text-green-400';
    if (score >= 0.6) return 'text-yellow-400';
    return 'text-red-400';
  };

  const renderApprovalCard = (request: ApprovalRequest, isHistory = false) => (
    <GlassCard key={request.id} className="p-4 mb-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <StatusBadge 
              status={
                request.status === 'approved' ? 'success' : 
                request.status === 'rejected' ? 'error' : 
                'pending'
              }
              label={request.status.charAt(0).toUpperCase() + request.status.slice(1)}
            />
            <span className="text-xs text-muted-foreground">
              {new Date(request.createdAt).toLocaleString()}
            </span>
          </div>
          
          <p className="text-foreground mb-2 line-clamp-2">
            {request.content}
          </p>
          
          <div className="flex flex-wrap gap-2 mb-2">
            {request.platforms.map(platform => (
              <span 
                key={platform}
                className="px-2 py-0.5 text-xs rounded bg-muted text-muted-foreground"
              >
                {platform}
              </span>
            ))}
          </div>

          {request.scheduledTime && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Calendar className="w-3 h-3" />
              Scheduled: {new Date(request.scheduledTime).toLocaleString()}
            </div>
          )}

          {request.profileSnapshot && (
            <div className="mt-2 space-y-1 text-xs text-muted-foreground">
              {request.profileSnapshot.niche && (
                <div>Niche: {request.profileSnapshot.niche}</div>
              )}
              {request.profileSnapshot.targetAudience && (
                <div>Audience: {request.profileSnapshot.targetAudience}</div>
              )}
              {request.profileSnapshot.monetizationGoals && request.profileSnapshot.monetizationGoals.length > 0 && (
                <div>Monetization: {request.profileSnapshot.monetizationGoals.join(', ')}</div>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-col items-end gap-2">
          <div className={`text-lg font-bold ${getScoreColor(request.safetyCheck.score)}`}>
            {Math.round(request.safetyCheck.score * 100)}%
          </div>
          <button
            onClick={() => setExpandedId(expandedId === request.id ? null : request.id)}
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
          >
            <Eye className="w-3 h-3" />
            {expandedId === request.id ? 'Hide' : 'Details'}
            {expandedId === request.id ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
        </div>
      </div>

      {expandedId === request.id && (
        <div className="mt-4 pt-4 border-t border-border">
          <h4 className="text-sm font-semibold mb-2">Safety Checks</h4>
          <div className="space-y-2 mb-4">
            {request.safetyCheck.checks.map((check, idx) => (
              <div key={idx} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  {check.passed ? (
                    <CheckCircle2 className="w-4 h-4 text-green-400" />
                  ) : (
                    <AlertTriangle className={`w-4 h-4 ${check.severity === 'error' ? 'text-red-400' : 'text-yellow-400'}`} />
                  )}
                  <span>{check.name}</span>
                </div>
                <span className="text-xs text-muted-foreground">{check.message}</span>
              </div>
            ))}
          </div>

          {request.profileSnapshot && (
            <div className="mb-4 p-3 bg-muted/30 rounded-lg text-sm space-y-1">
              <div className="font-semibold">Locked Profile Snapshot</div>
              {request.profileSnapshot.niche && <div>Niche: {request.profileSnapshot.niche}</div>}
              {request.profileSnapshot.targetAudience && <div>Audience: {request.profileSnapshot.targetAudience}</div>}
              {request.profileSnapshot.targetPlatforms && request.profileSnapshot.targetPlatforms.length > 0 && (
                <div>Platforms: {request.profileSnapshot.targetPlatforms.join(', ')}</div>
              )}
              {request.profileSnapshot.monetizationGoals && request.profileSnapshot.monetizationGoals.length > 0 && (
                <div>Monetization Goals: {request.profileSnapshot.monetizationGoals.join(', ')}</div>
              )}
              {request.profileSnapshot.contentPillars && request.profileSnapshot.contentPillars.length > 0 && (
                <div>Content Pillars: {request.profileSnapshot.contentPillars.join(', ')}</div>
              )}
              {request.profileSnapshot.contentIdea && (
                <div>Seed Idea: {request.profileSnapshot.contentIdea}</div>
              )}
            </div>
          )}

          {!isHistory && request.status === 'pending' && (
            <div className="space-y-3">
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Reason for rejection (required if rejecting)..."
                className="w-full p-2 text-sm bg-muted/30 border border-border rounded-lg resize-none"
                rows={2}
              />
              <div className="flex gap-2">
                <NeonButton
                  onClick={() => handleApprove(request.id)}
                  className="flex-1"
                  icon={<CheckCircle2 className="w-4 h-4" />}
                >
                  Approve
                </NeonButton>
                <NeonButton
                  onClick={() => handleReject(request.id)}
                  variant="danger"
                  className="flex-1"
                  icon={<XCircle className="w-4 h-4" />}
                >
                  Reject
                </NeonButton>
              </div>
            </div>
          )}

          {isHistory && request.notes && (
            <div className="mt-2 p-2 bg-muted/30 rounded text-sm">
              <span className="font-semibold">Notes:</span> {request.notes}
            </div>
          )}

          {isHistory && request.publishResult && (
            <div className="mt-2 p-2 bg-muted/30 rounded text-sm">
              <span className="font-semibold">Publish Result:</span>{' '}
              <span className={request.publishResult.success ? 'text-green-400' : 'text-red-400'}>
                {request.publishResult.success ? 'Success' : 'Blocked/Failed'}
              </span>
              {request.publishResult.message ? ` - ${request.publishResult.message}` : ''}
            </div>
          )}
        </div>
      )}
    </GlassCard>
  );

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Content Approvals</h1>
          <p className="text-muted-foreground">Review and approve content before publishing</p>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 bg-muted/30 rounded-lg">
          <Clock className="w-4 h-4 text-yellow-400" />
          <span className="text-sm font-medium">{pending.length} pending</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setActiveTab('pending')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === 'pending' 
              ? 'bg-[var(--nexus-cyan)]/20 text-[var(--nexus-cyan)]' 
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Pending ({pending.length})
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === 'history' 
              ? 'bg-[var(--nexus-cyan)]/20 text-[var(--nexus-cyan)]' 
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          History ({history.length})
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-pulse text-muted-foreground">Loading...</div>
        </div>
      ) : activeTab === 'pending' ? (
        pending.length === 0 ? (
          <GlassCard className="p-8 text-center">
            <CheckCircle2 className="w-12 h-12 text-green-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-foreground mb-2">All caught up!</h3>
            <p className="text-muted-foreground">No content waiting for approval.</p>
          </GlassCard>
        ) : (
          pending.map(request => renderApprovalCard(request))
        )
      ) : (
        history.length === 0 ? (
          <GlassCard className="p-8 text-center">
            <Clock className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-foreground mb-2">No history yet</h3>
            <p className="text-muted-foreground">Approved and rejected content will appear here.</p>
          </GlassCard>
        ) : (
          history.slice(0, 20).map(request => renderApprovalCard(request, true))
        )
      )}
    </div>
  );
}
