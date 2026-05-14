# NexusAI Architecture Overview

## System Overview

NexusAI is a multi-agent content generation platform that orchestrates AI-powered content creation across multiple media types (text, images, video, audio, music) through a specialized agent system.

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Client (Next.js)                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐    │
│  │   Auth UI    │    │   Dashboard  │    │ Settings UI  │    │
│  └──────────────┘    └──────────────┘    └──────────────┘    │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                    AgentContext (React)                    │  │
│  │  ┌─────────────────────────────────────────────────────┐  │  │
│  │  │           MultiAgentService (Orchestration)        │  │  │
│  │  │                                                      │  │  │
│  │  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐  │  │  │
│  │  │  │ Planner │ │ Identity│ │  Rules  │ │Structure│  │  │  │
│  │  │  └─────────┘ └─────────┘ └─────────┘ └─────────┘  │  │  │
│  │  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐  │  │  │
│  │  │  │Generator│ │ Visual  │ │Distribut.│ │ Critic  │  │  │  │
│  │  │  └─────────┘ └─────────┘ └─────────┘ └─────────┘  │  │  │
│  │  └─────────────────────────────────────────────────────┘  │  │
│  └──────────────────────────────────────────────────────────┘  │
│                              │                                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                   Media Generation Layer                   │   │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌─────────┐ │   │
│  │  │  Image   │  │  Video   │  │  Audio   │  │  Music  │ │   │
│  │  │Generator │  │Generator │  │Generator │  │Generator│ │   │
│  │  └──────────┘  └──────────┘  └──────────┘  └─────────┘ │   │
│  └──────────────────────────────────────────────────────────┘   │
│                              │                                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                    External Services                      │   │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌─────────┐ │   │
│  │  │  OpenAI  │  │Anthropic │  │   Groq   │  │  Gemini │ │   │
│  │  │  Claude  │  │ElevenLabs│  │ Suno AI  │  │   LTX   │ │   │
│  │  └──────────┘  └──────────┘  └──────────┘  └─────────┘ │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Cloud Infrastructure                          │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐     │
│  │   Supabase   │    │  Puter.js    │    │     N8N      │     │
│  │  (Database)  │    │   (Storage)  │    │ (Automation) │     │
│  └──────────────┘    └──────────────┘    └──────────────┘     │
└─────────────────────────────────────────────────────────────────┘
```

## Core Components

### 1. Agent System (`lib/agents/`)

The multi-agent system consists of specialized roles:

| Agent | Purpose |
|-------|---------|
| **Planner** | Analyzes requirements and creates execution plan |
| **Identity** | Establishes brand voice and visual identity |
| **Rules** | Defines content guidelines and constraints |
| **Structure** | Organizes content format and flow |
| **Generator** | Produces the main content (text, scripts) |
| **Visual** | Creates visual prompts for media generation |
| **Distribution** | Formats content for specific platforms |
| **Critic** | Reviews and scores content, suggests improvements |

### 2. Orchestration Engine (`lib/core/NexusCore.ts`)

The orchestration engine coordinates agents:
- Initializes agent pool
- Routes requests to appropriate agents
- Collects and merges outputs
- Handles fallback and retry logic

### 3. Context Management (`lib/context/AgentContext.tsx`)

React context providing:
- Agent state management
- Message handling and normalization
- Intent detection (media generation, brainstorming, etc.)
- Fallback strategies

### 4. Media Services (`lib/services/`)

| Service | Description |
|---------|-------------|
| `aiService.ts` | AI provider routing and delegation |
| `imageGenerationService.ts` | Image generation via DALL-E, Stable Diffusion |
| `videoGenerationService.ts` | Video generation via LTX, Replicate |
| `musicGenerationService.ts` | Music generation via Suno AI |
| `musicEngine.ts` | Music mood analysis and generation |
| `audioMixingService.ts` | Audio post-production and mixing |

### 5. Platform Adapters (`lib/services/nativeProviders.ts` + `lib/services/directPublishService.ts`)

Handles publishing to social, blogging, and e-commerce platforms:
- YouTube, TikTok, Instagram, LinkedIn, Facebook, X (Twitter), Threads, Pinterest, Twitch
- WordPress, Medium, Ghost, Substack
- Discord, Reddit, WhatsApp, Telegram, Snapchat
- Shopify, Etsy, Amazon
- Mailchimp, Klaviyo, ConvertKit

## Data Flow

### Content Generation Flow

```
User Input
    │
    ▼
AgentContext (intent detection)
    │
    ▼
MultiAgentService (orchestration)
    │
    ├──► Planner Agent ──────► Execution Plan
    │
    ├──► Identity Agent ─────► Brand Guidelines
    │
    ├──► Rules Agent ───────► Content Rules
    │
    ├──► Structure Agent ───► Content Format
    │
    ├──► Generator Agent ───► Primary Content
    │
    ├──► Visual Agent ───────► Visual Prompts
    │
    ├──► Distribution Agent ► Platform Formats
    │
    └──► Critic Agent ───────► Review & Score
            │
            ▼
    Orchestration Engine (merge outputs)
            │
            ▼
    Media Generation (if needed)
            │
            ▼
    Platform Publishing
            │
            ▼
    Analytics & Monitoring
```

## API Structure

### Public API Routes (`app/api/`)

| Endpoint | Purpose |
|----------|---------|
| `/api/chat` | Main chat/agent interaction |
| `/api/generate/image` | Image generation |
| `/api/generate/video` | Video generation |
| `/api/generate/audio` | Voice synthesis |
| `/api/generate/music` | Music creation |
| `/api/publish` | Content publishing |

### Internal Services

- `uploadWorkerService.ts` - Background publishing
- `monitorRetryService.ts` - Retry and monitoring
- `analyticsService.ts` - Engagement tracking

## State Management

### Client State (React)
- AgentContext - Agent state and messages
- AuthContext - User authentication
- ThemeContext - UI theming

### Server State
- Supabase - User data, brand profiles, content history
- Puter.js - File storage (generated media)
- In-memory - Session state, generation tracking

## Security

### Content Security Policy (next.config.mjs)
- Strict CSP headers configured
- Allowlisted domains for AI services
- Protected against XSS and injection

### Authentication
- Supabase Auth (email/password, social)
- Row-level security (RLS) in Supabase
- API key protection in environment

## Deployment

### Environments
1. **Development** - Local `npm run dev`
2. **Preview** - PR preview deployments via GitHub Actions
3. **Staging** - Pre-production via Vercel
4. **Production** - Main branch via GitHub Actions

### Infrastructure
- **Frontend**: Vercel (Next.js)
- **Database**: Supabase (PostgreSQL)
- **Storage**: Puter.js (S3-compatible)
- **Automation**: N8N (optional)

## Key Files Reference

| Path | Purpose |
|------|---------|
| `lib/core/NexusCore.ts` | Main orchestration engine |
| `lib/context/AgentContext.tsx` | React agent context |
| `lib/services/multiAgentService.ts` | Agent coordination |
| `lib/agents/SpecializedAgents.ts` | Agent implementations |
| `lib/services/agentMediaService.ts` | Media generation routing |
| `lib/services/uploadWorkerService.ts` | Publishing worker |
| `lib/services/analyticsService.ts` | Analytics tracking |