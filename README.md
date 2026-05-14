# NexusAI

A multi-agent AI content generation platform that orchestrates text, images, video, audio, and music production through an intelligent agent system.

## Features

- **Multi-Agent Orchestration**: Routes creative work through specialized agents (planner, identity, rules, structure, generator, visual, distribution, critic)
- **Multi-Media Generation**: Supports text, image, video, voice, and music generation
- **Platform Adapters**: Publish to YouTube, TikTok, Instagram, LinkedIn, Facebook, X (Twitter)
- **Brand Memory**: Maintains consistent brand identity across all generated content
- **Scheduling & Analytics**: Queue posts, monitor engagement, and optimize based on performance
- **Cloud Persistence**: Uses Supabase for data and Puter.js for file storage

## Tech Stack

- **Frontend**: Next.js 16, React 19, TypeScript, Tailwind CSS
- **UI Components**: Radix UI, Shadcn/ui
- **Backend Services**: Supabase, Puter.js
- **AI Providers**: OpenAI, Anthropic, Groq, Gemini (configurable)
- **Media Services**: ElevenLabs, Suno AI, LTX Video (configurable)
- **Automation**: N8N workflows (optional)

## Prerequisites

- Node.js 20.x
- npm or pnpm
- Supabase account (required for authentication)
- At least one AI provider API key

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` with your credentials:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key

# At least one AI provider required
OPENAI_API_KEY=sk-...
# or
ANTHROPIC_API_KEY=sk-ant-...
```

### 3. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Build for production |
| `npm run start` | Start production server |
| `npm run lint` | Run ESLint |
| `npm run lint:fix` | Fix ESLint errors |
| `npm run format` | Format code with Prettier |
| `npm run typecheck` | Run TypeScript type checking |
| `npm test` | Run all unit tests |

## Project Structure

```
nexusai/
├── app/                    # Next.js app router pages
│   ├── api/               # API routes
│   ├── auth/              # Authentication pages
│   ├── dashboard/        # Dashboard pages
│   ├── media-providers/  # Media provider settings
│   └── settings/         # App settings
├── components/            # React components
├── lib/
│   ├── agents/           # Agent implementations
│   ├── context/          # React contexts
│   ├── core/             # Core orchestration engine
│   ├── services/         # Business logic services
│   ├── supabase/         # Supabase utilities
│   ├── types/            # TypeScript types
│   └── utils/            # Utility functions
├── tests/                 # Unit tests
├── docs/                  # Documentation
└── supabase/              # Database migrations
```

## Documentation

- [Deployment Guide](./DEPLOYMENT.md) - Vercel deployment instructions
- [Simplified Setup](./SIMPLIFIED_SETUP.md) - Troubleshooting and alternative setup
- [Agent Skills Sources](./docs/AGENT_SKILLS_SOURCES.md) - How agent capabilities are derived
- [Agent Routing Checkpoint](./docs/agent-routing-checkpoint.md) - Current agent routing architecture

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase anonymous key |
| `OPENAI_API_KEY` | No | OpenAI API key |
| `ANTHROPIC_API_KEY` | No | Anthropic API key |
| `GROQ_API_KEY` | No | Groq API key |
| `GEMINI_API_KEY` | No | Gemini API key |
| `ELEVENLABS_API_KEY` | No | ElevenLabs voice generation |
| `N8N_URL` | No | N8N automation URL |
| `N8N_API_KEY` | No | N8N API key |
| `SHOPIFY_STORE_URL` | No | Shopify store domain (e.g. mystore.myshopify.com) |
| `SHOPIFY_ACCESS_TOKEN` | No | Shopify Admin API access token |
| `ETSY_API_KEY` | No | Etsy API key |
| `MAILCHIMP_API_KEY` | No | Mailchimp API key |
| `MAILCHIMP_LIST_ID` | No | Mailchimp audience list ID |
| `MAILCHIMP_SERVER_PREFIX` | No | Mailchimp server prefix (e.g. us19) |
| `KLAVIYO_API_KEY` | No | Klaviyo API key |
| `CONVERTKIT_API_KEY` | No | ConvertKit API key |
| `AWS_ACCESS_KEY_ID` | No | AWS access key (Amazon SP-API SigV4) |
| `AWS_SECRET_ACCESS_KEY` | No | AWS secret key (Amazon SP-API SigV4) |
| `AWS_REGION` | No | AWS region (defaults to us-east-1) |
| `REPLICATE_API_KEY` | No | Replicate API (3D models, fine-tuning) |
| `KLAVIYO_TEMPLATE_ID` | No | Klaviyo email template ID |
| `KLAVIYO_LIST_ID` | No | Klaviyo audience list ID |
| `SUBSTACK_N8N_WEBHOOK` | No | Substack N8N webhook bridge |
| `NEXT_PUBLIC_COLLAB_MODE` | No | Collaboration mode: auto/supabase/local |
| `REMOTION_API_KEY` | No | Remotion Lambda for cloud video rendering |
| `HUGGINGFACE_API_TOKEN` | No | HuggingFace API (fine-tuning, models) |
| `AMAZON_SP_API_REFRESH_TOKEN` | No | Amazon SP-API OAuth refresh token |
| `AMAZON_SP_API_CLIENT_ID` | No | Amazon SP-API OAuth client ID |
| `AMAZON_SP_API_CLIENT_SECRET` | No | Amazon SP-API OAuth client secret |


The app supports free alternatives for paid services:
- **Voice**: Web Speech API, Azure Cognitive Services (500K chars/mo free)
- **Music**: Beatoven.ai, AIVA, Musicfy

See [docs/FREE_ALTERNATIVES.md](./docs/FREE_ALTERNATIVES.md) for full details.

## Architecture

```
User Input → AgentContext → Specialized Agents → Orchestration Engine
                                                        ↓
                                              Media Services (AI, Video, Audio, Music)
                                                        ↓
                                              Platform Adapters → Publishing
                                                        ↓
                                              Analytics & Monitoring
```

## Contributing

1. Create a feature branch
2. Make changes and add tests
3. Ensure linting and type checking pass
4. Submit a pull request

## License

Private - All rights reserved