-- ============================================
-- HEADSTONE LEGACY - QR CODE STORAGE POLICIES
-- Migration 010 - Orders and QR code setup
-- ============================================

-- Add qr_code_url column to orders if not exists
ALTER TABLE orders ADD COLUMN IF NOT EXISTS qr_code_url TEXT;

-- ============================================
-- STORAGE POLICIES FOR qr-codes BUCKET
-- Run in SQL Editor after creating the bucket
-- ============================================

-- Allow anyone to read/download QR codes (public bucket)
CREATE POLICY "Public can view QR codes"
ON storage.objects FOR SELECT
USING (bucket_id = 'qr-codes');

-- Allow authenticated users to upload (API uses service role which bypasses RLS)
CREATE POLICY "Authenticated can upload QR codes"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'qr-codes');

-- Allow updates to QR codes
CREATE POLICY "Authenticated can update QR codes"
ON storage.objects FOR UPDATE
USING (bucket_id = 'qr-codes');
