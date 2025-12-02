-- Migration: Add birth_place and death_place to memorials
-- Date: 2025-11-28
-- Purpose: Allow users to record the location where someone was born and died

-- Add birth_place column (city, state/country or full address)
ALTER TABLE memorials ADD COLUMN IF NOT EXISTS birth_place TEXT;

-- Add death_place column (city, state/country or full address)
ALTER TABLE memorials ADD COLUMN IF NOT EXISTS death_place TEXT;

-- Add comments for documentation
COMMENT ON COLUMN memorials.birth_place IS 'Place of birth (city, state/country)';
COMMENT ON COLUMN memorials.death_place IS 'Place of death (city, state/country)';
