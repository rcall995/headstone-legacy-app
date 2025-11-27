-- Migration: 019_gedcom_import.sql
-- GEDCOM Import - Family tree file import creating "wanted" graves

-- Track GEDCOM file imports
CREATE TABLE IF NOT EXISTS gedcom_imports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,

    -- File info
    file_name TEXT NOT NULL,
    file_size_bytes INTEGER,

    -- Import statistics
    individuals_count INTEGER DEFAULT 0,
    families_count INTEGER DEFAULT 0,
    memorials_created INTEGER DEFAULT 0,
    memorials_linked INTEGER DEFAULT 0, -- Linked to existing memorials
    connections_created INTEGER DEFAULT 0,

    -- Processing status
    status TEXT DEFAULT 'processing' CHECK (status IN ('processing', 'completed', 'failed', 'partial')),
    error_message TEXT,

    -- Raw data for debugging/reprocessing
    raw_individuals JSONB,
    raw_families JSONB,

    -- Timestamps
    imported_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

-- Add source tracking and "wanted" status to memorials
ALTER TABLE memorials
ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual',
ADD COLUMN IF NOT EXISTS gedcom_import_id UUID REFERENCES gedcom_imports(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS gedcom_id TEXT,
ADD COLUMN IF NOT EXISTS needs_location BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS needs_cemetery BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS search_hints TEXT,
ADD COLUMN IF NOT EXISTS imported_by UUID REFERENCES auth.users(id);

-- Update source column comment
COMMENT ON COLUMN memorials.source IS 'How memorial was created: manual, gedcom, scout, api';
COMMENT ON COLUMN memorials.needs_location IS 'True if grave GPS location is unknown (for scout bounty system)';
COMMENT ON COLUMN memorials.needs_cemetery IS 'True if cemetery name/address is unknown';
COMMENT ON COLUMN memorials.search_hints IS 'Hints for scouts: "Buried in Ohio", "Family plot in Oak Hill"';

-- Indexes for GEDCOM imports
CREATE INDEX IF NOT EXISTS idx_gedcom_imports_user ON gedcom_imports(user_id);
CREATE INDEX IF NOT EXISTS idx_gedcom_imports_status ON gedcom_imports(status);

-- Indexes for wanted graves (scout queries)
CREATE INDEX IF NOT EXISTS idx_memorials_needs_location ON memorials(needs_location) WHERE needs_location = true;
CREATE INDEX IF NOT EXISTS idx_memorials_needs_cemetery ON memorials(needs_cemetery) WHERE needs_cemetery = true;
CREATE INDEX IF NOT EXISTS idx_memorials_source ON memorials(source);
CREATE INDEX IF NOT EXISTS idx_memorials_gedcom_import ON memorials(gedcom_import_id);
CREATE INDEX IF NOT EXISTS idx_memorials_gedcom_id ON memorials(gedcom_id);

-- RLS Policies for GEDCOM imports
ALTER TABLE gedcom_imports ENABLE ROW LEVEL SECURITY;

-- Users can view their own imports
CREATE POLICY "Users can view own imports"
ON gedcom_imports FOR SELECT
USING (auth.uid() = user_id);

-- Users can create imports
CREATE POLICY "Users can create imports"
ON gedcom_imports FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Users can update their own imports (for status updates)
CREATE POLICY "Users can update own imports"
ON gedcom_imports FOR UPDATE
USING (auth.uid() = user_id);

-- Update existing memorials RLS to allow viewing wanted memorials
-- Drop existing policy if it exists and recreate
DROP POLICY IF EXISTS "Anyone can view published memorials" ON memorials;
CREATE POLICY "Anyone can view published or wanted memorials"
ON memorials FOR SELECT
USING (
    status = 'published'
    OR status = 'approved'
    OR needs_location = true
    OR needs_cemetery = true
    OR auth.uid() = ANY(curator_ids)
    OR auth.uid() = imported_by
);

-- Function to generate memorial ID from GEDCOM data
CREATE OR REPLACE FUNCTION generate_gedcom_memorial_id(name TEXT, gedcom_id TEXT)
RETURNS TEXT AS $$
DECLARE
    slug TEXT;
    random_suffix TEXT;
BEGIN
    -- Create slug from name
    slug := LOWER(REGEXP_REPLACE(name, '[^a-zA-Z0-9]+', '-', 'g'));
    slug := TRIM(BOTH '-' FROM slug);

    -- Add random suffix
    random_suffix := SUBSTRING(MD5(gedcom_id || NOW()::TEXT) FROM 1 FOR 6);

    RETURN slug || '-' || random_suffix;
END;
$$ LANGUAGE plpgsql;

COMMENT ON TABLE gedcom_imports IS 'Tracks GEDCOM family tree file imports. Each import can create multiple stub memorials marked as needing location discovery by scouts.';
