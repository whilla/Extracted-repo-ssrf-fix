-- Queue Improvements Migration
-- Adds progress tracking, cancellation, per-user concurrency, and claim_next_job RPC

-- Add progress tracking column
alter table system_jobs
add column if not exists progress jsonb null default null;

-- Add cancellation support
alter table system_jobs
drop constraint if exists system_jobs_status_check;
alter table system_jobs
add constraint system_jobs_status_check
  check (status in ('pending', 'processing', 'completed', 'failed', 'cancelled'));

-- Add next_attempt_at for retry scheduling
alter table system_jobs
add column if not exists next_attempt_at timestamptz null;

-- Create the claim_next_job RPC (missing from original migration)
create or replace function claim_next_job()
returns setof system_jobs
language plpgsql
security definer
as $$
declare
  job_record system_jobs%rowtype;
begin
  select * into job_record
  from system_jobs
  where status = 'pending'
    and (next_attempt_at is null or next_attempt_at <= now())
  order by priority desc, created_at asc
  limit 1
  for update skip locked;

  if not found then
    return;
  end if;

  update system_jobs
  set status = 'processing',
      started_at = now(),
      updated_at = now()
  where id = job_record.id;

  return query select * from system_jobs where id = job_record.id;
end;
$$;

-- Add scheduled_at for delayed jobs
alter table system_jobs
add column if not exists scheduled_at timestamptz null;

-- Per-user rate limiting table
create table if not exists rate_limits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  job_type text not null,
  window_start timestamptz not null default now(),
  request_count integer not null default 0,
  max_requests integer not null default 10,
  window_seconds integer not null default 60,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_rate_limits_user_type
  on rate_limits(user_id, job_type);

alter table rate_limits add constraint rate_limits_unique_user_job unique (user_id, job_type);

create index if not exists idx_rate_limits_window
  on rate_limits(user_id, job_type, window_start);

create trigger rate_limits_set_updated_at
before update on rate_limits
for each row execute function set_updated_at();

-- Per-user active job tracking for concurrency limits
create table if not exists user_active_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  job_id uuid not null references system_jobs(id) on delete cascade,
  job_type text not null,
  started_at timestamptz not null default now(),
  unique(user_id, job_id)
);

create index if not exists idx_user_active_jobs_user
  on user_active_jobs(user_id, job_type);

-- RPC: cancel a running job
create or replace function cancel_job(job_id uuid)
returns boolean
language plpgsql
security definer
as $$
declare
  job_record system_jobs%rowtype;
begin
  select * into job_record
  from system_jobs
  where id = job_id and status = 'processing'
  for update;

  if not found then
    return false;
  end if;

  update system_jobs
  set status = 'cancelled',
      updated_at = now()
  where id = job_id;

  delete from user_active_jobs where job_id = cancel_job.job_id;

  return true;
end;
$$;

-- RPC: check rate limit for a user + job type
create or replace function check_rate_limit(
  p_user_id uuid,
  p_job_type text,
  p_max_requests integer default 10,
  p_window_seconds integer default 60
)
returns boolean
language plpgsql
security definer
as $$
declare
  current_count integer;
begin
  delete from rate_limits
  where user_id = p_user_id
    and job_type = p_job_type
    and window_start < now() - (p_window_seconds || ' seconds')::interval;

  insert into rate_limits (user_id, job_type, max_requests, window_seconds)
  values (p_user_id, p_job_type, p_max_requests, p_window_seconds)
  on conflict do nothing;

  select request_count into current_count
  from rate_limits
  where user_id = p_user_id and job_type = p_job_type;

  if current_count >= p_max_requests then
    return false;
  end if;

  update rate_limits
  set request_count = request_count + 1
  where user_id = p_user_id and job_type = p_job_type;

  return true;
end;
$$;

-- RPC: get user's active job count
create or replace function get_active_job_count(
  p_user_id uuid,
  p_job_type text default null
)
returns integer
language plpgsql
security definer
as $$
declare
  job_count integer;
begin
  if p_job_type is null then
    select count(*) into job_count
    from system_jobs
    where user_id = p_user_id and status = 'processing';
  else
    select count(*) into job_count
    from system_jobs
    where user_id = p_user_id
      and job_type = p_job_type
      and status = 'processing';
  end if;
  return job_count;
end;
$$;

-- Index for efficient job claiming
create index if not exists idx_jobs_claim
  on system_jobs(status, priority desc, created_at asc)
  where status = 'pending';
