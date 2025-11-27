-- Migration 012: Living Legacy Tree - Memorial Connections
-- Creates a formal linking system between memorials for family trees

-- Table to store connections between memorials
CREATE TABLE IF NOT EXISTS memorial_connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- The two memorials being connected (TEXT to match memorials.id type)
    memorial_id TEXT NOT NULL REFERENCES memorials(id) ON DELETE CASCADE,
    connected_memorial_id TEXT NOT NULL REFERENCES memorials(id) ON DELETE CASCADE,

    -- Relationship from memorial_id's perspective
    -- e.g., if memorial_id is John and connected_memorial_id is Mary,
    -- relationship_type = 'spouse' means "John's spouse is Mary"
    relationship_type TEXT NOT NULL CHECK (relationship_type IN (
        'spouse',
        'parent',      -- connected_memorial_id is parent of memorial_id
        'child',       -- connected_memorial_id is child of memorial_id
        'sibling',
        'grandparent',
        'grandchild',
        'aunt_uncle',
        'niece_nephew',
        'cousin',
        'in_law',
        'step_parent',
        'step_child',
        'step_sibling',
        'other'
    )),

    -- Optional: more specific relationship label (e.g., "Father", "Mother-in-law")
    relationship_label TEXT,

    -- Who created this connection
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),

    -- Prevent duplicate connections
    UNIQUE(memorial_id, connected_memorial_id, relationship_type)
);

-- Index for fast lookups
CREATE INDEX idx_memorial_connections_memorial ON memorial_connections(memorial_id);
CREATE INDEX idx_memorial_connections_connected ON memorial_connections(connected_memorial_id);
CREATE INDEX idx_memorial_connections_type ON memorial_connections(relationship_type);

-- Enable RLS
ALTER TABLE memorial_connections ENABLE ROW LEVEL SECURITY;

-- Anyone can view connections (memorials are public)
CREATE POLICY "Anyone can view memorial connections"
    ON memorial_connections FOR SELECT
    USING (true);

-- Curators and collaborators can create connections
CREATE POLICY "Curators can create connections"
    ON memorial_connections FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM memorials m
            WHERE m.id = memorial_id
            AND auth.uid() = ANY(m.curator_ids)
        )
        OR EXISTS (
            SELECT 1 FROM memorial_collaborators mc
            WHERE mc.memorial_id = memorial_connections.memorial_id
            AND mc.user_id = auth.uid()
            AND mc.status = 'active'
            AND mc.role IN ('owner', 'editor')
        )
    );

-- Curators and collaborators can delete connections
CREATE POLICY "Curators can delete connections"
    ON memorial_connections FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM memorials m
            WHERE m.id = memorial_id
            AND auth.uid() = ANY(m.curator_ids)
        )
        OR EXISTS (
            SELECT 1 FROM memorial_collaborators mc
            WHERE mc.memorial_id = memorial_connections.memorial_id
            AND mc.user_id = auth.uid()
            AND mc.status = 'active'
            AND mc.role IN ('owner', 'editor')
        )
    );

-- Function to get the inverse relationship type
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
        ELSE rel_type  -- spouse, sibling, cousin, in_law, step_sibling, other are symmetric
    END;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to create bidirectional connection
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
    -- Don't allow self-connections
    IF p_memorial_id = p_connected_memorial_id THEN
        RAISE EXCEPTION 'Cannot connect a memorial to itself';
    END IF;

    -- Get inverse relationship type
    v_inverse_type := get_inverse_relationship(p_relationship_type);

    -- Generate inverse label if needed
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

    -- Insert the primary connection
    INSERT INTO memorial_connections (memorial_id, connected_memorial_id, relationship_type, relationship_label, created_by)
    VALUES (p_memorial_id, p_connected_memorial_id, p_relationship_type, p_relationship_label, auth.uid())
    RETURNING id INTO v_connection_id;

    -- Insert the inverse connection (ignore if already exists)
    INSERT INTO memorial_connections (memorial_id, connected_memorial_id, relationship_type, relationship_label, created_by)
    VALUES (p_connected_memorial_id, p_memorial_id, v_inverse_type, v_inverse_label, auth.uid())
    ON CONFLICT (memorial_id, connected_memorial_id, relationship_type) DO NOTHING;

    RETURN v_connection_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get all connections for a memorial (for family tree view)
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

-- View to help with searching memorials for linking
CREATE OR REPLACE VIEW searchable_memorials AS
SELECT
    id,
    name,
    main_photo,
    birth_date,
    death_date,
    EXTRACT(YEAR FROM birth_date)::TEXT || ' - ' || EXTRACT(YEAR FROM death_date)::TEXT as date_range
FROM memorials
WHERE status = 'published';

-- Grant access to the view
GRANT SELECT ON searchable_memorials TO authenticated;
GRANT SELECT ON searchable_memorials TO anon;

COMMENT ON TABLE memorial_connections IS 'Stores family relationships between memorials for the Living Legacy Tree feature';
COMMENT ON FUNCTION create_memorial_connection IS 'Creates a bidirectional connection between two memorials';
COMMENT ON FUNCTION get_memorial_family_tree IS 'Returns all family connections for a memorial, suitable for rendering a family tree';
