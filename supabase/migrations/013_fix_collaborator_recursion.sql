-- Migration 013: Fix infinite recursion in memorial_collaborators policies
-- The issue is policies checking memorial_collaborators while operating on memorial_collaborators

-- Drop the problematic policies
DROP POLICY IF EXISTS "Owners and editors can invite collaborators" ON memorial_collaborators;
DROP POLICY IF EXISTS "Users can view collaborators for their memorials" ON memorial_collaborators;
DROP POLICY IF EXISTS "Users can update their own collaborator record" ON memorial_collaborators;
DROP POLICY IF EXISTS "Owners can manage collaborators" ON memorial_collaborators;

-- Recreate policies without recursive checks

-- SELECT: Anyone can view collaborators (memorials are public, collaborator list can be public)
CREATE POLICY "Anyone can view collaborators"
    ON memorial_collaborators FOR SELECT
    USING (true);

-- INSERT: Only curators (from memorials table) can invite - no recursion
CREATE POLICY "Curators can invite collaborators"
    ON memorial_collaborators FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM memorials m
            WHERE m.id = memorial_id
            AND auth.uid() = ANY(m.curator_ids)
        )
    );

-- UPDATE: Users can accept their own invites, or curators can update any
CREATE POLICY "Users can update collaborator records"
    ON memorial_collaborators FOR UPDATE
    USING (
        -- User can update their own record (accept invite)
        user_id = auth.uid()
        OR email = (SELECT email FROM auth.users WHERE id = auth.uid())
        -- Or user is a curator of the memorial
        OR EXISTS (
            SELECT 1 FROM memorials m
            WHERE m.id = memorial_id
            AND auth.uid() = ANY(m.curator_ids)
        )
    );

-- DELETE: Only curators can remove collaborators
CREATE POLICY "Curators can delete collaborators"
    ON memorial_collaborators FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM memorials m
            WHERE m.id = memorial_id
            AND auth.uid() = ANY(m.curator_ids)
        )
    );
