'use client';

import { useState, useEffect, useRef } from 'react';
import { GlassCard } from '@/components/nexus/GlassCard';
import { NeonButton } from '@/components/nexus/NeonButton';
import { toast } from 'sonner';
import {
  Users,
  UserPlus,
  UserMinus,
  Edit3,
  Eye,
  Loader2,
  Link,
  Copy,
} from 'lucide-react';

export default function CollaborationPage() {
  const [documentId, setDocumentId] = useState('');
  const [connected, setConnected] = useState(false);
  const [peers, setPeers] = useState<number>(0);
  const [content, setContent] = useState('');
  const [mode, setMode] = useState<'edit' | 'view'>('edit');
  const [connecting, setConnecting] = useState(false);
  const editorRef = useRef<HTMLTextAreaElement>(null);

  function generateDocId() {
    const id = `doc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setDocumentId(id);
    return id;
  }

  async function createDocument() {
    const id = generateDocId();
    setConnected(true);
    setPeers(1);
    toast.success(`Document created: ${id}`);
  }

  async function joinDocument() {
    if (!documentId.trim()) {
      toast.error('Please enter a document ID');
      return;
    }
    setConnecting(true);
    try {
      const res = await fetch(`/api/realtime/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to join');
      setConnected(true);
      setPeers(data.peers || 1);
      setContent(data.content || '');
      toast.success('Joined document');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to join');
    } finally {
      setConnecting(false);
    }
  }

  function copyLink() {
    const url = `${window.location.origin}?doc=${documentId}`;
    navigator.clipboard.writeText(url);
    toast.success('Link copied to clipboard');
  }

  function leaveDocument() {
    setConnected(false);
    setDocumentId('');
    setPeers(0);
    setContent('');
    toast.info('Left document');
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Real-Time Collaboration</h1>
        <p className="text-gray-400 mt-1">Collaborate on content in real-time with your team</p>
      </div>

      {!connected ? (
        <div className="grid gap-6 md:grid-cols-2">
          <GlassCard>
            <h2 className="font-semibold text-white mb-4">Create New Document</h2>
            <p className="text-sm text-gray-400 mb-4">
              Start a new collaborative document and share the link with your team.
            </p>
            <NeonButton onClick={createDocument} className="w-full">
              <Edit3 className="h-4 w-4 mr-2" />
              Create Document
            </NeonButton>
          </GlassCard>

          <GlassCard>
            <h2 className="font-semibold text-white mb-4">Join Existing Document</h2>
            <div className="space-y-3">
              <input
                type="text"
                value={documentId}
                onChange={e => setDocumentId(e.target.value)}
                placeholder="Enter document ID"
                className="w-full bg-gray-800/50 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:border-blue-500 focus:outline-none"
              />
              <NeonButton
                onClick={joinDocument}
                disabled={connecting}
                className="w-full"
              >
                {connecting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Join'}
              </NeonButton>
            </div>
          </GlassCard>
        </div>
      ) : (
        <div className="space-y-4">
          <GlassCard>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-blue-400" />
                  <span className="text-sm text-gray-300">{peers} peer{peers !== 1 ? 's' : ''} connected</span>
                </div>
                <div className="flex items-center gap-2">
                  <Link className="h-4 w-4 text-gray-500" />
                  <code className="text-xs text-gray-400 bg-gray-800 px-2 py-1 rounded">{documentId}</code>
                  <NeonButton size="sm" variant="secondary" onClick={copyLink}>
                    <Copy className="h-3 w-3" />
                  </NeonButton>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <NeonButton
                  size="sm"
                  variant={mode === 'edit' ? 'primary' : 'secondary'}
                  onClick={() => setMode('edit')}
                >
                  <Edit3 className="h-4 w-4" />
                </NeonButton>
                <NeonButton
                  size="sm"
                  variant={mode === 'view' ? 'primary' : 'secondary'}
                  onClick={() => setMode('view')}
                >
                  <Eye className="h-4 w-4" />
                </NeonButton>
                <NeonButton size="sm" variant="secondary" onClick={leaveDocument}>
                  <UserMinus className="h-4 w-4" />
                </NeonButton>
              </div>
            </div>
          </GlassCard>

          <GlassCard>
            {mode === 'edit' ? (
              <textarea
                ref={editorRef}
                value={content}
                onChange={e => setContent(e.target.value)}
                placeholder="Start typing..."
                className="w-full bg-transparent text-white text-sm min-h-[400px] focus:outline-none resize-none"
              />
            ) : (
              <div className="prose prose-invert max-w-none min-h-[400px] whitespace-pre-wrap text-gray-300">
                {content || 'No content yet...'}
              </div>
            )}
          </GlassCard>
        </div>
      )}
    </div>
  );
}
