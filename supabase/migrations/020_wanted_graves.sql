-- Migration: 020_wanted_graves.sql
-- Wanted Graves System - Scout bounty system for finding family tree graves

-- Track active grave searches (when family is actively looking)
CREATE TABLE IF NOT EXISTS grave_searches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    memorial_id TEXT REFERENCES memorials(id) ON DELETE CASCADE,
    searcher_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,

    -- Search details
    search_hints TEXT,           -- "Buried in Ohio, near Cleveland"
    known_cemetery TEXT,         -- If cemetery is known but not exact location
    known_region TEXT,           -- State/county/city
    urgency TEXT DEFAULT 'normal' CHECK (urgency IN ('low', 'normal', 'high')),
    reward_points INTEGER DEFAULT 0, -- Bonus points offered (future feature)

    -- Status
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'claimed', 'found', 'cancelled')),
    claimed_by UUID REFERENCES auth.users(id),
    claimed_at TIMESTAMPTZ,
    found_at TIMESTAMPTZ,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '1 year')
);

-- Track scout claims to prevent duplicate work
CREATE TABLE IF NOT EXISTS scout_claims (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    memorial_id TEXT REFERENCES memorials(id) ON DELETE CASCADE,
    scout_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,

    -- Claim details
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'submitted', 'verified', 'rejected', 'expired')),
    notes TEXT,

    -- Submitted location (pending verification)
    submitted_cemetery TEXT,
    submitted_lat DOUBLE PRECISION,
    submitted_lng DOUBLE PRECISION,
    submitted_photo_url TEXT,
    submitted_at TIMESTAMPTZ,

    -- Verification
    verified_by UUID REFERENCES auth.users(id),
    verified_at TIMESTAMPTZ,
    rejection_reason TEXT,

    -- Timestamps
    claimed_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '7 days')
);

-- Add scout attribution to memorials
ALTER TABLE memorials
ADD COLUMN IF NOT EXISTS located_by UUID REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS located_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS location_verified BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS location_verified_by UUID REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS location_verified_at TIMESTAMPTZ;

-- Add wanted_finds tracking to scout stats
ALTER TABLE scout_stats
ADD COLUMN IF NOT EXISTS wanted_finds_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS cemetery_ids_count INTEGER DEFAULT 0;

-- New badges for family finding
INSERT INTO badges (id, name, description, icon, category, requirement_type, requirement_value, sort_order)
VALUES
    ('family_finder_1', 'Family Finder', 'Found 1 grave a family was searching for', 'fa-heart', 'activity', 'wanted_finds', 1, 20),
    ('family_finder_10', 'Reunion Helper', 'Found 10 graves families were searching for', 'fa-users', 'activity', 'wanted_finds', 10, 21),
    ('family_finder_50', 'Ancestry Angel', 'Found 50 graves families were searching for', 'fa-star', 'milestone', 'wanted_finds', 50, 22),
    ('cemetery_expert_10', 'Cemetery Expert', 'Identified 10 unknown cemeteries', 'fa-map-marked-alt', 'activity', 'cemetery_ids', 10, 23),
    ('cemetery_expert_50', 'Cemetery Master', 'Identified 50 unknown cemeteries', 'fa-map', 'milestone', 'cemetery_ids', 50, 24)
ON CONFLICT (id) DO NOTHING;

-- Indexes for wanted graves queries
CREATE INDEX IF NOT EXISTS idx_grave_searches_status ON grave_searches(status) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_grave_searches_memorial ON grave_searches(memorial_id);
CREATE INDEX IF NOT EXISTS idx_grave_searches_searcher ON grave_searches(searcher_id);
CREATE INDEX IF NOT EXISTS idx_grave_searches_urgency ON grave_searches(urgency);

CREATE INDEX IF NOT EXISTS idx_scout_claims_memorial ON scout_claims(memorial_id);
CREATE INDEX IF NOT EXISTS idx_scout_claims_scout ON scout_claims(scout_id);
CREATE INDEX IF NOT EXISTS idx_scout_claims_status ON scout_claims(status);

CREATE INDEX IF NOT EXISTS idx_memorials_located_by ON memorials(located_by);

-- RLS Policies
ALTER TABLE grave_searches ENABLE ROW LEVEL SECURITY;
ALTER TABLE scout_claims ENABLE ROW LEVEL SECURITY;

-- Anyone can view active searches (for scouts to find bounties)
CREATE POLICY "Anyone can view active searches"
ON grave_searches FOR SELECT
USING (status = 'active' OR auth.uid() = searcher_id);

-- Users can create searches for memorials they own/imported
CREATE POLICY "Users can create searches"
ON grave_searches FOR INSERT
WITH CHECK (auth.uid() = searcher_id);

-- Users can update their own searches
CREATE POLICY "Users can update own searches"
ON grave_searches FOR UPDATE
USING (auth.uid() = searcher_id);

-- Scouts can view their own claims
CREATE POLICY "Scouts can view own claims"
ON scout_claims FOR SELECT
USING (auth.uid() = scout_id);

-- Authenticated users can create claims
CREATE POLICY "Users can create claims"
ON scout_claims FOR INSERT
WITH CHECK (auth.uid() = scout_id);

-- Scouts can update their own claims
CREATE POLICY "Scouts can update own claims"
ON scout_claims FOR UPDATE
USING (auth.uid() = scout_id);

-- Memorial owners can view claims on their memorials
CREATE POLICY "Memorial owners can view claims"
ON scout_claims FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM memorials m
        WHERE m.id = memorial_id
        AND (auth.uid() = ANY(m.curator_ids) OR auth.uid() = m.imported_by)
    )
);

-- Function to award bonus points for wanted grave finds
CREATE OR REPLACE FUNCTION award_wanted_find_points(
    p_scout_id UUID,
    p_memorial_id TEXT,
    p_has_photo BOOLEAN DEFAULT false,
    p_has_cemetery BOOLEAN DEFAULT false
)
RETURNS INTEGER AS $$
DECLARE
    total_points INTEGER := 0;
    base_pin_points INTEGER := 25;      -- 2.5x normal
    base_photo_points INTEGER := 40;    -- 2.5x normal
    combo_bonus INTEGER := 10;
    cemetery_bonus INTEGER := 20;
BEGIN
    -- Base points for pin
    total_points := base_pin_points;

    -- Photo bonus
    IF p_has_photo THEN
        total_points := total_points + base_photo_points + combo_bonus;
    END IF;

    -- Cemetery identification bonus
    IF p_has_cemetery THEN
        total_points := total_points + cemetery_bonus;
    END IF;

    -- Update scout stats
    UPDATE scout_stats
    SET
        total_points = total_points + total_points,
        pins_count = pins_count + 1,
        photos_count = photos_count + CASE WHEN p_has_photo THEN 1 ELSE 0 END,
        wanted_finds_count = wanted_finds_count + 1,
        cemetery_ids_count = cemetery_ids_count + CASE WHEN p_has_cemetery THEN 1 ELSE 0 END,
        updated_at = NOW()
    WHERE user_id = p_scout_id;

    -- Insert if not exists
    IF NOT FOUND THEN
        INSERT INTO scout_stats (user_id, total_points, pins_count, photos_count, wanted_finds_count, cemetery_ids_count)
        VALUES (
            p_scout_id,
            total_points,
            1,
            CASE WHEN p_has_photo THEN 1 ELSE 0 END,
            1,
            CASE WHEN p_has_cemetery THEN 1 ELSE 0 END
        );
    END IF;

    RETURN total_points;
END;
$$ LANGUAGE plpgsql;

COMMENT ON TABLE grave_searches IS 'Active searches for graves by families who imported GEDCOM data. Creates bounty system for scouts.';
COMMENT ON TABLE scout_claims IS 'Tracks scouts who claim to work on finding a specific grave. Prevents duplicate effort and enables verification.';
COMMENT ON FUNCTION award_wanted_find_points IS 'Awards bonus points (2.5x) to scouts who find graves families are searching for.';
