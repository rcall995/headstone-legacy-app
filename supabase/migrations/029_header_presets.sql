-- Header background presets management
CREATE TABLE IF NOT EXISTS header_presets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(50) NOT NULL,
    label VARCHAR(50) NOT NULL,
    image_url TEXT NOT NULL,
    preview_url TEXT, -- Optional smaller preview for the grid
    display_order INT DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    is_default BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE header_presets ENABLE ROW LEVEL SECURITY;

-- Everyone can read active presets
CREATE POLICY "Anyone can view active header presets"
    ON header_presets FOR SELECT
    USING (is_active = true);

-- Only admins can manage presets (we'll check this in the API)
CREATE POLICY "Service role can manage header presets"
    ON header_presets FOR ALL
    USING (true)
    WITH CHECK (true);

-- Insert current hardcoded presets as initial data
INSERT INTO header_presets (name, label, image_url, preview_url, display_order, is_default) VALUES
    ('default', 'Teal', 'gradient:linear-gradient(135deg, #005F60 0%, #007a7a 50%, #00959a 100%)', NULL, 1, true),
    ('sunset-sky', 'Sunset', 'https://images.unsplash.com/photo-1495616811223-4d98c6e9c869?w=1920&h=400&fit=crop', 'https://images.unsplash.com/photo-1495616811223-4d98c6e9c869?w=400&h=200&fit=crop', 2, false),
    ('forest-path', 'Forest', 'https://images.unsplash.com/photo-1448375240586-882707db888b?w=1920&h=400&fit=crop', 'https://images.unsplash.com/photo-1448375240586-882707db888b?w=400&h=200&fit=crop', 3, false),
    ('ocean-waves', 'Beach', 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=1920&h=400&fit=crop', 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=400&h=200&fit=crop', 4, false),
    ('mountain-peaks', 'Mountains', 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=1920&h=400&fit=crop', 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=400&h=200&fit=crop', 5, false),
    ('clouds', 'Sky', 'https://images.unsplash.com/photo-1534088568595-a066f410bcda?w=1920&h=400&fit=crop', 'https://images.unsplash.com/photo-1534088568595-a066f410bcda?w=400&h=200&fit=crop', 6, false),
    ('autumn-leaves', 'Autumn', 'https://images.unsplash.com/photo-1760370048204-1abcd672609f?w=1920&h=400&fit=crop', 'https://images.unsplash.com/photo-1760370048204-1abcd672609f?w=400&h=200&fit=crop', 7, false),
    ('starry-night', 'Stars', 'https://images.unsplash.com/photo-1519681393784-d120267933ba?w=1920&h=400&fit=crop', 'https://images.unsplash.com/photo-1519681393784-d120267933ba?w=400&h=200&fit=crop', 8, false),
    ('buffalo-skyline', 'Buffalo', 'https://images.unsplash.com/photo-1594050304868-c9299fdba722?w=1920&h=400&fit=crop', 'https://images.unsplash.com/photo-1594050304868-c9299fdba722?w=400&h=200&fit=crop', 9, false),
    ('nyc-skyline', 'NYC', 'https://images.unsplash.com/photo-1496442226666-8d4d0e62e6e9?w=1920&h=400&fit=crop', 'https://images.unsplash.com/photo-1496442226666-8d4d0e62e6e9?w=400&h=200&fit=crop', 10, false),
    ('phoenix-skyline', 'Phoenix', 'https://images.unsplash.com/photo-1688066212257-3bb83619d81b?w=1920&h=400&fit=crop', 'https://images.unsplash.com/photo-1688066212257-3bb83619d81b?w=400&h=200&fit=crop', 11, false),
    ('niagara-falls', 'Niagara', 'https://images.unsplash.com/photo-1489447068241-b3490214e879?w=1920&h=400&fit=crop', 'https://images.unsplash.com/photo-1489447068241-b3490214e879?w=400&h=200&fit=crop', 12, false),
    ('sedona-az', 'Sedona', 'https://images.unsplash.com/photo-1702260031554-0c3a45de71d3?w=1920&h=400&fit=crop', 'https://images.unsplash.com/photo-1702260031554-0c3a45de71d3?w=400&h=200&fit=crop', 13, false);

-- Index for faster queries
CREATE INDEX idx_header_presets_active_order ON header_presets(is_active, display_order);
