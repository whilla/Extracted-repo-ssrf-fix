'use client';

import { useAgent } from '@/lib/context/AgentContext';
import { cn } from '@/lib/utils';
import { useRef, useEffect, useLayoutEffect, useState, useCallback, useMemo, type FormEvent, type ChangeEvent } from 'react';
import { MarkdownRenderer } from './MarkdownRenderer';
import { 
  X, Send, Paperclip, Trash2, Brain, Zap, 
  Mic, MicOff, Volume2, VolumeX, Download, Copy, 
  Settings2, Bot, ChevronDown, Check, Play, Square, ExternalLink
} from 'lucide-react';
import type { AttachedFile, ChatMessage } from '@/lib/types';
import { downloadContent } from '@/lib/services/voiceConversation';
import { voiceConversation } from '@/lib/services/voiceConversation';
import { PATHS } from '@/lib/services/puterService';
import {
  isPuterFallbackDisabled,
  PROVIDER_STATE_EVENT_NAME,
  resolveProviderForModel,
  type ProviderStateDetail,
} from '@/lib/services/providerControl';

function openAttachmentFile(attachment: AttachedFile): void {
  if (typeof window === 'undefined' || !attachment.data) return;

  const byteCharacters = window.atob(attachment.data);
  const bytes = new Uint8Array(byteCharacters.length);
  for (let index = 0; index < byteCharacters.length; index += 1) {
    bytes[index] = byteCharacters.charCodeAt(index);
  }

  const blob = new Blob([bytes], { type: attachment.mimeType || 'application/octet-stream' });
  const objectUrl = window.URL.createObjectURL(blob);
  const opened = window.open(objectUrl, '_blank', 'noopener,noreferrer');

  if (!opened) {
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = attachment.name;
    link.rel = 'noopener noreferrer';
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  window.setTimeout(() => {
    window.URL.revokeObjectURL(objectUrl);
  }, 60_000);
}

// Message component with download option, edit, delete
function AgentMessage({ 
  message, 
  onDownload, 
  onCopy,
  onSpeak,
  onEdit,
  onDelete,
  onRetry,
  isSpeaking,
  isConsecutive,
}: { 
  message: ChatMessage;
  onDownload: (content: string) => void;
  onCopy: (content: string) => void;
  onSpeak: (content: string) => void;
  onEdit?: (id: string, content: string) => void;
  onDelete?: (id: string) => void;
  onRetry?: (id: string) => void;
  isSpeaking: boolean;
  isConsecutive?: boolean;
}) {
  const isUser = message.role === 'user';
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(message.content);

  const handleCopy = () => {
    onCopy(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleOpenAttachment = (attachment: AttachedFile) => {
    openAttachmentFile(attachment);
  };

  const handleSaveEdit = () => {
    if (editText.trim() && editText !== message.content) {
      onEdit?.(message.id, editText.trim());
    }
    setEditing(false);
  };

  const handleCancelEdit = () => {
    setEditText(message.content);
    setEditing(false);
  };

  return (
    <div
      className={cn(
        'flex w-full group',
        isUser ? 'justify-end' : 'justify-start'
      )}
    >
      <div className="flex flex-col gap-1 max-w-[85%]">
        <div
          className={cn(
            'rounded-2xl px-4 py-2.5',
            isUser
              ? 'bg-gradient-to-r from-[var(--nexus-cyan)] to-[var(--nexus-violet)] text-background'
              : 'glass-card text-foreground'
          )}
        >
          {editing ? (
            <div className="flex flex-col gap-2">
              <textarea
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                className="w-full resize-none rounded-lg bg-background/20 border border-background/30 px-3 py-2 text-sm text-background focus:outline-none focus:ring-2 focus:ring-[var(--nexus-cyan)]"
                rows={3}
                autoFocus
              />
              <div className="flex gap-2 justify-end">
                <button
                  onClick={handleCancelEdit}
                  className="px-3 py-1 rounded-lg text-xs bg-background/10 text-background/80 hover:bg-background/20"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveEdit}
                  className="px-3 py-1 rounded-lg text-xs bg-[var(--nexus-cyan)] text-background"
                >
                  Save
                </button>
              </div>
            </div>
          ) : (
            <>
              {isUser ? (
                <p className="text-sm whitespace-pre-wrap break-words">{message.content}</p>
              ) : (
                <MarkdownRenderer content={message.content} />
              )}
              {message.attachments && message.attachments.length > 0 && (
                <div className="mt-3 space-y-2">
                  {message.attachments.map((attachment, index) => (
                    <button
                      key={`${attachment.name}-${index}`}
                      onClick={() => handleOpenAttachment(attachment)}
                      disabled={!attachment.data}
                      className={cn(
                        'w-full text-left rounded-lg border px-3 py-2 text-xs',
                        isUser
                          ? 'border-background/30 bg-background/10 text-background hover:bg-background/20'
                          : 'border-border/60 bg-background/30 text-foreground hover:bg-background/50',
                        !attachment.data && 'cursor-default opacity-70'
                      )}
                      title={`Open ${attachment.name}`}
                    >
                      <span className="block truncate font-medium">{attachment.name}</span>
                      <span className={cn('block text-[10px] mt-0.5', isUser ? 'text-background/70' : 'text-muted-foreground')}>
                        {(attachment.size / 1024).toFixed(1)} KB • {attachment.data ? 'Tap to open' : 'saved summary only'}
                      </span>
                    </button>
                  ))}
                </div>
              )}
              {message.media && message.media.length > 0 && (
                <div className="mt-3 space-y-3">
                  {message.media.map((asset, index) => (
                    <div key={`${asset.url}-${index}`} className="overflow-hidden rounded-xl border border-border/60 bg-background/30">
                      {asset.type === 'image' ? (
                        <img
                          src={asset.url}
                          alt={asset.prompt || 'Generated image'}
                          className="w-full h-auto"
                        />
                      ) : asset.type === 'video' ? (
                        <video
                          src={asset.url}
                          controls
                          playsInline
                          className="w-full h-auto"
                          poster={asset.thumbnailUrl}
                        />
                      ) : (
                        <audio src={asset.url} controls className="w-full" />
                      )}
                    </div>
                  ))}
                </div>
              )}
              {!isConsecutive && (
                <p className={cn(
                  'text-[10px] mt-1',
                  isUser ? 'text-background/70' : 'text-muted-foreground'
                )}>
                  {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  {message.edited && <span className="ml-1 opacity-60">(edited)</span>}
                </p>
              )}
            </>
          )}
        </div>
        
        {/* Action buttons */}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity ml-2">
          {isUser && onEdit && (
            <button
              onClick={() => { setEditText(message.content); setEditing(true); }}
              className="p-1.5 rounded-lg hover:bg-muted/50 text-muted-foreground"
              title="Edit"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
              </svg>
            </button>
          )}
          {message.originalRequest && onRetry && (
            <button
              onClick={() => onRetry(message.id)}
              className="p-1.5 rounded-lg hover:bg-muted/50 text-amber-400"
              title="Retry"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="23 4 23 10 17 10" />
                <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
              </svg>
            </button>
          )}
          {onDelete && (
            <button
              onClick={() => onDelete(message.id)}
              className="p-1.5 rounded-lg hover:bg-muted/50 text-muted-foreground"
              title="Delete"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            onClick={handleCopy}
            className="p-1.5 rounded-lg hover:bg-muted/50 text-muted-foreground"
            title="Copy"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
          {!isUser && (
            <>
              <button
                onClick={() => onDownload(message.content)}
                className="p-1.5 rounded-lg hover:bg-muted/50 text-muted-foreground"
                title="Download"
              >
                <Download className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => onSpeak(message.content)}
                className="p-1.5 rounded-lg hover:bg-muted/50 text-muted-foreground"
                title={isSpeaking ? "Stop speaking" : "Read aloud"}
              >
                {isSpeaking ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ThinkingIndicator({ task }: { task: string | null }) {
  return (
    <div className="flex justify-start">
      <div className="glass-card px-4 py-3 rounded-2xl">
        <div className="flex items-center gap-2">
          <div className="flex gap-1">
            <span className="w-2 h-2 rounded-full bg-[var(--nexus-cyan)] animate-bounce" style={{ animationDelay: '0ms' }} />
            <span className="w-2 h-2 rounded-full bg-[var(--nexus-cyan)] animate-bounce" style={{ animationDelay: '150ms' }} />
            <span className="w-2 h-2 rounded-full bg-[var(--nexus-cyan)] animate-bounce" style={{ animationDelay: '300ms' }} />
          </div>
          {task && <span className="text-xs text-muted-foreground">{task}</span>}
        </div>
      </div>
    </div>
  );
}

function FilePreview({ file, onRemove }: { file: AttachedFile; onRemove: () => void }) {
  const isImage = file.mimeType.startsWith('image/');

  return (
    <div className="relative group">
      <div className="glass-card p-2 rounded-lg flex items-center gap-2 pr-8">
        {isImage ? (
          <img
            src={`data:${file.mimeType};base64,${file.data}`}
            alt={file.name}
            className="w-10 h-10 rounded object-cover"
          />
        ) : (
          <div className="w-10 h-10 rounded bg-muted flex items-center justify-center text-xs">
            {file.name.split('.').pop()?.toUpperCase()}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-xs truncate">{file.name}</p>
          <p className="text-[10px] text-muted-foreground">
            {(file.size / 1024).toFixed(1)} KB
          </p>
        </div>
        <button
          type="button"
          onClick={() => openAttachmentFile(file)}
          className="p-1.5 rounded-lg hover:bg-muted/50 text-muted-foreground"
          aria-label={`Open ${file.name}`}
          title={`Open ${file.name}`}
        >
          <ExternalLink className="w-3.5 h-3.5" />
        </button>
      </div>
      <button
        onClick={onRemove}
        className="absolute top-1 right-1 p-1 rounded-full bg-destructive/80 text-destructive-foreground opacity-0 group-hover:opacity-100 transition-opacity"
        aria-label="Remove file"
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  );
}

// Model selector dropdown
function ModelSelector({ 
  currentModel, 
  models, 
  onSelect 
}: { 
  currentModel: string; 
  models: { model: string; name: string }[];
  onSelect: (model: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const current = models.find(m => m.model === currentModel);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-muted/50 hover:bg-muted text-xs transition-colors"
      >
        <Bot className="w-3.5 h-3.5" />
        <span className="max-w-[80px] truncate">{current?.name || currentModel}</span>
        <ChevronDown className={cn("w-3 h-3 transition-transform", open && "rotate-180")} />
      </button>
      
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute top-full left-0 mt-1 z-20 w-48 py-1 rounded-lg bg-card border border-border shadow-xl">
            {models.map(m => (
              <button
                key={m.model}
                onClick={() => {
                  onSelect(m.model);
                  setOpen(false);
                }}
                className={cn(
                  "w-full px-3 py-2 text-left text-xs hover:bg-muted/50 flex items-center justify-between",
                  m.model === currentModel && "bg-muted/30"
                )}
              >
                <span>{m.name}</span>
                {m.model === currentModel && <Check className="w-3 h-3 text-[var(--nexus-cyan)]" />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export function NexusAgentPanel() {
  const {
    isOpen,
    closeAgent,
    messages,
    isThinking,
    currentTask,
    sendMessage,
    pendingFiles,
    attachFile,
    removeFile,
    clearMessages,
    godModeEnabled,
    toggleGodMode,
    // New features
    currentModel,
    availableModels,
    setModel,
    currentImageProvider,
    availableImageProviders,
    setImageProvider,
    currentVideoProvider,
    availableVideoProviders,
    setVideoProvider,
    automationEnabled,
    toggleAutomation,
    isVoiceMode,
    toggleVoiceMode,
    isListening,
    startListening,
    stopListening,
    isSpeaking,
    speakResponse,
    stopSpeaking,
    reasoningEffort,
    setReasoningEffort,
    editMessage,
    deleteMessage,
    retryMessage,
    savedConversations,
    newConversation,
    restoreConversation,
  } = useAgent();

  const [input, setInput] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [disablePuterFallback, setDisablePuterFallback] = useState(false);
  const [isNearBottom, setIsNearBottom] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [providerOnline, setProviderOnline] = useState(true);
  const filteredMessages = useMemo(
    () => messages.filter(m => !searchQuery || m.content.toLowerCase().includes(searchQuery.toLowerCase())),
    [messages, searchQuery]
  );
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const scrollMessagesToBottom = useCallback((behavior: ScrollBehavior = 'auto') => {
    const container = messagesContainerRef.current;
    if (container) {
      container.scrollTo({ top: container.scrollHeight, behavior });
    } else {
      messagesEndRef.current?.scrollIntoView({ behavior, block: 'end' });
    }
    setIsNearBottom(true);
  }, []);

  // Track scroll position to show/hide scroll-to-bottom button
  const handleScroll = useCallback(() => {
    const container = messagesContainerRef.current;
    if (!container) return;
    const threshold = 100;
    setIsNearBottom(container.scrollHeight - container.scrollTop - container.clientHeight < threshold);
  }, []);

  // Check provider health periodically
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const check = () => setProviderOnline(navigator.onLine);
    check();
    window.addEventListener('online', check);
    window.addEventListener('offline', check);
    return () => {
      window.removeEventListener('online', check);
      window.removeEventListener('offline', check);
    };
  }, []);

  // Voice recognition setup
  useEffect(() => {
    if (isVoiceMode) {
      voiceConversation.setCallbacks(
        (transcript) => {
          // Auto-send when voice input is detected
          if (transcript.trim()) {
            sendMessage(transcript);
          }
        },
        (state) => {
          if (state.isListening !== undefined) {
            if (state.isListening) startListening();
            else stopListening();
          }
        }
      );
    }
  }, [isVoiceMode, sendMessage, startListening, stopListening]);

  // Keep the latest message in view whenever the panel opens or message count changes
  useLayoutEffect(() => {
    if (!isOpen) return;
    scrollMessagesToBottom('auto');
  }, [isOpen, messages.length, isThinking, scrollMessagesToBottom]);

  // Attach scroll listener to container
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;
    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  // Media assets can expand after initial render; keep the viewport pinned to latest content.
  useEffect(() => {
    if (!isOpen) return;

    const container = messagesContainerRef.current;
    if (!container) return;

    const handleMediaLoad = (event: Event) => {
      const target = event.target;
      if (target instanceof HTMLImageElement || target instanceof HTMLVideoElement) {
        scrollMessagesToBottom('auto');
      }
    };

    container.addEventListener('load', handleMediaLoad, true);
    return () => {
      container.removeEventListener('load', handleMediaLoad, true);
    };
  }, [isOpen, messages.length, scrollMessagesToBottom]);

  // Focus input when panel opens and force a couple of delayed bottom snaps during panel transition.
  useEffect(() => {
    if (!isOpen) return;

    const timers: number[] = [];
    if (!isVoiceMode) {
      timers.push(window.setTimeout(() => inputRef.current?.focus(), 300));
    }
    timers.push(window.setTimeout(() => scrollMessagesToBottom('auto'), 0));
    timers.push(window.setTimeout(() => scrollMessagesToBottom('auto'), 160));
    timers.push(window.setTimeout(() => scrollMessagesToBottom('auto'), 360));

    return () => {
      timers.forEach((timerId) => window.clearTimeout(timerId));
    };
  }, [isOpen, isVoiceMode, scrollMessagesToBottom]);

  // Auto-speak responses in voice mode
  useEffect(() => {
    if (isVoiceMode && messages.length > 0) {
      const lastMessage = messages[messages.length - 1];
      if (lastMessage.role === 'assistant') {
        speakResponse(lastMessage.content);
      }
    }
  }, [messages, isVoiceMode, speakResponse]);

  useEffect(() => {
    let mounted = true;

    const loadFallbackPreference = async () => {
      const disabled = await isPuterFallbackDisabled();
      if (mounted) {
        setDisablePuterFallback(disabled);
      }
    };

    void loadFallbackPreference();

    const handleProviderState = (event: Event) => {
      const customEvent = event as CustomEvent<ProviderStateDetail>;
      if (mounted) {
        setDisablePuterFallback(!!customEvent.detail?.disablePuterFallback);
      }
    };

    window.addEventListener(PROVIDER_STATE_EVENT_NAME, handleProviderState as EventListener);

    return () => {
      mounted = false;
      window.removeEventListener(PROVIDER_STATE_EVENT_NAME, handleProviderState as EventListener);
    };
  }, [currentModel]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!input.trim() && pendingFiles.length === 0) return;

    const messageText = input.trim();
    setInput('');
    await sendMessage(messageText);
  };

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    const ALLOWED_TYPES = new Set([
      'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
      'application/pdf',
      'text/plain', 'text/csv', 'text/markdown',
      'application/json',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ]);

    for (const file of Array.from(files)) {
      if (!ALLOWED_TYPES.has(file.type) && !file.type.startsWith('image/')) {
        alert(`File ${file.name} has unsupported type (${file.type || 'unknown'}).`);
        continue;
      }
      if (file.size > 10 * 1024 * 1024) {
        alert(`File ${file.name} is too large. Maximum size is 10MB.`);
        continue;
      }

      const reader = new FileReader();
      reader.onload = () => {
        const base64 = (reader.result as string).split(',')[1];
        attachFile({
          name: file.name,
          mimeType: file.type,
          data: base64,
          size: file.size,
        });
      };
      reader.readAsDataURL(file);
    }
    e.target.value = '';
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.key === 'Enter' && !e.shiftKey) || ((e.metaKey || e.ctrlKey) && e.key === 'Enter')) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const handleDownload = (content: string) => {
    const timestamp = new Date().toISOString().split('T')[0];
    downloadContent(content, `nexus-response-${timestamp}`, 'text');
  };

  const handleCopy = async (content: string) => {
    await navigator.clipboard.writeText(content);
  };

  const handleSpeak = (content: string) => {
    if (isSpeaking) {
      stopSpeaking();
    } else {
      speakResponse(content);
    }
  };

  const handleVoiceToggle = async () => {
    if (isListening) {
      voiceConversation.stopListening();
      stopListening();
    } else {
      const started = await voiceConversation.startListening(true);
      if (started) startListening();
    }
  };

  if (!isOpen) return null;

  const activeChatProvider = resolveProviderForModel(currentModel, availableModels);

  return (
    <div className="fixed inset-0 z-[9998] flex items-end justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-background/60 backdrop-blur-sm"
        onClick={closeAgent}
      />

      {/* Panel */}
      <div
        className={cn(
          'relative w-full max-w-lg h-[80vh] max-h-[700px]',
          'bg-card/95 backdrop-blur-xl',
          'rounded-t-3xl border border-border border-b-0',
          'flex flex-col',
          'slide-up',
          'safe-area-bottom'
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-3">
            <div className={cn(
              "relative w-10 h-10 rounded-full flex items-center justify-center transition-all",
              godModeEnabled 
                ? "bg-gradient-to-br from-yellow-400 via-orange-500 to-red-500 animate-pulse shadow-[0_0_20px_rgba(255,165,0,0.5)]"
                : "bg-gradient-to-br from-[var(--nexus-cyan)] to-[var(--nexus-violet)]"
            )}>
              <span className="absolute inset-0 rounded-full border border-[var(--nexus-cyan)]/40 animate-ping" />
              {godModeEnabled ? (
                <Brain className="w-5 h-5 text-background" />
              ) : (
                <span className="text-background font-bold text-lg">N</span>
              )}
            </div>
            <div>
              <h2 className="font-semibold flex items-center gap-2">
                Nexus Agent
                {godModeEnabled && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-gradient-to-r from-yellow-400 to-orange-500 text-background font-bold">
                    GOD MODE
                  </span>
                )}
              </h2>
              <p className="text-xs text-muted-foreground">
                {isThinking ? currentTask || 'Thinking...' : isListening ? 'Listening...' : 'Ready'}
              </p>
              <p className="text-[11px] text-muted-foreground/80 flex items-center gap-1">
                <span className={cn(
                  'inline-block w-1.5 h-1.5 rounded-full',
                  providerOnline ? 'bg-green-400' : 'bg-red-400'
                )} />
                Chat: {activeChatProvider}{' '}
                {activeChatProvider !== 'puter' && disablePuterFallback ? '| Puter fallback off' : '| Puter fallback available'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {/* Settings Toggle */}
            <button
              onClick={() => setShowSettings(!showSettings)}
              className={cn(
                "p-2 rounded-lg transition-all",
                showSettings ? "bg-muted text-foreground" : "hover:bg-muted/50 text-muted-foreground"
              )}
              aria-label="Settings"
            >
              <Settings2 className="w-5 h-5" />
            </button>
            {/* God Mode Toggle */}
            <button
              onClick={toggleGodMode}
              className={cn(
                "p-2 rounded-lg transition-all",
                godModeEnabled 
                  ? "bg-gradient-to-r from-yellow-400/20 to-orange-500/20 text-orange-400"
                  : "hover:bg-muted/50 text-muted-foreground"
              )}
              aria-label="Toggle God Mode"
              title="God Mode: Multi-perspective AI analysis"
            >
              <Zap className={cn("w-5 h-5", godModeEnabled && "animate-pulse")} />
            </button>
            <button
              onClick={clearMessages}
              className="p-2 rounded-lg hover:bg-muted/50 transition-colors"
              aria-label="Clear chat"
            >
              <Trash2 className="w-5 h-5 text-muted-foreground" />
            </button>
            <button
              onClick={closeAgent}
              className="p-2 rounded-lg hover:bg-muted/50 transition-colors"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Settings Bar */}
        {showSettings && (
          <div className="px-4 py-2 border-b border-border bg-muted/30 flex items-center gap-3 flex-wrap">
            {/* Model Selector */}
            <ModelSelector
              currentModel={currentModel}
              models={availableModels}
              onSelect={setModel}
            />

            <ModelSelector
              currentModel={currentImageProvider}
              models={availableImageProviders as unknown as { model: string; name: string }[]}
              onSelect={(provider) => setImageProvider(provider as 'puter' | 'stability' | 'leonardo' | 'ideogram')}
            />

            <ModelSelector
              currentModel={currentVideoProvider}
              models={availableVideoProviders as unknown as { model: string; name: string }[]}
              onSelect={(provider) => setVideoProvider(provider as 'ltx23' | 'ltx23-open')}
            />
            
            {/* Reasoning Effort */}
            {['low', 'medium', 'high'].map((effort) => (
              <button
                key={effort}
                onClick={() => setReasoningEffort(effort as 'low' | 'medium' | 'high')}
                className={cn(
                  "flex items-center gap-1 px-2 py-1 rounded-lg text-xs transition-colors",
                  reasoningEffort === effort
                    ? "bg-[var(--nexus-cyan)]/20 text-[var(--nexus-cyan)]"
                    : "bg-muted/50 hover:bg-muted text-muted-foreground"
                )}
              >
                <Brain className="w-3 h-3" />
                <span>{effort}</span>
              </button>
            ))}

            {/* Automation Toggle */}
            <button
              onClick={toggleAutomation}
              className={cn(
                "flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs transition-colors",
                automationEnabled 
                  ? "bg-green-500/20 text-green-400" 
                  : "bg-muted/50 hover:bg-muted text-muted-foreground"
              )}
            >
              {automationEnabled ? <Play className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
              <span>Auto</span>
            </button>
            
            {/* Voice Mode Toggle */}
            <button
              onClick={toggleVoiceMode}
              className={cn(
                "flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs transition-colors",
                isVoiceMode 
                  ? "bg-[var(--nexus-cyan)]/20 text-[var(--nexus-cyan)]" 
                  : "bg-muted/50 hover:bg-muted text-muted-foreground"
              )}
            >
              <Volume2 className="w-3.5 h-3.5" />
              <span>Voice</span>
            </button>

            <span className="text-[10px] text-muted-foreground">
              Skills: {PATHS.skills}
            </span>
          </div>
        )}

        {/* Messages */}
        <div ref={messagesContainerRef} className="flex-1 overflow-y-auto custom-scrollbar px-4 py-4 space-y-4">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center px-4">
              <div className={cn(
                "w-16 h-16 rounded-full flex items-center justify-center mb-4 transition-all",
                godModeEnabled 
                  ? "bg-gradient-to-br from-yellow-400 via-orange-500 to-red-500 animate-pulse shadow-[0_0_30px_rgba(255,165,0,0.4)]"
                  : "bg-gradient-to-br from-[var(--nexus-cyan)] to-[var(--nexus-violet)]"
              )}>
                {godModeEnabled ? (
                  <Brain className="w-8 h-8 text-background" />
                ) : (
                  <span className="text-background font-bold text-2xl">N</span>
                )}
              </div>
              <h3 className="font-semibold text-lg mb-2">
                {godModeEnabled ? 'God Mode Activated' : 'Welcome to Nexus Agent'}
              </h3>
              <p className="text-sm text-muted-foreground mb-4">
                {godModeEnabled 
                  ? 'Multi-model synthesis with expert perspectives. Ask for content ideas to unlock full power.'
                  : 'Create content, generate images, make cinematic videos, or drop in a PDF and I will extract usable ideas.'
                }
              </p>
              {!godModeEnabled && (
                <div className="flex flex-wrap gap-2 justify-center mb-4">
                  {[
                    { label: 'Generate a post', prompt: 'Generate a social media post about' },
                    { label: 'Analyze PDF', prompt: 'Analyze this PDF and extract content ideas' },
                    { label: 'Create image', prompt: 'Create an image of' },
                    { label: 'Make video', prompt: 'Make a cinematic video about' },
                    { label: 'Plan content', prompt: 'Plan a week of content for' },
                    { label: 'Set niche', prompt: 'My niche is' },
                  ].map((action) => (
                    <button
                      key={action.label}
                      onClick={() => {
                        setInput(action.prompt + ' ');
                        inputRef.current?.focus();
                      }}
                      className="px-3 py-1.5 rounded-full text-xs bg-muted/50 hover:bg-muted border border-border/60 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {action.label}
                    </button>
                  ))}
                </div>
              )}
              <p className="text-xs text-muted-foreground/80 mb-4">
                Skills and learned playbooks are stored in {PATHS.skills}.
              </p>
              {savedConversations.length > 0 && (
                <div className="w-full max-w-xs mb-4">
                  <p className="text-[11px] text-muted-foreground/60 mb-2 text-center">Previous conversations</p>
                  <div className="space-y-1">
                    {savedConversations.map(c => (
                      <button
                        key={c.id}
                        onClick={() => restoreConversation(c.id)}
                        className="w-full text-left px-3 py-2 rounded-lg text-xs bg-muted/30 hover:bg-muted/60 border border-border/40 text-muted-foreground hover:text-foreground transition-colors truncate"
                        title={`${c.count} messages — ${new Date(c.timestamp).toLocaleDateString()}`}
                      >
                        <span className="block truncate">{c.title}</span>
                        <span className="block text-[10px] text-muted-foreground/50">{c.count} msgs · {new Date(c.timestamp).toLocaleDateString()}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <button
                onClick={newConversation}
                className="px-4 py-2 rounded-lg text-xs bg-muted/50 hover:bg-muted border border-border/60 text-muted-foreground hover:text-foreground transition-colors mb-4"
              >
                + New conversation
              </button>
              {godModeEnabled && (
                <div className="flex flex-wrap gap-2 justify-center text-xs">
                  <span className="px-2 py-1 rounded-full bg-yellow-500/20 text-yellow-400">Viral Architect</span>
                  <span className="px-2 py-1 rounded-full bg-orange-500/20 text-orange-400">Story Weaver</span>
                  <span className="px-2 py-1 rounded-full bg-red-500/20 text-red-400">Visual Prophet</span>
                  <span className="px-2 py-1 rounded-full bg-pink-500/20 text-pink-400">Growth Hacker</span>
                  <span className="px-2 py-1 rounded-full bg-purple-500/20 text-purple-400">Zeitgeist Reader</span>
                </div>
              )}
            </div>
          ) : (
            <>
              {messages.length > 3 && (
                <div className="px-4 pb-2 sticky top-0 z-10">
                  <div className="relative">
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      placeholder="Search messages..."
                      className="w-full rounded-lg bg-muted/50 border border-border/60 px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-[var(--nexus-cyan)]"
                    />
                    {searchQuery && (
                      <button
                        onClick={() => setSearchQuery('')}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>
              )}
              {filteredMessages.map((message, idx) => {
                const prevRole = idx > 0 ? filteredMessages[idx - 1].role : null;
                return (
                  <AgentMessage 
                    key={message.id} 
                    message={message}
                    isConsecutive={message.role === prevRole}
                    onDownload={handleDownload}
                    onCopy={handleCopy}
                    onSpeak={handleSpeak}
                    onEdit={editMessage}
                    onDelete={deleteMessage}
                    onRetry={retryMessage}
                    isSpeaking={isSpeaking}
                  />
                );
              })}
              {searchQuery && filteredMessages.length === 0 && (
                <div className="px-4 py-8 text-center text-xs text-muted-foreground/60">
                  No messages match &quot;{searchQuery}&quot;
                </div>
              )}
              {isThinking && <ThinkingIndicator task={currentTask} />}
            </>
          )}
          <div ref={messagesEndRef} />
        </div>

        {!isNearBottom && messages.length > 5 && (
          <button
            onClick={() => scrollMessagesToBottom('smooth')}
            className="absolute bottom-36 left-1/2 -translate-x-1/2 z-20 p-2 rounded-full bg-muted/80 border border-border/60 text-muted-foreground hover:text-foreground hover:bg-muted shadow-lg transition-all"
            title="Scroll to bottom"
          >
            <ChevronDown className="w-4 h-4" />
          </button>
        )}

        {/* Attached files preview */}
        {pendingFiles.length > 0 && (
          <div className="px-4 pb-2">
            <div className="flex gap-2 overflow-x-auto pb-2">
              {pendingFiles.map((file) => (
                <FilePreview
                  key={file.name}
                  file={file}
                  onRemove={() => removeFile(file.name)}
                />
              ))}
            </div>
          </div>
        )}

        {/* Voice Mode UI */}
        {isVoiceMode && (
          <div className="px-4 py-4 border-t border-border flex flex-col items-center gap-4">
            <button
              onClick={handleVoiceToggle}
              className={cn(
                "w-20 h-20 rounded-full flex items-center justify-center transition-all",
                isListening 
                  ? "bg-red-500 animate-pulse shadow-[0_0_30px_rgba(239,68,68,0.5)]"
                  : "bg-gradient-to-r from-[var(--nexus-cyan)] to-[var(--nexus-violet)] hover:shadow-[0_0_30px_rgba(0,245,255,0.4)]"
              )}
            >
              {isListening ? (
                <MicOff className="w-8 h-8 text-white" />
              ) : (
                <Mic className="w-8 h-8 text-background" />
              )}
            </button>
            <p className="text-sm text-muted-foreground">
              {isListening ? 'Tap to stop' : 'Tap to speak'}
            </p>
          </div>
        )}

        {/* Text Input */}
        {!isVoiceMode && (
          <form onSubmit={handleSubmit} className="p-4 border-t border-border">
            <div className="flex items-end gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex-shrink-0 p-2.5 rounded-xl hover:bg-muted/50 transition-colors"
                aria-label="Attach file"
              >
                <Paperclip className="w-5 h-5 text-muted-foreground" />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*,application/pdf,text/*,.csv,.json"
                onChange={handleFileChange}
                className="hidden"
              />
              
              {/* Voice input button */}
              <button
                type="button"
                onClick={handleVoiceToggle}
                className={cn(
                  "flex-shrink-0 p-2.5 rounded-xl transition-colors",
                  isListening 
                    ? "bg-red-500/20 text-red-400"
                    : "hover:bg-muted/50 text-muted-foreground"
                )}
                aria-label="Voice input"
              >
                {isListening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
              </button>
              
              <div className="flex-1 relative">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask me anything..."
                  rows={1}
                  className={cn(
                    'w-full resize-none rounded-xl',
                    'bg-input border border-border',
                    'px-4 py-2.5',
                    'text-sm placeholder:text-muted-foreground',
                    'focus:outline-none focus:ring-2 focus:ring-[var(--nexus-cyan)] focus:border-transparent',
                    'max-h-32'
                  )}
                  style={{
                    height: 'auto',
                    minHeight: '44px',
                  }}
                />
              </div>
              <button
                type="submit"
                disabled={isThinking || (!input.trim() && pendingFiles.length === 0)}
                className={cn(
                  'flex-shrink-0 p-2.5 rounded-xl',
                  'bg-gradient-to-r from-[var(--nexus-cyan)] to-[var(--nexus-violet)]',
                  'text-background',
                  'disabled:opacity-50 disabled:cursor-not-allowed',
                  'hover:shadow-[0_0_20px_rgba(0,245,255,0.4)]',
                  'transition-all'
                )}
                aria-label="Send message"
              >
                <Send className="w-5 h-5" />
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
