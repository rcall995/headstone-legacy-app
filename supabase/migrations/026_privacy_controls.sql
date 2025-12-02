-- ============================================
-- PRIVACY CONTROLS FOR MEMORIALS
-- Migration 026
-- ============================================

-- Add privacy control columns to memorials table
ALTER TABLE memorials ADD COLUMN IF NOT EXISTS show_dates BOOLEAN DEFAULT TRUE;
ALTER TABLE memorials ADD COLUMN IF NOT EXISTS show_gallery BOOLEAN DEFAULT TRUE;
ALTER TABLE memorials ADD COLUMN IF NOT EXISTS show_family_tree BOOLEAN DEFAULT TRUE;
ALTER TABLE memorials ADD COLUMN IF NOT EXISTS show_guest_book BOOLEAN DEFAULT TRUE;
ALTER TABLE memorials ADD COLUMN IF NOT EXISTS show_timeline BOOLEAN DEFAULT TRUE;
