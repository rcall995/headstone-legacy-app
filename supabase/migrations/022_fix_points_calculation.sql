-- Migration: 022_fix_points_calculation.sql
-- Fixes the points calculation bug in award_wanted_find_points function
-- Bug: Line 166 used `total_points = total_points + total_points` which doubled the local variable
-- instead of adding to the existing column value

CREATE OR REPLACE FUNCTION award_wanted_find_points(
    p_scout_id UUID,
    p_memorial_id TEXT,
    p_has_photo BOOLEAN DEFAULT false,
    p_has_cemetery BOOLEAN DEFAULT false
)
RETURNS INTEGER AS $$
DECLARE
    v_points_to_add INTEGER := 0;
    base_pin_points INTEGER := 25;      -- 2.5x normal
    base_photo_points INTEGER := 40;    -- 2.5x normal
    combo_bonus INTEGER := 10;
    cemetery_bonus INTEGER := 20;
BEGIN
    -- Base points for pin
    v_points_to_add := base_pin_points;

    -- Photo bonus
    IF p_has_photo THEN
        v_points_to_add := v_points_to_add + base_photo_points + combo_bonus;
    END IF;

    -- Cemetery identification bonus
    IF p_has_cemetery THEN
        v_points_to_add := v_points_to_add + cemetery_bonus;
    END IF;

    -- Update scout stats (using explicit column reference to avoid variable shadowing)
    UPDATE scout_stats
    SET
        total_points = scout_stats.total_points + v_points_to_add,
        pins_count = scout_stats.pins_count + 1,
        photos_count = scout_stats.photos_count + CASE WHEN p_has_photo THEN 1 ELSE 0 END,
        wanted_finds_count = scout_stats.wanted_finds_count + 1,
        cemetery_ids_count = scout_stats.cemetery_ids_count + CASE WHEN p_has_cemetery THEN 1 ELSE 0 END,
        updated_at = NOW()
    WHERE user_id = p_scout_id;

    -- Insert if not exists
    IF NOT FOUND THEN
        INSERT INTO scout_stats (user_id, total_points, pins_count, photos_count, wanted_finds_count, cemetery_ids_count)
        VALUES (
            p_scout_id,
            v_points_to_add,
            1,
            CASE WHEN p_has_photo THEN 1 ELSE 0 END,
            1,
            CASE WHEN p_has_cemetery THEN 1 ELSE 0 END
        );
    END IF;

    RETURN v_points_to_add;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION award_wanted_find_points IS 'Awards bonus points (2.5x) to scouts who find graves families are searching for. Fixed variable shadowing bug.';
