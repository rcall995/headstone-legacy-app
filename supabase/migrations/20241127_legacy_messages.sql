-- Legacy Messages (Posthumous Communication) Feature
-- Allows users to schedule messages to be delivered after they pass

-- Create legacy_messages table
CREATE TABLE IF NOT EXISTS legacy_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    memorial_id UUID NOT NULL REFERENCES memorials(id) ON DELETE CASCADE,
    created_by UUID NOT NULL REFERENCES auth.users(id),

    -- Recipient information
    recipient_name VARCHAR(255) NOT NULL,
    recipient_email VARCHAR(255) NOT NULL,
    recipient_phone VARCHAR(50),
    recipient_relationship VARCHAR(100), -- e.g., "daughter", "grandson", "friend"

    -- Message content
    message_type VARCHAR(50) NOT NULL DEFAULT 'milestone',
    -- Types: 'milestone' (birthday, graduation), 'anniversary' (wedding, memorial),
    --        'wisdom' (life advice), 'conditional' (triggered by event)

    subject VARCHAR(255) NOT NULL,
    message_content TEXT NOT NULL,
    attachment_urls JSONB DEFAULT '[]', -- Array of attachment URLs (photos, videos, documents)

    -- Delivery settings
    delivery_type VARCHAR(50) NOT NULL DEFAULT 'scheduled',
    -- Types: 'scheduled' (specific date), 'recurring' (annual), 'conditional' (manual trigger)

    scheduled_date DATE, -- For one-time scheduled messages
    recurring_month INT, -- 1-12 for recurring annual messages
    recurring_day INT, -- 1-31 for recurring annual messages
    recurring_description VARCHAR(255), -- e.g., "Sarah's birthday", "Our anniversary"

    -- Conditional delivery settings
    trigger_condition VARCHAR(255), -- Description of what should trigger delivery
    trigger_keywords JSONB DEFAULT '[]', -- Keywords that family can use to trigger

    -- Status tracking
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    -- Status: 'draft', 'pending', 'sent', 'cancelled', 'failed'

    is_active BOOLEAN DEFAULT true,
    last_sent_at TIMESTAMPTZ,
    send_count INT DEFAULT 0,

    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for efficient queries
CREATE INDEX IF NOT EXISTS idx_legacy_messages_memorial ON legacy_messages(memorial_id);
CREATE INDEX IF NOT EXISTS idx_legacy_messages_status ON legacy_messages(status);
CREATE INDEX IF NOT EXISTS idx_legacy_messages_scheduled ON legacy_messages(scheduled_date) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_legacy_messages_recurring ON legacy_messages(recurring_month, recurring_day) WHERE delivery_type = 'recurring' AND is_active = true;

-- Create delivery log table to track sent messages
CREATE TABLE IF NOT EXISTS legacy_message_deliveries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id UUID NOT NULL REFERENCES legacy_messages(id) ON DELETE CASCADE,

    delivered_at TIMESTAMPTZ DEFAULT NOW(),
    delivery_method VARCHAR(50) DEFAULT 'email', -- 'email', 'sms', 'notification'
    delivery_status VARCHAR(50) NOT NULL, -- 'sent', 'delivered', 'opened', 'failed', 'bounced'

    recipient_email VARCHAR(255),
    recipient_phone VARCHAR(50),

    -- Tracking
    email_provider_id VARCHAR(255), -- ID from email service (SendGrid, etc.)
    error_message TEXT,

    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_legacy_deliveries_message ON legacy_message_deliveries(message_id);

-- RLS Policies
ALTER TABLE legacy_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE legacy_message_deliveries ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view/edit legacy messages for memorials they curate
CREATE POLICY "Curators can manage legacy messages" ON legacy_messages
    FOR ALL
    USING (
        memorial_id IN (
            SELECT id FROM memorials WHERE created_by = auth.uid() OR auth.uid() = ANY(curator_ids)
        )
    );

-- Policy: Anyone can view delivery logs for messages they created
CREATE POLICY "Creators can view deliveries" ON legacy_message_deliveries
    FOR SELECT
    USING (
        message_id IN (
            SELECT id FROM legacy_messages WHERE created_by = auth.uid()
        )
    );

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_legacy_message_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for updated_at
DROP TRIGGER IF EXISTS update_legacy_messages_timestamp ON legacy_messages;
CREATE TRIGGER update_legacy_messages_timestamp
    BEFORE UPDATE ON legacy_messages
    FOR EACH ROW
    EXECUTE FUNCTION update_legacy_message_timestamp();

-- Sample message templates (stored as a reference, not a table)
COMMENT ON TABLE legacy_messages IS 'Scheduled posthumous messages. Message types:
- milestone: For specific life events (birthdays, graduations, weddings)
- anniversary: For remembrance dates (death anniversary, wedding anniversary)
- wisdom: Life advice and lessons to be shared
- conditional: Triggered by family members when appropriate

Delivery types:
- scheduled: One-time delivery on a specific date
- recurring: Annual delivery (e.g., every birthday)
- conditional: Delivered when family triggers it manually';
