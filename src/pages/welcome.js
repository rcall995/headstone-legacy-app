import { supabase } from '/js/supabase-client.js';

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

        if (!viewMemorialLink || !memorialNameSpan) {
            console.error('Required elements not found in welcome.html');
            appRoot.innerHTML = `<p class="text-center text-danger">Error: Page elements missing.</p>`;
            return;
        }

        viewMemorialLink.href = `/memorial?id=${memorialId}`;

        const { data: memorial, error } = await supabase
            .from('memorials')
            .select('name')
            .eq('id', memorialId)
            .single();

        if (memorial) {
            memorialNameSpan.textContent = memorial.name;
        } else {
            memorialNameSpan.textContent = "a loved one";
        }

    } catch (error) {
        console.error('Error loading welcome page:', error);
        appRoot.innerHTML = `<p class="text-center text-danger">Error loading page.</p>`;
    }
}
