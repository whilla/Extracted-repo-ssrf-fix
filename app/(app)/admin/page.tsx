'use client';

import { useState } from 'react';
import { GlassCard } from '@/components/nexus/GlassCard';
import { NeonButton } from '@/components/nexus/NeonButton';
import { useAuth } from '@/lib/context/AuthContext';
import { Shield, Users, UserPlus, CheckCircle2, XCircle, Clock, Plus, Trash2, Key } from 'lucide-react';
import { toast } from 'sonner';

type ApprovalStep = { role: string; order: number; status: 'pending' | 'approved' | 'rejected'; userId?: string };
type ApprovalChain = { id: string; name: string; steps: ApprovalStep[] };
type TeamMember = { id: string; name: string; role: string; email: string; status: 'active' | 'invited' };

export default function AdminPage() {
  useAuth();
  const [members, setMembers] = useState<TeamMember[]>([
    { id: '1', name: 'Admin User', role: 'admin', email: 'admin@example.com', status: 'active' },
  ]);
  const [chains, setChains] = useState<ApprovalChain[]>([]);
  const [newMember, setNewMember] = useState({ name: '', email: '', role: 'editor' });
  const [newChain, setNewChain] = useState({ name: '', steps: [{ role: 'reviewer', order: 1, status: 'pending' as const }] });
  const [tab, setTab] = useState<'members' | 'approvals'>('members');

  const addMember = () => {
    if (!newMember.name || !newMember.email) { toast.error('Name and email required'); return; }
    setMembers(prev => [...prev, { ...newMember, id: `m_${Date.now()}`, status: 'invited' }]);
    setNewMember({ name: '', email: '', role: 'editor' });
    toast.success('Team member added');
  };

  const removeMember = (id: string) => {
    setMembers(prev => prev.filter(m => m.id !== id));
    toast.success('Member removed');
  };

  const addChain = () => {
    if (!newChain.name) { toast.error('Chain name required'); return; }
    setChains(prev => [...prev, { id: `chain_${Date.now()}`, name: newChain.name, steps: newChain.steps }]);
    setNewChain({ name: '', steps: [{ role: 'reviewer', order: 1, status: 'pending' as const }] });
    toast.success('Approval chain created');
  };

  const addStep = () => {
    setNewChain(prev => ({ ...prev, steps: [...prev.steps, { role: 'reviewer', order: prev.steps.length + 1, status: 'pending' as const }] }));
  };

  const updateStepRole = (idx: number, role: string) => {
    setNewChain(prev => ({ ...prev, steps: prev.steps.map((s, i) => i === idx ? { ...s, role } : s) }));
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-bg-primary via-bg-primary to-violet-900/20 p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        <div className="mb-12">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-4xl font-bold text-white mb-2 flex items-center gap-3">
                <Shield className="w-8 h-8 text-nexus-cyan" /> Admin
              </h1>
              <p className="text-gray-400">Team management, roles, and approval workflows</p>
            </div>
            <a href="/admin/vault" className="flex items-center gap-2 px-4 py-2 bg-nexus-cyan/10 border border-nexus-cyan/30 rounded-lg text-nexus-cyan hover:bg-nexus-cyan/20 transition-colors text-sm font-medium">
              <Key className="w-4 h-4" /> Credential Vault
            </a>
          </div>
        </div>

        <div className="flex gap-2 mb-8">
          <NeonButton onClick={() => setTab('members')} variant={tab === 'members' ? 'primary' : 'secondary'}>
            <Users className="w-4 h-4" /> Team Members
          </NeonButton>
          <NeonButton onClick={() => setTab('approvals')} variant={tab === 'approvals' ? 'primary' : 'secondary'}>
            <CheckCircle2 className="w-4 h-4" /> Approval Chains
          </NeonButton>
        </div>

        {tab === 'members' ? (
          <>
            <GlassCard className="p-6 mb-6">
              <h3 className="text-lg font-semibold text-white mb-4">Invite Team Member</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <input className="bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-white text-sm" placeholder="Name" value={newMember.name} onChange={e => setNewMember(p => ({ ...p, name: e.target.value }))} />
                <input className="bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-white text-sm" placeholder="Email" value={newMember.email} onChange={e => setNewMember(p => ({ ...p, email: e.target.value }))} />
                <select className="bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-white text-sm" value={newMember.role} onChange={e => setNewMember(p => ({ ...p, role: e.target.value }))}>
                  <option value="admin">Admin</option>
                  <option value="editor">Editor</option>
                  <option value="reviewer">Reviewer</option>
                  <option value="viewer">Viewer</option>
                </select>
              </div>
              <NeonButton onClick={addMember}><UserPlus className="w-4 h-4" /> Send Invite</NeonButton>
            </GlassCard>

            <GlassCard className="p-6">
              <h3 className="text-lg font-semibold text-white mb-4">Team Members ({members.length})</h3>
              <div className="space-y-3">
                {members.map(m => (
                  <div key={m.id} className="flex items-center justify-between p-3 bg-black/30 rounded-lg border border-white/5">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-nexus-cyan to-violet-500 flex items-center justify-center text-white text-xs font-bold">
                        {m.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="text-white text-sm font-medium">{m.name}</p>
                        <p className="text-xs text-gray-500">{m.email} • {m.role}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${m.status === 'active' ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'}`}>{m.status}</span>
                      <NeonButton size="sm" onClick={() => removeMember(m.id)}><Trash2 className="w-3 h-3" /></NeonButton>
                    </div>
                  </div>
                ))}
              </div>
            </GlassCard>
          </>
        ) : (
          <>
            <GlassCard className="p-6 mb-6">
              <h3 className="text-lg font-semibold text-white mb-4">New Approval Chain</h3>
              <input className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-white text-sm mb-4" placeholder="Chain name (e.g. Content Review)" value={newChain.name} onChange={e => setNewChain(p => ({ ...p, name: e.target.value }))} />
              <div className="space-y-2 mb-4">
                {newChain.steps.map((step, i) => (
                  <div key={i} className="flex items-center gap-3 p-2 bg-black/30 rounded-lg">
                    <span className="text-xs text-gray-500 w-6">#{step.order}</span>
                    <select className="flex-1 bg-black/40 border border-white/10 rounded px-2 py-1 text-white text-xs" value={step.role} onChange={e => updateStepRole(i, e.target.value)}>
                      <option value="reviewer">Reviewer</option>
                      <option value="editor">Editor</option>
                      <option value="admin">Admin</option>
                    </select>
                    <span className="text-xs text-yellow-400 flex items-center gap-1"><Clock className="w-3 h-3" /> Pending</span>
                  </div>
                ))}
              </div>
              <div className="flex gap-3">
                <NeonButton onClick={addStep}><Plus className="w-4 h-4" /> Add Step</NeonButton>
                <NeonButton onClick={addChain}><CheckCircle2 className="w-4 h-4" /> Create Chain</NeonButton>
              </div>
            </GlassCard>

            <GlassCard className="p-6">
              <h3 className="text-lg font-semibold text-white mb-4">Saved Approval Chains</h3>
              {chains.length === 0 ? (
                <p className="text-sm text-gray-500">No chains configured. Create one to enforce multi-step content review.</p>
              ) : (
                <div className="space-y-3">
                  {chains.map(c => (
                    <div key={c.id} className="p-3 bg-black/30 rounded-lg border border-white/5">
                      <p className="text-white text-sm font-medium mb-2">{c.name}</p>
                      <div className="flex gap-2">
                        {c.steps.map(s => (
                          <span key={s.order} className="text-xs px-2 py-1 rounded bg-white/5 text-gray-400">
                            {s.order}. {s.role} {s.status === 'approved' ? '✅' : s.status === 'rejected' ? '❌' : '⏳'}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </GlassCard>
          </>
        )}
      </div>
    </div>
  );
}
