import { supabase } from '/js/supabase-client.js';
import { showToast } from '/js/utils/toasts.js';

// Point values for scout actions
export const POINT_VALUES = {
    PIN: 10,
    PHOTO: 15,
    PIN_WITH_PHOTO: 30  // Bonus for both together
};

// Level thresholds
export const LEVEL_THRESHOLDS = [
    { level: 1, title: 'Novice Scout', points: 0, color: '#6c757d' },
    { level: 2, title: 'Bronze Scout', points: 100, color: '#cd7f32' },
    { level: 3, title: 'Silver Scout', points: 500, color: '#c0c0c0' },
    { level: 4, title: 'Gold Scout', points: 1500, color: '#c0a062' },
    { level: 5, title: 'Legacy Guardian', points: 5000, color: '#005F60' }
];

/**
 * Calculate level from total points
 */
export function calculateLevel(points) {
    let level = LEVEL_THRESHOLDS[0];
    for (const threshold of LEVEL_THRESHOLDS) {
        if (points >= threshold.points) {
            level = threshold;
        } else {
            break;
        }
    }
    return level;
}

/**
 * Get user's scout stats
 */
export async function getScoutStats(userId) {
    if (!userId) return null;

    const { data, error } = await supabase
        .from('scout_stats')
        .select('*')
        .eq('user_id', userId)
        .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 = no rows found
        console.error('Error fetching scout stats:', error);
        return null;
    }

    // Return default stats if none exist
    if (!data) {
        return {
            user_id: userId,
            total_points: 0,
            pins_count: 0,
            photos_count: 0,
            current_level: 1
        };
    }

    return data;
}

/**
 * Get user's earned badges
 */
export async function getUserBadges(userId) {
    if (!userId) return [];

    const { data, error } = await supabase
        .from('user_badges')
        .select('badge_id, earned_at, badges(*)')
        .eq('user_id', userId)
        .order('earned_at', { ascending: false });

    if (error) {
        console.error('Error fetching user badges:', error);
        return [];
    }

    return data || [];
}

/**
 * Get all badge definitions
 */
export async function getAllBadges() {
    const { data, error } = await supabase
        .from('badges')
        .select('*')
        .order('sort_order', { ascending: true });

    if (error) {
        console.error('Error fetching badges:', error);
        return [];
    }

    return data || [];
}

/**
 * Award points for scout actions
 * @param {string} userId - User ID
 * @param {number} pinsAdded - Number of pins added
 * @param {number} photosAdded - Number of photos uploaded
 * @returns {Object} - Result with points earned, new badges, level up info
 */
export async function awardPoints(userId, pinsAdded = 0, photosAdded = 0) {
    if (!userId) {
        console.error('No user ID provided for awarding points');
        return { success: false };
    }

    // Calculate points
    let pointsEarned = 0;

    // If both pin and photo together, give combo bonus
    const combos = Math.min(pinsAdded, photosAdded);
    const extraPins = pinsAdded - combos;
    const extraPhotos = photosAdded - combos;

    pointsEarned += combos * POINT_VALUES.PIN_WITH_PHOTO;
    pointsEarned += extraPins * POINT_VALUES.PIN;
    pointsEarned += extraPhotos * POINT_VALUES.PHOTO;

    if (pointsEarned === 0 && pinsAdded === 0 && photosAdded === 0) {
        return { success: true, pointsEarned: 0, newBadges: [], levelUp: null };
    }

    try {
        // Get current stats
        let currentStats = await getScoutStats(userId);
        const isNewUser = currentStats.total_points === 0 && currentStats.pins_count === 0;

        // Calculate new totals
        const newTotalPoints = currentStats.total_points + pointsEarned;
        const newPinsCount = currentStats.pins_count + pinsAdded;
        const newPhotosCount = currentStats.photos_count + photosAdded;
        const newLevel = calculateLevel(newTotalPoints);

        // Upsert stats
        const { error: statsError } = await supabase
            .from('scout_stats')
            .upsert({
                user_id: userId,
                total_points: newTotalPoints,
                pins_count: newPinsCount,
                photos_count: newPhotosCount,
                current_level: newLevel.level,
                updated_at: new Date().toISOString()
            }, { onConflict: 'user_id' });

        if (statsError) {
            console.error('Error updating scout stats:', statsError);
            return { success: false, error: statsError };
        }

        // Check for new badges
        const newBadges = await checkAndAwardBadges(userId, {
            total_points: newTotalPoints,
            pins_count: newPinsCount,
            photos_count: newPhotosCount
        });

        // Check for level up
        const previousLevel = calculateLevel(currentStats.total_points);
        const levelUp = newLevel.level > previousLevel.level ? newLevel : null;

        return {
            success: true,
            pointsEarned,
            totalPoints: newTotalPoints,
            newBadges,
            levelUp,
            stats: {
                pins_count: newPinsCount,
                photos_count: newPhotosCount,
                current_level: newLevel.level
            }
        };

    } catch (error) {
        console.error('Error awarding points:', error);
        return { success: false, error };
    }
}

/**
 * Check and award any new badges the user has earned
 */
async function checkAndAwardBadges(userId, stats) {
    const newBadges = [];

    try {
        // Get all badges and user's current badges
        const [allBadges, userBadges] = await Promise.all([
            getAllBadges(),
            getUserBadges(userId)
        ]);

        const earnedBadgeIds = new Set(userBadges.map(ub => ub.badge_id));

        // Check each badge
        for (const badge of allBadges) {
            // Skip if already earned
            if (earnedBadgeIds.has(badge.id)) continue;

            // Check if requirement is met
            let earned = false;
            switch (badge.requirement_type) {
                case 'points':
                    earned = stats.total_points >= badge.requirement_value;
                    break;
                case 'pins':
                    earned = stats.pins_count >= badge.requirement_value;
                    break;
                case 'photos':
                    earned = stats.photos_count >= badge.requirement_value;
                    break;
            }

            if (earned) {
                // Award the badge
                const { error } = await supabase
                    .from('user_badges')
                    .insert({
                        user_id: userId,
                        badge_id: badge.id
                    });

                if (!error) {
                    newBadges.push(badge);
                }
            }
        }

    } catch (error) {
        console.error('Error checking badges:', error);
    }

    return newBadges;
}

/**
 * Get leaderboard (top scouts by points)
 */
export async function getLeaderboard(limit = 20) {
    const { data, error } = await supabase
        .from('scout_stats')
        .select(`
            user_id,
            total_points,
            pins_count,
            photos_count,
            current_level,
            profiles!inner(display_name, avatar_url)
        `)
        .order('total_points', { ascending: false })
        .limit(limit);

    if (error) {
        console.error('Error fetching leaderboard:', error);
        return [];
    }

    // Format the data
    return (data || []).map((entry, index) => ({
        rank: index + 1,
        userId: entry.user_id,
        displayName: entry.profiles?.display_name || 'Anonymous Scout',
        avatarUrl: entry.profiles?.avatar_url,
        totalPoints: entry.total_points,
        pinsCount: entry.pins_count,
        photosCount: entry.photos_count,
        level: calculateLevel(entry.total_points)
    }));
}

/**
 * Get user's rank on the leaderboard
 */
export async function getUserRank(userId) {
    if (!userId) return null;

    // Get user's points
    const stats = await getScoutStats(userId);
    if (!stats || stats.total_points === 0) return null;

    // Count how many users have more points
    const { count, error } = await supabase
        .from('scout_stats')
        .select('*', { count: 'exact', head: true })
        .gt('total_points', stats.total_points);

    if (error) {
        console.error('Error getting user rank:', error);
        return null;
    }

    return (count || 0) + 1;
}

/**
 * Show toast notifications for points, badges, and level ups
 */
export function showGamificationToasts(result) {
    if (!result.success) return;

    // Show points earned
    if (result.pointsEarned > 0) {
        showToast(`+${result.pointsEarned} points earned!`, 'success');
    }

    // Show new badges
    if (result.newBadges && result.newBadges.length > 0) {
        setTimeout(() => {
            for (const badge of result.newBadges) {
                showToast(`Badge unlocked: ${badge.name}!`, 'success');
            }
        }, 1500);
    }

    // Show level up
    if (result.levelUp) {
        setTimeout(() => {
            showToast(`Level up! You're now a ${result.levelUp.title}!`, 'success');
        }, 3000);
    }
}
