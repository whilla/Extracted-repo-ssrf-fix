-- SUPABASE SCHEMA CONSOLIDATION
-- This file replaces all fragmented migrations.

-- Extensions
create extension if not exists pgcrypto;
create extension if not exists vector;

-- 1. Core Infrastructure
create table if not exists workspaces (
  id uuid primary key default gen_random_uuid(),
  user_id text not null unique,
  name text not null default 'Personal Workspace',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists user_profiles (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  user_id text not null unique,
  onboarding_complete boolean not null default false,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2. Content & Brand
create table if not exists brand_kits (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  user_id text not null unique,
  name text not null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists drafts (
  id text primary key,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  user_id text not null,
  name text not null,
  versions jsonb not null default '[]'::jsonb,
  current_version integer not null default 1,
  status text not null default 'draft',
  platforms jsonb not null default '[]'::jsonb,
  content_type text null,
  scheduled_at timestamptz null,
  published_at timestamptz null,
  publish_results jsonb null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists drafts_user_id_updated_idx on drafts(user_id, updated_at desc);

-- 3. AI & Orchestration
create table if not exists generations (
  id text primary key,
  user_id text not null,
  workspace_id uuid references workspaces(id) on delete cascade,
  model text not null,
  prompt text,
  result text,
  error_message text,
  media_urls jsonb default '[]'::jsonb,
  token_usage jsonb default '{}'::jsonb,
  estimated_cost_cents integer,
  status text not null default 'pending', -- 'pending' | 'streaming' | 'complete' | 'error'
  task_type text,
  platform text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_generations_user_id on generations(user_id);
create index if not exists idx_generations_created_at on generations(created_at desc);

create table if not exists autonomous_plans (
  id uuid primary key default gen_random_uuid(),
  agent_id text not null, -- Workspace ID or User ID
  goal text not null,
  description text,
  status text default 'active', -- 'active', 'completed', 'paused', 'archived'
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists plan_steps (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid references autonomous_plans(id) on delete cascade,
  step_order int not null,
  description text not null,
  action_type text, -- 'research', 'generate', 'post', 'analyze'
  status text default 'pending', -- 'pending', 'in_progress', 'completed', 'failed'
  dependencies text[],
  result_summary text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists agent_action_logs (
  id uuid primary key default gen_random_uuid(),
  agent_id text not null,
  plan_id uuid references autonomous_plans(id) on delete cascade,
  step_id uuid references plan_steps(id) on delete cascade,
  status text not null, -- 'thinking', 'acting', 'completed', 'failed', 'waiting'
  message text not null,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- 4. Memory & Intelligence
create table if not exists agent_vector_memory (
  id uuid primary key default gen_random_uuid(),
  agent_id text not null,
  content text not null,
  embedding vector(1536),
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_vector_memory_hnsw on agent_vector_memory 
using hnsw (embedding vector_cosine_ops);

create table if not exists performance_insights (
  id uuid primary key default gen_random_uuid(),
  agent_id text not null,
  insight text not null,
  confidence float default 0.5,
  evidence_post_ids text[],
  category text, -- 'hook', 'editing', 'topic', 'hashtag'
  created_at timestamptz not null default now()
);

-- 5. Publishing & Feedback
create table if not exists social_posts (
  id uuid primary key default gen_random_uuid(),
  agent_id text not null,
  plan_id uuid references autonomous_plans(id) on delete cascade,
  platform text not null,
  external_post_id text,
  video_url text not null,
  caption text,
  status text default 'pending',
  live_url text,
  error_message text,
  refined_from_rejection boolean default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists content_performance (
  id uuid primary key default gen_random_uuid(),
  post_id text not null,
  agent_id text not null,
  platform text not null,
  content_type text,
  metrics jsonb default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique(post_id, platform)
);

create table if not exists approval_queue (
  id uuid primary key default gen_random_uuid(),
  content text not null,
  metadata jsonb not null default '{}'::jsonb,
  status text not null default 'pending',
  decision_reason text null,
  rejection_reason text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 6. System & Meta
create table if not exists system_configs (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists evolution_logs (
  id uuid primary key default gen_random_uuid(),
  version text not null,
  change_type text not null,
  description text not null,
  diff jsonb null,
  status text not null default 'applied',
  created_at timestamptz not null default now()
);

-- Triggers for updated_at
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger workspaces_set_updated_at before update on workspaces for each row execute function set_updated_at();
create trigger user_profiles_set_updated_at before update on user_profiles for each row execute function set_updated_at();
create trigger brand_kits_set_updated_at before update on brand_kits for each row execute function set_updated_at();
create trigger drafts_set_updated_at before update on drafts for each row execute function set_updated_at();
create trigger autonomous_plans_set_updated_at before update on autonomous_plans for each row execute function set_updated_at();
create trigger plan_steps_set_updated_at before update on plan_steps for each row execute function set_updated_at();
create trigger social_posts_set_updated_at before update on social_posts for each row execute function set_updated_at();
create trigger approval_queue_set_updated_at before update on approval_queue for each row execute function set_updated_at();

-- Similarity Search Function
create or replace function match_agent_memories (
  query_embedding vector(1536),
  filter_agent_id text,
  match_threshold float,
  match_count int
)
returns table (
  id uuid,
  agent_id text,
  content text,
  metadata jsonb,
  similarity float
)
language plpgsql
as $$
begin
  return query
  select
    m.id,
    m.agent_id,
    m.content,
    m.metadata,
    1 - (m.embedding <=> query_embedding) as similarity
  from agent_vector_memory m
  where m.agent_id = filter_agent_id
    and 1 - (m.embedding <=> query_embedding) > match_threshold
  order by m.embedding <=> query_embedding
  limit match_count;
end;
$$;

-- RLS Policies
alter table workspaces enable row level security;
create policy "Users manage own workspaces" on workspaces for all using (auth.uid() = user_id);

alter table user_profiles enable row level security;
create policy "Users manage own profiles" on user_profiles for all using (auth.uid() = user_id);

alter table brand_kits enable row level security;
create policy "Users manage own brand kits" on brand_kits for all using (auth.uid() = user_id);

alter table drafts enable row level security;
create policy "Users manage own drafts" on drafts for all using (auth.uid() = user_id);

alter table autonomous_plans enable row level security;
create policy "Users manage own plans" on autonomous_plans for all using (autonomous_plans.agent_id = auth.uid());

alter table plan_steps enable row level security;
create policy "Users view own plan steps" on plan_steps for all using (
  exists (select 1 from autonomous_plans where autonomous_plans.id = plan_steps.plan_id and autonomous_plans.agent_id = auth.uid())
);

alter table agent_action_logs enable row level security;
create policy "Users view own logs" on agent_action_logs for select using (agent_id = auth.uid());

alter table agent_vector_memory enable row level security;
create policy "Users manage own memory" on agent_vector_memory for all using (agent_id = auth.uid());

alter table social_posts enable row level security;
create policy "Users manage own posts" on social_posts for all using (agent_id = auth.uid());

alter table content_performance enable row level security;
create policy "Users view own performance" on content_performance for select using (agent_id = auth.uid());

alter table approval_queue enable row level security;
create policy "Authenticated users view queue" on approval_queue for select using (auth.role() = 'authenticated');

alter table system_configs enable row level security;
create policy "Authenticated users read configs" on system_configs for select using (auth.role() = 'authenticated');

alter table evolution_logs enable row level security;
create policy "Authenticated users read evolution" on evolution_logs for select using (auth.role() = 'authenticated');
