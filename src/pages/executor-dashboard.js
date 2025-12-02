// /js/pages/executor-dashboard.js - Executor Dashboard
import { supabase } from '/js/supabase-client.js';
import { showToast } from '/js/utils/toasts.js';

let currentUser = null;
let assignedLegacies = [];
let selectedLegacy = null;

export async function loadExecutorDashboardPage(appRoot) {
    try {
        const response = await fetch('/pages/executor-dashboard.html');
        if (!response.ok) throw new Error('Could not load executor-dashboard.html');
        appRoot.innerHTML = await response.text();

        // Check auth
        const { data: { user } } = await supabase.auth.getUser();
        currentUser = user;

        const loadingEl = document.getElementById('executor-loading');
        const notLoggedInEl = document.getElementById('executor-not-logged-in');
        const emptyEl = document.getElementById('executor-empty');
        const legaciesEl = document.getElementById('executor-legacies');

        if (!currentUser) {
            loadingEl.style.display = 'none';
            notLoggedInEl.style.display = 'block';
            return;
        }

        // Load legacies where user is executor
        await loadAssignedLegacies();

        loadingEl.style.display = 'none';

        if (assignedLegacies.length === 0) {
            emptyEl.style.display = 'block';
        } else {
            legaciesEl.style.display = 'block';
            renderLegacies();
        }

        // Setup event listeners
        setupEventListeners();

    } catch (error) {
        console.error('Error loading executor dashboard:', error);
        appRoot.innerHTML = '<p class="text-danger text-center">Error loading page. Please try again.</p>';
    }
}

async function loadAssignedLegacies() {
    try {
        const { data, error } = await supabase
            .from('memorials')
            .select('id, name, main_photo, birth_date, status, is_activated, activated_at, created_at')
            .eq('executor_id', currentUser.id)
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Error loading legacies:', error);
            return;
        }

        assignedLegacies = data || [];
    } catch (err) {
        console.error('Error in loadAssignedLegacies:', err);
    }
}

function renderLegacies() {
    const listEl = document.getElementById('legacies-list');

    listEl.innerHTML = assignedLegacies.map(legacy => {
        const isActive = legacy.status === 'living_legacy' && !legacy.is_activated;
        const photoHtml = legacy.main_photo
            ? `<img src="${legacy.main_photo}" alt="${legacy.name}" class="legacy-photo">`
            : `<div class="legacy-photo-placeholder"><i class="fas fa-user"></i></div>`;

        const birthYear = legacy.birth_date ? new Date(legacy.birth_date).getFullYear() : '';
        const statusBadge = isActive
            ? '<span class="status-badge active"><i class="fas fa-heart-pulse"></i> Living</span>'
            : '<span class="status-badge activated"><i class="fas fa-check-circle"></i> Activated</span>';

        const activatedInfo = legacy.is_activated && legacy.activated_at
            ? `<p class="activated-date">Activated on ${new Date(legacy.activated_at).toLocaleDateString()}</p>`
            : '';

        const actionButton = isActive
            ? `<button class="btn btn-primary activate-legacy-btn" data-id="${legacy.id}" data-name="${legacy.name}">
                 <i class="fas fa-play-circle"></i> Activate Legacy
               </button>`
            : `<a href="/memorial?id=${legacy.id}" data-route class="btn btn-outline-secondary">
                 <i class="fas fa-eye"></i> View Memorial
               </a>`;

        return `
            <div class="legacy-card ${isActive ? 'active' : 'activated'}">
                <div class="legacy-card-photo">
                    ${photoHtml}
                </div>
                <div class="legacy-card-info">
                    <h3>${legacy.name}</h3>
                    ${birthYear ? `<p class="legacy-birth">Born ${birthYear}</p>` : ''}
                    ${statusBadge}
                    ${activatedInfo}
                </div>
                <div class="legacy-card-actions">
                    ${actionButton}
                </div>
            </div>
        `;
    }).join('');

    // Add click handlers for activate buttons
    listEl.querySelectorAll('.activate-legacy-btn').forEach(btn => {
        btn.addEventListener('click', () => openActivateModal(btn.dataset.id, btn.dataset.name));
    });
}

function setupEventListeners() {
    // Confirmation checkbox
    const confirmCheckbox = document.getElementById('confirm-activation');
    const confirmBtn = document.getElementById('confirm-activate-btn');

    confirmCheckbox?.addEventListener('change', () => {
        confirmBtn.disabled = !confirmCheckbox.checked;
    });

    // Confirm activate button
    confirmBtn?.addEventListener('click', activateLegacy);
}

function openActivateModal(legacyId, legacyName) {
    selectedLegacy = { id: legacyId, name: legacyName };

    // Update modal content
    document.getElementById('activate-name').textContent = legacyName;
    document.getElementById('confirm-name').textContent = legacyName;

    // Reset form
    document.getElementById('death-date').value = '';
    document.getElementById('confirm-activation').checked = false;
    document.getElementById('confirm-activate-btn').disabled = true;

    const modal = new bootstrap.Modal(document.getElementById('activateModal'));
    modal.show();
}

async function activateLegacy() {
    if (!selectedLegacy) return;

    const btn = document.getElementById('confirm-activate-btn');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Activating...';

    try {
        const deathDate = document.getElementById('death-date').value || null;

        const { data: { session } } = await supabase.auth.getSession();

        const response = await fetch('/api/executor/activate', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.access_token}`
            },
            body: JSON.stringify({
                memorialId: selectedLegacy.id,
                deathDate,
                confirmActivation: true
            })
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.error || 'Failed to activate legacy');
        }

        // Update local state
        const legacy = assignedLegacies.find(l => l.id === selectedLegacy.id);
        if (legacy) {
            legacy.is_activated = true;
            legacy.activated_at = new Date().toISOString();
            legacy.status = 'published';
        }

        // Close modal and refresh UI
        bootstrap.Modal.getInstance(document.getElementById('activateModal')).hide();
        renderLegacies();

        showToast(`${selectedLegacy.name}'s legacy has been activated.`, 'success');

    } catch (error) {
        console.error('Activation error:', error);
        showToast(error.message || 'Failed to activate legacy.', 'error');
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-check"></i> Activate Legacy';
    }
}
