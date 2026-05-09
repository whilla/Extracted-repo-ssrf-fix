// NexusAI Type Definitions
// Re-export types from validators for consistency
export { BrandKitSchema } from '@/lib/validators';
export type BrandKit = import('@/lib/validators').BrandKit;

export interface UserContentPreference {
  type: string;
  description: string;
  frequency: 'always' | 'often' | 'rarely';
  savedInstructions: string;
}

// Content
export interface ContentDraft {
  id: string;
  created: string;
  updated: string;
  versions: DraftVersion[];
  currentVersion: number;
  status: 'draft' | 'approved' | 'scheduled' | 'published' | 'failed';
  platforms: Platform[];
  contentType?: string;
  scheduledAt?: string;
  publishedAt?: string;
  publishResults?: { platform: string; success: boolean; postId?: string }[];
}

export interface DraftVersion {
  v: number;
  text: string;
  imageUrl?: string;
  imagePrompt?: string;
  voiceUrl?: string;
  score?: number;
  createdAt: string;
}

// Legacy alias
export type ContentVersion = DraftVersion;

// Platforms
export type Platform = 
  | 'twitter' 
  | 'instagram' 
  | 'tiktok' 
  | 'linkedin' 
  | 'facebook' 
  | 'threads' 
  | 'youtube' 
  | 'pinterest';

export interface PlatformConfig {
  id: Platform;
  name: string;
  icon: string;
  color?: string;
  maxLength: number;
  supportsImages: boolean;
  supportsVideo: boolean;
  aspectRatios: string[];
}

// AI Models
export type AIProvider =
  | 'puter'
  | 'gemini'
  | 'openrouter'
  | 'groq'
  | 'nvidia'
  | 'ollama'
  | 'together'
  | 'fireworks'
  | 'deepseek'
  | 'githubmodels'
  | 'bytez'
  | 'poe';

export interface AIModel {
  provider: AIProvider;
  model: string;
  name: string;
  contextWindow: number;
  supportsVision: boolean;
}

export interface AIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | AIMessageContent[];
}

export interface AIMessageContent {
  type: 'text' | 'image_url';
  text?: string;
  image_url?: { url: string };
}

// Agent
export interface AgentIntent {
  type: 
    | 'generate_content'
    | 'create_image'
    | 'make_video'
    | 'make_audio'
    | 'make_music'
    | 'regenerate_media'
    | 'schedule_post'
    | 'analyze_performance'
    | 'read_file'
    | 'answer_question'
    | 'edit_draft'
    | 'manage_brand';
  confidence: number;
  params: Record<string, unknown>;
}

export interface AgentState {
  isThinking: boolean;
  currentTask: string | null;
  messages: ChatMessage[];
  pendingFiles: AttachedFile[];
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  attachments?: AttachedFile[];
  actions?: AgentAction[];
  media?: ChatMediaAsset[];
  edited?: boolean;
  originalRequest?: string;
}

export interface ChatMediaAsset {
  type: 'image' | 'video' | 'audio';
  url: string;
  mimeType?: string;
  provider?: string;
  prompt?: string;
  thumbnailUrl?: string;
}

export interface AttachedFile {
  name: string;
  mimeType: string;
  data: string; // base64
  size: number;
  processed?: boolean;
  summary?: string;
}

export interface AgentAction {
  type: 'approve' | 'edit' | 'schedule' | 'regenerate' | 'publish';
  label: string;
  data?: Record<string, unknown>;
}

// Schedule
export interface ScheduledPost {
  id: string;
  draftId: string;
  platforms: Platform[];
  scheduledAt: string;
  status: 'pending' | 'publishing' | 'published' | 'failed';
  error?: string;
  provider?: 'ayrshare' | 'local';
  providerPostId?: string;
  localOnly?: boolean;
  publishedUrls?: Record<Platform, string>;
}

// Settings
export interface AppSettings {
  defaultModel: string;
  defaultPlatforms: Platform[];
  autoSaveDrafts: boolean;
  notificationsEnabled: boolean;
  theme: 'dark'; // dark mode only
}

export interface APIKeys {
  ayrshare?: string;
  elevenlabs?: string;
  gemini?: string;
  openrouter?: string;
}

// God Mode
export interface ThoughtProcess {
  perspective: string;
  thought: string;
  confidence: number;
  innovations: string[];
}

export interface GodModeResult {
  thoughts: ThoughtProcess[];
  synthesis: string;
  finalIdea: string;
  contentSuggestions: string[];
  visualConcepts: string[];
  audioConcepts: string[];
  estimatedViralScore: number;
}

// Music Mood
export interface MusicMood {
  primary: 'happy' | 'sad' | 'energetic' | 'calm' | 'dramatic' | 'mysterious' | 'inspiring' | 'nostalgic';
  secondary?: string;
  tempo: 'slow' | 'medium' | 'fast';
  energy: number;
  genre: string;
  instruments: string[];
  keywords: string[];
}

// Analytics
export interface PostAnalytics {
  postId: string;
  platform: Platform;
  impressions: number;
  engagement: number;
  likes: number;
  comments: number;
  shares: number;
  clicks: number;
  timestamp: string;
}

// A/B Testing
export interface ABMetrics {
  impressions: number;
  engagements: number;
  engagement?: number;
  clicks: number;
  shares: number;
  saves: number;
  comments: number;
  engagementRate: number;
  clickThroughRate: number;
}

export interface ABVariant {
  id: string;
  name: string;
  label?: string;
  content: string;
  imageUrl?: string;
  hashtags?: string[];
  metrics?: ABMetrics;
  isControl?: boolean;
}

export type ABTestVariant = ABVariant;

export interface ABTest {
  id: string;
  name: string;
  description?: string;
  status: 'draft' | 'active' | 'completed';
  platform: Platform;
  variants: ABVariant[];
  winner?: string;
  startDate?: string;
  endDate?: string;
  createdAt: string;
  insights?: string[];
}

// User State
export interface UserState {
  isAuthenticated: boolean;
  onboardingComplete: boolean;
  brandKit: BrandKit | null;
  settings: AppSettings;
}

// Puter Types (declarations for the global puter object)
declare global {
  interface Window {
    puter: {
      ui?: {
        authenticateWithPuter?: () => Promise<void>;
      };
      auth: {
        signIn: () => Promise<{ username: string }>;
        signOut: () => Promise<void>;
        getUser: () => Promise<{ username: string } | null>;
        isSignedIn: () => Promise<boolean>;
      };
      fs: {
        write: (path: string, content: string | Blob, options?: { createMissingParents?: boolean }) => Promise<void>;
        read: (path: string) => Promise<Blob>;
        getReadURL?: (path: string) => Promise<string>;
        mkdir: (path: string, options?: { createMissingParents?: boolean }) => Promise<void>;
        readdir: (path: string) => Promise<{ name: string; is_dir: boolean }[]>;
        delete: (path: string) => Promise<void>;
        exists: (path: string) => Promise<boolean>;
      };
      kv: {
        set: (key: string, value: string) => Promise<void>;
        get: (key: string) => Promise<string | null>;
        del: (key: string) => Promise<void>;
        list: () => Promise<string[]>;
      };
      ai: {
        chat: (
          messages: AIMessage[] | string,
          options?: { model?: string; stream?: boolean }
        ) => Promise<{ message: { content: string } } | AsyncIterable<{ text: string }>>;
        txt2img: (
          prompt: string,
          options?: { negativePrompt?: string; model?: string }
        ) => Promise<{ src: string }>;
      };
    };
  }
}

export {};
