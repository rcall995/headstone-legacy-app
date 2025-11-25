import { supabase } from '/js/supabase-client.js';

/**
 * Updates notification badges in both mobile menu and desktop dropdown
 * Shows counts for drafts and pending tributes
 * @param {Object} user - Supabase user object
 */
export async function updateMenuBadges(user) {
    if (!user) {
        return;
    }

    try {
        // Get count of drafts
        const { count: draftCount, error: draftError } = await supabase
            .from('memorials')
            .select('*', { count: 'exact', head: true })
            .contains('curator_ids', [user.id])
            .eq('status', 'draft');

        if (draftError) throw draftError;

        // Update mobile menu draft badge
        const mobileDraftBadge = document.getElementById('mobile-draft-badge');
        if (mobileDraftBadge) {
            if (draftCount > 0) {
                mobileDraftBadge.textContent = draftCount;
                mobileDraftBadge.style.display = 'flex';
            } else {
                mobileDraftBadge.style.display = 'none';
            }
        }

        // Update desktop dropdown draft badge
        const desktopDraftBadge = document.getElementById('desktop-draft-badge');
        if (desktopDraftBadge) {
            if (draftCount > 0) {
                desktopDraftBadge.textContent = draftCount;
                desktopDraftBadge.style.display = 'inline-flex';
            } else {
                desktopDraftBadge.style.display = 'none';
            }
        }

        // Get count of pending tributes across all memorials
        const { data: memorials, error: memorialsError } = await supabase
            .from('memorials')
            .select('id')
            .contains('curator_ids', [user.id]);

        if (memorialsError) throw memorialsError;

        const memorialIds = memorials.map(m => m.id);

        let totalTributes = 0;
        if (memorialIds.length > 0) {
            const { count, error: tributeError } = await supabase
                .from('tributes')
                .select('*', { count: 'exact', head: true })
                .in('memorial_id', memorialIds)
                .eq('status', 'pending');

            if (tributeError) throw tributeError;
            totalTributes = count || 0;
        }

        // Update mobile menu tribute badge
        const mobileTributeBadge = document.getElementById('mobile-tribute-badge');
        if (mobileTributeBadge) {
            if (totalTributes > 0) {
                mobileTributeBadge.textContent = totalTributes;
                mobileTributeBadge.style.display = 'flex';
            } else {
                mobileTributeBadge.style.display = 'none';
            }
        }

        // Update desktop dropdown tribute badge
        const desktopTributeBadge = document.getElementById('desktop-tribute-badge');
        if (desktopTributeBadge) {
            if (totalTributes > 0) {
                desktopTributeBadge.textContent = totalTributes;
                desktopTributeBadge.style.display = 'inline-flex';
            } else {
                desktopTributeBadge.style.display = 'none';
            }
        }

    } catch (error) {
        console.error('[Badge Updater] Error updating menu badges:', error);
        // Don't show toast - badges are non-critical UI
    }
}
