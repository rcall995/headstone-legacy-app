-- ============================================
-- HEADSTONE LEGACY - MIGRATION SCRIPT
-- Run this to add new tables and columns
-- ============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- ADD MISSING COLUMNS TO MEMORIALS TABLE
-- ============================================
DO $$
BEGIN
    -- Add status column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'memorials' AND column_name = 'status') THEN
        ALTER TABLE memorials ADD COLUMN status TEXT DEFAULT 'published';
    END IF;

    -- Add candle_count column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'memorials' AND column_name = 'candle_count') THEN
        ALTER TABLE memorials ADD COLUMN candle_count INTEGER DEFAULT 0;
    END IF;

    -- Add view_count column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'memorials' AND column_name = 'view_count') THEN
        ALTER TABLE memorials ADD COLUMN view_count INTEGER DEFAULT 0;
    END IF;

    -- Add location columns if they don't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'memorials' AND column_name = 'location_lat') THEN
        ALTER TABLE memorials ADD COLUMN location_lat DECIMAL(10, 8);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'memorials' AND column_name = 'location_lng') THEN
        ALTER TABLE memorials ADD COLUMN location_lng DECIMAL(11, 8);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'memorials' AND column_name = 'is_location_exact') THEN
        ALTER TABLE memorials ADD COLUMN is_location_exact BOOLEAN DEFAULT FALSE;
    END IF;
END $$;

-- ============================================
-- CANDLES TABLE (Virtual candle lighting)
-- ============================================
CREATE TABLE IF NOT EXISTS candles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  memorial_id TEXT REFERENCES memorials(id) ON DELETE CASCADE,
  lit_by_name TEXT,
  lit_by_user_id UUID,
  message TEXT,
  lit_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '24 hours')
);

CREATE INDEX IF NOT EXISTS idx_candles_memorial_id ON candles (memorial_id);

-- ============================================
-- TRIBUTES TABLE (Guestbook entries)
-- ============================================
CREATE TABLE IF NOT EXISTS tributes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  memorial_id TEXT REFERENCES memorials(id) ON DELETE CASCADE,
  author_name TEXT NOT NULL,
  author_email TEXT,
  author_user_id UUID,
  message TEXT NOT NULL,
  photo_url TEXT,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tributes_memorial_id ON tributes (memorial_id);
CREATE INDEX IF NOT EXISTS idx_tributes_status ON tributes (status);

-- ============================================
-- VOICE RECORDINGS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS voice_recordings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  memorial_id TEXT REFERENCES memorials(id) ON DELETE CASCADE,
  recorded_by_name TEXT NOT NULL,
  recorded_by_email TEXT,
  recorded_by_user_id UUID,
  title TEXT,
  description TEXT,
  audio_url TEXT NOT NULL,
  duration_seconds INTEGER,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_voice_recordings_memorial_id ON voice_recordings (memorial_id);
CREATE INDEX IF NOT EXISTS idx_voice_recordings_status ON voice_recordings (status);

-- ============================================
-- ANNIVERSARY REMINDERS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS anniversary_reminders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  memorial_id TEXT REFERENCES memorials(id) ON DELETE CASCADE,
  user_id UUID,
  email TEXT NOT NULL,
  reminder_type TEXT NOT NULL,
  custom_date DATE,
  custom_label TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  last_sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reminders_memorial_id ON anniversary_reminders (memorial_id);
CREATE INDEX IF NOT EXISTS idx_reminders_user_id ON anniversary_reminders (user_id);

-- ============================================
-- PROJECT NOTES TABLE (Admin dashboard)
-- ============================================
CREATE TABLE IF NOT EXISTS project_notes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  category TEXT DEFAULT 'general',
  content TEXT NOT NULL,
  tags TEXT[] DEFAULT '{}',
  is_pinned BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- ENABLE ROW LEVEL SECURITY
-- ============================================
ALTER TABLE candles ENABLE ROW LEVEL SECURITY;
ALTER TABLE tributes ENABLE ROW LEVEL SECURITY;
ALTER TABLE voice_recordings ENABLE ROW LEVEL SECURITY;
ALTER TABLE anniversary_reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_notes ENABLE ROW LEVEL SECURITY;

-- ============================================
-- RLS POLICIES - CANDLES
-- ============================================
DROP POLICY IF EXISTS "Anyone can view candles" ON candles;
DROP POLICY IF EXISTS "Anyone can light candles" ON candles;

CREATE POLICY "Anyone can view candles" ON candles FOR SELECT USING (true);
CREATE POLICY "Anyone can light candles" ON candles FOR INSERT WITH CHECK (true);

-- ============================================
-- RLS POLICIES - TRIBUTES
-- ============================================
DROP POLICY IF EXISTS "Anyone can view approved tributes" ON tributes;
DROP POLICY IF EXISTS "Anyone can submit tributes" ON tributes;
DROP POLICY IF EXISTS "Curators can update tributes" ON tributes;
DROP POLICY IF EXISTS "Curators can delete tributes" ON tributes;

CREATE POLICY "Anyone can view approved tributes" ON tributes
  FOR SELECT USING (status = 'approved' OR EXISTS (
    SELECT 1 FROM memorials WHERE memorials.id = tributes.memorial_id AND auth.uid() = ANY(memorials.curator_ids)
  ));

CREATE POLICY "Anyone can submit tributes" ON tributes
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Curators can update tributes" ON tributes
  FOR UPDATE USING (EXISTS (
    SELECT 1 FROM memorials WHERE memorials.id = tributes.memorial_id AND auth.uid() = ANY(memorials.curator_ids)
  ));

CREATE POLICY "Curators can delete tributes" ON tributes
  FOR DELETE USING (EXISTS (
    SELECT 1 FROM memorials WHERE memorials.id = tributes.memorial_id AND auth.uid() = ANY(memorials.curator_ids)
  ));

-- ============================================
-- RLS POLICIES - VOICE RECORDINGS
-- ============================================
DROP POLICY IF EXISTS "Anyone can view approved voice recordings" ON voice_recordings;
DROP POLICY IF EXISTS "Anyone can submit voice recordings" ON voice_recordings;
DROP POLICY IF EXISTS "Curators can update voice recordings" ON voice_recordings;
DROP POLICY IF EXISTS "Curators can delete voice recordings" ON voice_recordings;

CREATE POLICY "Anyone can view approved voice recordings" ON voice_recordings
  FOR SELECT USING (status = 'approved' OR EXISTS (
    SELECT 1 FROM memorials WHERE memorials.id = voice_recordings.memorial_id AND auth.uid() = ANY(memorials.curator_ids)
  ));

CREATE POLICY "Anyone can submit voice recordings" ON voice_recordings
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Curators can update voice recordings" ON voice_recordings
  FOR UPDATE USING (EXISTS (
    SELECT 1 FROM memorials WHERE memorials.id = voice_recordings.memorial_id AND auth.uid() = ANY(memorials.curator_ids)
  ));

CREATE POLICY "Curators can delete voice recordings" ON voice_recordings
  FOR DELETE USING (EXISTS (
    SELECT 1 FROM memorials WHERE memorials.id = voice_recordings.memorial_id AND auth.uid() = ANY(memorials.curator_ids)
  ));

-- ============================================
-- RLS POLICIES - ANNIVERSARY REMINDERS
-- ============================================
DROP POLICY IF EXISTS "Users can view own reminders" ON anniversary_reminders;
DROP POLICY IF EXISTS "Anyone can insert reminders" ON anniversary_reminders;
DROP POLICY IF EXISTS "Users can update own reminders" ON anniversary_reminders;
DROP POLICY IF EXISTS "Users can delete own reminders" ON anniversary_reminders;

CREATE POLICY "Users can view own reminders" ON anniversary_reminders
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Anyone can insert reminders" ON anniversary_reminders
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Users can update own reminders" ON anniversary_reminders
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own reminders" ON anniversary_reminders
  FOR DELETE USING (auth.uid() = user_id);

-- ============================================
-- RLS POLICIES - PROJECT NOTES
-- ============================================
DROP POLICY IF EXISTS "Authenticated users can view project notes" ON project_notes;
DROP POLICY IF EXISTS "Authenticated users can insert project notes" ON project_notes;
DROP POLICY IF EXISTS "Authenticated users can update project notes" ON project_notes;
DROP POLICY IF EXISTS "Authenticated users can delete project notes" ON project_notes;

CREATE POLICY "Authenticated users can view project notes" ON project_notes
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can insert project notes" ON project_notes
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can update project notes" ON project_notes
  FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can delete project notes" ON project_notes
  FOR DELETE USING (auth.role() = 'authenticated');

-- ============================================
-- DONE!
-- ============================================
-- Now create these Storage Buckets manually:
-- 1. tributes (public)
-- 2. voice-recordings (public)
