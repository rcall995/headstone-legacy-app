-- ============================================
-- HEADSTONE LEGACY - MEMORIAL BOOKS
-- Migration 021 - Memorial book ordering system
-- ============================================

-- Extend orders table product_type to include books and bundles
-- First, drop and recreate the check constraint to add new values
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_status_check
    CHECK (status IN ('pending', 'paid', 'generating', 'submitted', 'printing', 'shipped', 'delivered', 'cancelled', 'refunded'));

-- Add book-specific columns to orders table
DO $$
BEGIN
    -- Cover template selection
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'cover_template') THEN
        ALTER TABLE orders ADD COLUMN cover_template TEXT DEFAULT 'classic';
    END IF;

    -- Book customization options
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'include_tributes') THEN
        ALTER TABLE orders ADD COLUMN include_tributes BOOLEAN DEFAULT true;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'include_family_tree') THEN
        ALTER TABLE orders ADD COLUMN include_family_tree BOOLEAN DEFAULT true;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'include_timeline') THEN
        ALTER TABLE orders ADD COLUMN include_timeline BOOLEAN DEFAULT true;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'include_residences') THEN
        ALTER TABLE orders ADD COLUMN include_residences BOOLEAN DEFAULT true;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'include_gallery') THEN
        ALTER TABLE orders ADD COLUMN include_gallery BOOLEAN DEFAULT true;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'dedication_text') THEN
        ALTER TABLE orders ADD COLUMN dedication_text TEXT;
    END IF;

    -- Generated PDF info
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'pdf_url') THEN
        ALTER TABLE orders ADD COLUMN pdf_url TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'page_count') THEN
        ALTER TABLE orders ADD COLUMN page_count INTEGER;
    END IF;

    -- Print partner integration (Lulu)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'lulu_order_id') THEN
        ALTER TABLE orders ADD COLUMN lulu_order_id TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'lulu_line_item_id') THEN
        ALTER TABLE orders ADD COLUMN lulu_line_item_id TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'shipping_carrier') THEN
        ALTER TABLE orders ADD COLUMN shipping_carrier TEXT;
    END IF;

    -- Bundle support - multiple memorials per order
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'memorial_ids') THEN
        ALTER TABLE orders ADD COLUMN memorial_ids TEXT[] DEFAULT '{}';
    END IF;

    -- Bundle items breakdown
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'items') THEN
        ALTER TABLE orders ADD COLUMN items JSONB DEFAULT '[]';
    END IF;

    -- Timestamps for status tracking
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'pdf_generated_at') THEN
        ALTER TABLE orders ADD COLUMN pdf_generated_at TIMESTAMPTZ;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'submitted_to_printer_at') THEN
        ALTER TABLE orders ADD COLUMN submitted_to_printer_at TIMESTAMPTZ;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'shipped_at') THEN
        ALTER TABLE orders ADD COLUMN shipped_at TIMESTAMPTZ;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'delivered_at') THEN
        ALTER TABLE orders ADD COLUMN delivered_at TIMESTAMPTZ;
    END IF;

    -- Customer notification preferences
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'notification_email') THEN
        ALTER TABLE orders ADD COLUMN notification_email TEXT;
    END IF;
END $$;

-- ============================================
-- BOOK TEMPLATES (cover designs)
-- ============================================
CREATE TABLE IF NOT EXISTS book_templates (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    preview_image_url TEXT,
    css_class TEXT,
    is_active BOOLEAN DEFAULT true,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default templates
INSERT INTO book_templates (id, name, description, css_class, sort_order) VALUES
    ('classic', 'Classic', 'Elegant black and gold design with traditional styling', 'template-classic', 1),
    ('modern', 'Modern', 'Clean, minimalist white design with contemporary typography', 'template-modern', 2),
    ('nature', 'Nature', 'Soft floral elements with earth tones', 'template-nature', 3),
    ('faith', 'Faith', 'Peaceful design with subtle religious imagery', 'template-faith', 4)
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- PRODUCT CATALOG
-- ============================================
CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    price_cents INTEGER NOT NULL,
    product_type TEXT NOT NULL, -- 'tag', 'book', 'cards', 'bundle'
    includes JSONB DEFAULT '[]', -- For bundles: list of included product IDs and quantities
    is_active BOOLEAN DEFAULT true,
    image_url TEXT,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert product catalog
INSERT INTO products (id, name, description, price_cents, product_type, includes, sort_order) VALUES
    ('tag_standard', 'Memorial QR Tag', 'Weatherproof 316 stainless steel QR code tag', 3900, 'tag', '[]', 1),
    ('book_hardcover', 'Memorial Book', 'Beautiful hardcover memorial book (40+ pages)', 7900, 'book', '[]', 2),
    ('cards_10pack', 'Keepsake Cards (10)', 'Wallet-sized memorial cards with QR code', 1900, 'cards', '[]', 3),
    ('bundle_legacy', 'Legacy Bundle', 'QR Tag + Memorial Book + 10 Keepsake Cards', 14900, 'bundle', '[{"product_id": "tag_standard", "qty": 1}, {"product_id": "book_hardcover", "qty": 1}, {"product_id": "cards_10pack", "qty": 1}]', 4),
    ('bundle_family', 'Family Package', '3 QR Tags + 3 Memorial Books + 30 Keepsake Cards', 24900, 'bundle', '[{"product_id": "tag_standard", "qty": 3}, {"product_id": "book_hardcover", "qty": 3}, {"product_id": "cards_10pack", "qty": 3}]', 5)
ON CONFLICT (id) DO UPDATE SET
    price_cents = EXCLUDED.price_cents,
    description = EXCLUDED.description,
    includes = EXCLUDED.includes;

-- RLS for products (public read)
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Products are viewable by everyone" ON products FOR SELECT USING (true);

-- RLS for book_templates (public read)
ALTER TABLE book_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Book templates are viewable by everyone" ON book_templates FOR SELECT USING (true);

-- ============================================
-- STORAGE BUCKET FOR BOOK PDFs
-- ============================================
-- Create a storage bucket named 'book-pdfs' in Supabase Dashboard
-- Settings:
--   - Name: book-pdfs
--   - Public: No (private, accessed via signed URLs)
--   - File size limit: 100MB
--   - Allowed MIME types: application/pdf

-- ============================================
-- HELPER FUNCTION: Get order with product details
-- ============================================
CREATE OR REPLACE FUNCTION get_order_with_details(order_id UUID)
RETURNS JSON AS $$
DECLARE
    result JSON;
BEGIN
    SELECT json_build_object(
        'order', row_to_json(o),
        'memorial', row_to_json(m),
        'product', row_to_json(p)
    ) INTO result
    FROM orders o
    LEFT JOIN memorials m ON o.memorial_id = m.id
    LEFT JOIN products p ON o.product_type = p.id
    WHERE o.id = order_id;

    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- INDEX for faster order lookups
-- ============================================
CREATE INDEX IF NOT EXISTS idx_orders_product_type ON orders (product_type);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders (status);
CREATE INDEX IF NOT EXISTS idx_orders_lulu_order_id ON orders (lulu_order_id);
