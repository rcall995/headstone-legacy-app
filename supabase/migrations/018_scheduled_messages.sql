-- Migration: 018_scheduled_messages.sql
-- Scheduled Legacy Messages - Future message delivery system

-- Main messages table
CREATE TABLE IF NOT EXISTS legacy_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    memorial_id TEXT REFERENCES memorials(id) ON DELETE CASCADE,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,

    -- Message Content
    message_type TEXT NOT NULL CHECK (message_type IN ('text', 'video', 'audio')),
    title TEXT,
    content TEXT,               -- For text messages
    media_url TEXT,             -- For video/audio stored in Supabase

    -- Delivery Settings
    recipient_name TEXT NOT NULL,
    recipient_email TEXT NOT NULL,
    recipient_relationship TEXT, -- daughter, son, spouse, grandchild, friend, etc.

    -- Trigger Conditions
    delivery_type TEXT NOT NULL CHECK (delivery_type IN ('date', 'milestone', 'conditional', 'anniversary')),
    delivery_date DATE,          -- For specific date delivery
    milestone_type TEXT,         -- graduation, wedding, first_child, 18th_birthday, 21st_birthday
    milestone_year INTEGER,      -- Expected year (can be updated by family)
    anniversary_type TEXT,       -- birth, death, wedding
    years_after INTEGER,         -- For "X years after death" type messages

    -- Status Tracking
    status TEXT DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'pending_approval', 'delivered', 'failed', 'cancelled')),
    delivered_at TIMESTAMPTZ,
    delivery_attempts INTEGER DEFAULT 0,
    last_attempt_at TIMESTAMPTZ,

    -- Pre-need vs Post-need
    is_pre_need BOOLEAN DEFAULT false, -- Created by subject themselves (before death)
    executor_id UUID REFERENCES auth.users(id), -- Who can trigger/manage pre-need messages
    executor_approved BOOLEAN DEFAULT false, -- For pre-need: executor must confirm after passing

    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Delivery attempt logging
CREATE TABLE IF NOT EXISTS message_delivery_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id UUID REFERENCES legacy_messages(id) ON DELETE CASCADE,
    attempt_at TIMESTAMPTZ DEFAULT NOW(),
    status TEXT NOT NULL CHECK (status IN ('sent', 'bounced', 'opened', 'clicked', 'failed')),
    email_provider_id TEXT, -- SendGrid/Resend message ID
    error_message TEXT,
    recipient_email TEXT,
    metadata JSONB DEFAULT '{}'::jsonb
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_legacy_messages_memorial ON legacy_messages(memorial_id);
CREATE INDEX IF NOT EXISTS idx_legacy_messages_creator ON legacy_messages(created_by);
CREATE INDEX IF NOT EXISTS idx_legacy_messages_status ON legacy_messages(status);
CREATE INDEX IF NOT EXISTS idx_legacy_messages_delivery_date ON legacy_messages(delivery_date) WHERE status = 'scheduled';
CREATE INDEX IF NOT EXISTS idx_legacy_messages_executor ON legacy_messages(executor_id) WHERE is_pre_need = true;

CREATE INDEX IF NOT EXISTS idx_message_delivery_log_message ON message_delivery_log(message_id);
CREATE INDEX IF NOT EXISTS idx_message_delivery_log_status ON message_delivery_log(status);

-- RLS Policies
ALTER TABLE legacy_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_delivery_log ENABLE ROW LEVEL SECURITY;

-- Users can view messages they created
CREATE POLICY "Users can view own messages"
ON legacy_messages FOR SELECT
USING (auth.uid() = created_by OR auth.uid() = executor_id);

-- Users can create messages for memorials they curate
CREATE POLICY "Curators can create messages"
ON legacy_messages FOR INSERT
WITH CHECK (
    auth.uid() = created_by
    AND EXISTS (
        SELECT 1 FROM memorials m
        WHERE m.id = memorial_id
        AND auth.uid() = ANY(m.curator_ids)
    )
);

-- Users can update their own messages
CREATE POLICY "Users can update own messages"
ON legacy_messages FOR UPDATE
USING (auth.uid() = created_by OR auth.uid() = executor_id);

-- Users can delete their own scheduled messages
CREATE POLICY "Users can delete own messages"
ON legacy_messages FOR DELETE
USING (auth.uid() = created_by AND status = 'scheduled');

-- Delivery logs viewable by message creator
CREATE POLICY "Users can view own message logs"
ON message_delivery_log FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM legacy_messages m
        WHERE m.id = message_id
        AND (auth.uid() = m.created_by OR auth.uid() = m.executor_id)
    )
);

-- Function to update timestamp
CREATE OR REPLACE FUNCTION update_legacy_message_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for auto-updating timestamp
DROP TRIGGER IF EXISTS legacy_messages_updated_at ON legacy_messages;
CREATE TRIGGER legacy_messages_updated_at
    BEFORE UPDATE ON legacy_messages
    FOR EACH ROW
    EXECUTE FUNCTION update_legacy_message_timestamp();

-- Create storage bucket for legacy message media
-- NOTE: Run this in Supabase dashboard or via CLI:
-- INSERT INTO storage.buckets (id, name, public) VALUES ('legacy-messages', 'legacy-messages', false);

COMMENT ON TABLE legacy_messages IS 'Scheduled future messages from/about the deceased. Supports pre-need (created by person before death) and post-need (created by family after).';
COMMENT ON COLUMN legacy_messages.milestone_type IS 'Supported: graduation, wedding, first_child, 18th_birthday, 21st_birthday, retirement, custom';
COMMENT ON COLUMN legacy_messages.anniversary_type IS 'Supported: birth (birthday), death (passing anniversary), wedding';
