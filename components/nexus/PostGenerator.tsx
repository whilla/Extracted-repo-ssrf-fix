'use client';

import { useState } from 'react';
import { usePostGenerator, type PostContent } from '@/hooks/usePostGenerator';
import { Sparkles, MessageCircle, RefreshCw, Send, Copy, Check } from 'lucide-react';

interface PostGeneratorProps {
  defaultPlatform?: string;
  onPostSelect?: (post: PostContent) => void;
}

export function PostGenerator({ defaultPlatform = 'twitter', onPostSelect }: PostGeneratorProps) {
  const [idea, setIdea] = useState('');
  const [platform, setPlatform] = useState(defaultPlatform);
  const [tone, setTone] = useState<'professional' | 'casual' | 'humorous' | 'inspirational' | 'educational'>('casual');
  const [includeEmoji, setIncludeEmoji] = useState(true);
  const [includeDescription, setIncludeDescription] = useState(true);
  const [showChat, setShowChat] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const {
    generatePost,
    generateVariations,
    chat,
    loading,
    error,
    currentPost,
    variations,
    chatHistory,
    clearChat,
    clearPost,
  } = usePostGenerator({ platform });

  const handleGenerate = async () => {
    if (!idea.trim()) return;
    await generatePost({
      idea: idea.trim(),
      platform,
      tone,
      includeEmoji,
      includeDescription,
    });
  };

  const handleGenerateVariations = async () => {
    if (!currentPost) return;
    await generateVariations(currentPost.text, platform);
  };

  const handleChat = async () => {
    if (!chatInput.trim()) return;
    const response = await chat(chatInput.trim(), 'content_creation');
    setChatInput('');
  };

  const copyToClipboard = async (text: string, id: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const platforms = ['twitter', 'instagram', 'tiktok', 'linkedin', 'facebook', 'threads', 'youtube', 'pinterest'];
  const tones = ['professional', 'casual', 'humorous', 'inspirational', 'educational'] as const;

  return (
    <div className="space-y-6 p-4 max-w-2xl mx-auto">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-purple-500" />
          Post Generator
        </h2>
        <button
          onClick={() => setShowChat(!showChat)}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <MessageCircle className="w-4 h-4" />
          {showChat ? 'Hide Chat' : 'Chat with Agent'}
        </button>
      </div>

      {!showChat ? (
        <>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-1 block">What do you want to post about?</label>
              <textarea
                value={idea}
                onChange={(e) => setIdea(e.target.value)}
                placeholder="Enter your idea, topic, or concept..."
                className="w-full p-3 border rounded-lg resize-none h-24"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium mb-1 block">Platform</label>
                <select
                  value={platform}
                  onChange={(e) => setPlatform(e.target.value)}
                  className="w-full p-2 border rounded"
                >
                  {platforms.map(p => (
                    <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-sm font-medium mb-1 block">Tone</label>
                <select
                  value={tone}
                  onChange={(e) => setTone(e.target.value as typeof tone)}
                  className="w-full p-2 border rounded"
                >
                  {tones.map(t => (
                    <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex gap-4 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={includeEmoji}
                  onChange={(e) => setIncludeEmoji(e.target.checked)}
                />
                Include Emojis
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={includeDescription}
                  onChange={(e) => setIncludeDescription(e.target.checked)}
                />
                Include Description
              </label>
            </div>

            <button
              onClick={handleGenerate}
              disabled={loading || !idea.trim()}
              className="w-full py-3 bg-primary text-primary-foreground rounded-lg font-medium flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {loading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  Generate Post
                </>
              )}
            </button>

            {error && (
              <div className="p-3 bg-red-500/10 border border-red-500/30 rounded text-red-500 text-sm">
                {error}
              </div>
            )}
          </div>

          {currentPost && (
            <div className="space-y-4">
              <div className="p-4 border rounded-lg bg-muted/30">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-muted-foreground uppercase">{currentPost.platform}</span>
                  <span className="text-xs text-muted-foreground">{currentPost.characterCount} chars</span>
                </div>
                
                <p className="whitespace-pre-wrap">{currentPost.text}</p>

                {currentPost.emojis.length > 0 && (
                  <div className="mt-2 text-lg">{currentPost.emojis.join(' ')}</div>
                )}

                {currentPost.description && (
                  <div className="mt-3 p-2 bg-blue-500/10 rounded text-sm text-blue-600">
                    <strong>Description:</strong> {currentPost.description}
                  </div>
                )}

                {currentPost.hashtags.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {currentPost.hashtags.map((tag, i) => (
                      <span key={i} className="text-xs text-blue-500">#{tag}</span>
                    ))}
                  </div>
                )}

                <div className="mt-3 flex gap-2">
                  <button
                    onClick={() => copyToClipboard(currentPost.text, currentPost.id)}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                  >
                    {copiedId === currentPost.id ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    {copiedId === currentPost.id ? 'Copied!' : 'Copy'}
                  </button>
                  <button
                    onClick={handleGenerateVariations}
                    disabled={loading}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                  >
                    <RefreshCw className="w-3 h-3" />
                    Variations
                  </button>
                </div>
              </div>

              {variations.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-medium">Variations</h4>
                  {variations.map((v, i) => (
                    <div key={i} className="p-3 border rounded text-sm bg-muted/20">
                      <p className="whitespace-pre-wrap">{v}</p>
                      <button
                        onClick={() => copyToClipboard(v, `variation-${i}`)}
                        className="mt-2 flex items-center gap-1 text-xs text-muted-foreground"
                      >
                        {copiedId === `variation-${i}` ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {onPostSelect && (
                <button
                  onClick={() => onPostSelect(currentPost)}
                  className="w-full py-2 border rounded-lg text-sm hover:bg-muted"
                >
                  Use This Post
                </button>
              )}
            </div>
          )}
        </>
      ) : (
        <div className="space-y-4">
          <div className="border rounded-lg h-80 overflow-y-auto p-4 space-y-4">
            {chatHistory.length === 0 ? (
              <p className="text-center text-muted-foreground">
                Chat with the AI agent about content ideas...
              </p>
            ) : (
              chatHistory.map((msg, i) => (
                <div
                  key={i}
                  className={`p-3 rounded-lg ${
                    msg.role === 'user' 
                      ? 'bg-primary/10 ml-8' 
                      : 'bg-muted mr-8'
                  }`}
                >
                  {msg.content}
                </div>
              ))
            )}
          </div>

          <div className="flex gap-2">
            <input
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleChat()}
              placeholder="Ask about content ideas..."
              className="flex-1 p-3 border rounded-lg"
            />
            <button
              onClick={handleChat}
              disabled={loading || !chatInput.trim()}
              className="p-3 bg-primary text-primary-foreground rounded-lg disabled:opacity-50"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>

          <button
            onClick={clearChat}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            Clear chat history
          </button>
        </div>
      )}
    </div>
  );
}