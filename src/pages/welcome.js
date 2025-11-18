import { db } from '/js/firebase-config.js';
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

export async function loadWelcomePage(appRoot, memorialId) {
    try {
        const response = await fetch('/pages/welcome.html');
        if (!response.ok) throw new Error('Could not load welcome.html');
        appRoot.innerHTML = await response.text();

        if (!memorialId) {
            appRoot.innerHTML = `<p class="text-center text-danger">No memorial ID was provided.</p>`;
            return;
        }

        const viewMemorialLink = appRoot.querySelector('#view-memorial-link');
        const memorialNameSpan = appRoot.querySelector('#welcome-memorial-name');

        // Check if elements exist before accessing properties
        if (!viewMemorialLink || !memorialNameSpan) {
            console.error('Required elements not found in welcome.html');
            appRoot.innerHTML = `<p class="text-center text-danger">Error: Page elements missing.</p>`;
            return;
        }

        viewMemorialLink.href = `/memorial?id=${memorialId}`;

        const docRef = doc(db, "memorials", memorialId);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            memorialNameSpan.textContent = docSnap.data().name;
        } else {
            memorialNameSpan.textContent = "a loved one";
        }

    } catch (error) {
        console.error('Error loading welcome page:', error);
        appRoot.innerHTML = `<p class="text-center text-danger">Error loading page.</p>`;
    }
}