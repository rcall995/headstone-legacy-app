import { supabase } from '/js/supabase-client.js';
import { showToast } from '/js/utils/toasts.js';

function renderMemorials(container, memorials, template) {
    container.innerHTML = '';
    if (memorials.length === 0) {
        const emptyTemplate = template.ownerDocument.getElementById('empty-state-template').content.cloneNode(true);
        container.appendChild(emptyTemplate);
        const status = new URLSearchParams(window.location.search).get('status');
        if (status === 'draft') {
            container.querySelector('.create-memorial-link').style.display = 'inline-block';
        }
        return;
    }

    memorials.forEach(memorial => {
        const item = template.content.cloneNode(true);
        item.querySelector('.memorial-name').textContent = memorial.name;
        const dates = `${memorial.birth_date || ''} - ${memorial.death_date || ''}`;
        item.querySelector('.memorial-dates').textContent = dates === ' - ' ? 'No dates provided' : dates;
        item.querySelector('.view-link').href = `/memorial?id=${memorial.id}`;
        item.querySelector('.edit-link').href = `/memorial-form?id=${memorial.id}`;
        container.appendChild(item);
    });
}

export async function loadMemorialsPage(appRoot, urlParams) {
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        showToast('You must be signed in to view your memorials.', 'error');
        window.dispatchEvent(new CustomEvent('navigate', { detail: '/login' }));
        return;
    }

    try {
        const response = await fetch('/pages/memorial-list.html');
        if (!response.ok) throw new Error('Could not load memorial-list.html');
        appRoot.innerHTML = await response.text();

        const listContainer = appRoot.querySelector('#list-container');
        const listTitle = appRoot.querySelector('#list-page-title');
        const listSubtitle = appRoot.querySelector('#list-page-subtitle');
        const memorialItemTemplate = appRoot.querySelector('#memorial-item-template');
        const status = urlParams.get('status') || 'published';

        if (status === 'draft') {
            listTitle.textContent = 'Drafts';
            listSubtitle.textContent = 'Your unpublished work.';
        } else {
            listTitle.textContent = 'Published Memorials';
            listSubtitle.textContent = 'Your creative legacy.';
        }

        // Query memorials where user is a curator
        const { data: memorials, error } = await supabase
            .from('memorials')
            .select('*')
            .contains('curator_ids', [user.id])
            .eq('status', status)
            .order('updated_at', { ascending: false });

        if (error) throw error;

        renderMemorials(listContainer, memorials || [], memorialItemTemplate);

    } catch (error) {
        console.error('Error loading memorials page:', error);
        appRoot.innerHTML = `<p class="text-center text-danger">Error loading memorials. Please try again.</p>`;
        showToast('Could not load memorials.', 'error');
    }
}
