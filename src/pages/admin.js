// /js/pages/admin.js - Admin Dashboard
import { supabase } from '/js/supabase-client.js';
import { showToast } from '/js/utils/toasts.js';

let currentUser = null;

// Category colors for badges
const categoryColors = {
    general: 'secondary',
    feature: 'primary',
    bug: 'danger',
    idea: 'success',
    decision: 'warning',
    meeting: 'info'
};

async function checkAdminAccess() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        showToast('You must be signed in to access the admin dashboard.', 'error');
        window.dispatchEvent(new CustomEvent('navigate', { detail: '/login' }));
        return false;
    }
    currentUser = user;
    return true;
}

async function loadStats() {
    try {
        // Get memorial counts
        const { count: totalMemorials } = await supabase
            .from('memorials')
            .select('*', { count: 'exact', head: true });

        const { count: publishedMemorials } = await supabase
            .from('memorials')
            .select('*', { count: 'exact', head: true })
            .in('status', ['published', 'approved']);

        // Get candle count
        const { data: candleData } = await supabase
            .from('memorials')
            .select('candle_count');

        const totalCandles = candleData?.reduce((sum, m) => sum + (m.candle_count || 0), 0) || 0;

        // Get tribute count
        const { count: totalTributes } = await supabase
            .from('tributes')
            .select('*', { count: 'exact', head: true });

        // Update UI
        document.getElementById('stat-memorials').textContent = totalMemorials || 0;
        document.getElementById('stat-published').textContent = publishedMemorials || 0;
        document.getElementById('stat-candles').textContent = totalCandles;
        document.getElementById('stat-tributes').textContent = totalTributes || 0;

    } catch (error) {
        console.error('Error loading stats:', error);
    }
}

async function loadNotes(filter = 'all') {
    const notesList = document.getElementById('notes-list');

    try {
        let query = supabase
            .from('project_notes')
            .select('*')
            .order('is_pinned', { ascending: false })
            .order('created_at', { ascending: false });

        if (filter !== 'all') {
            query = query.eq('category', filter);
        }

        const { data: notes, error } = await query;

        if (error) throw error;

        if (!notes || notes.length === 0) {
            notesList.innerHTML = `
                <div class="text-center py-4 text-muted">
                    <i class="fas fa-sticky-note fa-2x mb-2"></i>
                    <p class="mb-0">No notes yet. Add your first note above!</p>
                </div>
            `;
            return;
        }

        notesList.innerHTML = notes.map(note => `
            <div class="list-group-item ${note.is_pinned ? 'note-pinned' : ''}" data-note-id="${note.id}">
                <div class="d-flex justify-content-between align-items-start">
                    <div class="flex-grow-1">
                        <div class="d-flex align-items-center mb-1">
                            ${note.is_pinned ? '<i class="fas fa-thumbtack text-warning me-2"></i>' : ''}
                            <h6 class="mb-0 me-2">${escapeHtml(note.title)}</h6>
                            <span class="badge bg-${categoryColors[note.category] || 'secondary'} badge-category">
                                ${note.category}
                            </span>
                        </div>
                        <p class="mb-1 text-muted small">${escapeHtml(note.content)}</p>
                        <div class="d-flex align-items-center">
                            <small class="text-muted me-3">
                                <i class="fas fa-clock me-1"></i>${formatDate(note.created_at)}
                            </small>
                            ${note.tags && note.tags.length > 0 ? `
                                <div>
                                    ${note.tags.map(tag => `<span class="badge bg-light text-dark me-1">${escapeHtml(tag)}</span>`).join('')}
                                </div>
                            ` : ''}
                        </div>
                    </div>
                    <div class="ms-2">
                        <button class="btn btn-sm btn-outline-danger delete-note-btn" data-id="${note.id}" title="Delete">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
            </div>
        `).join('');

        // Add delete handlers
        notesList.querySelectorAll('.delete-note-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const noteId = btn.dataset.id;
                if (confirm('Delete this note?')) {
                    await deleteNote(noteId);
                }
            });
        });

    } catch (error) {
        console.error('Error loading notes:', error);
        notesList.innerHTML = `
            <div class="text-center py-4 text-danger">
                <i class="fas fa-exclamation-circle me-2"></i>
                Error loading notes. Make sure the project_notes table exists.
            </div>
        `;
    }
}

async function addNote(noteData) {
    try {
        const { error } = await supabase
            .from('project_notes')
            .insert([noteData]);

        if (error) throw error;

        showToast('Note saved successfully!', 'success');
        document.getElementById('add-note-form').reset();
        loadNotes(document.getElementById('notes-filter').value);

    } catch (error) {
        console.error('Error adding note:', error);
        showToast('Failed to save note: ' + error.message, 'error');
    }
}

async function deleteNote(noteId) {
    try {
        const { error } = await supabase
            .from('project_notes')
            .delete()
            .eq('id', noteId);

        if (error) throw error;

        showToast('Note deleted', 'success');
        loadNotes(document.getElementById('notes-filter').value);

    } catch (error) {
        console.error('Error deleting note:', error);
        showToast('Failed to delete note', 'error');
    }
}

async function loadRecentMemorials() {
    const tbody = document.getElementById('memorials-table-body');

    try {
        const { data: memorials, error } = await supabase
            .from('memorials')
            .select('id, name, status, candle_count, created_at')
            .order('created_at', { ascending: false })
            .limit(20);

        if (error) throw error;

        if (!memorials || memorials.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="5" class="text-center py-4 text-muted">
                        No memorials found.
                    </td>
                </tr>
            `;
            return;
        }

        const statusColors = {
            draft: 'warning',
            published: 'success',
            approved: 'primary',
            archived: 'secondary'
        };

        tbody.innerHTML = memorials.map(m => `
            <tr>
                <td>
                    <a href="/memorial?id=${m.id}" class="text-decoration-none">
                        ${escapeHtml(m.name)}
                    </a>
                </td>
                <td>
                    <span class="badge bg-${statusColors[m.status] || 'secondary'}">
                        ${m.status}
                    </span>
                </td>
                <td>
                    <i class="fas fa-fire text-warning me-1"></i>${m.candle_count || 0}
                </td>
                <td class="text-muted small">${formatDate(m.created_at)}</td>
                <td>
                    <a href="/memorial-form?id=${m.id}" class="btn btn-sm btn-outline-primary">
                        <i class="fas fa-edit"></i>
                    </a>
                </td>
            </tr>
        `).join('');

    } catch (error) {
        console.error('Error loading memorials:', error);
        tbody.innerHTML = `
            <tr>
                <td colspan="5" class="text-center py-4 text-danger">
                    Error loading memorials.
                </td>
            </tr>
        `;
    }
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatDate(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
    });
}

export async function loadAdminPage(appRoot) {
    try {
        const response = await fetch('/pages/admin.html');
        if (!response.ok) throw new Error('Could not load admin.html');
        appRoot.innerHTML = await response.text();

        // Check admin access
        const hasAccess = await checkAdminAccess();
        if (!hasAccess) return;

        // Load initial data
        await Promise.all([
            loadStats(),
            loadNotes(),
            loadRecentMemorials()
        ]);

        // Set up form submission
        document.getElementById('add-note-form')?.addEventListener('submit', async (e) => {
            e.preventDefault();

            const title = document.getElementById('note-title').value.trim();
            const category = document.getElementById('note-category').value;
            const content = document.getElementById('note-content').value.trim();
            const tagsStr = document.getElementById('note-tags').value.trim();
            const isPinned = document.getElementById('note-pinned').checked;

            const tags = tagsStr ? tagsStr.split(',').map(t => t.trim()).filter(t => t) : [];

            await addNote({
                title,
                category,
                content,
                tags,
                is_pinned: isPinned
            });
        });

        // Set up filter
        document.getElementById('notes-filter')?.addEventListener('change', (e) => {
            loadNotes(e.target.value);
        });

        // Load memorials when tab is shown
        document.getElementById('memorials-tab')?.addEventListener('shown.bs.tab', () => {
            loadRecentMemorials();
        });

    } catch (error) {
        console.error('Failed to load admin page:', error);
        appRoot.innerHTML = `
            <div class="container py-5">
                <div class="alert alert-danger">
                    <h4>Error Loading Admin Dashboard</h4>
                    <p>${error.message}</p>
                </div>
            </div>
        `;
    }
}
