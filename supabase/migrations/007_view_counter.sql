-- ============================================
-- HEADSTONE LEGACY - VIEW COUNTER
-- Migration 007 - View count increment function
-- ============================================

-- Create a function to safely increment view count
-- This prevents race conditions and is more efficient
CREATE OR REPLACE FUNCTION increment_view_count(memorial_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE memorials
    SET view_count = COALESCE(view_count, 0) + 1
    WHERE id = memorial_id;
END;
$$;

-- Grant execute permission to anonymous users (for public memorial viewing)
GRANT EXECUTE ON FUNCTION increment_view_count(UUID) TO anon;
GRANT EXECUTE ON FUNCTION increment_view_count(UUID) TO authenticated;

-- Also add an index on view_count for sorting by popularity
CREATE INDEX IF NOT EXISTS idx_memorials_view_count ON memorials(view_count DESC);
