-- Add world_events column to memorials table
-- This stores an array of historical event IDs that the curator has selected to display
ALTER TABLE memorials ADD COLUMN IF NOT EXISTS world_events text[];

-- Add comment explaining the column
COMMENT ON COLUMN memorials.world_events IS 'Array of historical event IDs selected by curator to show on timeline';
