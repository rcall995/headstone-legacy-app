import { supabase } from '/js/supabase-client.js';
import { showToast } from '/js/utils/toasts.js';

async function updateDashboardBadges(user) {
    try {
        // Get count of drafts
        const { count: draftCount, error: draftError } = await supabase
            .from('memorials')
            .select('*', { count: 'exact', head: true })
            .contains('curator_ids', [user.id])
            .eq('status', 'draft');

        if (draftError) throw draftError;

        const draftBadge = document.getElementById('draft-badge');
        if (draftBadge) {
            if (draftCount > 0) {
                draftBadge.textContent = draftCount;
                draftBadge.style.display = 'flex';
            } else {
                draftBadge.style.display = 'none';
            }
        }

        // Get count of pending tributes
        const { data: memorials, error: memorialsError } = await supabase
            .from('memorials')
            .select('id')
            .contains('curator_ids', [user.id]);

        if (memorialsError) throw memorialsError;

        const memorialIds = memorials.map(m => m.id);

        if (memorialIds.length > 0) {
            const { count: totalTributes, error: tributeError } = await supabase
                .from('tributes')
                .select('*', { count: 'exact', head: true })
                .in('memorial_id', memorialIds)
                .eq('status', 'pending');

            if (tributeError) throw tributeError;

            const tributeBadge = document.getElementById('tribute-badge');
            if (tributeBadge) {
                if (totalTributes > 0) {
                    tributeBadge.textContent = totalTributes;
                    tributeBadge.style.display = 'flex';
                } else {
                    tributeBadge.style.display = 'none';
                }
            }
        }
    } catch (error) {
        console.error("Error updating dashboard badges:", error);
        showToast('Failed to update dashboard badges.', 'error');
    }
}

export async function loadCuratorPanel(appRoot) {
    try {
        const response = await fetch('/pages/curator-panel.html');
        if (!response.ok) throw new Error('Could not load curator-panel.html');
        appRoot.innerHTML = await response.text();
        appRoot.style.display = 'block';

        // Update badges based on current auth state
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
            await updateDashboardBadges(user);
        }
    } catch (error) {
        console.error('Error loading curator panel:', error);
        appRoot.innerHTML = `<p class="text-center text-danger">Error loading dashboard. Please try again.</p>`;
        showToast('Dashboard failed to load.', 'error');
    }
}