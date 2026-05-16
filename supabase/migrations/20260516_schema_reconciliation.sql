-- Schema Reconciliation Migration
-- Resolves all duplicate table conflicts, adds missing tables, fixes RLS gaps
-- Migration 20260516

-- ============================================================
-- 1. FIX: evolution_logs status CHECK constraint conflict
-- 00001 has CHECK (status IN ('pending', 'applied', 'failed'))
-- 20260504 has CHECK (status IN ('proposed', 'applied', 'rolled_back'))
-- Unified: support all values from both migrations
-- ============================================================
ALTER TABLE evolution_logs DROP CONSTRAINT IF EXISTS evolution_logs_status_check;
ALTER TABLE evolution_logs ADD CONSTRAINT evolution_logs_status_check
  CHECK (status IN ('pending', 'proposed', 'applied', 'rolled_back', 'failed'));

-- ============================================================
-- 2. FIX: rate_limits table conflict
-- 00002 creates rate_limits with BIGSERIAL PK, TEXT user_id
-- 20260513 creates rate_limits with UUID PK, UUID user_id
-- Resolution: keep the newer 20260513 schema, migrate old data
-- ============================================================
-- If the old 00002 table exists (BIGSERIAL PK), rename it and create the new one
DO $$
DECLARE
  col_type TEXT;
BEGIN
  -- Check if rate_limits has the old BIGSERIAL id column
  SELECT data_type INTO col_type
  FROM information_schema.columns
  WHERE table_name = 'rate_limits' AND column_name = 'id';

  IF col_type = 'bigint' THEN
    -- Old schema exists: rename it
    ALTER TABLE rate_limits RENAME TO rate_limits_legacy;

    -- Create the new table with UUID PK
    CREATE TABLE rate_limits (
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

    CREATE INDEX idx_rate_limits_user_type ON rate_limits(user_id, job_type);
    CREATE INDEX idx_rate_limits_window ON rate_limits(user_id, job_type, window_start);
    ALTER TABLE rate_limits ADD CONSTRAINT rate_limits_unique_user_job UNIQUE (user_id, job_type);

    -- Migrate old data: convert TEXT user_id to UUID where possible
    INSERT INTO rate_limits (user_id, job_type, request_count, window_start, created_at)
    SELECT
      NULL::uuid, -- old TEXT user_ids can't be converted without auth.users mapping
      job_type,
      request_count,
      window_start,
      created_at
    FROM rate_limits_legacy
    WHERE request_count > 0;

    DROP TABLE rate_limits_legacy;
  END IF;
END $$;

-- Ensure the updated_at trigger exists for rate_limits
DROP TRIGGER IF EXISTS rate_limits_set_updated_at ON rate_limits;
CREATE TRIGGER rate_limits_set_updated_at
  BEFORE UPDATE ON rate_limits
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- 3. FIX: drafts table conflict
-- 00001/20260424: social-post drafts with workspace_id, versions, platforms
-- 20260512: collaboration drafts with title, content, owner_id
-- Resolution: keep the original drafts table for content, rename collaboration one
-- ============================================================
DO $$
DECLARE
  has_title_col BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'drafts' AND column_name = 'title'
  ) INTO has_title_col;

  IF has_title_col THEN
    -- The 20260512 migration ran and changed the schema
    -- Rename to collaboration_drafts and recreate the original schema
    ALTER TABLE drafts RENAME TO collaboration_drafts;

    -- Recreate the original drafts table
    CREATE TABLE drafts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      versions JSONB NOT NULL DEFAULT '[]'::jsonb,
      current_version INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'scheduled', 'published', 'failed')),
      platforms JSONB NOT NULL DEFAULT '[]'::jsonb,
      content_type TEXT,
      scheduled_at TIMESTAMPTZ,
      published_at TIMESTAMPTZ,
      publish_results JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX idx_drafts_workspace_id ON drafts(workspace_id);
    CREATE INDEX idx_drafts_user_id ON drafts(user_id);
    CREATE INDEX idx_drafts_status ON drafts(status);
    CREATE INDEX drafts_user_id_updated_idx ON drafts(user_id, updated_at DESC);

    ALTER TABLE drafts ENABLE ROW LEVEL SECURITY;
    CREATE POLICY user_drafts ON drafts FOR ALL
      USING (user_id = auth.uid()::text)
      WITH CHECK (user_id = auth.uid()::text);

    DROP TRIGGER IF EXISTS drafts_set_updated_at ON drafts;
    CREATE TRIGGER drafts_set_updated_at BEFORE UPDATE ON drafts
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END $$;

-- Enable realtime on collaboration_drafts if it exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'collaboration_drafts') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE collaboration_drafts;
  END IF;
END $$;

-- ============================================================
-- 4. FIX: customers vs crm_customers conflict
-- 00001 creates 'customers' with TEXT user_id, JSONB tags
-- 20260511 creates 'crm_customers' with UUID user_id, text[] tags
-- Resolution: rename old customers to customers_legacy
-- ============================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'customers') THEN
    ALTER TABLE customers RENAME TO customers_legacy;
    -- Keep the old table for data preservation but remove RLS to avoid conflicts
    ALTER TABLE customers_legacy DISABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS user_customers ON customers_legacy;
  END IF;
END $$;

-- ============================================================
-- 5. FIX: crm_segments conflict
-- 00001 creates crm_segments with customer_ids JSONB
-- 20260511 creates crm_segments with customer_count, engagement_score
-- Resolution: if old schema exists, migrate to new schema
-- ============================================================
DO $$
DECLARE
  has_customer_ids BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'crm_segments' AND column_name = 'customer_ids'
  ) INTO has_customer_ids;

  IF has_customer_ids THEN
    -- Old schema: add new columns and migrate
    ALTER TABLE crm_segments ADD COLUMN IF NOT EXISTS customer_count INTEGER DEFAULT 0;
    ALTER TABLE crm_segments ADD COLUMN IF NOT EXISTS engagement_score INTEGER DEFAULT 0;

    -- Migrate customer_ids JSONB to customer_count
    UPDATE crm_segments
    SET customer_count = jsonb_array_length(customer_ids)
    WHERE customer_ids IS NOT NULL AND customer_ids != '[]'::jsonb;

    -- Drop the old column
    ALTER TABLE crm_segments DROP COLUMN IF EXISTS customer_ids;
  END IF;
END $$;

-- ============================================================
-- 6. FIX: approval_queue missing user_id in 20260504
-- 00001 adds user_id, 20260504 doesn't include it
-- Resolution: ensure user_id exists
-- ============================================================
ALTER TABLE approval_queue ADD COLUMN IF NOT EXISTS user_id TEXT NOT NULL DEFAULT '';

-- ============================================================
-- 7. FIX: orchestration_plans missing user_id in 20260504
-- Same issue as approval_queue
-- ============================================================
ALTER TABLE orchestration_plans ADD COLUMN IF NOT EXISTS user_id TEXT NOT NULL DEFAULT '';

-- ============================================================
-- 8. FIX: system_configs duplicate (harmless with IF NOT EXISTS, but ensure trigger)
-- ============================================================
DROP TRIGGER IF EXISTS update_system_configs_updated_at ON system_configs;
CREATE TRIGGER update_system_configs_updated_at BEFORE UPDATE ON system_configs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- 9. FIX: workspaces user_id UNIQUE conflict
-- 00001: user_id TEXT NOT NULL (allows multiple)
-- 20260424: user_id TEXT NOT NULL UNIQUE (one per user)
-- Resolution: remove UNIQUE constraint to allow multiple workspaces
-- ============================================================
DO $$
DECLARE
  constraint_name TEXT;
BEGIN
  -- Find and drop any UNIQUE constraint on workspaces.user_id
  SELECT conname INTO constraint_name
  FROM pg_constraint
  WHERE conrelid = 'workspaces'::regclass
    AND contype = 'u'
    AND conkey = ARRAY(SELECT attnum FROM pg_attribute WHERE attrelid = 'workspaces'::regclass AND attname = 'user_id');

  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE workspaces DROP CONSTRAINT %I', constraint_name);
  END IF;
END $$;

-- ============================================================
-- 10. FIX: brand_kits and chat_threads user_id UNIQUE conflict
-- Same as workspaces
-- ============================================================
DO $$
DECLARE
  constraint_name TEXT;
BEGIN
  SELECT conname INTO constraint_name
  FROM pg_constraint
  WHERE conrelid = 'brand_kits'::regclass
    AND contype = 'u'
    AND conkey = ARRAY(SELECT attnum FROM pg_attribute WHERE attrelid = 'brand_kits'::regclass AND attname = 'user_id');

  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE brand_kits DROP CONSTRAINT %I', constraint_name);
  END IF;

  SELECT conname INTO constraint_name
  FROM pg_constraint
  WHERE conrelid = 'chat_threads'::regclass
    AND contype = 'u'
    AND conkey = ARRAY(SELECT attnum FROM pg_attribute WHERE attrelid = 'chat_threads'::regclass AND attname = 'user_id');

  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE chat_threads DROP CONSTRAINT %I', constraint_name);
  END IF;

  SELECT conname INTO constraint_name
  FROM pg_constraint
  WHERE conrelid = 'app_settings'::regclass
    AND contype = 'u'
    AND conkey = ARRAY(SELECT attnum FROM pg_attribute WHERE attrelid = 'app_settings'::regclass AND attname = 'user_id');

  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE app_settings DROP CONSTRAINT %I', constraint_name);
  END IF;

  SELECT conname INTO constraint_name
  FROM pg_constraint
  WHERE conrelid = 'user_state'::regclass
    AND contype = 'u'
    AND conkey = ARRAY(SELECT attnum FROM pg_attribute WHERE attrelid = 'user_state'::regclass AND attname = 'user_id');

  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE user_state DROP CONSTRAINT %I', constraint_name);
  END IF;
END $$;

-- ============================================================
-- 11. ADD MISSING TABLES
-- ============================================================

-- audit_log table (referenced in lib/utils/audit.ts)
CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  resource_type TEXT,
  resource_id TEXT,
  old_value JSONB,
  new_value JSONB,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_log_user_id ON audit_log(user_id);
CREATE INDEX idx_audit_log_action ON audit_log(action);
CREATE INDEX idx_audit_log_created ON audit_log(created_at);
CREATE INDEX idx_audit_log_resource ON audit_log(resource_type, resource_id);

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own audit logs" ON audit_log
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Service role can manage audit logs" ON audit_log
  FOR ALL USING (auth.role() = 'service_role');

-- teams table (referenced in lib/services/teamService.ts)
CREATE TABLE IF NOT EXISTS teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_teams_owner_id ON teams(owner_id);

ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Team owners can manage their teams" ON teams
  FOR ALL USING (auth.uid() = owner_id);
CREATE POLICY "Team members can view teams they belong to" ON teams
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM team_members WHERE team_members.team_id = teams.id
      AND team_members.user_id = auth.uid()
    )
  );

-- team_members table (referenced in lib/services/teamService.ts)
CREATE TABLE IF NOT EXISTS team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member', 'viewer')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(team_id, user_id)
);

CREATE INDEX idx_team_members_team_id ON team_members(team_id);
CREATE INDEX idx_team_members_user_id ON team_members(user_id);

ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Team members can view team membership" ON team_members
  FOR SELECT USING (
    auth.uid() = user_id OR
    EXISTS (
      SELECT 1 FROM team_members tm WHERE tm.team_id = team_members.team_id
      AND tm.user_id = auth.uid()
    )
  );
CREATE POLICY "Team admins can manage team membership" ON team_members
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM team_members tm WHERE tm.team_id = team_members.team_id
      AND tm.user_id = auth.uid() AND tm.role IN ('owner', 'admin')
    )
  );

-- sso_providers table (referenced in lib/services/ssoService.ts)
CREATE TABLE IF NOT EXISTS sso_providers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  provider_type TEXT NOT NULL CHECK (provider_type IN ('saml', 'oidc', 'oauth2')),
  enabled BOOLEAN NOT NULL DEFAULT false,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sso_providers_enabled ON sso_providers(enabled);

ALTER TABLE sso_providers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can view enabled SSO providers" ON sso_providers
  FOR SELECT USING (enabled = true);
CREATE POLICY "Service role can manage SSO providers" ON sso_providers
  FOR ALL USING (auth.role() = 'service_role');

-- ============================================================
-- 12. FIX: RLS policy gaps
-- ============================================================

-- system_jobs: add RLS (was missing entirely)
ALTER TABLE system_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own jobs" ON system_jobs
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create their own jobs" ON system_jobs
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Service role can manage all jobs" ON system_jobs
  FOR ALL USING (auth.role() = 'service_role');

-- rate_limits: add RLS (was missing in 20260513)
ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own rate limits" ON rate_limits
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Service role can manage rate limits" ON rate_limits
  FOR ALL USING (auth.role() = 'service_role');

-- user_active_jobs: add RLS (was missing)
ALTER TABLE user_active_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own active jobs" ON user_active_jobs
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Service role can manage active jobs" ON user_active_jobs
  FOR ALL USING (auth.role() = 'service_role');

-- Fix overly permissive stripe_webhook_events policy
DROP POLICY IF EXISTS "Service role can manage webhook events" ON stripe_webhook_events;
CREATE POLICY "Service role can manage webhook events" ON stripe_webhook_events
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- Fix overly permissive subscriptions policy
DROP POLICY IF EXISTS "Service role can manage all subscriptions" ON subscriptions;
CREATE POLICY "Service role can manage all subscriptions" ON subscriptions
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- Add missing INSERT/UPDATE policies for agent tables
-- content_performance
DROP POLICY IF EXISTS "Users can view their own content performance" ON content_performance;
CREATE POLICY "Users can view their own content performance" ON content_performance
  FOR SELECT USING (agent_id = auth.uid()::text);
CREATE POLICY "Agents can insert content performance" ON content_performance
  FOR INSERT WITH CHECK (agent_id = auth.uid()::text);
CREATE POLICY "Agents can update content performance" ON content_performance
  FOR UPDATE USING (agent_id = auth.uid()::text);

-- performance_insights
DROP POLICY IF EXISTS "Users can view their own insights" ON performance_insights;
CREATE POLICY "Users can view their own insights" ON performance_insights
  FOR SELECT USING (agent_id = auth.uid()::text);
CREATE POLICY "Agents can insert insights" ON performance_insights
  FOR INSERT WITH CHECK (agent_id = auth.uid()::text);

-- agent_action_logs
DROP POLICY IF EXISTS "Users can view their own agent logs" ON agent_action_logs;
CREATE POLICY "Users can view their own agent logs" ON agent_action_logs
  FOR SELECT USING (agent_id = auth.uid()::text);
CREATE POLICY "Agents can insert action logs" ON agent_action_logs
  FOR INSERT WITH CHECK (agent_id = auth.uid()::text);

-- crm_segments: add missing DELETE policy
CREATE POLICY "Users can delete own segments" ON crm_segments
  FOR DELETE USING (auth.uid() = user_id);

-- crm_interactions: add missing UPDATE and DELETE policies
CREATE POLICY "Users can update own interactions" ON crm_interactions
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own interactions" ON crm_interactions
  FOR DELETE USING (auth.uid() = user_id);

-- approval_queue: fix conflicting policies (remove org-wide SELECT, keep user-scoped)
DROP POLICY IF EXISTS "Authenticated users can view approval queue" ON approval_queue;
CREATE POLICY "Users can manage their own approval queue" ON approval_queue
  FOR ALL USING (user_id = auth.uid()::text) WITH CHECK (user_id = auth.uid()::text);

-- system_configs: fix conflicting policies (remove anonymous read)
DROP POLICY IF EXISTS public_read_system_configs ON system_configs;
CREATE POLICY "Authenticated users can read system configs" ON system_configs
  FOR SELECT USING (auth.role() = 'authenticated');

-- ============================================================
-- 13. FIX: Malformed CREATE INDEX in vector memory migration
-- The original had: create index if not exists on public.agent_vector_memory
-- Missing index name. This migration adds the properly named index.
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_agent_vector_memory_embedding
  ON public.agent_vector_memory USING hnsw (embedding vector_cosine_ops);

-- ============================================================
-- 14. FIX: Add updated_at triggers for new tables
-- ============================================================
CREATE TRIGGER audit_log_set_updated_at BEFORE UPDATE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER teams_set_updated_at BEFORE UPDATE ON teams
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER sso_providers_set_updated_at BEFORE UPDATE ON sso_providers
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
