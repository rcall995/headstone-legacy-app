-- ============================================
-- HEADSTONE LEGACY - ADMIN POLICIES & NOTIFICATIONS
-- Migration 008 - Fix RLS for admin access + email notifications
-- ============================================

-- ============================================
-- PART 1: ADMIN POLICIES FOR WHOLESALE
-- ============================================

-- Create an admin check function (you can add your user ID here)
-- Replace 'YOUR_USER_ID_HERE' with your actual Supabase user ID
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
BEGIN
    -- Add your admin user IDs here
    RETURN auth.uid() IN (
        SELECT id FROM auth.users
        WHERE email IN (
            'your-email@example.com'  -- Replace with your actual email
        )
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Allow admins to view ALL wholesale applications
CREATE POLICY "Admins can view all wholesale applications" ON wholesale_applications
    FOR SELECT USING (is_admin());

-- Allow admins to update wholesale applications (approve/reject)
CREATE POLICY "Admins can update wholesale applications" ON wholesale_applications
    FOR UPDATE USING (is_admin());

-- Allow admins to view all wholesale accounts
CREATE POLICY "Admins can view all wholesale accounts" ON wholesale_accounts
    FOR SELECT USING (is_admin());

-- Allow admins to insert wholesale accounts (when approving)
CREATE POLICY "Admins can create wholesale accounts" ON wholesale_accounts
    FOR INSERT WITH CHECK (is_admin());

-- Allow admins to update wholesale accounts
CREATE POLICY "Admins can update wholesale accounts" ON wholesale_accounts
    FOR UPDATE USING (is_admin());

-- ============================================
-- PART 2: ADMIN POLICIES FOR PARTNERS
-- ============================================

-- Allow admins to view all partners
CREATE POLICY "Admins can view all partners" ON partners
    FOR SELECT USING (is_admin());

-- ============================================
-- PART 3: ADMIN POLICIES FOR TRIBUTES
-- ============================================

-- Allow admins to view all tributes
CREATE POLICY "Admins can view all tributes" ON tributes
    FOR SELECT USING (is_admin());

-- Allow admins to update tributes (approve/reject)
CREATE POLICY "Admins can update tributes" ON tributes
    FOR UPDATE USING (is_admin());

-- Allow admins to delete tributes
CREATE POLICY "Admins can delete tributes" ON tributes
    FOR DELETE USING (is_admin());

-- ============================================
-- PART 4: EMAIL NOTIFICATION SETUP
-- ============================================

-- Create a table to store notification settings
CREATE TABLE IF NOT EXISTS notification_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    notification_type TEXT NOT NULL UNIQUE,
    enabled BOOLEAN DEFAULT TRUE,
    recipient_email TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default notification settings
INSERT INTO notification_settings (notification_type, recipient_email, enabled)
VALUES
    ('wholesale_application', 'your-email@example.com', true),
    ('partner_signup', 'your-email@example.com', true),
    ('new_tribute', 'your-email@example.com', true)
ON CONFLICT (notification_type) DO NOTHING;

-- Create a table to queue notifications (for edge function to process)
CREATE TABLE IF NOT EXISTS notification_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    notification_type TEXT NOT NULL,
    payload JSONB NOT NULL,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    sent_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_notification_queue_status ON notification_queue(status);

-- Function to queue a notification
CREATE OR REPLACE FUNCTION queue_notification(
    p_type TEXT,
    p_payload JSONB
)
RETURNS void AS $$
BEGIN
    INSERT INTO notification_queue (notification_type, payload)
    VALUES (p_type, p_payload);
END;
$$ LANGUAGE plpgsql;

-- Trigger function for wholesale application notifications
CREATE OR REPLACE FUNCTION notify_wholesale_application()
RETURNS TRIGGER AS $$
BEGIN
    PERFORM queue_notification(
        'wholesale_application',
        jsonb_build_object(
            'id', NEW.id,
            'business_name', NEW.business_name,
            'business_type', NEW.business_type,
            'contact_name', NEW.contact_name,
            'email', NEW.email,
            'phone', NEW.phone,
            'estimated_volume', NEW.estimated_volume,
            'created_at', NEW.created_at
        )
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for wholesale applications
DROP TRIGGER IF EXISTS wholesale_application_notify ON wholesale_applications;
CREATE TRIGGER wholesale_application_notify
    AFTER INSERT ON wholesale_applications
    FOR EACH ROW
    EXECUTE FUNCTION notify_wholesale_application();

-- Trigger function for partner signup notifications
CREATE OR REPLACE FUNCTION notify_partner_signup()
RETURNS TRIGGER AS $$
BEGIN
    PERFORM queue_notification(
        'partner_signup',
        jsonb_build_object(
            'id', NEW.id,
            'business_name', NEW.business_name,
            'contact_name', NEW.contact_name,
            'email', NEW.email,
            'referral_code', NEW.referral_code,
            'created_at', NEW.created_at
        )
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for partner signups
DROP TRIGGER IF EXISTS partner_signup_notify ON partners;
CREATE TRIGGER partner_signup_notify
    AFTER INSERT ON partners
    FOR EACH ROW
    EXECUTE FUNCTION notify_partner_signup();

-- Grant access to notification tables
ALTER TABLE notification_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_queue ENABLE ROW LEVEL SECURITY;

-- Only admins can view notification settings
CREATE POLICY "Admins can manage notification settings" ON notification_settings
    FOR ALL USING (is_admin());

-- Service role can manage notification queue (for edge function)
CREATE POLICY "Service role manages notification queue" ON notification_queue
    FOR ALL USING (true);

-- ============================================
-- INSTRUCTIONS:
-- ============================================
-- 1. Replace 'your-email@example.com' in is_admin() function with your actual email
-- 2. Replace 'your-email@example.com' in notification_settings with your email
-- 3. Run this migration in Supabase SQL Editor
-- 4. Set up a Supabase Edge Function or Database Webhook to process the notification_queue
-- ============================================
