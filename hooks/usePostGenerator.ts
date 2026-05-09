'use client';

import { useState, useCallback } from 'react';

export interface PostContent {
  id: string;
  text: string;
  description: string;
  variations: string[];
  hashtags: string[];
  emojis: string[];
  platform: string;
  characterCount: number;
  createdAt: string;
}

export interface ChatResponse {
  message: string;
  type: 'text' | 'code' | 'list' | 'warning';
  suggestions?: string[];
}

interface UsePostGeneratorOptions {
  platform?: string;
}

export function usePostGenerator(options: UsePostGeneratorOptions = {}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentPost, setCurrentPost] = useState<PostContent | null>(null);
  const [variations, setVariations] = useState<string[]>([]);
  const [chatHistory, setChatHistory] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([]);

  const generatePost = useCallback(async (params: {
    idea: string;
    platform?: string;
    format?: 'post' | 'thread' | 'story' | 'carousel' | 'reel';
    tone?: 'professional' | 'casual' | 'humorous' | 'inspirational' | 'educational';
    includeEmoji?: boolean;
    includeDescription?: boolean;
    includeHashtags?: boolean;
    customInstructions?: string;
  }) => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/posts/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'generate',
          ...params,
          platform: params.platform || options.platform || 'twitter',
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Generation failed');
      }

      setCurrentPost(data.post);
      return data.post;
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Generation failed';
      setError(message);
      throw e;
    } finally {
      setLoading(false);
    }
  }, [options.platform]);

  const generateVariations = useCallback(async (originalPost: string, platform?: string) => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/posts/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'variations',
          originalPost,
          platform: platform || options.platform || 'twitter',
          count: 3,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Variations generation failed');
      }

      setVariations(data.variations || []);
      return data.variations;
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Variations failed';
      setError(message);
      throw e;
    } finally {
      setLoading(false);
    }
  }, [options.platform]);

  const chat = useCallback(async (
    message: string,
    purpose?: 'content_creation' | 'general' | 'strategy'
  ) => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/posts/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'chat',
          message,
          recentMessages: chatHistory.slice(-10),
          purpose,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Chat failed');
      }

      const { response: chatResponse } = data;
      
      setChatHistory(prev => [
        ...prev,
        { role: 'user', content: message },
        { role: 'assistant', content: chatResponse.message },
      ]);

      return chatResponse;
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Chat failed';
      setError(message);
      throw e;
    } finally {
      setLoading(false);
    }
  }, [chatHistory]);

  const clearChat = useCallback(() => {
    setChatHistory([]);
  }, []);

  const clearPost = useCallback(() => {
    setCurrentPost(null);
    setVariations([]);
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    generatePost,
    generateVariations,
    chat,
    clearChat,
    clearPost,
    clearError,
    loading,
    error,
    currentPost,
    variations,
    chatHistory,
  };
}