-- ============================================
-- HEADSTONE LEGACY - QR CODE FOR ORDERS
-- Migration 009 - Add QR code URL to orders
-- ============================================

-- Add qr_code_url column to orders
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'qr_code_url') THEN
        ALTER TABLE orders ADD COLUMN qr_code_url TEXT;
    END IF;
END $$;

-- ============================================
-- STORAGE BUCKET (Create manually in Dashboard)
-- ============================================
-- Create a PUBLIC bucket named 'qr-codes'
-- This stores the generated QR code images for orders
-- Settings:
--   - Name: qr-codes
--   - Public: Yes (so engraving shop can access)
--   - File size limit: 5MB
--   - Allowed MIME types: image/png
