-- Wholesale Partners Tables
-- For B2B wholesale accounts and applications

-- Wholesale Applications table (pending applications)
CREATE TABLE IF NOT EXISTS wholesale_applications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Business info
    business_name VARCHAR(255) NOT NULL,
    business_type VARCHAR(100) NOT NULL, -- monument_company, funeral_home, cemetery, retailer, other
    contact_name VARCHAR(255) NOT NULL,
    title VARCHAR(100),
    email VARCHAR(255) NOT NULL,
    phone VARCHAR(50) NOT NULL,
    website VARCHAR(255),

    -- Volume and preferences
    estimated_volume VARCHAR(50) NOT NULL, -- 10-24, 25-49, 50-99, 100+
    timeline VARCHAR(50) DEFAULT 'immediately',
    message TEXT,
    interested_products JSONB DEFAULT '["tags"]', -- tags, books, digital

    -- Processing
    suggested_tier VARCHAR(50) DEFAULT 'starter', -- starter, professional, enterprise
    status VARCHAR(50) DEFAULT 'pending', -- pending, approved, rejected, converted
    reviewed_by UUID REFERENCES auth.users(id),
    reviewed_at TIMESTAMPTZ,
    review_notes TEXT,

    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Approved wholesale partners
CREATE TABLE IF NOT EXISTS wholesale_partners (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id),
    application_id UUID REFERENCES wholesale_applications(id),

    -- Business info
    business_name VARCHAR(255) NOT NULL,
    business_type VARCHAR(100) NOT NULL,
    contact_name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    phone VARCHAR(50),
    website VARCHAR(255),

    -- Account settings
    tier VARCHAR(50) DEFAULT 'starter', -- starter, professional, enterprise
    is_active BOOLEAN DEFAULT true,
    credit_limit DECIMAL(10, 2) DEFAULT 0, -- For net-30 accounts
    payment_terms VARCHAR(50) DEFAULT 'prepaid', -- prepaid, net-15, net-30

    -- Pricing (overrides for custom pricing)
    custom_tag_price DECIMAL(10, 2), -- NULL = use tier default
    custom_book_price DECIMAL(10, 2),
    custom_digital_price DECIMAL(10, 2),

    -- Branding
    logo_url VARCHAR(500),
    co_branded BOOLEAN DEFAULT false,
    white_label BOOLEAN DEFAULT false,
    custom_domain VARCHAR(255),

    -- Stats
    total_orders INT DEFAULT 0,
    total_revenue DECIMAL(12, 2) DEFAULT 0,
    last_order_at TIMESTAMPTZ,

    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Wholesale orders
CREATE TABLE IF NOT EXISTS wholesale_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    partner_id UUID NOT NULL REFERENCES wholesale_partners(id),

    -- Order details
    order_number VARCHAR(50) UNIQUE,
    status VARCHAR(50) DEFAULT 'pending', -- pending, paid, processing, shipped, delivered, cancelled

    -- Items (JSONB for flexibility)
    items JSONB NOT NULL, -- [{type: 'tag', quantity: 10, unit_price: 20.00, subtotal: 200.00}, ...]

    -- Pricing
    subtotal DECIMAL(10, 2) NOT NULL,
    shipping_cost DECIMAL(10, 2) DEFAULT 0,
    tax DECIMAL(10, 2) DEFAULT 0,
    discount DECIMAL(10, 2) DEFAULT 0,
    total DECIMAL(10, 2) NOT NULL,

    -- Payment
    payment_method VARCHAR(50), -- card, invoice, credit
    payment_status VARCHAR(50) DEFAULT 'pending', -- pending, paid, failed, refunded
    stripe_payment_id VARCHAR(255),
    invoice_number VARCHAR(50),
    due_date DATE,
    paid_at TIMESTAMPTZ,

    -- Shipping
    shipping_address JSONB,
    tracking_number VARCHAR(255),
    shipped_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,

    -- Metadata
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_ws_applications_status ON wholesale_applications(status);
CREATE INDEX IF NOT EXISTS idx_ws_applications_email ON wholesale_applications(email);
CREATE INDEX IF NOT EXISTS idx_ws_partners_user ON wholesale_partners(user_id);
CREATE INDEX IF NOT EXISTS idx_ws_partners_tier ON wholesale_partners(tier);
CREATE INDEX IF NOT EXISTS idx_ws_orders_partner ON wholesale_orders(partner_id);
CREATE INDEX IF NOT EXISTS idx_ws_orders_status ON wholesale_orders(status);

-- RLS Policies
ALTER TABLE wholesale_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE wholesale_partners ENABLE ROW LEVEL SECURITY;
ALTER TABLE wholesale_orders ENABLE ROW LEVEL SECURITY;

-- Applications are public to create, but only admins can view all
CREATE POLICY "Anyone can submit applications" ON wholesale_applications
    FOR INSERT WITH CHECK (true);

-- Partners can view their own record
CREATE POLICY "Partners can view own record" ON wholesale_partners
    FOR SELECT USING (user_id = auth.uid());

-- Partners can view their own orders
CREATE POLICY "Partners can view own orders" ON wholesale_orders
    FOR SELECT USING (
        partner_id IN (SELECT id FROM wholesale_partners WHERE user_id = auth.uid())
    );

-- Trigger to update timestamps
CREATE OR REPLACE FUNCTION update_wholesale_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_ws_applications_timestamp ON wholesale_applications;
CREATE TRIGGER update_ws_applications_timestamp
    BEFORE UPDATE ON wholesale_applications
    FOR EACH ROW EXECUTE FUNCTION update_wholesale_timestamp();

DROP TRIGGER IF EXISTS update_ws_partners_timestamp ON wholesale_partners;
CREATE TRIGGER update_ws_partners_timestamp
    BEFORE UPDATE ON wholesale_partners
    FOR EACH ROW EXECUTE FUNCTION update_wholesale_timestamp();

DROP TRIGGER IF EXISTS update_ws_orders_timestamp ON wholesale_orders;
CREATE TRIGGER update_ws_orders_timestamp
    BEFORE UPDATE ON wholesale_orders
    FOR EACH ROW EXECUTE FUNCTION update_wholesale_timestamp();

-- Wholesale pricing tiers reference (stored as a comment for documentation)
COMMENT ON TABLE wholesale_partners IS 'Wholesale pricing tiers:
QR Tags:
- Starter (10+): $25/tag
- Professional (25+): $20/tag
- Enterprise (50+): $15/tag

Memorial Books:
- Starter (5+): $45/book
- Professional (15+): $38/book
- Enterprise (30+): $32/book

Digital Licenses:
- Starter (10+): $12/license
- Professional (25+): $8/license
- Enterprise (50+): $5/license';
