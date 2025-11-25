-- ============================================
-- HEADSTONE LEGACY - SUPABASE SCHEMA
-- Run this in your Supabase SQL Editor
-- ============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- PROFILES (extends auth.users)
-- ============================================
CREATE TABLE IF NOT EXISTS profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email TEXT,
  display_name TEXT,
  avatar_url TEXT,
  subscription_tier TEXT DEFAULT 'free' CHECK (subscription_tier IN ('free', 'premium', 'legacy')),
  subscription_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Auto-create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================
-- MEMORIALS
-- ============================================
CREATE TABLE IF NOT EXISTS memorials (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  name_lowercase TEXT GENERATED ALWAYS AS (LOWER(name)) STORED,
  birth_date DATE,
  death_date DATE,
  bio TEXT,
  main_photo TEXT,
  photos JSONB DEFAULT '[]'::jsonb,
  cemetery_name TEXT,
  cemetery_address TEXT,
  cemetery_lat DECIMAL(10, 8),
  cemetery_lng DECIMAL(11, 8),
  location_lat DECIMAL(10, 8),
  location_lng DECIMAL(11, 8),
  is_location_exact BOOLEAN DEFAULT FALSE,
  relatives JSONB DEFAULT '[]'::jsonb,
  milestones JSONB DEFAULT '[]'::jsonb,
  residences JSONB DEFAULT '[]'::jsonb,
  military_service JSONB,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'approved', 'archived')),
  tier TEXT DEFAULT 'memorial',
  curator_ids UUID[] DEFAULT '{}',
  curators JSONB DEFAULT '[]'::jsonb,
  candle_count INTEGER DEFAULT 0,
  view_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for faster queries
CREATE INDEX IF NOT EXISTS idx_memorials_curator_ids ON memorials USING GIN (curator_ids);
CREATE INDEX IF NOT EXISTS idx_memorials_status ON memorials (status);
CREATE INDEX IF NOT EXISTS idx_memorials_name_lowercase ON memorials (name_lowercase);

-- ============================================
-- TRIBUTES (Guestbook entries)
-- ============================================
CREATE TABLE IF NOT EXISTS tributes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  memorial_id TEXT REFERENCES memorials(id) ON DELETE CASCADE,
  author_name TEXT NOT NULL,
  author_email TEXT,
  author_user_id UUID REFERENCES auth.users(id),
  message TEXT NOT NULL,
  photo_url TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tributes_memorial_id ON tributes (memorial_id);
CREATE INDEX IF NOT EXISTS idx_tributes_status ON tributes (status);

-- ============================================
-- CANDLES (Virtual candle lighting)
-- ============================================
CREATE TABLE IF NOT EXISTS candles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  memorial_id TEXT REFERENCES memorials(id) ON DELETE CASCADE,
  lit_by_name TEXT,
  lit_by_user_id UUID REFERENCES auth.users(id),
  message TEXT,
  lit_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '24 hours')
);

CREATE INDEX IF NOT EXISTS idx_candles_memorial_id ON candles (memorial_id);
CREATE INDEX IF NOT EXISTS idx_candles_expires_at ON candles (expires_at);

-- Function to update candle count on memorial
CREATE OR REPLACE FUNCTION update_candle_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE memorials SET candle_count = candle_count + 1 WHERE id = NEW.memorial_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS on_candle_lit ON candles;
CREATE TRIGGER on_candle_lit
  AFTER INSERT ON candles
  FOR EACH ROW EXECUTE FUNCTION update_candle_count();

-- ============================================
-- SUGGESTED LOCATIONS
-- ============================================
CREATE TABLE IF NOT EXISTS suggested_locations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  memorial_id TEXT REFERENCES memorials(id) ON DELETE CASCADE,
  suggested_by UUID REFERENCES auth.users(id),
  lat DECIMAL(10, 8) NOT NULL,
  lng DECIMAL(11, 8) NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- VOICE RECORDINGS
-- ============================================
CREATE TABLE IF NOT EXISTS voice_recordings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  memorial_id TEXT REFERENCES memorials(id) ON DELETE CASCADE,
  recorded_by_name TEXT NOT NULL,
  recorded_by_email TEXT,
  recorded_by_user_id UUID REFERENCES auth.users(id),
  title TEXT,
  description TEXT,
  audio_url TEXT NOT NULL,
  duration_seconds INTEGER,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_voice_recordings_memorial_id ON voice_recordings (memorial_id);
CREATE INDEX IF NOT EXISTS idx_voice_recordings_status ON voice_recordings (status);

-- ============================================
-- ANNIVERSARY REMINDERS
-- ============================================
CREATE TABLE IF NOT EXISTS anniversary_reminders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  memorial_id TEXT REFERENCES memorials(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id),
  email TEXT NOT NULL,
  reminder_type TEXT NOT NULL CHECK (reminder_type IN ('birthday', 'death_anniversary', 'custom')),
  custom_date DATE,
  custom_label TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  last_sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reminders_user_id ON anniversary_reminders (user_id);

-- ============================================
-- PROJECT NOTES (For storing roadmap/plans)
-- ============================================
CREATE TABLE IF NOT EXISTS project_notes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  category TEXT DEFAULT 'general' CHECK (category IN ('general', 'feature', 'bug', 'idea', 'decision', 'meeting')),
  content TEXT NOT NULL,
  tags TEXT[] DEFAULT '{}',
  is_pinned BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- ORDERS (Track QR plaque purchases)
-- ============================================
CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id),
  memorial_id TEXT REFERENCES memorials(id),
  square_order_id TEXT,
  square_payment_id TEXT,
  product_type TEXT DEFAULT 'qr_plaque',
  amount_cents INTEGER NOT NULL,
  currency TEXT DEFAULT 'USD',
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'shipped', 'delivered', 'cancelled', 'refunded')),
  shipping_address JSONB,
  tracking_number TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders (user_id);
CREATE INDEX IF NOT EXISTS idx_orders_memorial_id ON orders (memorial_id);

-- ============================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================

-- Enable RLS on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE memorials ENABLE ROW LEVEL SECURITY;
ALTER TABLE tributes ENABLE ROW LEVEL SECURITY;
ALTER TABLE candles ENABLE ROW LEVEL SECURITY;
ALTER TABLE suggested_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE voice_recordings ENABLE ROW LEVEL SECURITY;
ALTER TABLE anniversary_reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

-- Profiles: Users can read all, update own
CREATE POLICY "Profiles are viewable by everyone" ON profiles FOR SELECT USING (true);
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);

-- Memorials: Public read for published, curators can edit their own
CREATE POLICY "Published memorials are viewable by everyone" ON memorials
  FOR SELECT USING (status IN ('published', 'approved') OR auth.uid() = ANY(curator_ids));

CREATE POLICY "Curators can insert memorials" ON memorials
  FOR INSERT WITH CHECK (auth.uid() = ANY(curator_ids));

CREATE POLICY "Curators can update their memorials" ON memorials
  FOR UPDATE USING (auth.uid() = ANY(curator_ids));

CREATE POLICY "Curators can delete their memorials" ON memorials
  FOR DELETE USING (auth.uid() = ANY(curator_ids));

-- Tributes: Anyone can insert, curators can manage
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

-- Candles: Anyone can light, anyone can view
CREATE POLICY "Anyone can view candles" ON candles FOR SELECT USING (true);
CREATE POLICY "Anyone can light candles" ON candles FOR INSERT WITH CHECK (true);

-- Voice recordings: Anyone can submit, curators can manage
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

-- Anniversary reminders: Anyone can sign up, logged-in users can manage their own
CREATE POLICY "Users can view own reminders" ON anniversary_reminders
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Anyone can insert reminders" ON anniversary_reminders
  FOR INSERT WITH CHECK (true);
CREATE POLICY "Users can update own reminders" ON anniversary_reminders
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own reminders" ON anniversary_reminders
  FOR DELETE USING (auth.uid() = user_id);

-- Orders: Users can view own orders
CREATE POLICY "Users can view own orders" ON orders
  FOR SELECT USING (auth.uid() = user_id);

-- Project notes: Authenticated users can manage (admin only in practice)
ALTER TABLE project_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can view project notes" ON project_notes
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can insert project notes" ON project_notes
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can update project notes" ON project_notes
  FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can delete project notes" ON project_notes
  FOR DELETE USING (auth.role() = 'authenticated');

-- ============================================
-- STORAGE BUCKETS (Run in Supabase Dashboard)
-- ============================================
-- Create these buckets in Storage section:
-- 1. memorials (public) - memorial photos
-- 2. scouted-photos (public) - scout mode photos
-- 3. tributes (public) - tribute photos
-- 4. voice-recordings (public) - audio files
-- 5. avatars (public) - user profile photos

-- ============================================
-- HELPFUL VIEWS
-- ============================================

-- Active candles (not expired)
CREATE OR REPLACE VIEW active_candles AS
SELECT * FROM candles WHERE expires_at > NOW();

-- Memorial stats
CREATE OR REPLACE VIEW memorial_stats AS
SELECT
  m.id,
  m.name,
  m.status,
  m.candle_count,
  m.view_count,
  COUNT(DISTINCT t.id) FILTER (WHERE t.status = 'approved') as tribute_count,
  COUNT(DISTINCT vr.id) as voice_recording_count,
  m.created_at,
  m.updated_at
FROM memorials m
LEFT JOIN tributes t ON m.id = t.memorial_id
LEFT JOIN voice_recordings vr ON m.id = vr.memorial_id
GROUP BY m.id;

-- ============================================
-- SEED DATA (Optional - for testing)
-- ============================================

-- Insert a test project note
INSERT INTO project_notes (title, category, content, tags, is_pinned) VALUES
('Project Kickoff', 'decision', 'Migrated from Firebase to Supabase + Vercel. Focus on building engagement features next.', ARRAY['migration', 'supabase', 'vercel'], true),
('Feature Priority', 'feature', 'Phase 1: Virtual candles, Anniversary reminders, Enhanced tributes. Phase 2: Voice recordings, Video tributes, Life timeline.', ARRAY['roadmap', 'features'], true);
