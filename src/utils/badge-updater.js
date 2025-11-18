import { db } from '/js/firebase-config.js';
import { collection, query, where, getDocs, getCountFromServer } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

/**
 * Updates notification badges in both mobile menu and desktop dropdown
 * Shows counts for drafts and pending tributes
 * @param {Object} user - Firebase user object
 */
export async function updateMenuBadges(user) {
    if (!user || user.isAnonymous) {
        return;
    }

    try {
        // Get count of drafts
        const draftsQuery = query(
            collection(db, 'memorials'),
            where('curatorIds', 'array-contains', user.uid),
            where('status', '==', 'draft')
        );
        const draftsSnapshot = await getCountFromServer(draftsQuery);
        const draftCount = draftsSnapshot.data().count;

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
        const memorialsQuery = query(
            collection(db, 'memorials'),
            where('curatorIds', 'array-contains', user.uid)
        );
        const memorialsSnapshot = await getDocs(memorialsQuery);
        const memorialIds = memorialsSnapshot.docs.map(doc => doc.id);

        let totalTributes = 0;
        if (memorialIds.length > 0) {
            const tributeQueries = memorialIds.map(id => {
                const tributesRef = collection(db, `memorials/${id}/tributes`);
                return getCountFromServer(query(tributesRef, where('status', '==', 'pending')));
            });

            const tributeCounts = await Promise.all(tributeQueries);
            totalTributes = tributeCounts.reduce((sum, snapshot) => sum + snapshot.data().count, 0);
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
