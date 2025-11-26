// Scout info page loader
import { supabase } from '/js/supabase-client.js';
import {
    getScoutStats,
    getUserBadges,
    getAllBadges,
    calculateLevel,
    LEVEL_THRESHOLDS
} from '/js/utils/scout-gamification.js';

export async function loadScoutPage(appRoot) {
    try {
        const response = await fetch('/pages/scout.html');
        if (!response.ok) throw new Error('HTML content not found');
        appRoot.innerHTML = await response.text();

        // Check if user is logged in
        const { data: { user } } = await supabase.auth.getUser();

        if (user) {
            // Load and display scout stats
            await loadScoutStats(user.id);
        }

    } catch (error) {
        console.error("Failed to load Scout page:", error);
        appRoot.innerHTML = `<p class="text-danger text-center">Error loading page.</p>`;
    }
}

async function loadScoutStats(userId) {
    try {
        // Fetch stats and badges in parallel
        const [stats, userBadges, allBadges] = await Promise.all([
            getScoutStats(userId),
            getUserBadges(userId),
            getAllBadges()
        ]);

        // Show stats section
        const statsSection = document.getElementById('scout-stats-section');
        if (statsSection) {
            statsSection.style.display = 'block';
        }

        // Calculate level
        const level = calculateLevel(stats.total_points);

        // Update level badge color
        const levelBadge = document.getElementById('scout-level-badge');
        if (levelBadge) {
            levelBadge.style.backgroundColor = level.color;
        }

        // Update level title
        const levelTitle = document.getElementById('scout-level-title');
        if (levelTitle) {
            levelTitle.textContent = level.title;
        }

        // Update points display
        const pointsDisplay = document.getElementById('scout-points-display');
        if (pointsDisplay) {
            pointsDisplay.textContent = `${stats.total_points.toLocaleString()} points`;
        }

        // Update stat counts
        const pinsEl = document.getElementById('scout-pins-count');
        const photosEl = document.getElementById('scout-photos-count');
        const badgesEl = document.getElementById('scout-badges-count');

        if (pinsEl) pinsEl.textContent = stats.pins_count;
        if (photosEl) photosEl.textContent = stats.photos_count;
        if (badgesEl) badgesEl.textContent = userBadges.length;

        // Update progress bar
        updateProgressBar(stats.total_points, level);

        // Render badges
        renderBadges(allBadges, userBadges);

    } catch (error) {
        console.error('Error loading scout stats:', error);
    }
}

function updateProgressBar(currentPoints, currentLevel) {
    const progressFill = document.getElementById('scout-progress-fill');
    const progressText = document.getElementById('scout-progress-text');

    // Find next level
    const currentLevelIndex = LEVEL_THRESHOLDS.findIndex(l => l.level === currentLevel.level);
    const nextLevel = LEVEL_THRESHOLDS[currentLevelIndex + 1];

    if (!nextLevel) {
        // Max level reached
        if (progressFill) progressFill.style.width = '100%';
        if (progressText) progressText.textContent = 'Max level reached!';
        return;
    }

    // Calculate progress to next level
    const pointsInCurrentLevel = currentPoints - currentLevel.points;
    const pointsNeededForNext = nextLevel.points - currentLevel.points;
    const progressPercent = Math.min((pointsInCurrentLevel / pointsNeededForNext) * 100, 100);

    if (progressFill) {
        progressFill.style.width = `${progressPercent}%`;
    }

    if (progressText) {
        const pointsToGo = nextLevel.points - currentPoints;
        progressText.textContent = `${pointsToGo.toLocaleString()} points to ${nextLevel.title}`;
    }
}

function renderBadges(allBadges, userBadges) {
    const badgesGrid = document.getElementById('scout-badges-grid');
    if (!badgesGrid) return;

    const earnedBadgeIds = new Set(userBadges.map(ub => ub.badge_id));

    const badgesHTML = allBadges.map(badge => {
        const isEarned = earnedBadgeIds.has(badge.id);
        return `
            <div class="scout-badge ${isEarned ? 'earned' : 'locked'}" title="${badge.description}">
                <div class="scout-badge-icon">
                    <i class="fas ${badge.icon}"></i>
                </div>
                <span class="scout-badge-name">${badge.name}</span>
                ${!isEarned ? '<i class="fas fa-lock scout-badge-lock"></i>' : ''}
            </div>
        `;
    }).join('');

    badgesGrid.innerHTML = badgesHTML;
}
