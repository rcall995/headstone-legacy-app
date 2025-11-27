-- Migration 015: Fix UUID vs TEXT type mismatches
-- Memorial IDs are TEXT (like "anna-rose-kerschner-call-n2wmlz") not UUID

-- ============================================
-- FIX 1: increment_view_count function
-- ============================================
-- Drop both old versions (UUID and the wrong TEXT one)
DROP FUNCTION IF EXISTS increment_view_count(UUID);
DROP FUNCTION IF EXISTS increment_view_count(TEXT);

-- Create with parameter name matching what JS code sends: memorial_id (not p_memorial_id)
CREATE OR REPLACE FUNCTION increment_view_count(memorial_id TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE memorials
    SET view_count = COALESCE(view_count, 0) + 1
    WHERE id = memorial_id;
END;
$$;

GRANT EXECUTE ON FUNCTION increment_view_count(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION increment_view_count(TEXT) TO authenticated;

-- ============================================
-- FIX 2: Ensure memorial_connections table exists
-- ============================================
CREATE TABLE IF NOT EXISTS memorial_connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    memorial_id TEXT NOT NULL REFERENCES memorials(id) ON DELETE CASCADE,
    connected_memorial_id TEXT NOT NULL REFERENCES memorials(id) ON DELETE CASCADE,
    relationship_type TEXT NOT NULL CHECK (relationship_type IN (
        'spouse', 'parent', 'child', 'sibling', 'grandparent', 'grandchild',
        'aunt_uncle', 'niece_nephew', 'cousin', 'in_law',
        'step_parent', 'step_child', 'step_sibling', 'other'
    )),
    relationship_label TEXT,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(memorial_id, connected_memorial_id, relationship_type)
);

-- Ensure indexes exist
CREATE INDEX IF NOT EXISTS idx_memorial_connections_memorial ON memorial_connections(memorial_id);
CREATE INDEX IF NOT EXISTS idx_memorial_connections_connected ON memorial_connections(connected_memorial_id);

-- Enable RLS
ALTER TABLE memorial_connections ENABLE ROW LEVEL SECURITY;

-- Drop and recreate policies to ensure they exist
DROP POLICY IF EXISTS "Anyone can view memorial connections" ON memorial_connections;
CREATE POLICY "Anyone can view memorial connections"
    ON memorial_connections FOR SELECT
    USING (true);

DROP POLICY IF EXISTS "Curators can create connections" ON memorial_connections;
CREATE POLICY "Curators can create connections"
    ON memorial_connections FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM memorials m
            WHERE m.id = memorial_id
            AND auth.uid() = ANY(m.curator_ids)
        )
    );

DROP POLICY IF EXISTS "Curators can delete connections" ON memorial_connections;
CREATE POLICY "Curators can delete connections"
    ON memorial_connections FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM memorials m
            WHERE m.id = memorial_id
            AND auth.uid() = ANY(m.curator_ids)
        )
    );

-- ============================================
-- FIX 3: Recreate helper functions with TEXT type
-- ============================================

-- Get inverse relationship helper
CREATE OR REPLACE FUNCTION get_inverse_relationship(rel_type TEXT)
RETURNS TEXT AS $$
BEGIN
    RETURN CASE rel_type
        WHEN 'parent' THEN 'child'
        WHEN 'child' THEN 'parent'
        WHEN 'grandparent' THEN 'grandchild'
        WHEN 'grandchild' THEN 'grandparent'
        WHEN 'aunt_uncle' THEN 'niece_nephew'
        WHEN 'niece_nephew' THEN 'aunt_uncle'
        WHEN 'step_parent' THEN 'step_child'
        WHEN 'step_child' THEN 'step_parent'
        ELSE rel_type
    END;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Create bidirectional connection
CREATE OR REPLACE FUNCTION create_memorial_connection(
    p_memorial_id TEXT,
    p_connected_memorial_id TEXT,
    p_relationship_type TEXT,
    p_relationship_label TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    v_connection_id UUID;
    v_inverse_type TEXT;
    v_inverse_label TEXT;
BEGIN
    IF p_memorial_id = p_connected_memorial_id THEN
        RAISE EXCEPTION 'Cannot connect a memorial to itself';
    END IF;

    v_inverse_type := get_inverse_relationship(p_relationship_type);

    IF p_relationship_label IS NOT NULL THEN
        v_inverse_label := CASE p_relationship_label
            WHEN 'Father' THEN 'Child'
            WHEN 'Mother' THEN 'Child'
            WHEN 'Son' THEN 'Parent'
            WHEN 'Daughter' THEN 'Parent'
            WHEN 'Husband' THEN 'Wife'
            WHEN 'Wife' THEN 'Husband'
            WHEN 'Brother' THEN 'Sibling'
            WHEN 'Sister' THEN 'Sibling'
            WHEN 'Grandfather' THEN 'Grandchild'
            WHEN 'Grandmother' THEN 'Grandchild'
            WHEN 'Grandson' THEN 'Grandparent'
            WHEN 'Granddaughter' THEN 'Grandparent'
            ELSE p_relationship_label
        END;
    END IF;

    INSERT INTO memorial_connections (memorial_id, connected_memorial_id, relationship_type, relationship_label, created_by)
    VALUES (p_memorial_id, p_connected_memorial_id, p_relationship_type, p_relationship_label, auth.uid())
    RETURNING id INTO v_connection_id;

    INSERT INTO memorial_connections (memorial_id, connected_memorial_id, relationship_type, relationship_label, created_by)
    VALUES (p_connected_memorial_id, p_memorial_id, v_inverse_type, v_inverse_label, auth.uid())
    ON CONFLICT (memorial_id, connected_memorial_id, relationship_type) DO NOTHING;

    RETURN v_connection_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get family tree for a memorial
CREATE OR REPLACE FUNCTION get_memorial_family_tree(p_memorial_id TEXT)
RETURNS TABLE (
    connection_id UUID,
    memorial_id TEXT,
    memorial_name TEXT,
    memorial_photo TEXT,
    birth_date DATE,
    death_date DATE,
    relationship_type TEXT,
    relationship_label TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        mc.id as connection_id,
        m.id as memorial_id,
        m.name as memorial_name,
        m.main_photo as memorial_photo,
        m.birth_date,
        m.death_date,
        mc.relationship_type,
        mc.relationship_label
    FROM memorial_connections mc
    JOIN memorials m ON m.id = mc.connected_memorial_id
    WHERE mc.memorial_id = p_memorial_id
    AND m.status = 'published'
    ORDER BY
        CASE mc.relationship_type
            WHEN 'parent' THEN 1
            WHEN 'spouse' THEN 2
            WHEN 'sibling' THEN 3
            WHEN 'child' THEN 4
            WHEN 'grandparent' THEN 5
            WHEN 'grandchild' THEN 6
            ELSE 7
        END,
        m.birth_date NULLS LAST;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION create_memorial_connection(TEXT, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_memorial_family_tree(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION get_memorial_family_tree(TEXT) TO authenticated;
