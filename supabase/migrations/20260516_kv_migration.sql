-- Missing tables for services currently using Puter KV
-- Migration 20260516

-- ============================================
-- AGENTS (currently stored in Puter KV)
-- ============================================
create table if not exists public.agents (
  id text primary key,
  user_id uuid references auth.users(id) on delete cascade,
  name text not null,
  role text not null,
  capabilities text[] default '{}',
  prompt_template text not null,
  scoring_weights jsonb not null default '{"creativity": 0.25, "relevance": 0.25, "engagement": 0.25, "brandAlignment": 0.25}'::jsonb,
  performance_score integer default 75,
  task_history jsonb default '[]'::jsonb,
  evolution_state text default 'active' check (evolution_state in ('active', 'promoted', 'demoted', 'deprecated', 'hybrid')),
  version integer default 1,
  parent_agents text[],
  created_at timestamptz default timezone('utc'::text, now()) not null,
  updated_at timestamptz default timezone('utc'::text, now()) not null
);

create index if not exists idx_agents_user_id on public.agents(user_id);
create index if not exists idx_agents_role on public.agents(role);
create index if not exists idx_agents_evolution on public.agents(evolution_state);

-- ============================================
-- PODCASTS (currently stored in Puter KV)
-- ============================================
create table if not exists public.podcasts (
  id text primary key,
  user_id uuid references auth.users(id) on delete cascade,
  title text not null,
  description text not null,
  author text not null,
  language text default 'en',
  explicit boolean default false,
  category text,
  image_url text,
  created_at timestamptz default timezone('utc'::text, now()) not null,
  updated_at timestamptz default timezone('utc'::text, now()) not null
);

create index if not exists idx_podcasts_user_id on public.podcasts(user_id);

-- ============================================
-- PODCAST EPISODES (currently stored in Puter KV)
-- ============================================
create table if not exists public.podcast_episodes (
  id text primary key,
  podcast_id text references public.podcasts(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  title text not null,
  description text,
  content text not null,
  voices jsonb not null default '[]'::jsonb,
  duration integer,
  audio_url text,
  status text default 'draft' check (status in ('draft', 'processing', 'published', 'failed')),
  published_at timestamptz,
  created_at timestamptz default timezone('utc'::text, now()) not null,
  updated_at timestamptz default timezone('utc'::text, now()) not null
);

create index if not exists idx_episodes_podcast on public.podcast_episodes(podcast_id);
create index if not exists idx_episodes_user on public.podcast_episodes(user_id);
create index if not exists idx_episodes_status on public.podcast_episodes(status);

-- ============================================
-- NEWSLETTERS (currently no persistence)
-- ============================================
create table if not exists public.newsletters (
  id text primary key,
  user_id uuid references auth.users(id) on delete cascade,
  title text not null,
  content text not null,
  plain_text text,
  html_content text,
  audience text,
  platform text not null check (platform in ('mailchimp', 'klaviyo', 'convertkit')),
  status text default 'draft' check (status in ('draft', 'scheduled', 'sent', 'failed')),
  campaign_id text,
  scheduled_at timestamptz,
  sent_at timestamptz,
  stats jsonb default '{}'::jsonb,
  created_at timestamptz default timezone('utc'::text, now()) not null,
  updated_at timestamptz default timezone('utc'::text, now()) not null
);

create index if not exists idx_newsletters_user on public.newsletters(user_id);
create index if not exists idx_newsletters_status on public.newsletters(status);
create index if not exists idx_newsletters_platform on public.newsletters(platform);

-- ============================================
-- COMPETITORS (currently stored in Puter KV)
-- ============================================
create table if not exists public.competitors (
  id text primary key,
  user_id uuid references auth.users(id) on delete cascade,
  name text not null,
  handles jsonb not null default '{}'::jsonb,
  website text,
  description text,
  last_analyzed timestamptz,
  created_at timestamptz default timezone('utc'::text, now()) not null,
  updated_at timestamptz default timezone('utc'::text, now()) not null
);

create index if not exists idx_competitors_user on public.competitors(user_id);

-- ============================================
-- COMPETITOR ANALYSES
-- ============================================
create table if not exists public.competitor_analyses (
  id uuid primary key default gen_random_uuid(),
  competitor_id text references public.competitors(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  platform text not null,
  analyzed_at timestamptz default timezone('utc'::text, now()) not null,
  metrics jsonb default '{}'::jsonb,
  strengths text[] default '{}',
  weaknesses text[] default '{}',
  opportunities text[] default '{}',
  content_strategy text
);

create index if not exists idx_competitor_analyses_competitor on public.competitor_analyses(competitor_id);
create index if not exists idx_competitor_analyses_user on public.competitor_analyses(user_id);

-- ============================================
-- COMPETITOR POSTS
-- ============================================
create table if not exists public.competitor_posts (
  id uuid primary key default gen_random_uuid(),
  competitor_id text references public.competitors(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  platform text not null,
  content text,
  url text,
  posted_at timestamptz,
  metrics jsonb default '{}'::jsonb,
  created_at timestamptz default timezone('utc'::text, now()) not null
);

create index if not exists idx_competitor_posts_competitor on public.competitor_posts(competitor_id);
create index if not exists idx_competitor_posts_posted on public.competitor_posts(posted_at);

-- ============================================
-- INFLUENCERS (currently stored in Puter KV)
-- ============================================
create table if not exists public.influencers (
  id text primary key,
  user_id uuid references auth.users(id) on delete cascade,
  name text not null,
  platform text not null,
  handle text not null,
  followers integer default 0,
  engagement_rate numeric default 0,
  niche text[] default '{}',
  contact_email text,
  status text default 'prospect' check (status in ('prospect', 'contacted', 'negotiating', 'active', 'completed', 'rejected')),
  notes text,
  campaigns text[] default '{}',
  created_at timestamptz default timezone('utc'::text, now()) not null,
  updated_at timestamptz default timezone('utc'::text, now()) not null
);

create index if not exists idx_influencers_user on public.influencers(user_id);
create index if not exists idx_influencers_status on public.influencers(status);

-- ============================================
-- INFLUENCER CAMPAIGNS
-- ============================================
create table if not exists public.influencer_campaigns (
  id text primary key,
  user_id uuid references auth.users(id) on delete cascade,
  name text not null,
  influencers text[] default '{}',
  budget numeric default 0,
  start_date timestamptz,
  end_date timestamptz,
  status text default 'planning' check (status in ('planning', 'active', 'completed', 'cancelled')),
  deliverables text[] default '{}',
  metrics jsonb default '{"impressions": 0, "clicks": 0, "conversions": 0, "revenue": 0}'::jsonb,
  created_at timestamptz default timezone('utc'::text, now()) not null,
  updated_at timestamptz default timezone('utc'::text, now()) not null
);

create index if not exists idx_influencer_campaigns_user on public.influencer_campaigns(user_id);
create index if not exists idx_influencer_campaigns_status on public.influencer_campaigns(status);

-- ============================================
-- SOCIAL LISTENING QUERIES (currently stored in Puter KV)
-- ============================================
create table if not exists public.listening_queries (
  id text primary key,
  user_id uuid references auth.users(id) on delete cascade,
  query text not null,
  platforms text[] default '{}',
  sentiment_filter text default 'all' check (sentiment_filter in ('all', 'positive', 'negative', 'neutral')),
  is_active boolean default true,
  mention_count integer default 0,
  last_checked timestamptz,
  created_at timestamptz default timezone('utc'::text, now()) not null,
  updated_at timestamptz default timezone('utc'::text, now()) not null
);

create index if not exists idx_listening_queries_user on public.listening_queries(user_id);
create index if not exists idx_listening_queries_active on public.listening_queries(is_active);

-- ============================================
-- SOCIAL MENTIONS
-- ============================================
create table if not exists public.social_mentions (
  id text primary key,
  user_id uuid references auth.users(id) on delete cascade,
  query_id text references public.listening_queries(id) on delete cascade,
  platform text not null,
  author text not null,
  content text not null,
  url text not null,
  sentiment text default 'neutral' check (sentiment in ('positive', 'negative', 'neutral')),
  engagement jsonb default '{"likes": 0, "shares": 0, "comments": 0}'::jsonb,
  keywords text[] default '{}',
  created_at timestamptz default timezone('utc'::text, now()) not null
);

create index if not exists idx_social_mentions_user on public.social_mentions(user_id);
create index if not exists idx_social_mentions_query on public.social_mentions(query_id);
create index if not exists idx_social_mentions_sentiment on public.social_mentions(sentiment);

-- ============================================
-- TEAMS (new)
-- ============================================
create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  owner_id uuid references auth.users(id) on delete cascade,
  settings jsonb default '{}'::jsonb,
  created_at timestamptz default timezone('utc'::text, now()) not null,
  updated_at timestamptz default timezone('utc'::text, now()) not null
);

create index if not exists idx_teams_owner on public.teams(owner_id);

-- ============================================
-- TEAM MEMBERS
-- ============================================
create table if not exists public.team_members (
  id uuid primary key default gen_random_uuid(),
  team_id uuid references public.teams(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  email text not null,
  role text not null default 'viewer' check (role in ('owner', 'admin', 'editor', 'viewer')),
  status text default 'invited' check (status in ('invited', 'active', 'removed')),
  invited_at timestamptz default timezone('utc'::text, now()) not null,
  joined_at timestamptz,
  unique(team_id, user_id)
);

create index if not exists idx_team_members_team on public.team_members(team_id);
create index if not exists idx_team_members_user on public.team_members(user_id);
create index if not exists idx_team_members_status on public.team_members(status);

-- ============================================
-- TRIGGERS
-- ============================================
create trigger agents_set_updated_at before update on public.agents
  for each row execute function set_updated_at();

create trigger podcasts_set_updated_at before update on public.podcasts
  for each row execute function set_updated_at();

create trigger podcast_episodes_set_updated_at before update on public.podcast_episodes
  for each row execute function set_updated_at();

create trigger newsletters_set_updated_at before update on public.newsletters
  for each row execute function set_updated_at();

create trigger competitors_set_updated_at before update on public.competitors
  for each row execute function set_updated_at();

create trigger influencers_set_updated_at before update on public.influencers
  for each row execute function set_updated_at();

create trigger influencer_campaigns_set_updated_at before update on public.influencer_campaigns
  for each row execute function set_updated_at();

create trigger listening_queries_set_updated_at before update on public.listening_queries
  for each row execute function set_updated_at();

create trigger teams_set_updated_at before update on public.teams
  for each row execute function set_updated_at();

-- ============================================
-- RLS POLICIES
-- ============================================
alter table public.agents enable row level security;
alter table public.podcasts enable row level security;
alter table public.podcast_episodes enable row level security;
alter table public.newsletters enable row level security;
alter table public.competitors enable row level security;
alter table public.competitor_analyses enable row level security;
alter table public.competitor_posts enable row level security;
alter table public.influencers enable row level security;
alter table public.influencer_campaigns enable row level security;
alter table public.listening_queries enable row level security;
alter table public.social_mentions enable row level security;
alter table public.teams enable row level security;
alter table public.team_members enable row level security;

create policy "Users can manage own agents" on public.agents for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users can manage own podcasts" on public.podcasts for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users can manage own podcast episodes" on public.podcast_episodes for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users can manage own newsletters" on public.newsletters for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users can manage own competitors" on public.competitors for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users can manage own competitor analyses" on public.competitor_analyses for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users can manage own competitor posts" on public.competitor_posts for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users can manage own influencers" on public.influencers for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users can manage own influencer campaigns" on public.influencer_campaigns for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users can manage own listening queries" on public.listening_queries for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users can manage own social mentions" on public.social_mentions for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Team owners can manage teams" on public.teams for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy "Team members can view teams they belong to" on public.teams for select using (
  exists (select 1 from public.team_members where team_id = teams.id and user_id = auth.uid() and status = 'active')
);
create policy "Team members can view team members" on public.team_members for select using (
  exists (select 1 from public.team_members tm where tm.team_id = team_members.team_id and tm.user_id = auth.uid() and tm.status = 'active')
);
create policy "Team admins can manage team members" on public.team_members for all using (
  exists (select 1 from public.team_members tm where tm.team_id = team_members.team_id and tm.user_id = auth.uid() and tm.role in ('owner', 'admin') and tm.status = 'active')
);
