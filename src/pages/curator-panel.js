import { auth, db } from '/js/firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { collection, query, where, getDocs, getCountFromServer } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { showToast } from '/js/utils/toasts.js';

async function updateDashboardBadges(user) {
    try {
        // Get count of drafts
        const draftsQuery = query(collection(db, 'memorials'), where('curatorIds', 'array-contains', user.uid), where('status', '==', 'draft'));
        const draftsSnapshot = await getCountFromServer(draftsQuery);
        const draftCount = draftsSnapshot.data().count;

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
        const memorialsQuery = query(collection(db, 'memorials'), where('curatorIds', 'array-contains', user.uid));
        const memorialsSnapshot = await getDocs(memorialsQuery);
        const memorialIds = memorialsSnapshot.docs.map(doc => doc.id);

        if (memorialIds.length > 0) {
            const tributeQueries = memorialIds.map(id => {
                const tributesRef = collection(db, `memorials/${id}/tributes`);
                return getCountFromServer(query(tributesRef, where('status', '==', 'pending')));
            });
            
            const tributeCounts = await Promise.all(tributeQueries);
            const totalTributes = tributeCounts.reduce((sum, snapshot) => sum + snapshot.data().count, 0);

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
        const user = auth.currentUser;
        if (user && !user.isAnonymous) {
            await updateDashboardBadges(user);
        }
    } catch (error) {
        console.error('Error loading curator panel:', error);
        appRoot.innerHTML = `<p class="text-center text-danger">Error loading dashboard. Please try again.</p>`;
        showToast('Dashboard failed to load.', 'error');
    }
}