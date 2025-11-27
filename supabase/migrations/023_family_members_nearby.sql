-- Migration: 023_family_members_nearby.sql
-- Family Members Nearby - Allow curators to add family members who may be buried nearby
-- Visitors can then help pin these relatives when scanning a QR code at a cemetery

-- Create family_members table for tracking relatives with burial info
CREATE TABLE IF NOT EXISTS family_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Link to the primary memorial
    memorial_id TEXT REFERENCES memorials(id) ON DELETE CASCADE,

    -- Basic info
    name TEXT NOT NULL,
    relationship TEXT NOT NULL, -- Father, Mother, Spouse, Sibling, Child, etc.
    birth_date DATE,
    death_date DATE,

    -- Burial information
    burial_status TEXT DEFAULT 'unknown' CHECK (burial_status IN (
        'unknown',           -- Don't know where buried
        'same_cemetery',     -- Same cemetery as primary memorial, not pinned
        'nearby_cemetery',   -- Different but nearby cemetery
        'different_cemetery', -- Known different cemetery
        'has_memorial'       -- Already has their own memorial in system
    )),

    -- Cemetery info (if known)
    cemetery_name TEXT,
    cemetery_city TEXT,
    cemetery_state TEXT,

    -- Link to existing memorial (if they have one)
    linked_memorial_id TEXT REFERENCES memorials(id) ON DELETE SET NULL,

    -- Pinning info (when visitor finds the grave)
    needs_pin BOOLEAN DEFAULT true,
    gravesite_lat DOUBLE PRECISION,
    gravesite_lng DOUBLE PRECISION,
    gravesite_accuracy DOUBLE PRECISION,
    headstone_photo_url TEXT,

    -- Who pinned it
    pinned_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    pinned_at TIMESTAMPTZ,
    pinned_device_id TEXT, -- For anonymous visitors

    -- Auto-create memorial option
    auto_created_memorial_id TEXT REFERENCES memorials(id) ON DELETE SET NULL,

    -- Metadata
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for efficient queries
CREATE INDEX idx_family_members_memorial ON family_members(memorial_id);
CREATE INDEX idx_family_members_needs_pin ON family_members(needs_pin) WHERE needs_pin = true;
CREATE INDEX idx_family_members_burial_status ON family_members(burial_status);
CREATE INDEX idx_family_members_cemetery ON family_members(cemetery_name) WHERE cemetery_name IS NOT NULL;
CREATE INDEX idx_family_members_linked ON family_members(linked_memorial_id) WHERE linked_memorial_id IS NOT NULL;

-- RLS Policies
ALTER TABLE family_members ENABLE ROW LEVEL SECURITY;

-- Anyone can view family members (for memorial pages)
CREATE POLICY "Anyone can view family members"
ON family_members FOR SELECT
USING (true);

-- Curators can manage family members for their memorials
CREATE POLICY "Curators can insert family members"
ON family_members FOR INSERT
WITH CHECK (
    EXISTS (
        SELECT 1 FROM memorials m
        WHERE m.id = memorial_id
        AND auth.uid() = ANY(m.curator_ids)
    )
);

CREATE POLICY "Curators can update family members"
ON family_members FOR UPDATE
USING (
    EXISTS (
        SELECT 1 FROM memorials m
        WHERE m.id = memorial_id
        AND auth.uid() = ANY(m.curator_ids)
    )
);

CREATE POLICY "Curators can delete family members"
ON family_members FOR DELETE
USING (
    EXISTS (
        SELECT 1 FROM memorials m
        WHERE m.id = memorial_id
        AND auth.uid() = ANY(m.curator_ids)
    )
);

-- Anyone can update pinning info (for visitor pins)
-- This is a special policy that only allows updating pin-related fields
CREATE POLICY "Anyone can pin family members"
ON family_members FOR UPDATE
USING (needs_pin = true)
WITH CHECK (
    -- Only allow updating these specific fields
    needs_pin IS NOT NULL
);

-- Track visitor pins for anonymous users
CREATE TABLE IF NOT EXISTS visitor_pins (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    family_member_id UUID REFERENCES family_members(id) ON DELETE CASCADE,
    memorial_id TEXT REFERENCES memorials(id) ON DELETE CASCADE,

    -- Location submitted
    gravesite_lat DOUBLE PRECISION NOT NULL,
    gravesite_lng DOUBLE PRECISION NOT NULL,
    gravesite_accuracy DOUBLE PRECISION,
    headstone_photo_url TEXT,

    -- Visitor info (may be anonymous)
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    device_id TEXT, -- Fingerprint for anonymous
    visitor_name TEXT, -- Optional name they provide
    visitor_email TEXT, -- Optional email for notification

    -- Status
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    approved_by UUID REFERENCES auth.users(id),
    approved_at TIMESTAMPTZ,
    rejection_reason TEXT,

    -- Points awarded
    points_awarded INTEGER DEFAULT 0,

    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_visitor_pins_family_member ON visitor_pins(family_member_id);
CREATE INDEX idx_visitor_pins_memorial ON visitor_pins(memorial_id);
CREATE INDEX idx_visitor_pins_status ON visitor_pins(status);

ALTER TABLE visitor_pins ENABLE ROW LEVEL SECURITY;

-- Anyone can submit a pin
CREATE POLICY "Anyone can submit pins"
ON visitor_pins FOR INSERT
WITH CHECK (true);

-- Users can view their own pins
CREATE POLICY "Users can view own pins"
ON visitor_pins FOR SELECT
USING (
    user_id = auth.uid()
    OR device_id IS NOT NULL
    OR EXISTS (
        SELECT 1 FROM memorials m
        WHERE m.id = memorial_id
        AND auth.uid() = ANY(m.curator_ids)
    )
);

-- Curators can manage pins for their memorials
CREATE POLICY "Curators can update pins"
ON visitor_pins FOR UPDATE
USING (
    EXISTS (
        SELECT 1 FROM memorials m
        WHERE m.id = memorial_id
        AND auth.uid() = ANY(m.curator_ids)
    )
);

-- Notification table for curator alerts
CREATE TABLE IF NOT EXISTS pin_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    memorial_id TEXT REFERENCES memorials(id) ON DELETE CASCADE,
    family_member_id UUID REFERENCES family_members(id) ON DELETE CASCADE,
    visitor_pin_id UUID REFERENCES visitor_pins(id) ON DELETE CASCADE,

    curator_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,

    notification_type TEXT DEFAULT 'relative_pinned',
    message TEXT,

    read BOOLEAN DEFAULT false,
    read_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_pin_notifications_curator ON pin_notifications(curator_id);
CREATE INDEX idx_pin_notifications_unread ON pin_notifications(curator_id, read) WHERE read = false;

ALTER TABLE pin_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own notifications"
ON pin_notifications FOR SELECT
USING (curator_id = auth.uid());

CREATE POLICY "Users can update own notifications"
ON pin_notifications FOR UPDATE
USING (curator_id = auth.uid());

-- Function to notify curators when a relative is pinned
CREATE OR REPLACE FUNCTION notify_curator_of_pin()
RETURNS TRIGGER AS $$
DECLARE
    curator UUID;
    memorial_name TEXT;
    family_name TEXT;
BEGIN
    -- Get memorial info
    SELECT m.name INTO memorial_name
    FROM memorials m
    WHERE m.id = NEW.memorial_id;

    -- Get family member name
    SELECT fm.name INTO family_name
    FROM family_members fm
    WHERE fm.id = NEW.family_member_id;

    -- Notify each curator
    FOR curator IN
        SELECT UNNEST(curator_ids)
        FROM memorials
        WHERE id = NEW.memorial_id
    LOOP
        INSERT INTO pin_notifications (
            memorial_id,
            family_member_id,
            visitor_pin_id,
            curator_id,
            notification_type,
            message
        ) VALUES (
            NEW.memorial_id,
            NEW.family_member_id,
            NEW.id,
            curator,
            'relative_pinned',
            'Someone found ' || family_name || '''s grave near ' || memorial_name || '!'
        );
    END LOOP;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to notify curators
CREATE TRIGGER on_visitor_pin_created
AFTER INSERT ON visitor_pins
FOR EACH ROW
EXECUTE FUNCTION notify_curator_of_pin();

-- Comments
COMMENT ON TABLE family_members IS 'Family members related to a memorial who may be buried nearby. Visitors can help pin these.';
COMMENT ON TABLE visitor_pins IS 'Pins submitted by visitors who find graves of family members.';
COMMENT ON TABLE pin_notifications IS 'Notifications sent to curators when visitors pin family members.';
