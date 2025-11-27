-- Migration 014: Properly fix RLS infinite recursion
-- Issue: Migration 013 used wrong policy names and didn't fix the trigger

-- ============================================
-- STEP 1: Drop ALL existing policies on memorial_collaborators
-- This ensures we clean up regardless of naming
-- ============================================
DROP POLICY IF EXISTS "Users can view collaborators for their memorials" ON memorial_collaborators;
DROP POLICY IF EXISTS "Owners can invite collaborators" ON memorial_collaborators;
DROP POLICY IF EXISTS "Owners can update collaborators" ON memorial_collaborators;
DROP POLICY IF EXISTS "Owners can remove collaborators" ON memorial_collaborators;

-- Also drop the ones from migration 013 if they were created
DROP POLICY IF EXISTS "Anyone can view collaborators" ON memorial_collaborators;
DROP POLICY IF EXISTS "Curators can invite collaborators" ON memorial_collaborators;
DROP POLICY IF EXISTS "Users can update collaborator records" ON memorial_collaborators;
DROP POLICY IF EXISTS "Curators can delete collaborators" ON memorial_collaborators;

-- Drop any other potential policy names
DROP POLICY IF EXISTS "Owners and editors can invite collaborators" ON memorial_collaborators;
DROP POLICY IF EXISTS "Users can update their own collaborator record" ON memorial_collaborators;
DROP POLICY IF EXISTS "Owners can manage collaborators" ON memorial_collaborators;

-- ============================================
-- STEP 2: Fix the trigger to use SECURITY DEFINER
-- This allows it to bypass RLS when auto-creating owner records
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- STEP 3: Create simple non-recursive RLS policies
-- These ONLY check memorials.curator_ids, never memorial_collaborators
-- ============================================

-- SELECT: Anyone can view collaborators (memorials are public)
CREATE POLICY "collaborators_select_all"
    ON memorial_collaborators FOR SELECT
    USING (true);

-- INSERT: Only curators of the memorial can invite
-- Uses memorials.curator_ids only - no recursion
CREATE POLICY "collaborators_insert_curators"
    ON memorial_collaborators FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM memorials m
            WHERE m.id = memorial_id
            AND auth.uid() = ANY(m.curator_ids)
        )
    );

-- UPDATE: Users can update their own record OR curators can update any
-- Uses memorials.curator_ids only - no recursion
CREATE POLICY "collaborators_update_own_or_curator"
    ON memorial_collaborators FOR UPDATE
    USING (
        user_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM memorials m
            WHERE m.id = memorial_id
            AND auth.uid() = ANY(m.curator_ids)
        )
    );

-- DELETE: Only curators can remove collaborators
-- Uses memorials.curator_ids only - no recursion
CREATE POLICY "collaborators_delete_curators"
    ON memorial_collaborators FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM memorials m
            WHERE m.id = memorial_id
            AND auth.uid() = ANY(m.curator_ids)
        )
    );
