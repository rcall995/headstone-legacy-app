-- Migration 016: Gravesite Pin Feature
-- Adds precise gravesite location separate from cemetery location

-- Add gravesite coordinates to memorials table
ALTER TABLE memorials
ADD COLUMN IF NOT EXISTS gravesite_lat DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS gravesite_lng DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS gravesite_accuracy DOUBLE PRECISION; -- accuracy in meters from GPS

-- Add index for geospatial queries on gravesite location
CREATE INDEX IF NOT EXISTS idx_memorials_gravesite
ON memorials (gravesite_lat, gravesite_lng)
WHERE gravesite_lat IS NOT NULL AND gravesite_lng IS NOT NULL;

-- Comment on columns for documentation
COMMENT ON COLUMN memorials.gravesite_lat IS 'Latitude of exact gravesite location within cemetery';
COMMENT ON COLUMN memorials.gravesite_lng IS 'Longitude of exact gravesite location within cemetery';
COMMENT ON COLUMN memorials.gravesite_accuracy IS 'GPS accuracy in meters when gravesite was pinned';
