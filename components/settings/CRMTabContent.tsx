'use client';

import { useState, useEffect } from 'react';
import { GlassCard } from '@/components/nexus/GlassCard';
import { Users } from 'lucide-react';

export function CRMTabContent() {
  const [crmData, setCrmData] = useState<{ totalContacts: number; totalSegments: number; avgScore: number }>({
    totalContacts: 0,
    totalSegments: 0,
    avgScore: 0,
  });

  useEffect(() => {
    const loadCRM = async () => {
      try {
        const { CRMService } = await import('@/lib/services/crmService');
        const [customers, segments] = await Promise.all([
          CRMService.getAllCustomers(),
          CRMService.getAllSegments(),
        ]);
        const totalContacts = customers.success && customers.data ? customers.data.length : 0;
        const totalSegments = segments.success && segments.data ? segments.data.length : 0;
        const avgScore = customers.success && customers.data && customers.data.length > 0
          ? Math.round(customers.data.reduce((s, c) => s + c.score, 0) / customers.data.length)
          : 0;
        setCrmData({ totalContacts, totalSegments, avgScore });
      } catch {}
    };
    loadCRM();
  }, []);

  return (
    <div className="space-y-4">
      <GlassCard className="p-6">
        <div className="flex items-center gap-3 mb-4">
          <Users className="w-5 h-5 text-nexus-cyan" />
          <h3 className="text-lg font-semibold text-foreground">CRM Configuration</h3>
        </div>
        <p className="text-sm text-muted-foreground mb-6">
          Manage customer segments and track audience interactions. CRM data is persisted via Supabase.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="p-4 rounded-lg bg-secondary/10 border border-border/50 text-center">
            <p className="text-2xl font-bold text-nexus-cyan">{crmData.totalContacts}</p>
            <p className="text-xs text-muted-foreground mt-1">Total Contacts</p>
          </div>
          <div className="p-4 rounded-lg bg-secondary/10 border border-border/50 text-center">
            <p className="text-2xl font-bold text-nexus-cyan">{crmData.totalSegments}</p>
            <p className="text-xs text-muted-foreground mt-1">Active Segments</p>
          </div>
          <div className="p-4 rounded-lg bg-secondary/10 border border-border/50 text-center">
            <p className="text-2xl font-bold text-nexus-cyan">{crmData.avgScore}</p>
            <p className="text-xs text-muted-foreground mt-1">Avg Score</p>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          CRM data is managed through the CRM API endpoints (<code className="text-nexus-cyan">/api/crm/customer</code>, <code className="text-nexus-cyan">/api/crm/segment</code>). All data is stored in Supabase with RLS policies.
        </p>
      </GlassCard>
    </div>
  );
}
