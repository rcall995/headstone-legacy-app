-- Migration: 017_ai_storyteller.sql
-- AI Legacy Storyteller - Guided prompts with cost-capped AI follow-up

-- Track AI story sessions for cost management
CREATE TABLE IF NOT EXISTS ai_story_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    memorial_id TEXT REFERENCES memorials(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,

    -- User's answers to guided prompts
    prompt_responses JSONB DEFAULT '[]'::jsonb,

    -- AI-generated content
    generated_story TEXT,
    follow_up_questions JSONB DEFAULT '[]'::jsonb,
    follow_up_responses JSONB DEFAULT '[]'::jsonb,

    -- Cost tracking
    ai_interactions INTEGER DEFAULT 0,
    max_interactions INTEGER DEFAULT 5,

    -- Status
    status TEXT DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed', 'abandoned')),

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for quick lookups
CREATE INDEX IF NOT EXISTS idx_ai_story_sessions_memorial ON ai_story_sessions(memorial_id);
CREATE INDEX IF NOT EXISTS idx_ai_story_sessions_user ON ai_story_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_story_sessions_status ON ai_story_sessions(status);

-- RLS Policies
ALTER TABLE ai_story_sessions ENABLE ROW LEVEL SECURITY;

-- Users can view their own sessions
CREATE POLICY "Users can view own AI sessions"
ON ai_story_sessions FOR SELECT
USING (auth.uid() = user_id);

-- Users can create sessions
CREATE POLICY "Users can create AI sessions"
ON ai_story_sessions FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Users can update their own sessions
CREATE POLICY "Users can update own AI sessions"
ON ai_story_sessions FOR UPDATE
USING (auth.uid() = user_id);

-- Function to update timestamp on changes
CREATE OR REPLACE FUNCTION update_ai_session_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for auto-updating timestamp
DROP TRIGGER IF EXISTS ai_story_sessions_updated_at ON ai_story_sessions;
CREATE TRIGGER ai_story_sessions_updated_at
    BEFORE UPDATE ON ai_story_sessions
    FOR EACH ROW
    EXECUTE FUNCTION update_ai_session_timestamp();

-- Default prompt questions (stored as reference)
COMMENT ON TABLE ai_story_sessions IS 'Tracks AI storyteller sessions with cost caps. Default prompts:
1. What is your favorite memory of them?
2. What made them laugh or brought them joy?
3. What was their greatest accomplishment?
4. What advice did they give that stuck with you?
5. How would their friends describe them?
6. What were their hobbies or passions?
7. What life challenges did they overcome?
8. What do you want future generations to know about them?';
