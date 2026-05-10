-- Enable Realtime for the drafts table
CREATE TABLE IF NOT EXISTS drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  content TEXT DEFAULT '',
  metadata JSONB DEFAULT '{}'::jsonb,
  owner_id UUID REFERENCES auth.users(id),
  version INTEGER DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable Row Level Security (RLS)
ALTER TABLE drafts ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read/write drafts they own or are shared with
CREATE POLICY "Allow authenticated users to manage their own drafts" 
ON drafts FOR ALL 
TO authenticated 
USING (auth.uid() = owner_id);

-- Enable Supabase Realtime for this table
ALTER PUBLICATION supabase_realtime ADD TABLE drafts;
