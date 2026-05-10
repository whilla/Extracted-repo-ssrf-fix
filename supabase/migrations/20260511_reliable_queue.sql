-- Reliable Job Queue Migration
create table if not exists system_jobs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  job_type text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'processing', 'completed', 'failed')),
  priority integer not null default 2 check (priority between 0 and 3),
  attempts integer not null default 0 check (attempts >= 0),
  max_attempts integer not null default 3 check (max_attempts > 0),
  error_message text null,
  result jsonb null,
  created_at timestamptz not null default now(),
  started_at timestamptz null,
  completed_at timestamptz null,
  updated_at timestamptz not null default now(),
  check (attempts <= max_attempts)
);

create index if not exists idx_jobs_status_priority on system_jobs(status, priority, created_at);
create index if not exists idx_jobs_user_id on system_jobs(user_id);

-- Trigger for updated_at
create trigger system_jobs_set_updated_at 
before update on system_jobs 
for each row execute function set_updated_at();
