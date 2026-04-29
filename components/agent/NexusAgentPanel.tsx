'use client';

import { useAgent } from '@/lib/context/AgentContext';
import { cn } from '@/lib/utils';
import { useRef, useEffect, useState, type FormEvent, type ChangeEvent } from 'react';
import { GlassCard } from '@/components/nexus/GlassCard';
import { 
  X, Send, Paperclip, Trash2, Brain, Zap, 
  Mic, MicOff, Volume2, VolumeX, Download, Copy, 
  Settings2, Bot, ChevronDown, Check, Play, Square
} from 'lucide-react';
import type { AttachedFile, ChatMessage } from '@/lib/types';
import { downloadContent } from '@/lib/services/voiceConversation';
import { voiceConversation } from '@/lib/services/voiceConversation';
import { PATHS } from '@/lib/services/puterService';
import { isPuterFallbackDisabled, resolveProviderForModel } from '@/lib/services/providerControl';

// Message component with download option
function AgentMessage({ 
  message, 
  onDownload, 
  onCopy,
  onSpeak,
  isSpeaking 
}: { 
  message: ChatMessage;
  onDownload: (content: string) => void;
  onCopy: (content: string) => void;
  onSpeak: (content: string) => void;
  isSpeaking: boolean;
}) {
  const isUser = message.role === 'user';
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    onCopy(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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
          <p className="text-sm whitespace-pre-wrap break-words">{message.content}</p>
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
          <p className={cn(
            'text-[10px] mt-1',
            isUser ? 'text-background/70' : 'text-muted-foreground'
          )}>
            {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>
        
        {/* Action buttons for assistant messages */}
        {!isUser && (
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity ml-2">
            <button
              onClick={handleCopy}
              className="p-1.5 rounded-lg hover:bg-muted/50 text-muted-foreground"
              title="Copy"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
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
          </div>
        )}
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
  } = useAgent();

  const [input, setInput] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [disablePuterFallback, setDisablePuterFallback] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isThinking]);

  // Focus input when panel opens
  useEffect(() => {
    if (isOpen && !isVoiceMode) {
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [isOpen, isVoiceMode]);

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

    return () => {
      mounted = false;
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

    for (const file of Array.from(files)) {
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
    if (e.key === 'Enter' && !e.shiftKey) {
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
              <p className="text-[11px] text-muted-foreground/80">
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
        <div className="flex-1 overflow-y-auto custom-scrollbar px-4 py-4 space-y-4">
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
              <p className="text-xs text-muted-foreground/80 mb-4">
                Skills and learned playbooks are stored in {PATHS.skills}.
              </p>
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
              {messages.map((message) => (
                <AgentMessage 
                  key={message.id} 
                  message={message}
                  onDownload={handleDownload}
                  onCopy={handleCopy}
                  onSpeak={handleSpeak}
                  isSpeaking={isSpeaking}
                />
              ))}
              {isThinking && <ThinkingIndicator task={currentTask} />}
            </>
          )}
          <div ref={messagesEndRef} />
        </div>

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
