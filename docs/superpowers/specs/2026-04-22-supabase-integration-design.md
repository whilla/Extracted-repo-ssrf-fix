# Supabase Integration Design — 2026-04-22

## Context

This project (NexusAI) is a Next.js 16 social media/content management application currently running locally. The goal is to:
1. Add Supabase as the data persistence layer
2. Keep authentication separate (Clerk handles user sessions)
3. Deploy the full stack to Vercel

The app has a multi-agent content generation system with Governor Mode, brand kits, agent configs, drafts, autopilot, analytics, and team features.

---

## Authentication

**Provider:** Clerk
- Handles user accounts, sessions, OAuth flows
- Exposes `user_id` (Clerk's `user.id`) used to scope all Supabase data
- Route Handlers validate Clerk session tokens server-side before Supabase queries

**Flow:**
1. User visits app → Clerk handles login/session
2. Clerk JWT passed to Next.js Route Handlers via `Authorization: Bearer <token>`
3. Route Handler verifies token with Clerk, extracts `user_id`
4. Supabase queries use `user_id` + `workspace_id` with RLS policies

**GDPR / User Deletion:**
- Clerk webhook (`POST /api/webhooks/clerk`) handles `user.deleted` events
- On receipt, deletes all Supabase rows matching the `user_id` (cascades via FK)
- Webhook secret verified before processing: `CLERK_WEBHOOK_SECRET`

---

## Data Architecture

### Database: Supabase Postgres

**Hosting:** Supabase Cloud

**Migrations:** Managed via Supabase CLI in `supabase/migrations/` — version-controlled, pushed to Supabase on deploy via CI (`supabase db push`).

**Row-Level Security (RLS):** All tables enforce `user_id` scoping so users only see their own data.

**JSONB Validation:** Each JSONB column has a corresponding Zod schema in `lib/supabase/schemas/` that validates data before insert/update. Prevents bad data from entering the DB.

### Tables

#### 1. `workspaces`
| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| user_id | text | Clerk user.id, indexed |
| name | text | |
| created_at | timestamptz | |
| updated_at | timestamptz | |

RLS: user_id = current user's Clerk id

#### 2. `brand_kits`
| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| workspace_id | uuid | FK → workspaces.id |
| user_id | text | Clerk user.id |
| name | text | |
| data | jsonb | Full BrandKit object |
| created_at | timestamptz | |
| updated_at | timestamptz | |

RLS: user_id = current user, workspace_id must belong to user
Validation: `BrandKitSchema` (Zod)

#### 3. `agent_configs`
| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| workspace_id | uuid | FK → workspaces.id |
| user_id | text | Clerk user.id |
| name | text | |
| type | text | agent type |
| config | jsonb | Full agent config |
| memory | jsonb | Agent memory log |
| performance_score | number | |
| created_at | timestamptz | |
| updated_at | timestamptz | |

RLS: user_id = current user
Validation: `AgentConfigSchema` (Zod)

#### 4. `drafts`
| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| workspace_id | uuid | FK → workspaces.id |
| user_id | text | Clerk user.id |
| name | text | |
| versions | jsonb | Array of DraftVersion |
| current_version | number | |
| status | text | draft/approved/scheduled/published/failed |
| platforms | jsonb | Array of Platform |
| content_type | text | |
| scheduled_at | timestamptz | nullable |
| published_at | timestamptz | nullable |
| publish_results | jsonb | |
| created_at | timestamptz | |
| updated_at | timestamptz | |

RLS: user_id = current user
Validation: `DraftSchema` (Zod)

#### 5. `autopilot_configs`
| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| workspace_id | uuid | FK → workspaces.id |
| user_id | text | Clerk user.id |
| name | text | |
| rules | jsonb | Automation rules |
| enabled | boolean | |
| created_at | timestamptz | |
| updated_at | timestamptz | |

RLS: user_id = current user

#### 6. `invites`
| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| workspace_id | uuid | FK → workspaces.id |
| user_id | text | Clerk user.id (inviter) |
| email | text | Invite target email |
| role | text | admin/editor/viewer |
| status | text | pending/accepted/declined |
| created_at | timestamptz | |
| expires_at | timestamptz | |

RLS: user_id = current user (inviter)

#### 7. `trend_data`
| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| workspace_id | uuid | FK → workspaces.id |
| user_id | text | Clerk user.id |
| source | text | |
| data | jsonb | Trend/competitor data |
| fetched_at | timestamptz | |

RLS: user_id = current user
Note: Append-only, refreshed periodically

### Storage: Supabase Storage

**Buckets:**
- `media` — user-uploaded images, avatars
- `generated` — AI-generated content images

**RLS:** bucket + object policies scoped to `user_id`

### Realtime (phase 2)
- Live sync across devices — skip for initial deployment

---

## Agent State Persistence

**Problem:** The multi-agent orchestrator + Governor Mode run in-process. Vercel serverless functions reset state on every cold start (or between invocations on the free tier).

**Solution:** Hybrid approach using Vercel Fluid Compute + Supabase

1. **Agent sessions table** (`agent_sessions`):
| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| workspace_id | uuid | FK |
| user_id | text | |
| agent_id | text | |
| state | jsonb | Serialized agent state + Governor context |
| created_at | timestamptz | |
| updated_at | timestamptz | |
| expires_at | timestamptz | Session TTL (e.g. 30 min) |

2. **Fluid Compute for active agents:** Use Vercel Fluid Compute (Node.js, not Edge) so function instances are reused across concurrent requests within a session window. Agent state stays warm in memory during the session.

3. **Serialization fallback:** On every significant agent action (after each generation cycle), serialize `Governor.state + agent memory` to `agent_sessions.state` in Supabase. If a cold start occurs mid-session, restore from this row.

4. **Workflow:**
   - New request → check `agent_sessions` for active session → deserialize or create new
   - After each generation → serialize to Supabase
   - Governor Mode evaluates `expires_at` to decide whether to resume or start fresh

---

## Scheduled Posts Queue

**Problem:** Posts scheduled for future publishing need a worker process.

**Solution:** Vercel Cron + Supabase queue

1. **`scheduled_posts` table** (extends `drafts`):
| Column | Type | Notes |
|---|---|---|
| id | uuid | Same as drafts.id |
| run_at | timestamptz | When to publish |
| status | text | pending/processing/published/failed |
| attempts | number | Retry count |
| last_error | text | |

2. **Cron endpoint:** `POST /api/cron/publish-scheduled`
   - Runs every minute via Vercel Cron: `* * * * *`
   - Protected by `CRON_SECRET` header verification
   - Queries `scheduled_posts` where `run_at <= now() AND status = 'pending'`
   - Processes each with exponential backoff (max 3 attempts)

3. **Status updates:** After publish attempt, update `drafts.status` + `scheduled_posts.status + last_error`

---

## Email Deliverability

**Provider:** Resend (Vercel-native, easy setup)

**Why Resend:** Next.js 16 compatible, React Email templates, Vercel integration.

**Transactional emails needed:**
- Invite emails (workspace collaboration)
- Post-published notifications
- Error alerts from Governor Mode

**Route:** `POST /api/email/send` — sends email via Resend API, rate-limited per user.

**Environment variable:**
```
RESEND_API_KEY=...
```

---

## Supabase Client Layer

**Pattern:** Server-side per-request in Route Handlers

```
Route Handler (app/api/...)
  → Validate Clerk session token
  → Extract user_id
  → Create Supabase admin client
  → Validate input with Zod schema (if applicable)
  → Query with user_id + workspace_id filter
  → Return response
```

**Client location:** `lib/supabase/server.ts` — creates a Supabase admin client per request.

**Schema location:** `lib/supabase/schemas/` — one Zod schema per table with JSONB columns.

---

## Migration Order

1. `workspaces` — foundational
2. `brand_kits` — referenced by agents and drafts
3. `agent_configs` — depends on brand kits
4. `drafts` — core creation loop
5. `agent_sessions` — for persistent agent state
6. `scheduled_posts` — extends drafts for cron
7. `autopilot_configs` — needs agents and drafts
8. `invites` — needs workspace structure
9. `trend_data` — independent, added last

---

## Vercel Deployment

- **Frontend + API:** Vercel (Next.js 16 App Router, Fluid Compute)
- **Database:** Supabase Cloud
- **Auth:** Clerk (Vercel Marketplace integration)
- **Email:** Resend
- **Cron:** Vercel Cron

**Environment variables:**
```
# Clerk
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=...
CLERK_SECRET_KEY=...
CLERK_WEBHOOK_SECRET=...

# Supabase
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...

# Resend
RESEND_API_KEY=...

# Cron
CRON_SECRET=...
```

**Deployment steps:**
1. Create Supabase project
2. Link repo to Supabase CLI, push migrations from `supabase/migrations/`
3. Create Clerk application
4. Set up Resend API key
5. Connect Vercel project, add all env vars
6. Deploy

---

## What's NOT in scope for this migration

- Clerk auth UI implementation (handled separately)
- Analytics events pipeline (keep as-is initially)
- Media file uploads to Supabase Storage (bucket created, wired later)
- Realtime subscriptions (phase 2)

---

## Open Questions (all resolved)

- `agent_memory_logs` → JSONB inside `agent_configs.memory` for simplicity
- `trend_data` → Append-only with periodic refresh
- All 6 deployment concerns → addressed in spec above
