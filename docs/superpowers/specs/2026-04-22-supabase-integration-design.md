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

---

## Data Architecture

### Database: Supabase Postgres

**Hosting:** Supabase Cloud (or self-hosted)

**Row-Level Security (RLS):** All tables enforce `user_id` scoping so users only see their own data.

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

### Storage: Supabase Storage

**Buckets:**
- `media` — user-uploaded images, avatars
- `generated` — AI-generated content images

**RLS:** bucket + object policies scoped to `user_id`

### Realtime (optional, phase 2)
- Live sync across devices when user is logged in from multiple places
- Subscribe to workspace changes in components
- Skip for initial deployment

---

## Migration Order

1. `workspaces` — foundational
2. `brand_kits` — referenced by agents and drafts
3. `agent_configs` — depends on brand kits
4. `drafts` — core creation loop
5. `autopilot_configs` — needs agents and drafts
6. `invites` — needs workspace structure
7. `trend_data` — independent, can be added last

---

## Supabase Client Layer

**Pattern:** Server-side per-request in Route Handlers

```
Route Handler (app/api/...)
  → Validate Clerk session token
  → Extract user_id
  → Create Supabase admin client
  → Query with user_id + workspace_id filter
  → Return response
```

**Why:** Keeps auth (Clerk) and data (Supabase) cleanly separated, RLS enforced on the server, no client-side Supabase key exposure.

**Client location:** `lib/supabase/server.ts` — creates a Supabase admin client per request using the Clerk JWT as an auth token.

---

## Vercel Deployment

- **Frontend + API:** Vercel (Next.js 16 App Router)
- **Database:** Supabase Cloud
- **Auth:** Clerk (Vercel Marketplace integration available)

**Environment variables needed:**
```
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=...
CLERK_SECRET_KEY=...
CLERK_WEBHOOK_SECRET=...
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
```

**Deployment steps:**
1. Create Supabase project, run migration SQL
2. Create Clerk application
3. Connect Vercel project to both
4. Deploy

---

## What's NOT in scope for this migration

- Clerk auth implementation (handled separately)
- Analytics events pipeline (keep as-is initially)
- Media file uploads (Storage bucket created but wired later)
- Realtime subscriptions (phase 2)

---

## Open Questions

- Does `agent_memory_logs` need its own table or is it part of `agent_configs.memory` JSONB? → Use JSONB inside `agent_configs` for simplicity
- Should `trend_data` be mutable or append-only? → Append-only with periodic refresh
