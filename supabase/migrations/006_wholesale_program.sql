-- ============================================
-- HEADSTONE LEGACY - WHOLESALE PROGRAM
-- Migration 006 - Wholesale accounts and orders
-- ============================================

-- Wholesale applications table
CREATE TABLE IF NOT EXISTS wholesale_applications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_name TEXT NOT NULL,
    business_type TEXT NOT NULL,
    contact_name TEXT NOT NULL,
    title TEXT,
    email TEXT NOT NULL,
    phone TEXT NOT NULL,
    website TEXT,
    estimated_volume TEXT,
    timeline TEXT,
    message TEXT,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    reviewed_by UUID REFERENCES auth.users(id),
    reviewed_at TIMESTAMPTZ,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wholesale_apps_status ON wholesale_applications(status);
CREATE INDEX IF NOT EXISTS idx_wholesale_apps_email ON wholesale_applications(email);

-- Wholesale accounts (approved applications become accounts)
CREATE TABLE IF NOT EXISTS wholesale_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    application_id UUID REFERENCES wholesale_applications(id),
    user_id UUID REFERENCES auth.users(id),
    business_name TEXT NOT NULL,
    business_type TEXT NOT NULL,
    contact_name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    phone TEXT,
    website TEXT,

    -- Pricing tier
    pricing_tier TEXT DEFAULT 'starter' CHECK (pricing_tier IN ('starter', 'professional', 'enterprise')),
    price_per_tag DECIMAL(10,2) DEFAULT 25.00,

    -- Payment terms
    payment_terms TEXT DEFAULT 'prepaid' CHECK (payment_terms IN ('prepaid', 'net15', 'net30')),
    credit_limit DECIMAL(10,2) DEFAULT 0,

    -- Status
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'closed')),

    -- Custom options
    custom_branding BOOLEAN DEFAULT FALSE,
    white_label BOOLEAN DEFAULT FALSE,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wholesale_accounts_user ON wholesale_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_wholesale_accounts_status ON wholesale_accounts(status);

-- Wholesale orders
CREATE TABLE IF NOT EXISTS wholesale_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID REFERENCES wholesale_accounts(id) ON DELETE CASCADE,

    -- Order details
    quantity INTEGER NOT NULL,
    price_per_tag DECIMAL(10,2) NOT NULL,
    subtotal DECIMAL(10,2) NOT NULL,
    shipping DECIMAL(10,2) DEFAULT 0,
    total DECIMAL(10,2) NOT NULL,

    -- Tag type
    tag_type TEXT DEFAULT 'premium' CHECK (tag_type IN ('basic', 'premium', 'deluxe')),

    -- Pre-linked or blank tags
    pre_linked BOOLEAN DEFAULT FALSE,
    memorial_ids TEXT[], -- Array of memorial IDs if pre-linked

    -- Payment
    payment_status TEXT DEFAULT 'pending' CHECK (payment_status IN ('pending', 'paid', 'invoiced', 'overdue')),
    stripe_payment_id TEXT,
    invoice_number TEXT,
    paid_at TIMESTAMPTZ,

    -- Fulfillment
    order_status TEXT DEFAULT 'pending' CHECK (order_status IN ('pending', 'processing', 'shipped', 'delivered', 'cancelled')),
    tracking_number TEXT,
    shipped_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,

    -- Shipping address
    shipping_address JSONB,

    -- Notes
    notes TEXT,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wholesale_orders_account ON wholesale_orders(account_id);
CREATE INDEX IF NOT EXISTS idx_wholesale_orders_status ON wholesale_orders(order_status);
CREATE INDEX IF NOT EXISTS idx_wholesale_orders_payment ON wholesale_orders(payment_status);

-- RLS Policies
ALTER TABLE wholesale_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE wholesale_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE wholesale_orders ENABLE ROW LEVEL SECURITY;

-- Anyone can submit applications
CREATE POLICY "Anyone can submit wholesale application" ON wholesale_applications
    FOR INSERT WITH CHECK (true);

-- Users can view their own applications
CREATE POLICY "Users can view own applications" ON wholesale_applications
    FOR SELECT USING (email = (SELECT email FROM auth.users WHERE id = auth.uid()));

-- Wholesale accounts: Users can view/manage their own
CREATE POLICY "Users can view own wholesale account" ON wholesale_accounts
    FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can update own wholesale account" ON wholesale_accounts
    FOR UPDATE USING (user_id = auth.uid());

-- Wholesale orders: Users can view/manage their own
CREATE POLICY "Users can view own wholesale orders" ON wholesale_orders
    FOR SELECT USING (
        account_id IN (SELECT id FROM wholesale_accounts WHERE user_id = auth.uid())
    );

CREATE POLICY "Users can insert wholesale orders" ON wholesale_orders
    FOR INSERT WITH CHECK (
        account_id IN (SELECT id FROM wholesale_accounts WHERE user_id = auth.uid())
    );

-- View for wholesale dashboard
CREATE OR REPLACE VIEW wholesale_dashboard AS
SELECT
    wa.id as account_id,
    wa.business_name,
    wa.pricing_tier,
    wa.price_per_tag,
    wa.status,
    COUNT(wo.id) as total_orders,
    COALESCE(SUM(wo.quantity), 0) as total_tags_ordered,
    COALESCE(SUM(wo.total), 0) as total_spent,
    MAX(wo.created_at) as last_order_date
FROM wholesale_accounts wa
LEFT JOIN wholesale_orders wo ON wa.id = wo.account_id AND wo.payment_status = 'paid'
GROUP BY wa.id;
