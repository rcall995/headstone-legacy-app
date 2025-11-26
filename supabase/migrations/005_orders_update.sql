-- ============================================
-- HEADSTONE LEGACY - ORDERS UPDATE
-- Migration 005 - Enhanced order tracking for Stripe
-- ============================================

-- Add new columns to orders table if they don't exist
DO $$
BEGIN
    -- Stripe-specific columns
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'stripe_session_id') THEN
        ALTER TABLE orders ADD COLUMN stripe_session_id TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'stripe_payment_intent_id') THEN
        ALTER TABLE orders ADD COLUMN stripe_payment_intent_id TEXT;
    END IF;

    -- Product details
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'product_tier') THEN
        ALTER TABLE orders ADD COLUMN product_tier TEXT DEFAULT 'premium';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'quantity') THEN
        ALTER TABLE orders ADD COLUMN quantity INTEGER DEFAULT 1;
    END IF;

    -- Referral tracking
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'referral_id') THEN
        ALTER TABLE orders ADD COLUMN referral_id UUID REFERENCES referrals(id);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'partner_id') THEN
        ALTER TABLE orders ADD COLUMN partner_id UUID REFERENCES partners(id);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'commission_amount') THEN
        ALTER TABLE orders ADD COLUMN commission_amount DECIMAL(10,2);
    END IF;

    -- Customer info (from Stripe)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'customer_email') THEN
        ALTER TABLE orders ADD COLUMN customer_email TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'customer_name') THEN
        ALTER TABLE orders ADD COLUMN customer_name TEXT;
    END IF;

    -- Fulfillment
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'shipped_at') THEN
        ALTER TABLE orders ADD COLUMN shipped_at TIMESTAMPTZ;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'delivered_at') THEN
        ALTER TABLE orders ADD COLUMN delivered_at TIMESTAMPTZ;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'notes') THEN
        ALTER TABLE orders ADD COLUMN notes TEXT;
    END IF;
END $$;

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_orders_stripe_session ON orders(stripe_session_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_partner_id ON orders(partner_id);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at DESC);

-- Update RLS policy to allow webhook to update orders
DROP POLICY IF EXISTS "Service role can manage orders" ON orders;
CREATE POLICY "Service role can manage orders" ON orders
    FOR ALL USING (true) WITH CHECK (true);

-- Allow users to insert their own orders
DROP POLICY IF EXISTS "Users can insert own orders" ON orders;
CREATE POLICY "Users can insert own orders" ON orders
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- View for order analytics
CREATE OR REPLACE VIEW order_analytics AS
SELECT
    DATE_TRUNC('day', created_at) as order_date,
    COUNT(*) as order_count,
    SUM(amount_cents) / 100.0 as revenue,
    SUM(commission_amount) as commissions_owed,
    COUNT(DISTINCT partner_id) as partners_with_sales
FROM orders
WHERE status = 'paid'
GROUP BY DATE_TRUNC('day', created_at)
ORDER BY order_date DESC;
