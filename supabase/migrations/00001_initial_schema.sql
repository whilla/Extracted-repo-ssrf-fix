-- NexusAI Initial Schema
-- Migration 00001

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- WORKSPACES
-- ============================================
CREATE TABLE IF NOT EXISTS workspaces (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT 'Personal Workspace',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workspaces_user_id ON workspaces(user_id);

-- ============================================
-- DRAFTS
-- ============================================
CREATE TABLE IF NOT EXISTS drafts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
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

CREATE INDEX IF NOT EXISTS idx_drafts_workspace_id ON drafts(workspace_id);
CREATE INDEX IF NOT EXISTS idx_drafts_user_id ON drafts(user_id);
CREATE INDEX IF NOT EXISTS idx_drafts_status ON drafts(status);

-- ============================================
-- BRAND KITS
-- ============================================
CREATE TABLE IF NOT EXISTS brand_kits (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_brand_kits_workspace_id ON brand_kits(workspace_id);
CREATE INDEX IF NOT EXISTS idx_brand_kits_user_id ON brand_kits(user_id);

-- ============================================
-- CHAT THREADS
-- ============================================
CREATE TABLE IF NOT EXISTS chat_threads (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  data JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_threads_workspace_id ON chat_threads(workspace_id);
CREATE INDEX IF NOT EXISTS idx_chat_threads_user_id ON chat_threads(user_id);

-- ============================================
-- SYSTEM CONFIGS
-- ============================================
CREATE TABLE IF NOT EXISTS system_configs (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- EVOLUTION LOGS
-- ============================================
CREATE TABLE IF NOT EXISTS evolution_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  version TEXT NOT NULL,
  change_type TEXT NOT NULL,
  description TEXT NOT NULL,
  diff JSONB,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'applied', 'failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_evolution_logs_version ON evolution_logs(version);

-- ============================================
-- APPROVAL QUEUE
-- ============================================
CREATE TABLE IF NOT EXISTS approval_queue (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  content TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  decision_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_approval_queue_status ON approval_queue(status);

-- ============================================
-- ORCHESTRATION PLANS
-- ============================================
CREATE TABLE IF NOT EXISTS orchestration_plans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_request TEXT NOT NULL,
  plan_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  final_output TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_orchestration_plans_status ON orchestration_plans(status);

ALTER TABLE approval_queue ADD COLUMN IF NOT EXISTS user_id TEXT NOT NULL DEFAULT '';
ALTER TABLE orchestration_plans ADD COLUMN IF NOT EXISTS user_id TEXT NOT NULL DEFAULT '';

-- ============================================
-- CUSTOMERS (CRM)
-- ============================================
CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  source TEXT,
  tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  engagement_history JSONB NOT NULL DEFAULT '[]'::jsonb,
  lifecycle_stage TEXT NOT NULL DEFAULT 'lead' CHECK (lifecycle_stage IN ('lead', 'prospect', 'customer', 'advocate')),
  score INTEGER NOT NULL DEFAULT 0,
  last_contact TIMESTAMPTZ,
  notes TEXT,
  user_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customers_user_id ON customers(user_id);
CREATE INDEX IF NOT EXISTS idx_customers_lifecycle_stage ON customers(lifecycle_stage);

-- ============================================
-- CRM SEGMENTS
-- ============================================
CREATE TABLE IF NOT EXISTS crm_segments (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  customer_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  user_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_segments_user_id ON crm_segments(user_id);

-- ============================================
-- RLS POLICIES
-- ============================================
ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE brand_kits ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_segments ENABLE ROW LEVEL SECURITY;
ALTER TABLE approval_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE orchestration_plans ENABLE ROW LEVEL SECURITY;

-- User-scoped policies
CREATE POLICY user_workspaces ON workspaces FOR ALL USING (user_id = auth.uid()::text) WITH CHECK (user_id = auth.uid()::text);
CREATE POLICY user_drafts ON drafts FOR ALL USING (user_id = auth.uid()::text) WITH CHECK (user_id = auth.uid()::text);
CREATE POLICY user_brand_kits ON brand_kits FOR ALL USING (user_id = auth.uid()::text) WITH CHECK (user_id = auth.uid()::text);
CREATE POLICY user_chat_threads ON chat_threads FOR ALL USING (user_id = auth.uid()::text) WITH CHECK (user_id = auth.uid()::text);
CREATE POLICY user_customers ON customers FOR ALL USING (user_id = auth.uid()::text) WITH CHECK (user_id = auth.uid()::text);
CREATE POLICY user_crm_segments ON crm_segments FOR ALL USING (user_id = auth.uid()::text) WITH CHECK (user_id = auth.uid()::text);
CREATE POLICY user_approval_queue ON approval_queue FOR ALL USING (user_id = auth.uid()::text) WITH CHECK (user_id = auth.uid()::text);
CREATE POLICY user_orchestration_plans ON orchestration_plans FOR ALL USING (user_id = auth.uid()::text) WITH CHECK (user_id = auth.uid()::text);

-- Public read for system configs
CREATE POLICY public_read_system_configs ON system_configs FOR SELECT USING (true);

-- Insert trigger for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_workspaces_updated_at BEFORE UPDATE ON workspaces
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_drafts_updated_at BEFORE UPDATE ON drafts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_brand_kits_updated_at BEFORE UPDATE ON brand_kits
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_chat_threads_updated_at BEFORE UPDATE ON chat_threads
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_approval_queue_updated_at BEFORE UPDATE ON approval_queue
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_orchestration_plans_updated_at BEFORE UPDATE ON orchestration_plans
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_customers_updated_at BEFORE UPDATE ON customers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_crm_segments_updated_at BEFORE UPDATE ON crm_segments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_system_configs_updated_at BEFORE UPDATE ON system_configs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
