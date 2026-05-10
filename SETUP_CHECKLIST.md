# NexusAI Setup Verification Checklist

Use this checklist to verify your local environment is properly configured.

## Prerequisites

- [ ] Node.js 20.x installed (`node --version` should return v20.x)
- [ ] npm or pnpm installed (`npm --version` or `pnpm --version`)

## Installation

- [ ] Run `npm install` successfully
- [ ] No peer dependency warnings or errors

## Environment Configuration

- [ ] Copy `.env.example` to `.env`
- [ ] Set `NEXT_PUBLIC_SUPABASE_URL` (required)
- [ ] Set `NEXT_PUBLIC_SUPABASE_ANON_KEY` (required)
- [ ] At least one AI provider configured:
  - [ ] `OPENAI_API_KEY` OR
  - [ ] `ANTHROPIC_API_KEY` OR
  - [ ] `GROQ_API_KEY` OR
  - [ ] `GEMINI_API_KEY`
- [ ] Optional: Media providers
  - [ ] `ELEVENLABS_API_KEY`
  - [ ] `SUNO_API_KEY`

## Type Checking

- [ ] Run `npm run typecheck` - should complete without errors

## Linting

- [ ] Run `npm run lint` - should pass without critical errors

## Build Test

- [ ] Run `npm run build` - should complete successfully

## Testing

- [ ] Run `npm test` - all tests should pass
- [ ] Individual test suites:
  - [ ] `npm run test:agent`
  - [ ] `npm run test:orchestration`
  - [ ] `npm run test:nexus-core-integration`
  - [ ] `npm run test:ai-routing`

## Application Launch

- [ ] Run `npm run dev`
- [ ] Access http://localhost:3000
- [ ] No console errors on load
- [ ] Authentication flow works (login/signup)
- [ ] Can access dashboard

## Optional: Media Providers

If using media generation:

- [ ] Configure at least one voice provider (ElevenLabs, Azure, Web Speech API)
- [ ] Configure at least one music provider (Suno AI, Beatoven, Musicfy)
- [ ] Test voice generation
- [ ] Test music generation

## Troubleshooting

### Node version mismatch
```bash
# Use nvm to switch to correct version
nvm install 20
nvm use 20
```

### TypeScript errors
```bash
# Clear cache and retry
rm -rf node_modules/.cache
npm run typecheck
```

### Build fails
```bash
# Check for circular imports or missing dependencies
npm run lint
npm run typecheck
```

### Tests fail
```bash
# Run individual test to debug
npm run test:agent
```

### Authentication not working
- Verify Supabase URL and key are correct
- Check browser console for CORS errors
- Ensure Supabase project is not paused

## Verification Complete

Once all items are checked, your environment is ready for development!

## Quick Verification Command

Run this single command to verify most items:
```bash
npm run lint && npm run typecheck && npm test
```

For full build verification:
```bash
npm run lint && npm run typecheck && npm run build
```