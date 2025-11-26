-- ============================================
-- HEADSTONE LEGACY - SCOUT GAMIFICATION
-- Migration 002 - Adds gamification features
-- ============================================

-- Scout stats (points, level tracking)
CREATE TABLE IF NOT EXISTS scout_stats (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    total_points INTEGER DEFAULT 0,
    pins_count INTEGER DEFAULT 0,
    photos_count INTEGER DEFAULT 0,
    current_level INTEGER DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scout_stats_points ON scout_stats(total_points DESC);

-- Badge definitions
CREATE TABLE IF NOT EXISTS badges (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    icon TEXT NOT NULL,
    category TEXT NOT NULL CHECK (category IN ('milestone', 'activity')),
    requirement_type TEXT NOT NULL CHECK (requirement_type IN ('points', 'pins', 'photos')),
    requirement_value INTEGER NOT NULL,
    sort_order INTEGER DEFAULT 0
);

-- User earned badges
CREATE TABLE IF NOT EXISTS user_badges (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    badge_id TEXT REFERENCES badges(id) ON DELETE CASCADE,
    earned_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, badge_id)
);

CREATE INDEX IF NOT EXISTS idx_user_badges_user ON user_badges(user_id);

-- ============================================
-- GAMIFICATION RLS POLICIES
-- ============================================

-- Enable RLS
ALTER TABLE scout_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE badges ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_badges ENABLE ROW LEVEL SECURITY;

-- Scout stats: Anyone can view (for leaderboard), users manage own
CREATE POLICY "Anyone can view scout stats" ON scout_stats FOR SELECT USING (true);
CREATE POLICY "Users can insert own stats" ON scout_stats FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own stats" ON scout_stats FOR UPDATE USING (auth.uid() = user_id);

-- Badges: Anyone can view definitions
CREATE POLICY "Anyone can view badges" ON badges FOR SELECT USING (true);

-- User badges: Anyone can view, users can earn own
CREATE POLICY "Anyone can view user badges" ON user_badges FOR SELECT USING (true);
CREATE POLICY "Users can earn badges" ON user_badges FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ============================================
-- BADGE SEED DATA
-- ============================================
INSERT INTO badges (id, name, description, icon, category, requirement_type, requirement_value, sort_order) VALUES
('first-pin', 'First Pin', 'Pin your first location', 'fa-map-pin', 'milestone', 'pins', 1, 1),
('shutterbug', 'Shutterbug', 'Upload your first photo', 'fa-camera', 'milestone', 'photos', 1, 2),
('getting-started', 'Getting Started', 'Reach 50 points', 'fa-seedling', 'milestone', 'points', 50, 3),
('century-club', 'Century Club', 'Reach 100 points', 'fa-award', 'milestone', 'points', 100, 4),
('rising-star', 'Rising Star', 'Reach 500 points', 'fa-star', 'milestone', 'points', 500, 5),
('dedicated-scout', 'Dedicated Scout', 'Reach 1,500 points', 'fa-medal', 'milestone', 'points', 1500, 6),
('legend', 'Legend', 'Reach 5,000 points', 'fa-crown', 'milestone', 'points', 5000, 7),
('explorer', 'Explorer', 'Pin 10 locations', 'fa-compass', 'activity', 'pins', 10, 10),
('cartographer', 'Cartographer', 'Pin 50 locations', 'fa-map', 'activity', 'pins', 50, 11),
('master-mapper', 'Master Mapper', 'Pin 100 locations', 'fa-globe', 'activity', 'pins', 100, 12),
('photographer', 'Photographer', 'Upload 10 photos', 'fa-images', 'activity', 'photos', 10, 13),
('chronicler', 'Chronicler', 'Upload 50 photos', 'fa-book', 'activity', 'photos', 50, 14),
('archivist', 'Archivist', 'Upload 100 photos', 'fa-archive', 'activity', 'photos', 100, 15)
ON CONFLICT (id) DO NOTHING;
