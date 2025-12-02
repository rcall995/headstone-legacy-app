-- ============================================
-- VIDEO TRIBUTES - Allow video messages on memorials
-- Migration 028
-- ============================================

-- Add videos array to memorials table (for owner's videos)
ALTER TABLE memorials ADD COLUMN IF NOT EXISTS videos JSONB DEFAULT '[]'::jsonb;

-- Create video_tributes table (for visitor-submitted videos)
CREATE TABLE IF NOT EXISTS video_tributes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  memorial_id TEXT REFERENCES memorials(id) ON DELETE CASCADE,
  recorded_by_name TEXT NOT NULL,
  recorded_by_email TEXT,
  recorded_by_user_id UUID REFERENCES auth.users(id),
  title TEXT,
  description TEXT,
  video_url TEXT NOT NULL,
  thumbnail_url TEXT,
  duration_seconds INTEGER,
  file_size_bytes INTEGER,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_video_tributes_memorial_id ON video_tributes (memorial_id);
CREATE INDEX IF NOT EXISTS idx_video_tributes_status ON video_tributes (status);

-- Enable RLS
ALTER TABLE video_tributes ENABLE ROW LEVEL SECURITY;

-- RLS Policies for video_tributes
CREATE POLICY "Anyone can view approved video tributes" ON video_tributes
  FOR SELECT USING (status = 'approved' OR EXISTS (
    SELECT 1 FROM memorials WHERE memorials.id = video_tributes.memorial_id AND auth.uid() = ANY(memorials.curator_ids)
  ));

CREATE POLICY "Anyone can submit video tributes" ON video_tributes
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Curators can update video tributes" ON video_tributes
  FOR UPDATE USING (EXISTS (
    SELECT 1 FROM memorials WHERE memorials.id = video_tributes.memorial_id AND auth.uid() = ANY(memorials.curator_ids)
  ));

CREATE POLICY "Curators can delete video tributes" ON video_tributes
  FOR DELETE USING (EXISTS (
    SELECT 1 FROM memorials WHERE memorials.id = video_tributes.memorial_id AND auth.uid() = ANY(memorials.curator_ids)
  ));

-- Note: Create 'videos' storage bucket in Supabase Dashboard (public bucket)
-- Max file size: 50MB
