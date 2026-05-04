'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Activity, TrendingUp, TrendingDown, RotateCcw, Cpu } from 'lucide-react';
import { toast } from 'sonner';

interface EvolutionEvent {
  id: string;
  timestamp: string;
  type: string;
  description: string;
  impact: 'positive' | 'neutral' | 'negative' | 'unknown';
  details: {
    reasoning: string;
    before?: any;
    after?: any;
  };
  scoreDelta?: number;
}

interface EvolutionStats {
  totalChanges: number;
  positiveChanges: number;
  rollbacks: number;
  latestChange: EvolutionEvent | null;
}

export default function EvolutionDashboardPage() {
  const [events, setEvents] = useState<EvolutionEvent[]>([]);
  const [stats, setStats] = useState<EvolutionStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setLoading(true);
    try {
      const [logRes, statsRes] = await Promise.all([
        fetch('/api/evolution'),
        fetch('/api/evolution?view=stats')
      ]);
      
      const logData = await logRes.json();
      const statsData = await statsRes.json();
      
      setEvents(logData);
      setStats(statsData);
    } catch (err) {
      toast.error('Failed to load evolution data');
    } finally {
      setLoading(false);
    }
  }

  if (loading) return <div className="p-8 text-center">Loading Evolution Dashboard...</div>;

  return (
    <div className="p-8 space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Evolution Dashboard</h1>
        <p className="text-muted-foreground">Real-time audit trail of the Manager&apos;s autonomous optimizations.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium">Total Modifications</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.totalChanges || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium">Positive Gains</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{stats?.positiveChanges || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium">Auto-Rollbacks</CardTitle>
            <RotateCcw className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{stats?.rollbacks || 0}</div>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        <h2 className="text-xl font-semibold flex items-center gap-2">
          <Cpu className="h-5 w-5" /> Decision Log
        </h2>
        
        {events.length === 0 ? (
          <Card className="text-center p-12">
            <CardContent>
              <p className="text-muted-foreground">No evolution events recorded yet.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {events.map((event) => (
              <Card key={event.id} className="overflow-hidden">
                <div className="flex items-center justify-between p-4 bg-muted/20 border-b">
                  <div className="flex items-center gap-3">
                    <Badge variant={
                      event.impact === 'positive' ? 'default' : 
                      event.impact === 'negative' ? 'destructive' : 'outline'
                    }>
                      {event.type.replace('_', ' ')}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {new Date(event.timestamp).toLocaleString()}
                    </span>
                  </div>
                  {event.scoreDelta && (
                    <div className={`text-xs font-bold flex items-center gap-1 ${event.scoreDelta > 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {event.scoreDelta > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                      {event.scoreDelta > 0 ? `+${event.scoreDelta}` : event.scoreDelta} pts
                    </div>
                  )}
                </div>
                <CardContent className="p-4 space-y-3">
                  <p className="font-medium">{event.description}</p>
                  <div className="bg-muted rounded-md p-3 text-sm">
                    <p className="text-xs uppercase text-muted-foreground font-bold mb-1">Reasoning</p>
                    <p className="italic text-muted-foreground">"{event.details.reasoning}"</p>
                  </div>
                  {event.details.before || event.details.after ? (
                    <div className="grid grid-cols-2 gap-4 text-xs">
                      <div className="p-2 bg-red-50 dark:bg-red-900/20 rounded border border-red-100 dark:border-red-900/30">
                        <p className="font-bold text-red-600 mb-1">Previous</p>
                        <pre className="overflow-x-auto whitespace-pre-wrap opacity-70">
                          {JSON.stringify(event.details.before, null, 2)}
                        </pre>
                      </div>
                      <div className="p-2 bg-green-50 dark:bg-green-900/20 rounded border border-green-100 dark:border-green-900/30">
                        <p className="font-bold text-green-600 mb-1">New</p>
                        <pre className="overflow-x-auto whitespace-pre-wrap">
                          {JSON.stringify(event.details.after, null, 2)}
                        </pre>
                      </div>
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
