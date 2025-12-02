-- Migration: Add header_image to memorials for custom backgrounds
-- Date: 2025-11-28
-- Purpose: Allow users to customize memorial header with preset or custom background images

-- Add header_image column (can be a URL to preset image or uploaded image)
ALTER TABLE memorials ADD COLUMN IF NOT EXISTS header_image TEXT;

-- Add header_image_type to track if it's a preset or custom upload
ALTER TABLE memorials ADD COLUMN IF NOT EXISTS header_image_type TEXT DEFAULT 'preset' CHECK (header_image_type IN ('preset', 'custom'));

COMMENT ON COLUMN memorials.header_image IS 'URL to header background image (preset or custom uploaded)';
COMMENT ON COLUMN memorials.header_image_type IS 'Whether the header image is a preset or custom upload';
