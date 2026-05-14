-- Rate Limiting Support
-- Migration 00002

-- Rate limiting table for API and job rate limiting
CREATE TABLE IF NOT EXISTS rate_limits (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  job_type TEXT NOT NULL DEFAULT 'default',
  request_count INTEGER NOT NULL DEFAULT 1,
  window_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rate_limits_lookup
  ON rate_limits(user_id, job_type, window_start);

-- Rate limit check function
CREATE OR REPLACE FUNCTION check_rate_limit(
  p_user_id TEXT,
  p_job_type TEXT DEFAULT 'default',
  p_max_requests INTEGER DEFAULT 10,
  p_window_seconds INTEGER DEFAULT 60
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count INTEGER;
  v_window_start TIMESTAMPTZ;
BEGIN
  v_window_start := NOW() - (p_window_seconds || ' seconds')::INTERVAL;

  -- Acquire advisory lock for this user+job_type
  PERFORM pg_advisory_xact_lock(hashtext(p_user_id || p_job_type));

  -- Delete old entries
  DELETE FROM rate_limits
  WHERE window_start < v_window_start
    AND user_id = p_user_id;

  -- Count current requests
  SELECT COUNT(*) INTO v_count
  FROM rate_limits
  WHERE user_id = p_user_id
    AND job_type = p_job_type
    AND window_start >= v_window_start;

  IF v_count >= p_max_requests THEN
    RETURN FALSE;
  END IF;

  -- Record new request
  INSERT INTO rate_limits (user_id, job_type, window_start)
  VALUES (p_user_id, p_job_type, NOW());

  RETURN TRUE;
END;
$$;
