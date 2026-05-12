-- CRM tables for customer and segment management
create table if not exists public.crm_customers (
  id text primary key,
  user_id uuid references auth.users(id) on delete cascade,
  email text not null,
  name text not null,
  source text,
  tags text[] default '{}',
  lifecycle_stage text default 'lead' check (lifecycle_stage in ('lead', 'prospect', 'customer', 'advocate')),
  score integer default 0,
  notes text,
  last_contact timestamptz,
  created_at timestamptz default timezone('utc'::text, now()) not null,
  updated_at timestamptz default timezone('utc'::text, now()) not null
);

create table if not exists public.crm_segments (
  id text primary key,
  user_id uuid references auth.users(id) on delete cascade,
  name text not null,
  customer_count integer default 0,
  engagement_score integer default 0,
  created_at timestamptz default timezone('utc'::text, now()) not null,
  updated_at timestamptz default timezone('utc'::text, now()) not null
);

create table if not exists public.crm_interactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  customer_id text references public.crm_customers(id) on delete cascade,
  content_id text not null,
  content_title text,
  action text not null check (action in ('view', 'like', 'comment', 'share', 'click')),
  created_at timestamptz default timezone('utc'::text, now()) not null
);

create index if not exists idx_crm_customers_user on public.crm_customers(user_id);
create index if not exists idx_crm_customers_email on public.crm_customers(email);
create index if not exists idx_crm_customers_stage on public.crm_customers(lifecycle_stage);
create index if not exists idx_crm_segments_user on public.crm_segments(user_id);
create index if not exists idx_crm_interactions_customer on public.crm_interactions(customer_id);
create index if not exists idx_crm_interactions_user on public.crm_interactions(user_id);

-- Enable RLS
alter table public.crm_customers enable row level security;
alter table public.crm_segments enable row level security;
alter table public.crm_interactions enable row level security;

-- RLS policies
create policy "Users can view own customers"
  on public.crm_customers for select
  using (auth.uid() = user_id);

create policy "Users can insert own customers"
  on public.crm_customers for insert
  with check (auth.uid() = user_id);

create policy "Users can update own customers"
  on public.crm_customers for update
  using (auth.uid() = user_id);

create policy "Users can view own segments"
  on public.crm_segments for select
  using (auth.uid() = user_id);

create policy "Users can insert own segments"
  on public.crm_segments for insert
  with check (auth.uid() = user_id);

create policy "Users can update own segments"
  on public.crm_segments for update
  using (auth.uid() = user_id);

create policy "Users can view own interactions"
  on public.crm_interactions for select
  using (auth.uid() = user_id);

create policy "Users can insert own interactions"
  on public.crm_interactions for insert
  with check (auth.uid() = user_id);
