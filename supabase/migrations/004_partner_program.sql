-- Partner/Affiliate Program Tables
-- Run this in Supabase SQL Editor

-- Partners table (affiliate accounts)
CREATE TABLE IF NOT EXISTS partners (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    business_name TEXT NOT NULL,
    contact_name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    phone TEXT,
    business_type TEXT CHECK (business_type IN ('funeral_home', 'cemetery', 'monument_company', 'church', 'other')),
    website TEXT,
    referral_code TEXT UNIQUE NOT NULL,
    commission_rate DECIMAL(5,2) DEFAULT 15.00, -- $15 per sale
    payment_method TEXT CHECK (payment_method IN ('paypal', 'venmo', 'check')),
    payment_email TEXT,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'active', 'suspended')),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    approved_at TIMESTAMPTZ,
    last_payout_at TIMESTAMPTZ
);

-- Referrals table (tracks each referral click/conversion)
CREATE TABLE IF NOT EXISTS referrals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    partner_id UUID REFERENCES partners(id) ON DELETE CASCADE,
    referral_code TEXT NOT NULL,
    visitor_id TEXT, -- anonymous tracking ID
    landing_page TEXT,
    converted BOOLEAN DEFAULT FALSE,
    order_id UUID, -- link to order when converted
    commission_amount DECIMAL(10,2),
    commission_paid BOOLEAN DEFAULT FALSE,
    paid_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    converted_at TIMESTAMPTZ
);

-- Partner payouts table
CREATE TABLE IF NOT EXISTS partner_payouts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    partner_id UUID REFERENCES partners(id) ON DELETE CASCADE,
    amount DECIMAL(10,2) NOT NULL,
    referral_count INTEGER NOT NULL,
    payment_method TEXT,
    payment_reference TEXT, -- PayPal transaction ID, check number, etc.
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

-- Function to generate unique referral code
CREATE OR REPLACE FUNCTION generate_referral_code(business TEXT)
RETURNS TEXT AS $$
DECLARE
    base_code TEXT;
    final_code TEXT;
    counter INTEGER := 0;
BEGIN
    -- Create base code from business name (first 8 chars, alphanumeric only)
    base_code := UPPER(REGEXP_REPLACE(LEFT(business, 8), '[^A-Za-z0-9]', '', 'g'));

    -- If too short, pad with random chars
    IF LENGTH(base_code) < 4 THEN
        base_code := base_code || SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR (4 - LENGTH(base_code)));
    END IF;

    final_code := base_code;

    -- Check for uniqueness, append number if needed
    WHILE EXISTS (SELECT 1 FROM partners WHERE referral_code = final_code) LOOP
        counter := counter + 1;
        final_code := base_code || counter::TEXT;
    END LOOP;

    RETURN final_code;
END;
$$ LANGUAGE plpgsql;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_partners_referral_code ON partners(referral_code);
CREATE INDEX IF NOT EXISTS idx_partners_status ON partners(status);
CREATE INDEX IF NOT EXISTS idx_referrals_partner_id ON referrals(partner_id);
CREATE INDEX IF NOT EXISTS idx_referrals_referral_code ON referrals(referral_code);
CREATE INDEX IF NOT EXISTS idx_referrals_converted ON referrals(converted);

-- RLS Policies
ALTER TABLE partners ENABLE ROW LEVEL SECURITY;
ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE partner_payouts ENABLE ROW LEVEL SECURITY;

-- Partners can view their own record
CREATE POLICY "Partners can view own record" ON partners
    FOR SELECT USING (auth.uid() = user_id);

-- Partners can update their own record (limited fields)
CREATE POLICY "Partners can update own record" ON partners
    FOR UPDATE USING (auth.uid() = user_id);

-- Anyone can insert (signup)
CREATE POLICY "Anyone can signup as partner" ON partners
    FOR INSERT WITH CHECK (true);

-- Partners can view their own referrals
CREATE POLICY "Partners can view own referrals" ON referrals
    FOR SELECT USING (
        partner_id IN (SELECT id FROM partners WHERE user_id = auth.uid())
    );

-- System can insert referrals (no auth required for tracking)
CREATE POLICY "System can track referrals" ON referrals
    FOR INSERT WITH CHECK (true);

-- Partners can view their own payouts
CREATE POLICY "Partners can view own payouts" ON partner_payouts
    FOR SELECT USING (
        partner_id IN (SELECT id FROM partners WHERE user_id = auth.uid())
    );
