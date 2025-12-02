import { supabase } from '/js/supabase-client.js';
import { showToast } from '/js/utils/toasts.js';

let allMemorials = []; // Store all memorials for filtering/sorting
let currentTemplate = null;
let currentContainer = null;

function renderMemorials(memorials) {
    if (!currentContainer || !currentTemplate) return;

    currentContainer.innerHTML = '';
    if (memorials.length === 0) {
        const emptyTemplate = currentTemplate.ownerDocument.getElementById('empty-state-template').content.cloneNode(true);
        const emptyMessage = emptyTemplate.querySelector('.empty-message');
        if (emptyMessage && document.getElementById('memorial-search')?.value) {
            emptyMessage.textContent = 'No memorials match your search';
        }
        currentContainer.appendChild(emptyTemplate);
        return;
    }

    memorials.forEach(memorial => {
        const item = currentTemplate.content.cloneNode(true);
        item.querySelector('.memorial-name').textContent = memorial.name;
        const dates = `${memorial.birth_date || ''} - ${memorial.death_date || ''}`;
        item.querySelector('.memorial-dates').textContent = dates === ' - ' ? 'No dates provided' : dates;
        item.querySelector('.view-link').href = `/memorial?id=${memorial.id}`;
        item.querySelector('.edit-link').href = `/memorial-form?id=${memorial.id}`;
        currentContainer.appendChild(item);
    });
}

function sortMemorials(memorials, sortValue) {
    const sorted = [...memorials];

    switch (sortValue) {
        case 'name_asc':
            sorted.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
            break;
        case 'name_desc':
            sorted.sort((a, b) => (b.name || '').localeCompare(a.name || ''));
            break;
        case 'birth_asc':
            sorted.sort((a, b) => (a.birth_date || '').localeCompare(b.birth_date || ''));
            break;
        case 'birth_desc':
            sorted.sort((a, b) => (b.birth_date || '').localeCompare(a.birth_date || ''));
            break;
        case 'death_asc':
            sorted.sort((a, b) => (a.death_date || '').localeCompare(b.death_date || ''));
            break;
        case 'death_desc':
            sorted.sort((a, b) => (b.death_date || '').localeCompare(a.death_date || ''));
            break;
        case 'updated_desc':
        default:
            sorted.sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''));
            break;
    }

    return sorted;
}

function filterAndRender() {
    const searchInput = document.getElementById('memorial-search');
    const sortSelect = document.getElementById('memorial-sort');

    const searchTerm = (searchInput?.value || '').toLowerCase().trim();
    const sortValue = sortSelect?.value || 'updated_desc';

    // Filter by search term
    let filtered = allMemorials;
    if (searchTerm) {
        filtered = allMemorials.filter(m =>
            (m.name || '').toLowerCase().includes(searchTerm) ||
            (m.birth_date || '').includes(searchTerm) ||
            (m.death_date || '').includes(searchTerm)
        );
    }

    // Sort
    const sorted = sortMemorials(filtered, sortValue);

    // Render
    renderMemorials(sorted);
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

        currentContainer = appRoot.querySelector('#list-container');
        const listTitle = appRoot.querySelector('#list-page-title');
        const listSubtitle = appRoot.querySelector('#list-page-subtitle');
        currentTemplate = appRoot.querySelector('#memorial-item-template');
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

        allMemorials = memorials || [];

        // Set up search handler
        const searchInput = appRoot.querySelector('#memorial-search');
        if (searchInput) {
            searchInput.addEventListener('input', debounce(filterAndRender, 300));
        }

        // Set up sort handler
        const sortSelect = appRoot.querySelector('#memorial-sort');
        if (sortSelect) {
            sortSelect.addEventListener('change', filterAndRender);
        }

        // Initial render
        filterAndRender();

    } catch (error) {
        console.error('Error loading memorials page:', error);
        appRoot.innerHTML = `<p class="text-center text-danger">Error loading memorials. Please try again.</p>`;
        showToast('Could not load memorials.', 'error');
    }
}

// Debounce helper for search input
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}
