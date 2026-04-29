'use client';

import { createContext, useContext, useState, useCallback, useRef, useEffect, type ReactNode } from 'react';
import type { ChatMessage, AttachedFile, AgentIntent, AIMessage } from '@/lib/types';
import { universalChat, analyzeImage, getCurrentModel } from '@/lib/services/aiService';
import { saveChatMessage, loadChatHistory, loadBrandKit, generateId, clearChatHistory, addToSchedule } from '@/lib/services/memoryService';
import { 
  loadAgentMemory, 
  buildMemoryContext, 
  addContentIdea, 
  addUserFact, 
  addNicheDetail,
  setPrimaryNiche,
  setTargetAudienceMemory,
  addTargetPlatform,
  addMonetizationGoal,
  addAudienceInsight,
  addConversationSummary,
  syncWithBrandKit,
  extractMemoryFromResponse,
  extractStructuredMemory,
} from '@/lib/services/agentMemoryService';
import { buildSystemPrompt, INTENT_DETECTION_PROMPT, FILE_ANALYSIS_PROMPT } from '@/lib/constants/prompts';
import { runGodModeAnalysis, quickIdeate, callCustomProvider, type GodModeResult } from '@/lib/services/godModeEngine';
import { analyzeMusicMood, type MusicMood } from '@/lib/services/musicEngine';
import { AVAILABLE_MODELS } from '@/lib/services/aiService';
import { kvGet, kvSet } from '@/lib/services/puterService';
import { automationEngine } from '@/lib/core/AutomationEngine';
import type { NexusRequest } from '@/lib/core';
import { 
  orchestrate, 
  initializeOrchestrationSystem,
  getOrchestrationStatus,
  runBackgroundEvolution,
  type OrchestrationResult 
} from '@/lib/services/orchestrationEngine';
import { validateContent, makeGovernorDecision, getGovernorDashboard, evaluateMoodApproval } from '@/lib/services/governorService';
import { getAgentStats, loadAgents, type AgentConfig } from '@/lib/services/multiAgentService';
import { generateAgentImage, generateAgentVideo } from '@/lib/services/agentMediaService';
import { fileProcessor } from '@/lib/services/fileProcessor';
import type { VideoProvider } from '@/lib/services/videoGenerationService';
import type { ImageProvider } from '@/lib/services/imageGenerationService';
import { generateContent } from '@/lib/services/contentEngine';
import { runUniversalContentPipeline } from '@/lib/services/universalContentEngine';
import type { Platform } from '@/lib/types';
import type { ScheduledPost } from '@/lib/types';
import { loadProviderCapabilities, getRecommendedModel, type ProviderCapability } from '@/lib/services/providerCapabilityService';
import {
  trackGenerationFailure,
  trackGenerationStart,
  trackGenerationSuccess,
  updateGenerationMetadata,
} from '@/lib/services/generationTrackerService';
import { syncPostedEngagements } from '@/lib/services/engagementSyncService';
import { normalizeIncomingMessage, detectExplicitMediaIntent, buildFallbackChatMessages } from './agentBehavior.mjs';
import { ensureAgentSkillsInstalled, getEnabledAgentSkills, buildAgentSkillContext } from '@/lib/services/agentSkillService';
import { CHAT_MODEL_EVENT_NAME, setActiveChatModel, type ChatModelDetail } from '@/lib/services/providerControl';
import { draftsService } from '@/lib/services/draftsService';
import { enqueuePostJob } from '@/lib/services/postQueueService';
import { getNextBestTime } from '@/lib/services/bestTimeService';

const IMAGE_ENGINE_OPTIONS = [
  { model: 'puter', name: 'Puter Image' },
  { model: 'stability', name: 'Stability XL' },
  { model: 'leonardo', name: 'Leonardo' },
  { model: 'ideogram', name: 'Ideogram' },
] as const;

const VIDEO_ENGINE_OPTIONS = [
  { model: 'ltx23', name: 'LTX 2.3 Cloud' },
  { model: 'ltx23-open', name: 'LTX 2.3 Open' },
] as const;

const AGENT_SESSION_KEY = 'agent_session_v1';
const PROVIDER_CAPABILITY_CACHE_MS = 90_000;

const AUTOMATION_START_PATTERN = /\b(start|run|launch|begin)\b.*\b(automation|autopilot|background|agent)\b/i;
const AUTOMATION_STOP_PATTERN = /\b(stop|pause|halt|disable)\b.*\b(automation|autopilot|background|agent)\b/i;
const SIMPLE_GREETING_PATTERN = /^(?:hi|hello|hey|yo|sup|what(?:'| i)?s up|good (?:morning|afternoon|evening))[\s!.?]*$/i;
const FILE_ANALYSIS_CUE_PATTERN = /\b(analy[sz]e|review|read|extract|summari[sz]e|parse|transcribe|use this (?:pdf|file|document)|from this (?:pdf|file|document)|what(?:'| i)?s in (?:this|the) (?:pdf|file|document))\b/i;
const DETAIL_HANDOFF_PATTERN = /\b(i(?:\s+am|'m)?\s+(?:going to|gonna)|i(?:'| a)?ll|let me|about to)\s+(?:give|share|send|provide)\b.*\b(detail|description|brief|profile|context|info)\b/i;
const SCENE_REQUEST_PATTERN = /\b(scene|storyboard|shot list|cinematic scene|loop[- ]friendly|camera movement)\b/i;
const UNIVERSAL_PIPELINE_PATTERN = /\b(multimodal|text\s*\+\s*image|image\s*\+\s*video|voice|music|sound design|final mix|production pipeline|full stack)\b/i;
const FILE_CONTEXT_LIMIT = 12_000;
const PAGE_BLOCK_PATTERN = /\[Page \d+\][\s\S]*?(?=\n\n\[Page \d+\]|$)/g;
const NICHE_CLARIFICATION_PATTERN = /\bwhat niche should i lock before generating\??\b/i;
const REWRITE_REQUEST_PATTERN = /\b(rewrite|regenerate|redo|rework|fix|improve)\b.*\b(script|scene|story|version|this)\b/i;
const SCHEDULE_REQUEST_PATTERN = /\b(schedule|queue|plan|slot)\b[\s\S]{0,40}\b(post|content|draft|caption|script|scene|reel|video|image|this|it|scheduler|calendar|later)\b/i;
const ADMIN_ASSISTANT_MESSAGE_PATTERN = /^(command mode:|locked niche set to:|idea queued in memory:|target platforms updated:|background automation|automation:|engagement sync complete|done\.\s+i scheduled it in your built-in scheduler)/i;
const CONTINUATION_CUE_PATTERN = /^\s*(continue|go on|proceed|carry on|keep going|do it|do that)\s*[.!?]*$/i;
const CAPABILITIES_REQUEST_PATTERN = /\b(what can you do|what do you do|your capabilities|capabilities|what are you capable of|help me understand what you can do)\b/i;
const UNIVERSAL_SCENE_DIRECTIVE = [
  'Scene generation constraints:',
  '- Keep mystery over explanation; never explain rituals, lore, or magic systems.',
  '- Keep focus on the requested focal character; do not add unnecessary new characters.',
  '- Include one disturbing anomaly in each scene.',
  '- Keep dialogue minimal or none.',
  '- Use camera movement and cinematic beat progression.',
  '- End each scene abruptly for loop-friendly playback.',
  '- If a scene feels safe or generic, regenerate before returning.',
].join('\n');
const AGENT_LATENCY_EVENT_NAME = 'nexus:agent-latency';
const COMMAND_PLATFORM_SET = new Set<Platform>([
  'twitter',
  'instagram',
  'tiktok',
  'linkedin',
  'facebook',
  'threads',
  'youtube',
  'pinterest',
]);

function extractQuotedOrTrailing(text: string, prefixPattern: RegExp): string | null {
  const match = text.match(prefixPattern);
  if (!match) return null;
  const value = (match[1] || '').trim();
  return value.length > 2 ? value : null;
}

function extractNicheHint(text: string): string | null {
  return extractQuotedOrTrailing(
    text,
    /(?:^|\b)(?:my\s+)?niche\s*(?:is|=|:)\s*["']?(.{3,140}?)["']?(?:$|[.!?\n])/i
  );
}

function extractIdeaHint(text: string): string | null {
  const fromIdea = extractQuotedOrTrailing(
    text,
    /(?:^|\b)(?:content\s+idea|idea|post\s+idea)\s*(?:is|=|:)\s*["']?(.{8,240}?)["']?(?:$|[.!?\n])/i
  );
  if (fromIdea) return fromIdea;
  return extractQuotedOrTrailing(
    text,
    /(?:^|\b)(?:make|create|generate|write)\s+(?:a\s+|an\s+)?(?:post|content|caption|thread|script)\s+(?:about|on)\s+["']?(.{8,240}?)["']?(?:$|[.!?\n])/i
  );
}

function isSimpleGreeting(message: string): boolean {
  return SIMPLE_GREETING_PATTERN.test(message.trim());
}

function wantsFileAnalysis(message: string): boolean {
  const normalized = message.trim();
  if (!normalized) return true;
  return FILE_ANALYSIS_CUE_PATTERN.test(normalized);
}

function isDetailHandoff(message: string): boolean {
  const normalized = message.trim().toLowerCase();
  if (!normalized) return false;
  if (!DETAIL_HANDOFF_PATTERN.test(normalized)) return false;
  return /\b(character|major character|main character|brand|niche|audience|idea|story)\b/i.test(normalized);
}

function isSceneRequest(message: string): boolean {
  return SCENE_REQUEST_PATTERN.test(message.trim().toLowerCase());
}

function isLikelyNicheReply(lastAssistantMessage: string | undefined, message: string): boolean {
  const candidate = message.trim();
  if (!candidate) return false;
  if (candidate.length < 3 || candidate.length > 120) return false;
  if (!lastAssistantMessage || !NICHE_CLARIFICATION_PATTERN.test(lastAssistantMessage.toLowerCase())) return false;
  if (/\?$/.test(candidate)) return false;
  if (/\b(niche|nich)\b/i.test(candidate)) return true;
  if (candidate.split(/\s+/).length <= 8) return true;
  return false;
}

function buildRewriteSourceFromHistory(messages: ChatMessage[]): string | null {
  const assistantCandidates = [...messages]
    .reverse()
    .filter((message) => message.role === 'assistant' && message.content.trim().length > 60);

  const scriptLike = assistantCandidates.find((message) =>
    /\bscene\b|\bscript\b|Scene\s+\d+/i.test(message.content)
  );
  if (!scriptLike) return null;
  return scriptLike.content.trim().slice(0, 3200);
}

function extractPrimaryBodyForScheduling(content: string): string {
  const trimmed = content.trim();
  if (!trimmed) return '';

  const primaryPost = trimmed.match(
    /Primary post:\s*([\s\S]*?)(?:\n\n(?:Platform versions|Alternate hooks\/angles|Assets:|Quality score:|Queued jobs:)|$)/i
  );
  if (primaryPost?.[1]) return primaryPost[1].trim();

  const primaryScript = trimmed.match(
    /Primary script:\s*([\s\S]*?)(?:\n\n(?:Platform cuts|Assets:|Quality score:|Queued jobs:)|$)/i
  );
  if (primaryScript?.[1]) return primaryScript[1].trim();

  return trimmed;
}

function extractInlineSchedulePayload(message: string): string | null {
  const match = message.match(/(?:schedule|queue)\s+(?:this|it)?\s*[:\-]\s*([\s\S]{20,})/i);
  if (!match?.[1]) return null;
  return match[1].trim();
}

function getLatestSchedulableContent(messages: ChatMessage[]): { text: string; mediaUrl?: string } | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role !== 'assistant') continue;
    const content = message.content.trim();
    if (!content || ADMIN_ASSISTANT_MESSAGE_PATTERN.test(content)) continue;

    const normalized = extractPrimaryBodyForScheduling(content);
    if (normalized.length < 24) continue;

    const mediaUrl = message.media?.find((asset) => asset.type === 'image' || asset.type === 'video')?.url;
    return { text: normalized, mediaUrl };
  }

  return null;
}

function parseClockTimeFromMessage(message: string): { hour: number; minute: number } | null {
  const twelveHour = message.match(/\b(at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i);
  if (twelveHour) {
    const baseHour = Number(twelveHour[2]);
    const minute = Number(twelveHour[3] || '0');
    if (Number.isNaN(baseHour) || Number.isNaN(minute)) return null;
    if (baseHour < 1 || baseHour > 12 || minute < 0 || minute > 59) return null;
    let hour = baseHour % 12;
    if (twelveHour[4].toLowerCase() === 'pm') hour += 12;
    return { hour, minute };
  }

  const twentyFourHour = message.match(/\b(at\s+)?([01]?\d|2[0-3]):([0-5]\d)\b/);
  if (twentyFourHour) {
    const hour = Number(twentyFourHour[2]);
    const minute = Number(twentyFourHour[3]);
    if (Number.isNaN(hour) || Number.isNaN(minute)) return null;
    return { hour, minute };
  }

  return null;
}

function parseScheduledAtFromMessage(message: string, now: Date = new Date()): string | null {
  const normalized = message.trim().toLowerCase();
  if (!normalized) return null;

  const relative = normalized.match(/\bin\s+(\d+)\s*(minute|minutes|min|mins|hour|hours|hr|hrs)\b/i);
  if (relative) {
    const amount = Number(relative[1]);
    if (!Number.isNaN(amount) && amount > 0) {
      const unit = relative[2].toLowerCase();
      const deltaMs = unit.startsWith('h') ? amount * 60 * 60 * 1000 : amount * 60 * 1000;
      return new Date(now.getTime() + deltaMs).toISOString();
    }
  }

  const isoLike = message.match(/\b\d{4}-\d{2}-\d{2}(?:[ t]\d{1,2}:\d{2}(?::\d{2})?)?\b/);
  if (isoLike?.[0]) {
    const parsed = new Date(isoLike[0].replace(' ', 'T'));
    if (!Number.isNaN(parsed.getTime()) && parsed.getTime() > now.getTime()) {
      return parsed.toISOString();
    }
  }

  const clock = parseClockTimeFromMessage(message);
  const hasToday = /\btoday\b/.test(normalized);
  const hasTomorrow = /\btomorrow\b/.test(normalized);
  const hasTonight = /\btonight\b/.test(normalized);

  if (hasToday || hasTomorrow || hasTonight || clock) {
    const scheduled = new Date(now);
    if (hasTomorrow) {
      scheduled.setDate(scheduled.getDate() + 1);
    }
    if (hasTonight && !clock) {
      scheduled.setHours(20, 0, 0, 0);
    } else if (clock) {
      scheduled.setHours(clock.hour, clock.minute, 0, 0);
    } else {
      scheduled.setHours(10, 0, 0, 0);
    }

    if (scheduled.getTime() <= now.getTime()) {
      scheduled.setDate(scheduled.getDate() + 1);
    }
    return scheduled.toISOString();
  }

  return null;
}

function findContinuationExecutionRequest(messages: ChatMessage[]): string | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role !== 'user') continue;
    const text = message.content.trim();
    if (!text || CONTINUATION_CUE_PATTERN.test(text)) continue;

    if (
      /\b(generate|create|make|write|build|produce|render|schedule|queue|analy[sz]e|review|extract)\b/i.test(text) &&
      /\b(video|clip|reel|shorts?|image|photo|scene|script|post|content|caption|calendar|scheduler|pdf|file|document|brand)\b/i.test(text)
    ) {
      return text;
    }
  }

  return null;
}

function looksLikeCharacterDescriptor(message: string): boolean {
  const normalized = message.trim();
  if (normalized.length < 40) return false;
  const descriptorSignals = [
    /\b(young|old|slim|build|hair|skin|robe|outfit|expression|eyes|lantern|pendant|barefoot)\b/i,
    /,/,
    /\b(character|wanderer|protagonist|main)\b/i,
  ];
  return descriptorSignals.filter((signal) => signal.test(normalized)).length >= 2;
}

function wantsUniversalPipeline(message: string): boolean {
  return UNIVERSAL_PIPELINE_PATTERN.test(message.trim().toLowerCase());
}

function buildFileContextPreview(text: string): string {
  const normalized = text.trim();
  if (!normalized) return '';
  if (normalized.length <= FILE_CONTEXT_LIMIT) return normalized;

  const pageBlocks = normalized.match(PAGE_BLOCK_PATTERN);
  if (pageBlocks && pageBlocks.length > 0) {
    const snippets: string[] = [];
    let budget = FILE_CONTEXT_LIMIT;
    for (let index = 0; index < pageBlocks.length; index += 1) {
      const block = pageBlocks[index];
      if (budget < 180) break;
      const titleMatch = block.match(/^\[Page \d+\]/);
      const title = titleMatch?.[0] || '[Page]';
      const pageBody = block.replace(/^\[Page \d+\]\s*/, '').trim();
      const maxBody = Math.min(260, Math.max(90, budget - title.length - 40));
      const excerpt = pageBody.slice(0, maxBody);
      const snippet = `${title}\n${excerpt}${pageBody.length > maxBody ? ' …' : ''}`;
      if (snippet.length > budget) break;
      snippets.push(snippet);
      budget -= snippet.length + 2;
    }
    const lastBlock = pageBlocks[pageBlocks.length - 1];
    const alreadyHasLast = snippets.some((snippet) => snippet.startsWith(`[Page ${pageBlocks.length}]`));
    if (!alreadyHasLast && lastBlock && budget > 180) {
      const lastBody = lastBlock.replace(/^\[Page \d+\]\s*/, '').trim();
      const lastSnippet = `[Page ${pageBlocks.length}]\n${lastBody.slice(0, Math.min(320, budget - 24))}${lastBody.length > Math.min(320, budget - 24) ? ' …' : ''}`;
      snippets.push(lastSnippet);
    }
    if (snippets.length > 0) {
      return `Document is long. Page-by-page excerpts are included below to preserve coverage.\n\n${snippets.join('\n\n')}`;
    }
  }

  const segment = Math.floor(FILE_CONTEXT_LIMIT / 3);
  const middleStart = Math.max(0, Math.floor(normalized.length / 2) - Math.floor(segment / 2));
  const start = normalized.slice(0, segment);
  const middle = normalized.slice(middleStart, middleStart + segment);
  const end = normalized.slice(-segment);

  return [
    `Document is long (${normalized.length} characters). Excerpts from start, middle, and end are included for full-range coverage.`,
    '[Start]',
    start,
    '[Middle]',
    middle,
    '[End]',
    end,
  ].join('\n\n');
}

function buildGreetingReply(): string {
  const options = [
    'Hey. Good to see you. What are we working on right now?',
    'Hi. I am here. Want to plan, generate, or review something?',
    'Hey there. Ready when you are. What do you want to ship first?',
  ];
  const index = Math.abs(Date.now()) % options.length;
  return options[index];
}

function isCapabilitiesRequest(message: string): boolean {
  return CAPABILITIES_REQUEST_PATTERN.test(message.trim().toLowerCase());
}

function buildCapabilitiesReply(options: {
  currentModel: string;
  imageProvider: ImageProvider;
  videoProvider: VideoProvider;
  automationEnabled: boolean;
  multiAgentEnabled: boolean;
}): string {
  return [
    'Here is exactly what I can execute right now:',
    '- Generate publish-ready posts, scripts, scenes, captions, hooks, and platform cuts.',
    '- Generate images and videos directly (not just prompts).',
    `- Current engines: chat model ${options.currentModel}, image ${options.imageProvider}, video ${options.videoProvider}.`,
    '- Analyze attached PDFs/files page by page and extract grounded content ideas.',
    '- Save brand memory (niche, audience, character lock, style rules) and reuse it automatically.',
    '- Schedule content into the built-in scheduler and queue it for posting workers.',
    '- Run background automation loops and sync engagement metrics.',
    `- System status: automation ${options.automationEnabled ? 'running' : 'paused'}, multi-agent ${options.multiAgentEnabled ? 'enabled' : 'disabled'}.`,
    '',
    'If you want, give one command now and I will execute immediately: generate, analyze file, schedule, or start automation.',
  ].join('\n');
}

function emitAgentLatency(stage: string, durationMs: number, metadata: Record<string, unknown> = {}): void {
  const detail = {
    stage,
    durationMs,
    timestamp: new Date().toISOString(),
    ...metadata,
  };
  try {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(AGENT_LATENCY_EVENT_NAME, { detail }));
    }
  } catch {
    // Ignore telemetry event dispatch failures
  }
  console.info('[AgentLatency]', detail);
}

type AgentCommand =
  | { type: 'help' }
  | { type: 'lock_niche'; value: string }
  | { type: 'queue_idea'; value: string }
  | { type: 'set_platforms'; platforms: Platform[] }
  | { type: 'start'; payload?: string }
  | { type: 'pause' }
  | { type: 'status' }
  | { type: 'approve'; outputId: string }
  | { type: 'reject'; outputId: string }
  | { type: 'run_now' }
  | { type: 'sync_engagement' };

function parseAgentCommand(input: string): AgentCommand | null {
  const text = input.trim();
  if (!text.startsWith('/')) return null;

  const [rawCommand, ...rest] = text.slice(1).split(/\s+/);
  const command = rawCommand.toLowerCase();
  const args = rest.join(' ').trim();

  if (command === 'help') return { type: 'help' };
  if ((command === 'lock-niche' || command === 'niche') && args) return { type: 'lock_niche', value: args };
  if ((command === 'queue-idea' || command === 'idea') && args) return { type: 'queue_idea', value: args };
  if (command === 'platforms' && args) {
    const platforms = args
      .split(/[,\s]+/)
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean)
      .filter((value): value is Platform => COMMAND_PLATFORM_SET.has(value as Platform));
    return { type: 'set_platforms', platforms: Array.from(new Set(platforms)) };
  }
  if (command === 'start') return { type: 'start', payload: args || undefined };
  if (command === 'pause' || command === 'stop') return { type: 'pause' };
  if (command === 'status') return { type: 'status' };
  if (command === 'approve' && args) return { type: 'approve', outputId: args };
  if (command === 'reject' && args) return { type: 'reject', outputId: args };
  if (command === 'run-now') return { type: 'run_now' };
  if (command === 'sync-engagement') return { type: 'sync_engagement' };

  return null;
}

interface AgentState {
  isOpen: boolean;
  isThinking: boolean;
  currentTask: string | null;
  messages: ChatMessage[];
  pendingFiles: AttachedFile[];
  godModeEnabled: boolean;
  lastGodModeResult: GodModeResult | null;
  currentMusicMood: MusicMood | null;
  // New features
  currentModel: string;
  availableModels: typeof AVAILABLE_MODELS;
  currentImageProvider: ImageProvider;
  availableImageProviders: typeof IMAGE_ENGINE_OPTIONS;
  currentVideoProvider: VideoProvider;
  availableVideoProviders: typeof VIDEO_ENGINE_OPTIONS;
  automationEnabled: boolean;
  isVoiceMode: boolean;
  isListening: boolean;
  isSpeaking: boolean;
  // Multi-agent system
  multiAgentEnabled: boolean;
  lastOrchestrationResult: OrchestrationResult | null;
  activeAgents: AgentConfig[];
  governorActive: boolean;
}

interface AgentContextType extends AgentState {
  openAgent: () => void;
  closeAgent: () => void;
  toggleAgent: () => void;
  sendMessage: (content: string, files?: AttachedFile[]) => Promise<void>;
  clearMessages: () => void;
  attachFile: (file: AttachedFile) => void;
  removeFile: (name: string) => void;
  clearFiles: () => void;
  toggleGodMode: () => void;
  runGodMode: (idea: string) => Promise<GodModeResult | null>;
  generateIdeas: (topic: string, count?: number) => Promise<string[]>;
  // New features
  setModel: (model: string) => void;
  setImageProvider: (provider: ImageProvider) => void;
  setVideoProvider: (provider: VideoProvider) => void;
  toggleAutomation: () => void;
  toggleVoiceMode: () => void;
  startListening: () => void;
  stopListening: () => void;
  speakResponse: (text: string) => void;
  stopSpeaking: () => void;
  // Multi-agent system
  toggleMultiAgent: () => void;
  runOrchestration: (request: string, type?: 'content' | 'strategy' | 'full') => Promise<OrchestrationResult | null>;
  getSystemStatus: () => Promise<{ agentsReady: boolean; agentCount: number; governorEnabled: boolean }>;
  triggerEvolution: () => Promise<void>;
}

interface AgentSessionSnapshot {
  messages: ChatMessage[];
  pendingFiles?: AttachedFile[];
  godModeEnabled: boolean;
  currentModel: string;
  currentImageProvider: ImageProvider;
  currentVideoProvider: VideoProvider;
  automationEnabled: boolean;
  isVoiceMode: boolean;
  multiAgentEnabled: boolean;
  lastOpenedAt: string;
}

export const AgentContext = createContext<AgentContextType | null>(null);

export function AgentProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AgentState>({
    isOpen: false,
    isThinking: false,
    currentTask: null,
    messages: [],
    pendingFiles: [],
    godModeEnabled: false,
    lastGodModeResult: null,
    currentMusicMood: null,
    // New features
    currentModel: 'gpt-4o',
    availableModels: AVAILABLE_MODELS,
    currentImageProvider: 'puter',
    availableImageProviders: IMAGE_ENGINE_OPTIONS,
    currentVideoProvider: 'ltx23',
    availableVideoProviders: VIDEO_ENGINE_OPTIONS,
    automationEnabled: false,
    isVoiceMode: false,
    isListening: false,
    isSpeaking: false,
    // Multi-agent system
    multiAgentEnabled: true,
    lastOrchestrationResult: null,
    activeAgents: [],
    governorActive: true,
  });

  const initializedRef = useRef(false);
  const providerCapabilitiesCacheRef = useRef<{
    timestamp: number;
    capabilities: ProviderCapability[];
  } | null>(null);

  const saveSessionSnapshot = useCallback(async (nextState: AgentState) => {
    const snapshot: AgentSessionSnapshot = {
      messages: nextState.messages.slice(-100),
      godModeEnabled: nextState.godModeEnabled,
      currentModel: nextState.currentModel,
      currentImageProvider: nextState.currentImageProvider,
      currentVideoProvider: nextState.currentVideoProvider,
      automationEnabled: nextState.automationEnabled,
      isVoiceMode: nextState.isVoiceMode,
      multiAgentEnabled: nextState.multiAgentEnabled,
      lastOpenedAt: new Date().toISOString(),
    };
    await kvSet(AGENT_SESSION_KEY, JSON.stringify(snapshot));
  }, []);

  const restoreSessionSnapshot = useCallback(async () => {
    try {
      const raw = await kvGet(AGENT_SESSION_KEY);
      if (!raw || typeof raw !== 'string') return null;
      return JSON.parse(raw) as AgentSessionSnapshot;
    } catch {
      return null;
    }
  }, []);

  // Load chat history on first open
  const loadHistory = useCallback(async () => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    
    try {
      const [history, savedModel, savedImageProvider, savedVideoProvider, sessionSnapshot] = await Promise.all([
        loadChatHistory(),
        getCurrentModel(),
        kvGet<ImageProvider>('image_provider'),
        kvGet<VideoProvider>('video_provider'),
        restoreSessionSnapshot(),
      ]);
      await Promise.all([
        ensureAgentSkillsInstalled(),
        automationEngine.initialize().catch(() => {}),
      ]);
      const automationState = automationEngine.getState();

      setState(s => ({
        ...s,
        messages: sessionSnapshot?.messages?.length ? sessionSnapshot.messages : (history.length > 0 ? history : s.messages),
        pendingFiles: [],
        godModeEnabled: sessionSnapshot?.godModeEnabled ?? s.godModeEnabled,
        currentModel: sessionSnapshot?.currentModel || savedModel || s.currentModel,
        currentImageProvider:
          sessionSnapshot?.currentImageProvider === 'stability' ||
          sessionSnapshot?.currentImageProvider === 'leonardo' ||
          sessionSnapshot?.currentImageProvider === 'ideogram' ||
          sessionSnapshot?.currentImageProvider === 'puter'
            ? sessionSnapshot.currentImageProvider
            : savedImageProvider === 'stability' ||
              savedImageProvider === 'leonardo' ||
              savedImageProvider === 'ideogram' ||
              savedImageProvider === 'puter'
            ? savedImageProvider
            : s.currentImageProvider,
        currentVideoProvider:
          sessionSnapshot?.currentVideoProvider === 'ltx23-open' || sessionSnapshot?.currentVideoProvider === 'ltx23'
            ? sessionSnapshot.currentVideoProvider
            : savedVideoProvider === 'ltx23-open' || savedVideoProvider === 'ltx23'
            ? savedVideoProvider
            : s.currentVideoProvider,
        automationEnabled: automationState.isRunning,
        isVoiceMode: sessionSnapshot?.isVoiceMode ?? s.isVoiceMode,
        multiAgentEnabled: sessionSnapshot?.multiAgentEnabled ?? s.multiAgentEnabled,
      }));
    } catch (error) {
      console.error('Failed to load chat history:', error);
    }
  }, [restoreSessionSnapshot]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadHistory();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [loadHistory]);

  useEffect(() => {
    if (!initializedRef.current) return;
    void saveSessionSnapshot(state);
  }, [
    state.messages,
    state.godModeEnabled,
    state.currentModel,
    state.currentImageProvider,
    state.currentVideoProvider,
    state.automationEnabled,
    state.isVoiceMode,
    state.multiAgentEnabled,
    saveSessionSnapshot,
  ]);

  useEffect(() => {
    const handleChatModelState = (event: Event) => {
      const customEvent = event as CustomEvent<ChatModelDetail>;
      const nextModel = customEvent.detail?.model;
      if (!nextModel) return;
      setState((s) => (s.currentModel === nextModel ? s : { ...s, currentModel: nextModel }));
    };

    window.addEventListener(CHAT_MODEL_EVENT_NAME, handleChatModelState as EventListener);
    return () => {
      window.removeEventListener(CHAT_MODEL_EVENT_NAME, handleChatModelState as EventListener);
    };
  }, []);

  const openAgent = useCallback(() => {
    loadHistory();
    setState(s => ({ ...s, isOpen: true }));
  }, [loadHistory]);

  const closeAgent = useCallback(() => {
    setState(s => ({ ...s, isOpen: false }));
  }, []);

  const toggleAgent = useCallback(() => {
    setState(s => {
      if (!s.isOpen) {
        loadHistory();
      }
      return { ...s, isOpen: !s.isOpen };
    });
  }, [loadHistory]);

  const attachFile = useCallback((file: AttachedFile) => {
    setState(s => ({
      ...s,
      pendingFiles: [...s.pendingFiles, file],
    }));
  }, []);

  const removeFile = useCallback((name: string) => {
    setState(s => ({
      ...s,
      pendingFiles: s.pendingFiles.filter(f => f.name !== name),
    }));
  }, []);

  const clearFiles = useCallback(() => {
    setState(s => ({ ...s, pendingFiles: [] }));
  }, []);

  const clearMessages = useCallback(() => {
    setState(s => ({ ...s, messages: [] }));
    clearChatHistory();
  }, []);

  const toggleGodMode = useCallback(() => {
    setState(s => ({ ...s, godModeEnabled: !s.godModeEnabled }));
  }, []);

  const runGodMode = useCallback(async (idea: string): Promise<GodModeResult | null> => {
    setState(s => ({ ...s, isThinking: true, currentTask: 'God Mode Analysis...' }));

    try {
      const brandKit = await loadBrandKit();
      const result = await runGodModeAnalysis(idea, brandKit, { useMultipleModels: true });
      
      // Analyze music mood from the final idea
      const musicMood = await analyzeMusicMood(result.finalIdea);
      
      setState(s => ({ 
        ...s, 
        lastGodModeResult: result,
        currentMusicMood: musicMood,
        isThinking: false, 
        currentTask: null 
      }));

      return result;
    } catch (error) {
      console.error('God Mode error:', error);
      setState(s => ({ ...s, isThinking: false, currentTask: null }));
      return null;
    }
  }, []);

  const generateIdeas = useCallback(async (topic: string, count = 5): Promise<string[]> => {
    setState(s => ({ ...s, isThinking: true, currentTask: 'Generating ideas...' }));

    try {
      const brandKit = await loadBrandKit();
      const ideas = await quickIdeate(topic, brandKit, count);
      setState(s => ({ ...s, isThinking: false, currentTask: null }));
      return ideas;
    } catch (error) {
      console.error('Ideation error:', error);
      setState(s => ({ ...s, isThinking: false, currentTask: null }));
      return [];
    }
  }, []);

  // Model switching
  const setModel = useCallback((model: string) => {
    setState(s => ({ ...s, currentModel: model }));
    void setActiveChatModel(model);
  }, []);

  const setImageProvider = useCallback((provider: ImageProvider) => {
    setState(s => ({ ...s, currentImageProvider: provider }));
    kvSet('image_provider', provider);
  }, []);

  const setVideoProvider = useCallback((provider: VideoProvider) => {
    setState(s => ({ ...s, currentVideoProvider: provider }));
    kvSet('video_provider', provider);
  }, []);

  // Automation toggle
  const toggleAutomation = useCallback(() => {
    void (async () => {
      try {
        await automationEngine.initialize();
        const nextRunning = await automationEngine.toggle();
        const autoState = automationEngine.getState();
        setState((s) => ({
          ...s,
          automationEnabled: nextRunning,
          currentTask: nextRunning ? `Background automation started (next run ${autoState.nextRun ? new Date(autoState.nextRun).toLocaleTimeString() : 'soon'})` : 'Background automation stopped',
        }));
      } catch (error) {
        console.error('Automation toggle failed:', error);
      }
    })();
  }, []);

  // Voice mode
  const toggleVoiceMode = useCallback(() => {
    setState(s => ({ ...s, isVoiceMode: !s.isVoiceMode }));
  }, []);

  const startListening = useCallback(() => {
    setState(s => ({ ...s, isListening: true }));
  }, []);

  const stopListening = useCallback(() => {
    setState(s => ({ ...s, isListening: false }));
  }, []);

  const speakResponse = useCallback(async (text: string) => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1;
    utterance.pitch = 1;
    
    utterance.onstart = () => setState(s => ({ ...s, isSpeaking: true }));
    utterance.onend = () => setState(s => ({ ...s, isSpeaking: false }));
    utterance.onerror = () => setState(s => ({ ...s, isSpeaking: false }));
    
    window.speechSynthesis.speak(utterance);
  }, []);

  const stopSpeaking = useCallback(() => {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    setState(s => ({ ...s, isSpeaking: false }));
  }, []);

  // Detect intent from user message
  const detectIntent = async (message: string, hasFiles: boolean): Promise<AgentIntent> => {
    const trimmedMessage = message.trim();
    const lowerMessage = trimmedMessage.toLowerCase();
    const directVideoPattern = /\b(generate|create|make|produce|render|build)\b[\s\S]{0,40}\b(video|clip|reel|shorts?|animation|short film)\b/i;
    const directImagePattern = /\b(generate|create|make|produce|render|build)\b[\s\S]{0,40}\b(image|photo|picture|thumbnail|illustration|poster)\b/i;
    const scheduleQuestionPattern = /^\s*(how|what|why|when|where|which|can|could|would|do|does|is|are|will)\b/i;
    const scheduleMetaQuestionPattern = /\b(just a question|question only|do not schedule|don't schedule|dont schedule)\b/i;
    const scheduleCommandPattern = /\b(schedule|queue)\s+(it|this)\b/i;
    const explicitScheduleExecutionPattern = /\b(schedule|queue|run)\b[\s\S]{0,24}\b(now|it|this|immediately|right now|please)\b/i;
    const explicitGenerationPattern = /\b(create content|make content|write (a|an)? ?post|write captions?|create posts?|turn this into content|use this pdf|make posts? from|create reels?|create shorts?|generate content|caption for|script for|turn this into posts?|create a caption|make a reel|make a video script|create scenes?|generate scenes?|scene breakdown|storyboard)\b/;
    const softIdeaPattern = /\b(content idea|post idea)\b/;
    const nichePattern = /\b(niche|nich)\s*(is|:|=)\b/;
    const regeneratePattern = /\b(regenerate|redo|try again|another version|improve this|make it more realistic|make it better|fix this image|fix this video)\b/;

    if (directVideoPattern.test(trimmedMessage)) {
      return { type: 'make_video', confidence: 0.96, params: {} };
    }

    if (directImagePattern.test(trimmedMessage)) {
      return { type: 'create_image', confidence: 0.95, params: {} };
    }

    if (SCHEDULE_REQUEST_PATTERN.test(trimmedMessage)) {
      const looksQuestion = scheduleQuestionPattern.test(trimmedMessage) || trimmedMessage.includes('?');
      const explicitExecution = scheduleCommandPattern.test(trimmedMessage) || explicitScheduleExecutionPattern.test(trimmedMessage);
      const isMetaQuestion = scheduleMetaQuestionPattern.test(trimmedMessage);

      if ((looksQuestion && !explicitExecution) || isMetaQuestion) {
        return { type: 'answer_question', confidence: 0.94, params: { scheduleQuestion: true } };
      }

      return { type: 'schedule_post', confidence: 0.95, params: {} };
    }

    if (looksLikeCharacterDescriptor(trimmedMessage)) {
      return { type: 'manage_brand', confidence: 0.94, params: { characterProfile: true } };
    }

    if (explicitGenerationPattern.test(lowerMessage)) {
      return { type: 'generate_content', confidence: 0.95, params: {} };
    }

    if (regeneratePattern.test(lowerMessage)) {
      return { type: 'regenerate_media', confidence: 0.95, params: {} };
    }

    if (nichePattern.test(lowerMessage)) {
      return { type: 'manage_brand', confidence: 0.95, params: {} };
    }

    if (hasFiles) {
      if (wantsFileAnalysis(trimmedMessage)) {
        return { type: 'read_file', confidence: 0.95, params: {} };
      }
      return { type: 'answer_question', confidence: 0.82, params: { hasFileContext: true } };
    }

    if (wantsFileAnalysis(trimmedMessage)) {
      return { type: 'read_file', confidence: 0.92, params: { missingFiles: true } };
    }

    if (softIdeaPattern.test(lowerMessage)) {
      return { type: 'answer_question', confidence: 0.7, params: { hasIdeaContext: true } };
    }

    const explicitMediaIntent = detectExplicitMediaIntent(trimmedMessage);
    if (explicitMediaIntent === 'answer_question') {
      return { type: 'answer_question', confidence: 0.88, params: { mediaTopic: true } };
    }
    if (explicitMediaIntent === 'create_image') {
      return { type: 'create_image', confidence: 0.92, params: {} };
    }
    if (explicitMediaIntent === 'make_video') {
      return { type: 'make_video', confidence: 0.9, params: {} };
    }

    try {
      const response = await universalChat(
        `${INTENT_DETECTION_PROMPT}\n\nUser message: "${message}"`,
        { model: 'gpt-4o-mini' }
      );
      
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        const parsedIntent = parsed.intent || 'answer_question';

        return {
          type: parsedIntent,
          confidence: parsed.confidence || 0.7,
          params: parsed.params || {},
        };
      }
    } catch {
      // Default to general chat
    }

    return { type: 'answer_question', confidence: 0.5, params: {} };
  };

  const getLastMediaContext = useCallback(() => {
    for (let i = state.messages.length - 1; i >= 0; i--) {
      const assistantMessage = state.messages[i];
      if (assistantMessage.role !== 'assistant' || !assistantMessage.media?.length) continue;

      const mediaAsset = assistantMessage.media[0];
      for (let j = i - 1; j >= 0; j--) {
        const priorUser = state.messages[j];
        if (priorUser.role !== 'user') continue;

        return {
          kind: mediaAsset.type === 'video' ? 'video' : 'image',
          prompt: mediaAsset.prompt || priorUser.content,
          userRequest: priorUser.content,
        };
      }

      return {
        kind: mediaAsset.type === 'video' ? 'video' : 'image',
        prompt: mediaAsset.prompt || assistantMessage.content,
        userRequest: mediaAsset.prompt || assistantMessage.content,
      };
    }

    return null;
  }, [state.messages]);

  const inferPlatformsFromContext = async (message: string): Promise<Platform[]> => {
    const lowerMessage = message.toLowerCase();
    const mentionedPlatforms = (['twitter', 'instagram', 'tiktok', 'linkedin', 'facebook', 'threads', 'youtube', 'pinterest'] as Platform[])
      .filter((platform) => lowerMessage.includes(platform));

    if (mentionedPlatforms.length > 0) {
      return mentionedPlatforms;
    }

    const memory = await loadAgentMemory();
    const rememberedPlatforms = memory.targetPlatforms.filter(
      (platform): platform is Platform =>
        ['twitter', 'instagram', 'tiktok', 'linkedin', 'facebook', 'threads', 'youtube', 'pinterest'].includes(platform)
    );

    if (rememberedPlatforms.length > 0) {
      return rememberedPlatforms;
    }

    return ['instagram', 'tiktok'];
  };

  const getProviderCapabilitiesCached = useCallback(async (): Promise<ProviderCapability[]> => {
    const cached = providerCapabilitiesCacheRef.current;
    if (cached && Date.now() - cached.timestamp < PROVIDER_CAPABILITY_CACHE_MS) {
      return cached.capabilities;
    }

    const capabilities = await loadProviderCapabilities();
    providerCapabilitiesCacheRef.current = {
      timestamp: Date.now(),
      capabilities,
    };
    return capabilities;
  }, []);

  const resolveExecutionModel = useCallback(async (
    task: 'chat' | 'vision' | 'code' | 'creative' | 'analysis' | 'fast'
  ): Promise<string> => {
    try {
      const capabilities = await getProviderCapabilitiesCached();
      let recommended = getRecommendedModel(task, capabilities);
      if (!recommended) {
        const fallbackProvider = capabilities.find(
          (provider) =>
            provider.apiKeyConfigured &&
            provider.status !== 'offline' &&
            provider.models.some((model) => !model.deprecated)
        );
        const fallbackModel = fallbackProvider?.models.find((model) => model.recommended && !model.deprecated)
          || fallbackProvider?.models.find((model) => !model.deprecated);

        if (fallbackProvider && fallbackModel) {
          recommended = { providerId: fallbackProvider.id, modelId: fallbackModel.id };
        }
      }
      if (!recommended) return state.currentModel;

      const match = AVAILABLE_MODELS.find((model) => model.model === recommended.modelId);
      if (!match) return state.currentModel;
      if (match.model === state.currentModel) return state.currentModel;

      await setActiveChatModel(match.model);
      setState((s) => ({ ...s, currentModel: match.model }));
      return match.model;
    } catch (error) {
      console.warn('Execution model resolution failed, using current model:', error);
      return state.currentModel;
    }
  }, [getProviderCapabilitiesCached, state.currentModel]);

  const queueAndStartBackgroundAutomation = useCallback(async (
    message: string
  ): Promise<{ ok: boolean; response: string }> => {
    const nicheHint = extractNicheHint(message);
    const ideaHint = extractIdeaHint(message);

    if (nicheHint) {
      await setPrimaryNiche(nicheHint);
      await addNicheDetail(nicheHint);
    }
    if (ideaHint) {
      await addContentIdea(ideaHint, 'user_stated');
    }

    const memory = await loadAgentMemory();
    const activeNiche = (memory.niche || nicheHint || '').trim();
    const selectedIdea =
      memory.contentIdeas
        .slice()
        .reverse()
        .find((idea) => idea.status === 'new') || null;

    if (!activeNiche) {
      return {
        ok: false,
        response: 'I am not starting background automation yet. I need a locked niche first. Tell me: "My niche is ...".',
      };
    }

    if (!selectedIdea) {
      return {
        ok: false,
        response: 'I am not starting background automation yet. I need a concrete content idea in memory first. Tell me one specific idea.',
      };
    }

    const platforms = memory.targetPlatforms.filter(
      (platform): platform is Platform =>
        ['twitter', 'instagram', 'tiktok', 'linkedin', 'facebook', 'threads', 'youtube', 'pinterest'].includes(platform)
    );
    const platform = platforms[0] || 'instagram';

    const request: NexusRequest = {
      userInput: `Create high-engagement, niche-locked content.\n- Niche: ${activeNiche}\n- Idea: ${selectedIdea.idea}`,
      taskType: 'content',
      platform,
      customInstructions: 'Do not assume missing details. If required details are missing, ask concise questions first. If the idea is weak, reject it politely with concrete reasons and a stronger replacement.',
    };

    await automationEngine.initialize();
    await automationEngine.addToQueue(request);
    const started = await automationEngine.start();

    if (started) {
      setState((s) => ({ ...s, automationEnabled: true }));
      void automationEngine.runCycle();
      const autoState = automationEngine.getState();
      return {
        ok: true,
        response: `Background automation is running. Locked niche: ${activeNiche}. Queued idea: ${selectedIdea.idea}. Next run: ${
          autoState.nextRun ? new Date(autoState.nextRun).toLocaleTimeString() : 'scheduled'
        }.`,
      };
    }

    return {
      ok: false,
      response: 'Automation did not start because it is currently paused by safety/failure guardrails. Clear the pause from the Nexus automation controls and retry.',
    };
  }, []);

  const formatGeneratedContentResponse = (
    generated: Awaited<ReturnType<typeof generateContent>>
  ): string => {
    const sections: string[] = ['I handled it.'];

    sections.push('\nPrimary post:\n' + generated.text);

    if (generated.platformPackages && generated.platformPackages.length > 0) {
      const packageText = generated.platformPackages.map((pkg) => {
        const hashtags = pkg.hashtags.length > 0 ? pkg.hashtags.join(' ') : 'None';
        return [
          `${pkg.platform.toUpperCase()}`,
          pkg.description,
          `Hashtags: ${hashtags}`,
        ].join('\n');
      }).join('\n\n');
      sections.push('\nPlatform versions:\n' + packageText);
    }

    if (generated.variations.length > 0) {
      sections.push('\nAlternate hooks/angles:\n' + generated.variations.slice(0, 3).map((variation, index) => `${index + 1}. ${variation}`).join('\n\n'));
    }

    return sections.join('\n');
  };

  const enforceGovernorApproval = useCallback(async (
    content: string,
    options: {
      platform?: string;
      brandKit?: Awaited<ReturnType<typeof loadBrandKit>>;
      request?: string;
    } = {}
  ): Promise<string> => {
    const original = (content || '').trim();
    if (!original) {
      return 'The provider returned an empty result. No content was generated, so the request needs to be retried.';
    }

    let candidate = original;

    try {
      for (let pass = 0; pass < 3; pass++) {
        const validation = await validateContent(candidate, {
          platform: options.platform,
          isRegeneration: pass > 0,
        });
        const decision = await makeGovernorDecision(validation, {
          currentModel: state.currentModel,
          regenerationCount: pass,
        });

        if (decision.approved) {
          return candidate;
        }

        const rewriteInstruction = `Rewrite this response so it passes strict quality governance.

User request:
${options.request || 'N/A'}

Current response:
${candidate}

Required fixes:
${decision.suggestions?.join('\n') || '- Improve quality and brand alignment'}

Rules:
- Keep it direct and human.
- Remove robotic/generic phrasing.
- Do not agree by default. If the idea is weak, say so clearly and explain why.
- If rejecting a direction, give a stronger replacement the user can execute immediately.
- Preserve the core answer.
- Return only the improved response text.`;

        if (decision.action === 'regenerate' || decision.action === 'downgrade' || decision.action === 'switch_provider') {
          const rewritten = await universalChat(
            [
              { role: 'system', content: 'You are Nexus Governor Rewrite. Return one improved final response only.' },
              { role: 'user', content: rewriteInstruction },
            ],
            { model: decision.alternativeModel || state.currentModel, brandKit: options.brandKit || undefined }
          );

          if (rewritten && rewritten.trim()) {
            candidate = rewritten.trim();
            continue;
          }
        }

        if (decision.action === 'reject') {
          const forcedFallback = await universalChat(
            [
              { role: 'system', content: 'Provide a concise, natural-sounding final response. Be direct, non-robotic, and willing to challenge weak ideas with clear reasoning.' },
              { role: 'user', content: `Request: ${options.request || 'N/A'}\n\nDraft response: ${candidate}` },
            ],
            { model: state.currentModel, brandKit: options.brandKit || undefined }
          );

          if (forcedFallback && forcedFallback.trim()) {
            return forcedFallback.trim();
          }
        }
      }
    } catch (error) {
      console.error('Governor enforcement error:', error);
    }

    let finalCandidate = candidate || original;

    try {
      for (let moodPass = 0; moodPass < 2; moodPass++) {
        const moodApproval = await evaluateMoodApproval(finalCandidate);
        setState((s) => ({ ...s, currentMusicMood: moodApproval.mood }));

        if (moodApproval.approved) {
          return finalCandidate;
        }

        const humanized = await universalChat(
          [
            {
              role: 'system',
              content: 'Rewrite the response to sound naturally human, emotionally grounded, and conversational. Avoid robotic or corporate phrasing. Return only final response text.',
            },
            {
              role: 'user',
              content: `User request:\n${options.request || 'N/A'}\n\nCurrent response:\n${finalCandidate}\n\nMood target:\n- Primary: ${moodApproval.mood.primary}\n- Tempo: ${moodApproval.mood.tempo}\n- Energy: ${moodApproval.mood.energy}\n\nFix these issues:\n${moodApproval.reasons.map((reason) => `- ${reason}`).join('\n')}`,
            },
          ],
          { model: state.currentModel, brandKit: options.brandKit || undefined }
        );

        if (humanized && humanized.trim()) {
          finalCandidate = humanized.trim();
        }
      }
    } catch (error) {
      console.error('Mood enforcement error:', error);
    }

    return finalCandidate;
  }, [state.currentModel]);

  const buildFailureOutput = useCallback(async (
    request: string,
    errorMessage: string,
    brandKit?: Awaited<ReturnType<typeof loadBrandKit>>
  ): Promise<string> => {
    try {
      const fallbackMessages = buildFallbackChatMessages(request, errorMessage) as AIMessage[];
      const fallback = await universalChat(fallbackMessages, { model: state.currentModel, brandKit: brandKit || undefined });
      if (fallback && fallback.trim()) return fallback.trim();
    } catch (fallbackError) {
      console.error('Fallback chat error:', fallbackError);
    }

    return `I couldn't complete the provider call right now.\n\nRequest: ${request}\n\nWhat happened:\n- The generation request failed before a usable result was returned\n- No final content was produced\n- Retry the request or switch providers`;
  }, [state.currentModel]);

  // Process attached files
  const processFiles = async (files: AttachedFile[], strictExtraction = false): Promise<string> => {
    const summaries: string[] = [];

    for (const file of files) {
      try {
        if (file.mimeType.startsWith('image/')) {
          const analysis = await analyzeImage(file.data, file.mimeType);
          summaries.push(`[Image: ${file.name}]\n${analysis}`);
        } else {
          const byteCharacters = atob(file.data);
          const byteNumbers = new Array(byteCharacters.length);
          for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
          }

          const browserFile = new File(
            [new Uint8Array(byteNumbers)],
            file.name,
            { type: file.mimeType }
          );

          const result = await fileProcessor.processFile(
            browserFile,
            FILE_ANALYSIS_PROMPT.replace('{fileType}', 'file'),
            { skipAiSummary: true }
          );
          const extractedText = result.file.extractedText
            ? buildFileContextPreview(result.file.extractedText)
            : '';
          const body = strictExtraction
            ? extractedText
            : extractedText || result.aiResponse || result.file.summary;

          if (body) {
            summaries.push(`[File: ${file.name}]\n${body}`);
          } else {
            summaries.push(
              strictExtraction
                ? `[File: ${file.name}] No extractable text was found in this file.`
                : `[File: ${file.name}] Processed successfully, but no summary was returned.`
            );
          }
        }
      } catch (error) {
        summaries.push(`[File: ${file.name}] - Error processing: ${error}`);
      }
    }

    return summaries.join('\n\n');
  };

  // Extract and save memory from conversations
  const extractAndSaveMemory = async (userMessage: string, aiResponse: string, intent: AgentIntent) => {
    try {
      const lowerMessage = userMessage.toLowerCase();
      const platformMatches = Array.from(new Set(
        ['instagram', 'tiktok', 'youtube', 'linkedin', 'twitter', 'x', 'facebook', 'threads', 'pinterest']
          .filter(platform => lowerMessage.includes(platform))
          .map(platform => platform === 'x' ? 'twitter' : platform)
      ));
      
      // Check for niche-related statements
      if (lowerMessage.includes('my niche') || lowerMessage.includes('i focus on') || 
          lowerMessage.includes('i specialize in') || lowerMessage.includes('my business is')) {
        // Extract the niche detail
        const nicheMatch = userMessage.match(/(?:my niche is|i focus on|i specialize in|my business is)\s+(.{5,100})/i);
        if (nicheMatch) {
          const niche = nicheMatch[1].trim();
          await setPrimaryNiche(niche);
          await addNicheDetail(niche);
        }
      }

      if ((lowerMessage.includes('niche') || lowerMessage.includes('nich')) && !lowerMessage.includes('my niche')) {
        const generalNicheMatch = userMessage.match(/(?:niche|nich)\s*(?:is|=|:)?\s+(.{3,100})/i);
        if (generalNicheMatch) {
          const niche = generalNicheMatch[1].trim();
          await setPrimaryNiche(niche);
          await addNicheDetail(niche);
        }
      }

      if (looksLikeCharacterDescriptor(userMessage)) {
        await addUserFact('locked_character_profile', userMessage.trim(), 'user_stated');
        await addNicheDetail(`Character lock profile: ${userMessage.trim().slice(0, 220)}`);
      }
      
      // Check for audience-related statements
      if (lowerMessage.includes('my audience') || lowerMessage.includes('my customers') || 
          lowerMessage.includes('my target') || lowerMessage.includes('my followers')) {
        const audienceMatch = userMessage.match(/(?:my audience|my customers|my target|my followers)\s+(?:is|are)\s+(.{10,150})/i);
        if (audienceMatch) {
          const audience = audienceMatch[1].trim();
          await setTargetAudienceMemory(audience);
          await addAudienceInsight(audience);
        }
      }

      const audienceIntentMatch = userMessage.match(/(?:target audience|ideal audience)\s*(?:is|=|:)?\s+(.{10,150})/i);
      if (audienceIntentMatch) {
        const audience = audienceIntentMatch[1].trim();
        await setTargetAudienceMemory(audience);
        await addAudienceInsight(audience);
      }

      for (const platform of platformMatches) {
        await addTargetPlatform(platform);
      }

      if (
        lowerMessage.includes('monetiz') ||
        lowerMessage.includes('sponsor') ||
        lowerMessage.includes('brand deal') ||
        lowerMessage.includes('affiliate') ||
        lowerMessage.includes('ad revenue') ||
        lowerMessage.includes('sell')
      ) {
        const monetizationMatch = userMessage.match(/(?:monetiz\w*|sponsor(?:ship)?s?|brand deals?|affiliate sales?|ad revenue|sell)\s+(?:through|with|using|from|via)?\s*(.{8,160})/i);
        await addMonetizationGoal((monetizationMatch?.[0] || userMessage).trim());
      }
      
      // Check for content ideas the user shares
      if (lowerMessage.includes('content idea') || lowerMessage.includes('post about') || 
          lowerMessage.includes('create content') || lowerMessage.includes('idea:') ||
          lowerMessage.includes('make content about') || intent.type === 'generate_content') {
        const directIdeaMatch = userMessage.match(/(?:content idea|idea|post about|make content about)\s*(?:is|:)?\s+(.{12,200})/i);
        if (directIdeaMatch) {
          await addContentIdea(directIdeaMatch[1].trim(), 'user_stated', platformMatches[0]);
        }
        const extracted = extractMemoryFromResponse(aiResponse);
        for (const idea of extracted.ideas.slice(0, 3)) {
          await addContentIdea(idea, 'ai_generated', platformMatches[0]);
        }
      }
      
      // Check for user facts (brand name, goals, etc.)
      if (lowerMessage.includes('my brand') || lowerMessage.includes('my company') || 
          lowerMessage.includes('my business name')) {
        const brandMatch = userMessage.match(/(?:my brand|my company|my business)\s+(?:is|name is|called)\s+([A-Za-z0-9\s]{2,50})/i);
        if (brandMatch) {
          await addUserFact('brand_name', brandMatch[1].trim(), 'user_stated');
        }
      }
      
      // Check for goals
      if (lowerMessage.includes('my goal') || lowerMessage.includes('i want to') || 
          lowerMessage.includes('i aim to')) {
        const goalMatch = userMessage.match(/(?:my goal is|i want to|i aim to)\s+(.{10,150})/i);
        if (goalMatch) {
          const goal = goalMatch[1].trim();
          await addUserFact('business_goal', goal, 'user_stated');
          if (
            goal.toLowerCase().includes('monetiz') ||
            goal.toLowerCase().includes('revenue') ||
            goal.toLowerCase().includes('income') ||
            goal.toLowerCase().includes('sales')
          ) {
            await addMonetizationGoal(goal);
          }
        }
      }

      const structuredMemory = await extractStructuredMemory(userMessage, aiResponse);

      if (structuredMemory.niche) {
        await setPrimaryNiche(structuredMemory.niche);
        await addNicheDetail(structuredMemory.niche);
      }

      for (const detail of structuredMemory.nicheDetails || []) {
        await addNicheDetail(detail);
      }

      if (structuredMemory.targetAudience) {
        await setTargetAudienceMemory(structuredMemory.targetAudience);
      }

      for (const insight of structuredMemory.audienceInsights || []) {
        await addAudienceInsight(insight);
      }

      for (const platform of structuredMemory.targetPlatforms || []) {
        await addTargetPlatform(platform);
      }

      for (const goal of structuredMemory.monetizationGoals || []) {
        await addMonetizationGoal(goal);
      }

      for (const goal of structuredMemory.businessGoals || []) {
        await addUserFact('business_goal', goal, 'inferred');
      }

      for (const fact of structuredMemory.userFacts || []) {
        await addUserFact(fact.key, fact.value, 'inferred');
      }

      for (const idea of structuredMemory.contentIdeas || []) {
        await addContentIdea(idea, intent.type === 'generate_content' ? 'user_stated' : 'memory_extracted', platformMatches[0]);
      }
      
      // Every 10 messages, create a conversation summary
      const messageCount = state.messages.length;
      if (messageCount > 0 && messageCount % 10 === 0) {
        const recentMessages = state.messages.slice(-10);
        const summaryText = recentMessages.map(m => `${m.role}: ${m.content.substring(0, 100)}`).join('\n');
        await addConversationSummary(
          `Discussed: ${recentMessages.map(m => m.content.substring(0, 30)).join(', ')}`,
          [],
          10
        );
      }
    } catch (error) {
      console.error('Error saving memory:', error);
    }
  };

  // Main send message function
  const sendMessage = useCallback(async (content: string, files?: AttachedFile[]) => {
    const attachedFiles = files || state.pendingFiles;
    const incomingContent = normalizeIncomingMessage(content, attachedFiles.length > 0);

    if (!incomingContent) {
      return;
    }

    const continuationSource =
      attachedFiles.length === 0 && CONTINUATION_CUE_PATTERN.test(incomingContent)
        ? findContinuationExecutionRequest(state.messages)
        : null;
    const normalizedContent = continuationSource || incomingContent;
    
    // Create user message
    const userMessage: ChatMessage = {
      id: generateId(),
      role: 'user',
      content: incomingContent,
      timestamp: new Date().toISOString(),
      attachments: attachedFiles.length > 0 ? attachedFiles : undefined,
    };

    // Update state with user message
    setState(s => ({
      ...s,
      messages: [...s.messages, userMessage],
      isThinking: true,
      currentTask: 'Processing...',
      pendingFiles: [],
    }));

    // Save user message without blocking response time
    void saveChatMessage(userMessage).catch((error) => {
      console.error('Failed to persist user message:', error);
    });

    let trackedGenerationId: string | null = null;
    try {
      const postCommandResponse = async (message: string) => {
        const assistantMessage: ChatMessage = {
          id: generateId(),
          role: 'assistant',
          content: message,
          timestamp: new Date().toISOString(),
        };
        setState((s) => ({
          ...s,
          messages: [...s.messages, assistantMessage],
          isThinking: false,
          currentTask: null,
        }));
        await saveChatMessage(assistantMessage);
      };

      const command = parseAgentCommand(incomingContent);
      if (command) {
        if (command.type === 'help') {
          await postCommandResponse(
            [
              'Command mode:',
              '- /lock-niche <niche>',
              '- /queue-idea <idea>',
              '- /platforms instagram,tiktok,linkedin',
              '- /start [optional idea text]',
              '- /run-now',
              '- /pause',
              '- /status',
              '- /approve <automation_output_id>',
              '- /reject <automation_output_id>',
              '- /sync-engagement',
            ].join('\n')
          );
          return;
        }

        if (command.type === 'lock_niche') {
          await setPrimaryNiche(command.value);
          await addNicheDetail(command.value);
          await postCommandResponse(`Locked niche set to: ${command.value}`);
          return;
        }

        if (command.type === 'queue_idea') {
          await addContentIdea(command.value, 'user_stated');
          await postCommandResponse(`Idea queued in memory: ${command.value}`);
          return;
        }

        if (command.type === 'set_platforms') {
          if (command.platforms.length === 0) {
            await postCommandResponse('No valid platforms found. Use: twitter, instagram, tiktok, linkedin, facebook, threads, youtube, pinterest.');
            return;
          }
          for (const platform of command.platforms) {
            await addTargetPlatform(platform);
          }
          await postCommandResponse(`Target platforms updated: ${command.platforms.join(', ')}`);
          return;
        }

        if (command.type === 'start') {
          const response = await queueAndStartBackgroundAutomation(command.payload || normalizedContent);
          await postCommandResponse(response.response);
          return;
        }

        if (command.type === 'pause') {
          await automationEngine.stop();
          setState((s) => ({ ...s, automationEnabled: false }));
          await postCommandResponse('Background automation is paused.');
          return;
        }

        if (command.type === 'status') {
          await automationEngine.initialize();
          const memory = await loadAgentMemory();
          const autoState = automationEngine.getState();
          const queue = automationEngine.getQueueDetails();
          const deadLetters = automationEngine.getDeadLetters();
          const pendingApprovals = automationEngine.getOutputs({ status: 'pending' }).length;
          await postCommandResponse(
            [
              `Automation: ${autoState.isRunning ? 'running' : 'paused'}`,
              `Locked niche: ${memory.niche || 'not set'}`,
              `Queued jobs: ${queue.length}`,
              `Dead-letter jobs: ${deadLetters.length}`,
              `Pending approvals: ${pendingApprovals}`,
              `Consecutive failures: ${autoState.consecutiveFailures}`,
              `Next run: ${autoState.nextRun ? new Date(autoState.nextRun).toLocaleString() : 'not scheduled'}`,
            ].join('\n')
          );
          return;
        }

        if (command.type === 'approve') {
          const approved = await automationEngine.approveOutput(command.outputId);
          await postCommandResponse(
            approved
              ? `Approved automation output: ${command.outputId}`
              : `Could not approve ${command.outputId}. Verify the output id.`
          );
          return;
        }

        if (command.type === 'reject') {
          const rejected = await automationEngine.rejectOutput(command.outputId);
          await postCommandResponse(
            rejected
              ? `Rejected automation output: ${command.outputId}`
              : `Could not reject ${command.outputId}. Verify the output id.`
          );
          return;
        }

        if (command.type === 'run_now') {
          await automationEngine.initialize();
          await automationEngine.start();
          void automationEngine.runCycle();
          setState((s) => ({ ...s, automationEnabled: true }));
          await postCommandResponse('Triggered one immediate automation run in the background.');
          return;
        }

        if (command.type === 'sync_engagement') {
          const report = await syncPostedEngagements({ limit: 40 });
          await postCommandResponse(
            `Engagement sync complete. Checked: ${report.checked}, Updated: ${report.updated}, Skipped: ${report.skipped}, Errors: ${report.errors.length}`
          );
          return;
        }
      }

      if (attachedFiles.length === 0 && isSimpleGreeting(normalizedContent)) {
        await postCommandResponse(buildGreetingReply());
        return;
      }

      if (attachedFiles.length === 0 && isCapabilitiesRequest(normalizedContent)) {
        await postCommandResponse(
          buildCapabilitiesReply({
            currentModel: state.currentModel,
            imageProvider: state.currentImageProvider,
            videoProvider: state.currentVideoProvider,
            automationEnabled: state.automationEnabled,
            multiAgentEnabled: state.multiAgentEnabled,
          })
        );
        return;
      }

      if (attachedFiles.length === 0 && isDetailHandoff(normalizedContent)) {
        await postCommandResponse(
          'Send the details now and I will save them to memory. Include: name, role, appearance, personality, backstory, and goals.'
        );
        return;
      }

      const lastAssistantMessage = [...state.messages]
        .slice()
        .reverse()
        .find((message) => message.role === 'assistant');
      if (isLikelyNicheReply(lastAssistantMessage?.content, normalizedContent)) {
        await setPrimaryNiche(normalizedContent.trim());
        await addNicheDetail(normalizedContent.trim());
      }

      // Detect intent
      const intentStart = Date.now();
      const intent = await detectIntent(normalizedContent, attachedFiles.length > 0);
      emitAgentLatency('intent_detection', Date.now() - intentStart, {
        intent: intent.type,
        hasFiles: attachedFiles.length > 0,
      });
      setState(s => ({ ...s, currentTask: `${intent.type.replace('_', ' ')}...` }));

      const automationStopRequested = AUTOMATION_STOP_PATTERN.test(normalizedContent);
      if (automationStopRequested) {
        await automationEngine.stop();
        setState((s) => ({ ...s, automationEnabled: false }));

        const approvedStopResponse = await enforceGovernorApproval(
          'Background automation is now stopped. Queue remains saved, and nothing else will run until you explicitly start it again.',
          { request: normalizedContent }
        );
        const stopMessage: ChatMessage = {
          id: generateId(),
          role: 'assistant',
          content: approvedStopResponse,
          timestamp: new Date().toISOString(),
        };
        setState((s) => ({
          ...s,
          messages: [...s.messages, stopMessage],
          isThinking: false,
          currentTask: null,
        }));
        await saveChatMessage(stopMessage);
        return;
      }

      const automationStartRequested = AUTOMATION_START_PATTERN.test(normalizedContent);
      if (automationStartRequested) {
        const automationResult = await queueAndStartBackgroundAutomation(normalizedContent);
        const approvedStartResponse = await enforceGovernorApproval(automationResult.response, {
          request: normalizedContent,
        });

        const startMessage: ChatMessage = {
          id: generateId(),
          role: 'assistant',
          content: approvedStartResponse,
          timestamp: new Date().toISOString(),
        };

        setState((s) => ({
          ...s,
          messages: [...s.messages, startMessage],
          isThinking: false,
          currentTask: null,
        }));
        await saveChatMessage(startMessage);
        return;
      }

      // Load brand kit for context
      const brandKit = await loadBrandKit();
      let activeModel = state.currentModel;
      
      // Load persistent memory context
      const memoryContext = await buildMemoryContext();
      
      // Sync brand kit with memory if available
      if (brandKit) {
        await syncWithBrandKit(brandKit);
      }

      // Build context from recent messages
      const recentMessages = state.messages.slice(-10);
      const contextMessages = recentMessages.map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }));

      // Process files if attached
      let fileContext = '';
      if (intent.type === 'read_file' && attachedFiles.length === 0) {
        const missingFileMessage: ChatMessage = {
          id: generateId(),
          role: 'assistant',
          content: 'I do not have any file attached in this message. Please attach the file again, then I will analyze it page by page and stick strictly to what is in the file.',
          timestamp: new Date().toISOString(),
        };
        setState((s) => ({
          ...s,
          messages: [...s.messages, missingFileMessage],
          isThinking: false,
          currentTask: null,
        }));
        await saveChatMessage(missingFileMessage);
        return;
      }

      if (attachedFiles.length > 0) {
        setState(s => ({ ...s, currentTask: 'Analyzing files...' }));
        const fileStart = Date.now();
        fileContext = await processFiles(attachedFiles, intent.type === 'read_file');
        emitAgentLatency('file_processing', Date.now() - fileStart, {
          fileCount: attachedFiles.length,
          contextChars: fileContext.length,
        });
      }

      // Build the full prompt with memory context
      const enabledSkills = await getEnabledAgentSkills();
      const systemPrompt = buildSystemPrompt(brandKit, undefined, memoryContext) + buildAgentSkillContext(enabledSkills);
      let userPrompt = normalizedContent;
      
      if (fileContext) {
        userPrompt = `${normalizedContent}\n\n--- Attached Files ---\n${fileContext}`;
      }
      if (isSceneRequest(normalizedContent)) {
        userPrompt = `${userPrompt}\n\n${UNIVERSAL_SCENE_DIRECTIVE}`;
      }

      if (intent.type === 'create_image') {
        activeModel = await resolveExecutionModel('vision');
        const tracked = await trackGenerationStart({
          source: 'agent',
          taskType: 'create_image',
          idea: normalizedContent,
          platforms: [],
        });
        trackedGenerationId = tracked.record.id;

        setState(s => ({ ...s, currentTask: 'Generating image...' }));
        const imageGenerationStart = Date.now();
        const imageResult = await generateAgentImage(userPrompt, {
          preferredModel: activeModel,
          provider: state.currentImageProvider,
        });
        emitAgentLatency('image_generation', Date.now() - imageGenerationStart, {
          provider: state.currentImageProvider,
          model: activeModel,
        });
        const approvedContent = await enforceGovernorApproval(imageResult.content, {
          brandKit,
          request: normalizedContent,
        });

        const assistantMessage: ChatMessage = {
          id: generateId(),
          role: 'assistant',
          content: approvedContent,
          media: imageResult.media,
          timestamp: new Date().toISOString(),
        };

        setState(s => ({
          ...s,
          messages: [...s.messages, assistantMessage],
          isThinking: false,
          currentTask: null,
        }));

        await saveChatMessage(assistantMessage);
        await trackGenerationSuccess(tracked.record.id, {
          artifactId: assistantMessage.id,
          artifactType: 'draft',
        });
        await extractAndSaveMemory(normalizedContent, approvedContent, intent);
        return;
      }

      if (intent.type === 'regenerate_media') {
        const lastMedia = getLastMediaContext();
        if (!lastMedia) {
          throw new Error('No previous image or video generation was found to regenerate.');
        }

        const regenerationPrompt = `${lastMedia.userRequest}\n\nRegeneration instructions: ${normalizedContent}\n\nPrevious generation prompt:\n${lastMedia.prompt}`;

        if (lastMedia.kind === 'image') {
          activeModel = await resolveExecutionModel('vision');
          const tracked = await trackGenerationStart({
            source: 'agent',
            taskType: 'regenerate_image',
            idea: `${lastMedia.userRequest}\n${normalizedContent}`,
            platforms: [],
          });
          trackedGenerationId = tracked.record.id;

          setState(s => ({ ...s, currentTask: 'Regenerating image...' }));
          const regenerateImageStart = Date.now();
          const imageResult = await generateAgentImage(regenerationPrompt, {
            preferredModel: activeModel,
            provider: state.currentImageProvider,
          });
          emitAgentLatency('image_regeneration', Date.now() - regenerateImageStart, {
            provider: state.currentImageProvider,
            model: activeModel,
          });
          const approvedContent = await enforceGovernorApproval(imageResult.content, {
            brandKit,
            request: normalizedContent,
          });

          const assistantMessage: ChatMessage = {
            id: generateId(),
            role: 'assistant',
            content: approvedContent,
            media: imageResult.media,
            timestamp: new Date().toISOString(),
          };

          setState(s => ({
            ...s,
            messages: [...s.messages, assistantMessage],
            isThinking: false,
            currentTask: null,
          }));

          await saveChatMessage(assistantMessage);
          await trackGenerationSuccess(tracked.record.id, {
            artifactId: assistantMessage.id,
            artifactType: 'draft',
          });
          await extractAndSaveMemory(normalizedContent, approvedContent, intent);
          return;
        }

        activeModel = await resolveExecutionModel('creative');
        const tracked = await trackGenerationStart({
          source: 'agent',
          taskType: 'regenerate_video',
          idea: `${lastMedia.userRequest}\n${normalizedContent}`,
          platforms: [],
        });
        trackedGenerationId = tracked.record.id;

        setState(s => ({ ...s, currentTask: 'Regenerating video...' }));
        const regenerateVideoStart = Date.now();
        const videoResult = await generateAgentVideo(regenerationPrompt, {
          preferredModel: activeModel,
          provider: state.currentVideoProvider,
        });
        emitAgentLatency('video_regeneration', Date.now() - regenerateVideoStart, {
          provider: state.currentVideoProvider,
          model: activeModel,
        });
        const approvedContent = await enforceGovernorApproval(videoResult.content, {
          brandKit,
          request: normalizedContent,
        });

        const assistantMessage: ChatMessage = {
          id: generateId(),
          role: 'assistant',
          content: approvedContent,
          media: videoResult.media,
          timestamp: new Date().toISOString(),
        };

        setState(s => ({
          ...s,
          messages: [...s.messages, assistantMessage],
          isThinking: false,
          currentTask: null,
        }));

        await saveChatMessage(assistantMessage);
        await trackGenerationSuccess(tracked.record.id, {
          artifactId: assistantMessage.id,
          artifactType: 'draft',
        });
        await extractAndSaveMemory(normalizedContent, approvedContent, intent);
        return;
      }

      if (intent.type === 'make_video') {
        activeModel = await resolveExecutionModel('creative');
        const tracked = await trackGenerationStart({
          source: 'agent',
          taskType: 'make_video',
          idea: normalizedContent,
          platforms: [],
        });
        trackedGenerationId = tracked.record.id;

        setState(s => ({ ...s, currentTask: 'Generating video...' }));
        const videoGenerationStart = Date.now();
        const videoResult = await generateAgentVideo(userPrompt, {
          preferredModel: activeModel,
          provider: state.currentVideoProvider,
        });
        emitAgentLatency('video_generation', Date.now() - videoGenerationStart, {
          provider: state.currentVideoProvider,
          model: activeModel,
        });
        const approvedContent = await enforceGovernorApproval(videoResult.content, {
          brandKit,
          request: normalizedContent,
        });

        const assistantMessage: ChatMessage = {
          id: generateId(),
          role: 'assistant',
          content: approvedContent,
          media: videoResult.media,
          timestamp: new Date().toISOString(),
        };

        setState(s => ({
          ...s,
          messages: [...s.messages, assistantMessage],
          isThinking: false,
          currentTask: null,
        }));

        await saveChatMessage(assistantMessage);
        await trackGenerationSuccess(tracked.record.id, {
          artifactId: assistantMessage.id,
          artifactType: 'draft',
        });
        await extractAndSaveMemory(normalizedContent, approvedContent, intent);
        return;
      }

      if (intent.type === 'schedule_post') {
        setState((s) => ({ ...s, currentTask: 'Scheduling content...' }));

        const inlinePayload = extractInlineSchedulePayload(normalizedContent);
        const lastContent = inlinePayload
          ? { text: inlinePayload, mediaUrl: undefined }
          : getLatestSchedulableContent(state.messages);

        if (!lastContent?.text) {
          const missingContentResponse = await enforceGovernorApproval(
            'I could not find a generated post to schedule yet. Share the post text directly or ask me to generate one first, and I will place it in the built-in scheduler.',
            { request: normalizedContent, brandKit }
          );
          const missingContentMessage: ChatMessage = {
            id: generateId(),
            role: 'assistant',
            content: missingContentResponse,
            timestamp: new Date().toISOString(),
          };
          setState((s) => ({
            ...s,
            messages: [...s.messages, missingContentMessage],
            isThinking: false,
            currentTask: null,
          }));
          await saveChatMessage(missingContentMessage);
          return;
        }

        const platforms = await inferPlatformsFromContext(`${normalizedContent}\n${lastContent.text}`);
        let scheduledAt = parseScheduledAtFromMessage(normalizedContent);

        if (!scheduledAt) {
          try {
            const best = await getNextBestTime(platforms[0] || 'instagram');
            scheduledAt = best.date.toISOString();
          } catch {
            scheduledAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
          }
        }

        const tracked = await trackGenerationStart({
          source: 'agent',
          taskType: 'schedule_post',
          idea: lastContent.text.slice(0, 500),
          platforms,
        });
        trackedGenerationId = tracked.record.id;

        const draft = await draftsService.createDraft({
          text: lastContent.text,
          imageUrl: lastContent.mediaUrl,
          platforms,
          contentType: 'scheduled_from_chat',
        });
        await draftsService.updateStatus(draft.id, 'scheduled', scheduledAt);

        const scheduleEntry: ScheduledPost = {
          id: generateId(),
          draftId: draft.id,
          platforms,
          scheduledAt,
          status: 'pending',
        };
        await addToSchedule(scheduleEntry);

        const queueJob = await enqueuePostJob({
          text: lastContent.text,
          platforms,
          mediaUrl: lastContent.mediaUrl,
          scheduledAt,
          generationId: tracked.record.id,
        });

        await updateGenerationMetadata(tracked.record.id, {
          pipelineMode: 'standard',
          assets: {
            image: Boolean(lastContent.mediaUrl),
            video: false,
            voice: false,
            music: false,
          },
        });
        await trackGenerationSuccess(tracked.record.id, {
          artifactId: draft.id,
          artifactType: 'draft',
        });

        const scheduledResponse = await enforceGovernorApproval(
          `Done. I scheduled it in your built-in scheduler for ${new Date(scheduledAt).toLocaleString()} on ${platforms.join(', ')}. Draft ID: ${draft.id}. Queue job: ${queueJob.id}.`,
          { request: normalizedContent, brandKit, platform: platforms[0] }
        );

        const assistantMessage: ChatMessage = {
          id: generateId(),
          role: 'assistant',
          content: scheduledResponse,
          timestamp: new Date().toISOString(),
        };

        setState((s) => ({
          ...s,
          messages: [...s.messages, assistantMessage],
          isThinking: false,
          currentTask: null,
        }));
        await saveChatMessage(assistantMessage);
        await extractAndSaveMemory(normalizedContent, scheduledResponse, intent);
        return;
      }

      if (intent.type === 'generate_content') {
        setState(s => ({ ...s, currentTask: 'Generating content...' }));
        activeModel = await resolveExecutionModel('creative');
        const platforms = await inferPlatformsFromContext(normalizedContent);
        const rewriteSource = REWRITE_REQUEST_PATTERN.test(normalizedContent)
          ? buildRewriteSourceFromHistory(state.messages)
          : null;
        const effectiveIdea = rewriteSource
          ? `${normalizedContent}\n\nRewrite source:\n${rewriteSource}`
          : normalizedContent;
        const tracked = await trackGenerationStart({
          source: 'agent',
          taskType: 'generate_content',
          idea: effectiveIdea,
          platforms,
        });
        trackedGenerationId = tracked.record.id;
        const contentGenerationStart = Date.now();
        const shouldRunUniversalPipeline = wantsUniversalPipeline(normalizedContent);
        let generatedResponse: string;

        if (shouldRunUniversalPipeline) {
          const pipeline = await runUniversalContentPipeline({
            prompt: fileContext ? `${effectiveIdea}\n\nSource material:\n${fileContext}` : effectiveIdea,
            platforms,
            includeImage: true,
            includeVideo: true,
            includeVoice: true,
            includeMusic: true,
            enqueueForPosting: /\b(queue|schedule|post later|autopilot)\b/i.test(normalizedContent),
            generationId: tracked.record.id,
          });

          await updateGenerationMetadata(tracked.record.id, {
            pipelineMode: 'universal',
            niche: pipeline.brandProfile.niche,
            hook: pipeline.content.hook,
            qualityScore: pipeline.criticVerdict.score,
            warnings: pipeline.warnings,
            assets: {
              image: Boolean(pipeline.media.imageUrl),
              video: Boolean(pipeline.media.videoUrl),
              voice: Boolean(pipeline.audio.voiceUrl),
              music: Boolean(pipeline.audio.musicUrl),
            },
          });

          const assets = [
            pipeline.media.imageUrl ? `Image: ${pipeline.media.imageUrl}` : null,
            pipeline.media.videoUrl ? `Video: ${pipeline.media.videoUrl}` : null,
            pipeline.audio.voiceUrl ? `Voice: ${pipeline.audio.voiceUrl}` : null,
            pipeline.audio.musicUrl ? `Music: ${pipeline.audio.musicUrl}` : null,
          ].filter(Boolean);

          const platformSummary = pipeline.platformPackages
            .map((pkg) => `${pkg.platform}: ${pkg.text}`)
            .slice(0, 3)
            .join('\n\n');

          generatedResponse = await enforceGovernorApproval(
            [
              `I ran the full production pipeline for your ${pipeline.brandProfile.niche} niche.`,
              '',
              `Hook: ${pipeline.content.hook}`,
              '',
              `Primary script:\n${pipeline.content.script}`,
              '',
              platformSummary ? `Platform cuts:\n${platformSummary}` : '',
              assets.length > 0 ? `Assets:\n${assets.join('\n')}` : '',
              `Quality score: ${pipeline.criticVerdict.score}${pipeline.criticVerdict.approved ? ' (approved)' : ' (needs revision)'}`,
              pipeline.queueIds.length > 0 ? `Queued jobs: ${pipeline.queueIds.join(', ')}` : '',
            ]
              .filter(Boolean)
              .join('\n\n'),
            {
              platform: platforms[0],
              brandKit,
              request: normalizedContent,
            }
          );
        } else {
          const generated = await generateContent({
            idea: fileContext ? `${effectiveIdea}\n\nSource material:\n${fileContext}` : effectiveIdea,
            platforms,
            customInstructions: [
              'Do the work directly. Return finished, platform-native social content instead of advice about what to create.',
              'Start with a stop-scroll hook and keep it aligned to the locked niche.',
              isSceneRequest(normalizedContent) ? UNIVERSAL_SCENE_DIRECTIVE : '',
            ]
              .filter(Boolean)
              .join('\n'),
          }, brandKit);

          await updateGenerationMetadata(tracked.record.id, {
            pipelineMode: 'standard',
            hook: generated.text.split('\n').find((line) => line.trim())?.trim() || generated.text.slice(0, 120),
            assets: {
              image: Boolean(generated.imageUrl),
              video: false,
              voice: false,
              music: false,
            },
          });

          generatedResponse = await enforceGovernorApproval(
            formatGeneratedContentResponse(generated),
            {
              platform: platforms[0],
              brandKit,
              request: normalizedContent,
            }
          );
        }

        emitAgentLatency('content_generation', Date.now() - contentGenerationStart, {
          platforms: platforms.join(','),
          model: activeModel,
          universalPipeline: shouldRunUniversalPipeline,
        });

        const assistantMessage: ChatMessage = {
          id: generateId(),
          role: 'assistant',
          content: generatedResponse,
          timestamp: new Date().toISOString(),
        };

        setState(s => ({
          ...s,
          messages: [...s.messages, assistantMessage],
          isThinking: false,
          currentTask: null,
        }));

        await saveChatMessage(assistantMessage);
        await trackGenerationSuccess(tracked.record.id, {
          artifactId: assistantMessage.id,
          artifactType: 'draft',
        });
        await extractAndSaveMemory(normalizedContent, generatedResponse, { ...intent, type: 'generate_content' });
        return;
      }

      // Add action instructions based on intent
      if (intent.type === 'read_file') {
        userPrompt += '\n\nAnalyze only the attached file text above. Do not infer missing facts. Do not fabricate themes, rituals, lore, characters, or mechanics that are not explicitly present. Provide: 1) exact extracted facts with page references when available, 2) what is unclear or missing from extraction, 3) optional content opportunities clearly marked as suggestions. Do not generate finished posts unless explicitly requested.';
      } else if (intent.type === 'manage_brand') {
        userPrompt += '\n\nAcknowledge and save this as brand/niche memory. Confirm the locked niche briefly and naturally. Do not generate content unless the user explicitly asks for it.';
      } else if (intent.type === 'answer_question' && intent.params.hasIdeaContext) {
        userPrompt += '\n\nTreat this as setup context unless the user explicitly asks you to generate content. Respond naturally, confirm you have the idea/context, and ask one concise follow-up only if needed.';
      } else if (intent.type === 'answer_question') {
        userPrompt += '\n\nKeep this conversational and natural. For casual chat, reply in 1-2 human sentences and avoid canned assistant lines like "How can I assist you today?" or "If you need anything, let me know." Do not auto-generate posts, scripts, images, or videos unless the user explicitly requests execution.';
        if (isDetailHandoff(normalizedContent)) {
          userPrompt += '\n\nThe user is about to share details. Ask one concise follow-up requesting those details now, then confirm you will save them.';
        }
      }

      activeModel = await resolveExecutionModel(
        intent.type === 'read_file'
          ? 'analysis'
          : intent.type === 'manage_brand'
          ? 'analysis'
          : intent.type === 'answer_question' && normalizedContent.length > 220
          ? 'analysis'
          : 'chat'
      );

      // Call AI
      const chatGenerationStart = Date.now();
      const response = await universalChat(
        [
          { role: 'system', content: systemPrompt },
          ...contextMessages,
          { role: 'user', content: userPrompt },
        ],
        { model: activeModel, brandKit }
      );
      emitAgentLatency('chat_response_generation', Date.now() - chatGenerationStart, {
        model: activeModel,
        intent: intent.type,
      });
      const approvedResponse = await enforceGovernorApproval(response, {
        brandKit,
        request: normalizedContent,
      });

      // Create assistant message
      const assistantMessage: ChatMessage = {
        id: generateId(),
        role: 'assistant',
        content: approvedResponse,
        timestamp: new Date().toISOString(),
      };

      // Update state with response
      setState(s => ({
        ...s,
        messages: [...s.messages, assistantMessage],
        isThinking: false,
        currentTask: null,
      }));

      // Save assistant message
      await saveChatMessage(assistantMessage);
      
      // Extract and save any memory-worthy information from user message and response
      await extractAndSaveMemory(normalizedContent, approvedResponse, intent);

    } catch (error) {
      console.error('Agent error:', error);
      if (trackedGenerationId) {
        try {
          await trackGenerationFailure(
            trackedGenerationId,
            error instanceof Error ? error.message : 'Unexpected generation error'
          );
        } catch (trackingError) {
          console.warn('Failed to track generation failure:', trackingError);
        }
      }

      try {
        const fallback = await buildFailureOutput(
          normalizedContent,
          (error as Error).message,
          await loadBrandKit()
        );
        const approvedFallback = await enforceGovernorApproval(fallback, {
          request: normalizedContent,
        });

        const fallbackMessage: ChatMessage = {
          id: generateId(),
          role: 'assistant',
          content: approvedFallback,
          timestamp: new Date().toISOString(),
        };

        setState(s => ({
          ...s,
          messages: [...s.messages, fallbackMessage],
          isThinking: false,
          currentTask: null,
        }));
        await saveChatMessage(fallbackMessage);
        return;
      } catch (fallbackError) {
        console.error('Fallback chat error:', fallbackError);
      }

      const safeFinal = await enforceGovernorApproval(
        `I kept your request active but hit a transient error. Please retry now.\n\nRequest: ${normalizedContent}`,
        { request: normalizedContent }
      );
      const errorMessage: ChatMessage = {
        id: generateId(),
        role: 'assistant',
        content: safeFinal,
        timestamp: new Date().toISOString(),
      };

      setState(s => ({
        ...s,
        messages: [...s.messages, errorMessage],
        isThinking: false,
        currentTask: null,
      }));
      await saveChatMessage(errorMessage);
    }
  }, [
    buildFailureOutput,
    enforceGovernorApproval,
    getLastMediaContext,
    queueAndStartBackgroundAutomation,
    resolveExecutionModel,
    state.currentModel,
    state.currentImageProvider,
    state.currentVideoProvider,
    state.messages,
    state.pendingFiles,
  ]);

  // Multi-agent system methods
  const toggleMultiAgent = useCallback(() => {
    setState(s => ({ ...s, multiAgentEnabled: !s.multiAgentEnabled }));
  }, []);

  const runOrchestration = useCallback(async (
    request: string,
    type: 'content' | 'strategy' | 'full' = 'content'
  ): Promise<OrchestrationResult | null> => {
    try {
      setState(s => ({ ...s, isThinking: true, currentTask: 'Running multi-agent orchestration...' }));
      
      // Initialize system
      await initializeOrchestrationSystem();
      
      // Run orchestration
      let result = await orchestrate(request, {
        requestType: type,
        preferredModel: state.currentModel,
      });

      if (result.success && result.finalContent.trim()) {
        const brandKit = await loadBrandKit();
        const approvedFinal = await enforceGovernorApproval(result.finalContent, {
          request,
          brandKit,
        });
        if (approvedFinal && approvedFinal.trim()) {
          result = {
            ...result,
            finalContent: approvedFinal.trim(),
            orchestrationPlan: {
              ...result.orchestrationPlan,
              finalOutput: approvedFinal.trim(),
            },
          };
        }
      }
      
      setState(s => ({ 
        ...s, 
        lastOrchestrationResult: result,
        isThinking: false,
        currentTask: null,
      }));
      
      return result;
    } catch (error) {
      console.error('Orchestration error:', error);
      setState(s => ({ ...s, isThinking: false, currentTask: null }));
      return null;
    }
  }, [enforceGovernorApproval, state.currentModel]);

  const getSystemStatus = useCallback(async () => {
    const status = await getOrchestrationStatus();
    const agents = await loadAgents();
    setState(s => ({ ...s, activeAgents: agents.filter(a => a.evolutionState !== 'deprecated') }));
    return status;
  }, []);

  const triggerEvolution = useCallback(async () => {
    setState(s => ({ ...s, currentTask: 'Running agent evolution cycle...' }));
    try {
      await runBackgroundEvolution();
      // Refresh agents after evolution
      const agents = await loadAgents();
      setState(s => ({ 
        ...s, 
        activeAgents: agents.filter(a => a.evolutionState !== 'deprecated'),
        currentTask: null,
      }));
    } catch (error) {
      console.error('Evolution error:', error);
      setState(s => ({ ...s, currentTask: null }));
    }
  }, []);

  return (
    <AgentContext.Provider
      value={{
        ...state,
        openAgent,
        closeAgent,
        toggleAgent,
        sendMessage,
        clearMessages,
        attachFile,
        removeFile,
        clearFiles,
        toggleGodMode,
        runGodMode,
        generateIdeas,
        setModel,
        setImageProvider,
        setVideoProvider,
        toggleAutomation,
        toggleVoiceMode,
        startListening,
        stopListening,
        speakResponse,
        stopSpeaking,
        toggleMultiAgent,
        runOrchestration,
        getSystemStatus,
        triggerEvolution,
      }}
    >
      {children}
    </AgentContext.Provider>
  );
}

export function useAgent() {
  const context = useContext(AgentContext);
  if (!context) {
    throw new Error('useAgent must be used within an AgentProvider');
  }
  return context;
}
