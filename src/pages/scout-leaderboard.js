// Scout Leaderboard page loader
import { supabase } from '/js/supabase-client.js';
import { getLeaderboard, getUserRank, getScoutStats, calculateLevel } from '/js/utils/scout-gamification.js';

export async function loadScoutLeaderboardPage(appRoot) {
    try {
        const response = await fetch('/pages/scout-leaderboard.html');
        if (!response.ok) throw new Error('HTML content not found');
        appRoot.innerHTML = await response.text();

        // Load leaderboard
        await loadLeaderboard();

        // Check if user is logged in and show their rank
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
            await loadUserRank(user.id);
        }

    } catch (error) {
        console.error("Failed to load Scout Leaderboard page:", error);
        appRoot.innerHTML = `<p class="text-danger text-center">Error loading page.</p>`;
    }
}

async function loadLeaderboard() {
    const leaderboardList = document.getElementById('leaderboard-list');
    if (!leaderboardList) return;

    try {
        const leaderboard = await getLeaderboard(50);

        if (leaderboard.length === 0) {
            leaderboardList.innerHTML = `
                <div class="text-center py-4">
                    <i class="fas fa-trophy fa-3x text-muted mb-3"></i>
                    <p class="text-muted">No scouts on the leaderboard yet. Be the first!</p>
                    <a href="/scout-mode" class="btn btn-hero-primary" data-route>
                        <i class="fas fa-map-marked-alt me-2"></i>Start Scouting
                    </a>
                </div>
            `;
            return;
        }

        const leaderboardHTML = leaderboard.map((entry, index) => {
            const isTopThree = index < 3;
            const rankClass = isTopThree ? `rank-${index + 1}` : '';
            const rankIcon = index === 0 ? 'fa-crown' : index === 1 ? 'fa-medal' : index === 2 ? 'fa-award' : '';

            return `
                <div class="leaderboard-item ${rankClass}">
                    <div class="leaderboard-rank">
                        ${isTopThree ? `<i class="fas ${rankIcon}"></i>` : `<span>#${entry.rank}</span>`}
                    </div>
                    <div class="leaderboard-avatar" style="background-color: ${entry.level.color}">
                        ${entry.avatarUrl
                            ? `<img src="${entry.avatarUrl}" alt="${entry.displayName}">`
                            : `<i class="fas fa-user"></i>`
                        }
                    </div>
                    <div class="leaderboard-info">
                        <h4>${escapeHtml(entry.displayName)}</h4>
                        <span class="leaderboard-level" style="color: ${entry.level.color}">${entry.level.title}</span>
                    </div>
                    <div class="leaderboard-stats">
                        <span class="leaderboard-points">${entry.totalPoints.toLocaleString()} pts</span>
                        <span class="leaderboard-details">${entry.pinsCount} pins | ${entry.photosCount} photos</span>
                    </div>
                </div>
            `;
        }).join('');

        leaderboardList.innerHTML = leaderboardHTML;

    } catch (error) {
        console.error('Error loading leaderboard:', error);
        leaderboardList.innerHTML = `<p class="text-danger text-center">Error loading leaderboard.</p>`;
    }
}

async function loadUserRank(userId) {
    try {
        const [rank, stats] = await Promise.all([
            getUserRank(userId),
            getScoutStats(userId)
        ]);

        if (!rank || !stats || stats.total_points === 0) {
            // User has no points yet, don't show rank card
            return;
        }

        const userSection = document.getElementById('leaderboard-user-section');
        if (userSection) {
            userSection.style.display = 'block';
        }

        const rankEl = document.getElementById('user-rank');
        if (rankEl) {
            rankEl.textContent = `#${rank}`;
        }

        const statsEl = document.getElementById('user-rank-stats');
        if (statsEl) {
            const level = calculateLevel(stats.total_points);
            statsEl.textContent = `${stats.total_points.toLocaleString()} points | ${level.title}`;
        }

    } catch (error) {
        console.error('Error loading user rank:', error);
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
