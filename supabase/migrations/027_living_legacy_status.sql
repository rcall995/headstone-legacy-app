-- Migration: 027_living_legacy_status.sql
-- Living Legacy Status - Allow people to create their own memorial while alive

-- Add living_legacy status to memorials
ALTER TABLE memorials DROP CONSTRAINT IF EXISTS memorials_status_check;
ALTER TABLE memorials ADD CONSTRAINT memorials_status_check
  CHECK (status IN ('draft', 'published', 'approved', 'archived', 'living_legacy'));

-- Add executor fields for living legacy memorials
ALTER TABLE memorials ADD COLUMN IF NOT EXISTS executor_id UUID REFERENCES auth.users(id);
ALTER TABLE memorials ADD COLUMN IF NOT EXISTS executor_email TEXT;
ALTER TABLE memorials ADD COLUMN IF NOT EXISTS executor_name TEXT;
ALTER TABLE memorials ADD COLUMN IF NOT EXISTS executor_token TEXT;
ALTER TABLE memorials ADD COLUMN IF NOT EXISTS executor_invited_at TIMESTAMPTZ;
ALTER TABLE memorials ADD COLUMN IF NOT EXISTS is_activated BOOLEAN DEFAULT FALSE;
ALTER TABLE memorials ADD COLUMN IF NOT EXISTS activated_at TIMESTAMPTZ;
ALTER TABLE memorials ADD COLUMN IF NOT EXISTS activated_by UUID REFERENCES auth.users(id);

-- Index for finding living legacy memorials
CREATE INDEX IF NOT EXISTS idx_memorials_living_legacy ON memorials(status) WHERE status = 'living_legacy';
CREATE INDEX IF NOT EXISTS idx_memorials_executor ON memorials(executor_id) WHERE executor_id IS NOT NULL;

-- Comment for documentation
COMMENT ON COLUMN memorials.executor_id IS 'User ID of designated executor who can activate the memorial after the subject passes';
COMMENT ON COLUMN memorials.executor_email IS 'Email of executor (for invitation if not yet a user)';
COMMENT ON COLUMN memorials.is_activated IS 'Whether the living legacy has been activated by executor (subject has passed)';
COMMENT ON COLUMN memorials.activated_at IS 'When the executor activated the memorial';
COMMENT ON COLUMN memorials.activated_by IS 'Who activated the memorial (should match executor_id)';

-- Update existing RLS policies to include executor access
-- Drop and recreate to ensure clean state

DROP POLICY IF EXISTS "Published memorials are viewable by everyone" ON memorials;
CREATE POLICY "Published memorials are viewable by everyone" ON memorials
  FOR SELECT USING (
    status IN ('published', 'approved')
    OR auth.uid() = ANY(curator_ids)
    OR auth.uid() = executor_id
  );

DROP POLICY IF EXISTS "Curators can update their memorials" ON memorials;
CREATE POLICY "Curators can update their memorials" ON memorials
  FOR UPDATE USING (
    auth.uid() = ANY(curator_ids)
    OR auth.uid() = executor_id
  );
