-- ============================================
-- HEADSTONE LEGACY - COLLABORATION SYSTEM
-- Migration 011 - Roles, Invites, and Permissions
-- ============================================

-- ============================================
-- MEMORIAL COLLABORATORS TABLE
-- Tracks who has access to each memorial and their role
-- ============================================
CREATE TABLE IF NOT EXISTS memorial_collaborators (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  memorial_id TEXT REFERENCES memorials(id) ON DELETE CASCADE,

  -- Either user_id (for existing users) or email (for pending invites)
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT, -- Used for pending invites before user signs up

  -- Role: owner (full control), editor (can edit), contributor (can add content), viewer (read-only)
  role TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('owner', 'editor', 'contributor', 'viewer')),

  -- Status: active, pending (invite sent), revoked
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('active', 'pending', 'revoked')),

  -- Invite tracking
  invited_by UUID REFERENCES auth.users(id),
  invite_message TEXT,
  invite_token TEXT UNIQUE, -- For invite link

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  accepted_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Ensure either user_id or email is set
  CONSTRAINT user_or_email CHECK (user_id IS NOT NULL OR email IS NOT NULL),

  -- Unique constraint: one role per user per memorial
  CONSTRAINT unique_user_memorial UNIQUE (memorial_id, user_id),
  CONSTRAINT unique_email_memorial UNIQUE (memorial_id, email)
);

-- Indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_collaborators_memorial_id ON memorial_collaborators(memorial_id);
CREATE INDEX IF NOT EXISTS idx_collaborators_user_id ON memorial_collaborators(user_id);
CREATE INDEX IF NOT EXISTS idx_collaborators_email ON memorial_collaborators(email);
CREATE INDEX IF NOT EXISTS idx_collaborators_invite_token ON memorial_collaborators(invite_token);
CREATE INDEX IF NOT EXISTS idx_collaborators_status ON memorial_collaborators(status);

-- ============================================
-- ACTIVITY LOG TABLE
-- Tracks all changes to memorials for audit and notifications
-- ============================================
CREATE TABLE IF NOT EXISTS memorial_activity (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  memorial_id TEXT REFERENCES memorials(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id),
  user_name TEXT,

  -- Activity type: edit, tribute_added, photo_added, voice_added, candle_lit, invite_sent, etc.
  activity_type TEXT NOT NULL,

  -- Description of what changed
  description TEXT,

  -- Additional metadata (JSON)
  metadata JSONB DEFAULT '{}',

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activity_memorial_id ON memorial_activity(memorial_id);
CREATE INDEX IF NOT EXISTS idx_activity_created_at ON memorial_activity(created_at DESC);

-- ============================================
-- HELPER FUNCTION: Check user role on memorial
-- ============================================
CREATE OR REPLACE FUNCTION get_user_memorial_role(p_memorial_id TEXT, p_user_id UUID)
RETURNS TEXT AS $$
DECLARE
  v_role TEXT;
BEGIN
  -- First check collaborators table
  SELECT role INTO v_role
  FROM memorial_collaborators
  WHERE memorial_id = p_memorial_id
    AND user_id = p_user_id
    AND status = 'active';

  IF v_role IS NOT NULL THEN
    RETURN v_role;
  END IF;

  -- Fallback: check legacy curator_ids array
  SELECT 'owner' INTO v_role
  FROM memorials
  WHERE id = p_memorial_id
    AND p_user_id = ANY(curator_ids);

  RETURN v_role; -- Returns NULL if no access
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- HELPER FUNCTION: Check if user can edit memorial
-- ============================================
CREATE OR REPLACE FUNCTION can_edit_memorial(p_memorial_id TEXT, p_user_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_role TEXT;
BEGIN
  v_role := get_user_memorial_role(p_memorial_id, p_user_id);
  RETURN v_role IN ('owner', 'editor');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- HELPER FUNCTION: Check if user can contribute to memorial
-- ============================================
CREATE OR REPLACE FUNCTION can_contribute_to_memorial(p_memorial_id TEXT, p_user_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_role TEXT;
BEGIN
  v_role := get_user_memorial_role(p_memorial_id, p_user_id);
  RETURN v_role IN ('owner', 'editor', 'contributor');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- TRIGGER: Auto-create owner collaborator on memorial creation
-- ============================================
CREATE OR REPLACE FUNCTION create_owner_collaborator()
RETURNS TRIGGER AS $$
BEGIN
  -- Create owner record for each curator_id
  IF NEW.curator_ids IS NOT NULL AND array_length(NEW.curator_ids, 1) > 0 THEN
    INSERT INTO memorial_collaborators (memorial_id, user_id, role, status, accepted_at)
    SELECT NEW.id, unnest(NEW.curator_ids), 'owner', 'active', NOW()
    ON CONFLICT (memorial_id, user_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS on_memorial_created_add_owner ON memorials;
CREATE TRIGGER on_memorial_created_add_owner
  AFTER INSERT ON memorials
  FOR EACH ROW EXECUTE FUNCTION create_owner_collaborator();

-- ============================================
-- TRIGGER: Link pending invites when user signs up
-- ============================================
CREATE OR REPLACE FUNCTION link_pending_invites()
RETURNS TRIGGER AS $$
BEGIN
  -- Update any pending invites for this email to link to the new user
  UPDATE memorial_collaborators
  SET user_id = NEW.id,
      status = 'active',
      accepted_at = NOW(),
      updated_at = NOW()
  WHERE email = NEW.email
    AND status = 'pending'
    AND user_id IS NULL;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_user_signup_link_invites ON auth.users;
CREATE TRIGGER on_user_signup_link_invites
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION link_pending_invites();

-- ============================================
-- RLS POLICIES FOR COLLABORATORS TABLE
-- ============================================
ALTER TABLE memorial_collaborators ENABLE ROW LEVEL SECURITY;

-- Users can view collaborators for memorials they have access to
CREATE POLICY "Users can view collaborators for their memorials"
ON memorial_collaborators FOR SELECT
USING (
  user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM memorial_collaborators mc
    WHERE mc.memorial_id = memorial_collaborators.memorial_id
      AND mc.user_id = auth.uid()
      AND mc.status = 'active'
  )
  OR EXISTS (
    SELECT 1 FROM memorials m
    WHERE m.id = memorial_collaborators.memorial_id
      AND auth.uid() = ANY(m.curator_ids)
  )
);

-- Only owners/editors can insert (invite) collaborators
CREATE POLICY "Owners can invite collaborators"
ON memorial_collaborators FOR INSERT
WITH CHECK (
  can_edit_memorial(memorial_id, auth.uid())
);

-- Only owners can update collaborator roles
CREATE POLICY "Owners can update collaborators"
ON memorial_collaborators FOR UPDATE
USING (
  get_user_memorial_role(memorial_id, auth.uid()) = 'owner'
  OR user_id = auth.uid() -- Users can update their own status (accept invite)
);

-- Only owners can remove collaborators
CREATE POLICY "Owners can remove collaborators"
ON memorial_collaborators FOR DELETE
USING (
  get_user_memorial_role(memorial_id, auth.uid()) = 'owner'
  OR user_id = auth.uid() -- Users can remove themselves
);

-- ============================================
-- RLS POLICIES FOR ACTIVITY LOG
-- ============================================
ALTER TABLE memorial_activity ENABLE ROW LEVEL SECURITY;

-- Anyone with access to memorial can view activity
CREATE POLICY "Collaborators can view activity"
ON memorial_activity FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM memorial_collaborators mc
    WHERE mc.memorial_id = memorial_activity.memorial_id
      AND mc.user_id = auth.uid()
      AND mc.status = 'active'
  )
  OR EXISTS (
    SELECT 1 FROM memorials m
    WHERE m.id = memorial_activity.memorial_id
      AND auth.uid() = ANY(m.curator_ids)
  )
);

-- Anyone can insert activity (logging)
CREATE POLICY "Anyone can log activity"
ON memorial_activity FOR INSERT
WITH CHECK (true);

-- ============================================
-- MIGRATE EXISTING CURATORS TO COLLABORATORS
-- Run this once to migrate existing data
-- ============================================
INSERT INTO memorial_collaborators (memorial_id, user_id, role, status, accepted_at, created_at)
SELECT
  m.id,
  unnest(m.curator_ids),
  'owner',
  'active',
  m.created_at,
  m.created_at
FROM memorials m
WHERE m.curator_ids IS NOT NULL AND array_length(m.curator_ids, 1) > 0
ON CONFLICT (memorial_id, user_id) DO NOTHING;
