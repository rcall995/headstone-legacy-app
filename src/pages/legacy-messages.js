/**
 * Legacy Messages Page
 * Manages scheduled posthumous communications
 */

import { supabase } from '/js/supabase-client.js';
import { showToast } from '/js/utils/toasts.js';

let currentMemorial = null;
let messages = [];
let currentFilter = 'all';
let editingMessageId = null;
let messageModal = null;
let previewModal = null;
let triggerModal = null;

export async function loadLegacyMessagesPage(appRoot, memorialId) {
    try {
        const { data: { user } } = await supabase.auth.getUser();

        // Load the HTML template
        const response = await fetch('/pages/legacy-messages.html');
        if (!response.ok) throw new Error('Failed to load page');
        appRoot.innerHTML = await response.text();

        // Initialize Bootstrap modals
        initModals();

        // If no memorial ID, show the selector
        if (!memorialId) {
            await showMemorialSelector(user);
            return;
        }

        // User must be logged in
        if (!user) {
            showToast('Please sign in to manage legacy messages', 'error');
            window.location.href = '/login';
            return;
        }

        // Load the memorial and messages
        await loadMemorial(memorialId);

    } catch (error) {
        console.error('Failed to load Legacy Messages page:', error);
        appRoot.innerHTML = `
            <div class="container py-5 text-center">
                <div class="alert alert-danger">
                    <i class="fas fa-exclamation-triangle me-2"></i>
                    Error loading Legacy Messages: ${error.message}
                </div>
                <a href="/memorial-list" class="btn btn-primary" data-route>
                    Return to Dashboard
                </a>
            </div>
        `;
    }
}

function initModals() {
    const messageModalEl = document.getElementById('messageModal');
    const previewModalEl = document.getElementById('previewModal');
    const triggerModalEl = document.getElementById('triggerModal');

    if (messageModalEl && window.bootstrap?.Modal) {
        messageModal = new bootstrap.Modal(messageModalEl);
    }
    if (previewModalEl && window.bootstrap?.Modal) {
        previewModal = new bootstrap.Modal(previewModalEl);
    }
    if (triggerModalEl && window.bootstrap?.Modal) {
        triggerModal = new bootstrap.Modal(triggerModalEl);
    }

    // Populate day select
    const daySelect = document.getElementById('recurring-day');
    if (daySelect) {
        for (let i = 1; i <= 31; i++) {
            daySelect.innerHTML += `<option value="${i}">${i}</option>`;
        }
    }
}

async function showMemorialSelector(user) {
    const container = document.getElementById('memorial-list-container');

    if (!user) {
        container.innerHTML = `
            <div class="text-center py-4">
                <p class="text-muted mb-3">Please sign in to manage legacy messages.</p>
                <a href="/login" class="btn btn-primary" data-route>
                    <i class="fas fa-sign-in-alt me-2"></i>Sign In
                </a>
            </div>
        `;
        return;
    }

    try {
        const { data: memorials, error } = await supabase
            .from('memorials')
            .select('id, name, main_photo, birth_date, death_date')
            .contains('curator_ids', [user.id])
            .order('created_at', { ascending: false });

        if (error || !memorials || memorials.length === 0) {
            container.innerHTML = `
                <div class="text-center py-4">
                    <p class="text-muted mb-3">You don't have any memorials yet.</p>
                    <a href="/memorial-form" class="btn btn-primary" data-route>
                        <i class="fas fa-plus-circle me-2"></i>Create Your First Memorial
                    </a>
                </div>
            `;
            return;
        }

        container.innerHTML = `
            <div class="memorial-select-grid">
                ${memorials.map(m => `
                    <a href="/legacy-messages/${m.id}" class="memorial-select-card" data-route>
                        <div class="memorial-select-photo">
                            ${m.main_photo
                                ? `<img src="${m.main_photo}" alt="${escapeHtml(m.name)}">`
                                : `<i class="fas fa-user"></i>`
                            }
                        </div>
                        <div class="memorial-select-info">
                            <h4>${escapeHtml(m.name)}</h4>
                            <span class="text-muted small">${formatYears(m.birth_date, m.death_date)}</span>
                        </div>
                    </a>
                `).join('')}
            </div>
        `;

    } catch (error) {
        console.error('Error loading memorials:', error);
        container.innerHTML = `<div class="alert alert-danger">Failed to load memorials</div>`;
    }
}

async function loadMemorial(memorialId) {
    try {
        const { data: memorial, error } = await supabase
            .from('memorials')
            .select('id, name, main_photo, birth_date, death_date')
            .eq('id', memorialId)
            .single();

        if (error || !memorial) {
            throw new Error('Memorial not found');
        }

        currentMemorial = memorial;

        // Hide selector, show messages section
        document.getElementById('memorial-selector-section').style.display = 'none';
        document.getElementById('messages-section').style.display = 'block';

        // Update header
        const photoEl = document.getElementById('selected-memorial-photo');
        const placeholderEl = document.getElementById('photo-placeholder');
        if (memorial.main_photo) {
            photoEl.src = memorial.main_photo;
            photoEl.style.display = 'block';
            placeholderEl.style.display = 'none';
        } else {
            photoEl.style.display = 'none';
            placeholderEl.style.display = 'flex';
        }

        document.getElementById('selected-memorial-name').textContent = memorial.name;
        document.getElementById('selected-memorial-dates').textContent = formatYears(memorial.birth_date, memorial.death_date);

        // Setup event listeners
        setupEventListeners();

        // Load messages
        await loadMessages();

    } catch (error) {
        console.error('Error loading memorial:', error);
        showToast('Failed to load memorial', 'error');
    }
}

function setupEventListeners() {
    // Change memorial link
    document.getElementById('change-memorial-link')?.addEventListener('click', (e) => {
        e.preventDefault();
        window.history.pushState({}, '', '/legacy-messages');
        document.getElementById('memorial-selector-section').style.display = 'block';
        document.getElementById('messages-section').style.display = 'none';
    });

    // Create message buttons
    document.getElementById('create-message-btn')?.addEventListener('click', openCreateModal);
    document.getElementById('create-first-message-btn')?.addEventListener('click', openCreateModal);

    // Tab filtering
    document.querySelectorAll('.type-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.type-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            currentFilter = tab.dataset.type;
            renderMessages();
        });
    });

    // Message type radio change
    document.querySelectorAll('input[name="messageType"]').forEach(input => {
        input.addEventListener('change', handleTypeChange);
    });

    // Delivery type change
    document.getElementById('delivery-type')?.addEventListener('change', handleDeliveryTypeChange);

    // Save message button
    document.getElementById('save-message-btn')?.addEventListener('click', saveMessage);

    // Edit from preview
    document.getElementById('edit-from-preview-btn')?.addEventListener('click', () => {
        previewModal?.hide();
        messageModal?.show();
    });

    // Confirm trigger
    document.getElementById('confirm-trigger-btn')?.addEventListener('click', confirmTrigger);

    // Modal reset on close
    document.getElementById('messageModal')?.addEventListener('hidden.bs.modal', resetForm);
}

function handleTypeChange(e) {
    const type = e.target.value;
    const scheduledCard = document.getElementById('delivery-scheduled-card');
    const conditionalCard = document.getElementById('delivery-conditional-card');

    if (type === 'conditional') {
        scheduledCard.style.display = 'none';
        conditionalCard.style.display = 'block';
    } else {
        scheduledCard.style.display = 'block';
        conditionalCard.style.display = 'none';
    }
}

function handleDeliveryTypeChange(e) {
    const type = e.target.value;
    const scheduledGroup = document.getElementById('scheduled-date-group');
    const recurringMonthGroup = document.getElementById('recurring-month-group');
    const recurringDayGroup = document.getElementById('recurring-day-group');
    const recurringDescGroup = document.getElementById('recurring-description-group');

    if (type === 'scheduled') {
        scheduledGroup.style.display = 'block';
        recurringMonthGroup.style.display = 'none';
        recurringDayGroup.style.display = 'none';
        recurringDescGroup.style.display = 'none';
    } else {
        scheduledGroup.style.display = 'none';
        recurringMonthGroup.style.display = 'block';
        recurringDayGroup.style.display = 'block';
        recurringDescGroup.style.display = 'block';
    }
}

async function loadMessages() {
    const loadingEl = document.getElementById('messages-loading');
    const emptyEl = document.getElementById('messages-empty');
    const listEl = document.getElementById('messages-list');

    loadingEl.style.display = 'block';
    emptyEl.style.display = 'none';
    listEl.innerHTML = '';

    try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;

        const response = await fetch(`/api/legacy/messages?memorialId=${currentMemorial.id}`, {
            headers: {
                'Authorization': `Bearer ${session.access_token}`
            }
        });

        if (!response.ok) throw new Error('Failed to fetch messages');

        const data = await response.json();
        messages = data.messages || [];

        // Update counts
        updateCounts();

        loadingEl.style.display = 'none';

        if (messages.length === 0) {
            emptyEl.style.display = 'block';
        } else {
            renderMessages();
        }

    } catch (error) {
        console.error('Failed to load messages:', error);
        loadingEl.style.display = 'none';
        showToast('Failed to load messages', 'error');
    }
}

function updateCounts() {
    const counts = {
        all: messages.length,
        milestone: messages.filter(m => m.message_type === 'milestone').length,
        anniversary: messages.filter(m => m.message_type === 'anniversary').length,
        wisdom: messages.filter(m => m.message_type === 'wisdom').length,
        conditional: messages.filter(m => m.message_type === 'conditional').length
    };

    Object.entries(counts).forEach(([type, count]) => {
        const el = document.getElementById(`count-${type}`);
        if (el) el.textContent = count;
    });
}

function renderMessages() {
    const listEl = document.getElementById('messages-list');
    const emptyEl = document.getElementById('messages-empty');

    let filtered = messages;
    if (currentFilter !== 'all') {
        filtered = messages.filter(m => m.message_type === currentFilter);
    }

    if (filtered.length === 0) {
        listEl.innerHTML = '';
        emptyEl.style.display = 'block';
        return;
    }

    emptyEl.style.display = 'none';
    listEl.innerHTML = filtered.map(msg => renderMessageCard(msg)).join('');

    // Add event listeners to cards
    listEl.querySelectorAll('.preview-btn').forEach(btn => {
        btn.addEventListener('click', () => previewMessage(btn.dataset.id));
    });

    listEl.querySelectorAll('.edit-btn').forEach(btn => {
        btn.addEventListener('click', () => editMessage(btn.dataset.id));
    });

    listEl.querySelectorAll('.trigger-btn').forEach(btn => {
        btn.addEventListener('click', () => showTriggerModal(btn.dataset.id));
    });

    listEl.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', () => deleteMessage(btn.dataset.id));
    });
}

function renderMessageCard(msg) {
    const typeIcons = {
        milestone: 'birthday-cake',
        anniversary: 'heart',
        wisdom: 'lightbulb',
        conditional: 'lock'
    };

    const scheduleText = getScheduleText(msg);

    return `
        <div class="message-card ${msg.status === 'sent' ? 'sent' : ''}">
            <div class="message-type-icon ${msg.message_type}">
                <i class="fas fa-${typeIcons[msg.message_type] || 'envelope'}"></i>
            </div>
            <div class="message-info">
                <div class="message-header">
                    <h5 class="message-subject">${escapeHtml(msg.subject)}</h5>
                    <span class="message-status ${msg.status}">${msg.status}</span>
                </div>
                <div class="message-meta">
                    <span><i class="fas fa-user"></i>${escapeHtml(msg.recipient_name)}</span>
                    <span><i class="fas fa-calendar"></i>${scheduleText}</span>
                    ${msg.send_count > 0 ? `<span><i class="fas fa-check"></i>Sent ${msg.send_count}x</span>` : ''}
                </div>
                <p class="message-preview">${escapeHtml(msg.message_content.substring(0, 150))}...</p>
                <div class="message-actions">
                    <button class="btn btn-sm btn-outline-primary preview-btn" data-id="${msg.id}">
                        <i class="fas fa-eye me-1"></i>Preview
                    </button>
                    ${msg.status !== 'sent' ? `
                        <button class="btn btn-sm btn-outline-secondary edit-btn" data-id="${msg.id}">
                            <i class="fas fa-edit me-1"></i>Edit
                        </button>
                    ` : ''}
                    ${msg.delivery_type === 'conditional' && msg.status === 'pending' ? `
                        <button class="btn btn-sm btn-warning trigger-btn" data-id="${msg.id}">
                            <i class="fas fa-paper-plane me-1"></i>Send Now
                        </button>
                    ` : ''}
                    ${msg.status !== 'sent' ? `
                        <button class="btn btn-sm btn-outline-danger delete-btn" data-id="${msg.id}">
                            <i class="fas fa-trash"></i>
                        </button>
                    ` : ''}
                </div>
            </div>
        </div>
    `;
}

function getScheduleText(msg) {
    if (msg.delivery_type === 'conditional') {
        return msg.trigger_condition || 'When triggered by family';
    }

    if (msg.delivery_type === 'recurring') {
        const monthNames = ['', 'January', 'February', 'March', 'April', 'May', 'June',
                           'July', 'August', 'September', 'October', 'November', 'December'];
        return `Every ${monthNames[msg.recurring_month]} ${msg.recurring_day}${msg.recurring_description ? ` (${msg.recurring_description})` : ''}`;
    }

    if (msg.scheduled_date) {
        return formatDate(msg.scheduled_date);
    }

    return 'Not scheduled';
}

function openCreateModal() {
    editingMessageId = null;
    resetForm();
    document.getElementById('messageModalLabel').innerHTML = '<i class="fas fa-envelope text-primary me-2"></i>Create Legacy Message';
    messageModal?.show();
}

function resetForm() {
    const form = document.getElementById('message-form');
    form?.reset();
    editingMessageId = null;

    // Reset to milestone type
    document.querySelector('input[name="messageType"][value="milestone"]').checked = true;
    handleTypeChange({ target: { value: 'milestone' } });

    // Reset delivery type
    document.getElementById('delivery-type').value = 'scheduled';
    handleDeliveryTypeChange({ target: { value: 'scheduled' } });
}

function editMessage(id) {
    const msg = messages.find(m => m.id === id);
    if (!msg) return;

    editingMessageId = id;

    // Fill form
    document.getElementById('message-id').value = id;
    document.querySelector(`input[name="messageType"][value="${msg.message_type}"]`).checked = true;
    handleTypeChange({ target: { value: msg.message_type } });

    document.getElementById('recipient-name').value = msg.recipient_name;
    document.getElementById('recipient-email').value = msg.recipient_email;
    document.getElementById('recipient-phone').value = msg.recipient_phone || '';
    document.getElementById('recipient-relationship').value = msg.recipient_relationship || '';
    document.getElementById('message-subject').value = msg.subject;
    document.getElementById('message-content').value = msg.message_content;

    if (msg.delivery_type === 'conditional') {
        document.getElementById('trigger-condition').value = msg.trigger_condition || '';
        document.getElementById('trigger-keywords').value = (msg.trigger_keywords || []).join(', ');
    } else {
        document.getElementById('delivery-type').value = msg.delivery_type;
        handleDeliveryTypeChange({ target: { value: msg.delivery_type } });

        if (msg.delivery_type === 'scheduled' && msg.scheduled_date) {
            document.getElementById('scheduled-date').value = msg.scheduled_date.split('T')[0];
        } else if (msg.delivery_type === 'recurring') {
            document.getElementById('recurring-month').value = msg.recurring_month;
            document.getElementById('recurring-day').value = msg.recurring_day;
            document.getElementById('recurring-description').value = msg.recurring_description || '';
        }
    }

    document.getElementById('messageModalLabel').innerHTML = '<i class="fas fa-edit text-primary me-2"></i>Edit Legacy Message';
    messageModal?.show();
}

function previewMessage(id) {
    const msg = messages.find(m => m.id === id);
    if (!msg) return;

    document.getElementById('preview-recipient').textContent = `${msg.recipient_name} <${msg.recipient_email}>`;
    document.getElementById('preview-subject').textContent = msg.subject;
    document.getElementById('preview-schedule').textContent = getScheduleText(msg);
    document.getElementById('preview-content').innerHTML = escapeHtml(msg.message_content).replace(/\n/g, '<br>');

    // Store ID for edit button
    document.getElementById('edit-from-preview-btn').dataset.id = id;

    previewModal?.show();
}

async function saveMessage() {
    const btn = document.getElementById('save-message-btn');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Saving...';

    try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) throw new Error('Please sign in');

        const messageType = document.querySelector('input[name="messageType"]:checked').value;
        const saveAsDraft = document.getElementById('save-as-draft').checked;

        const payload = {
            memorialId: currentMemorial.id,
            recipientName: document.getElementById('recipient-name').value.trim(),
            recipientEmail: document.getElementById('recipient-email').value.trim(),
            recipientPhone: document.getElementById('recipient-phone').value.trim() || null,
            recipientRelationship: document.getElementById('recipient-relationship').value.trim() || null,
            messageType,
            subject: document.getElementById('message-subject').value.trim(),
            messageContent: document.getElementById('message-content').value.trim(),
            status: saveAsDraft ? 'draft' : 'pending'
        };

        // Validate required fields
        if (!payload.recipientName || !payload.recipientEmail || !payload.subject || !payload.messageContent) {
            throw new Error('Please fill in all required fields');
        }

        if (messageType === 'conditional') {
            payload.deliveryType = 'conditional';
            payload.triggerCondition = document.getElementById('trigger-condition').value.trim();
            const keywords = document.getElementById('trigger-keywords').value.trim();
            payload.triggerKeywords = keywords ? keywords.split(',').map(k => k.trim()) : [];
        } else {
            payload.deliveryType = document.getElementById('delivery-type').value;

            if (payload.deliveryType === 'scheduled') {
                payload.scheduledDate = document.getElementById('scheduled-date').value;
                if (!payload.scheduledDate) throw new Error('Please select a delivery date');
            } else {
                payload.recurringMonth = parseInt(document.getElementById('recurring-month').value);
                payload.recurringDay = parseInt(document.getElementById('recurring-day').value);
                payload.recurringDescription = document.getElementById('recurring-description').value.trim();
            }
        }

        const url = editingMessageId
            ? `/api/legacy/messages?id=${editingMessageId}`
            : '/api/legacy/messages';

        const response = await fetch(url, {
            method: editingMessageId ? 'PUT' : 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.access_token}`
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to save message');
        }

        showToast(editingMessageId ? 'Message updated!' : 'Message created!', 'success');
        messageModal?.hide();
        await loadMessages();

    } catch (error) {
        console.error('Failed to save message:', error);
        showToast(error.message, 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-save me-2"></i>Save Message';
    }
}

let pendingTriggerId = null;

function showTriggerModal(id) {
    const msg = messages.find(m => m.id === id);
    if (!msg) return;

    pendingTriggerId = id;
    document.getElementById('trigger-recipient-name').textContent = msg.recipient_name;

    const keywordGroup = document.getElementById('trigger-keyword-group');
    const keywordInput = document.getElementById('trigger-keyword-input');

    if (msg.trigger_keywords && msg.trigger_keywords.length > 0) {
        keywordGroup.style.display = 'block';
        keywordInput.value = '';
    } else {
        keywordGroup.style.display = 'none';
    }

    triggerModal?.show();
}

async function confirmTrigger() {
    if (!pendingTriggerId) return;

    const btn = document.getElementById('confirm-trigger-btn');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Sending...';

    try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) throw new Error('Please sign in');

        const keyword = document.getElementById('trigger-keyword-input').value.trim();

        const response = await fetch('/api/legacy/trigger', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.access_token}`
            },
            body: JSON.stringify({
                messageId: pendingTriggerId,
                keyword: keyword || undefined
            })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to trigger message');
        }

        showToast('Message sent successfully!', 'success');
        triggerModal?.hide();
        await loadMessages();

    } catch (error) {
        console.error('Failed to trigger message:', error);
        showToast(error.message, 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-paper-plane me-2"></i>Send Now';
        pendingTriggerId = null;
    }
}

async function deleteMessage(id) {
    if (!confirm('Are you sure you want to delete this message? This cannot be undone.')) {
        return;
    }

    try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;

        const response = await fetch(`/api/legacy/messages?id=${id}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${session.access_token}`
            }
        });

        if (!response.ok) throw new Error('Failed to delete message');

        showToast('Message deleted', 'success');
        await loadMessages();

    } catch (error) {
        console.error('Failed to delete message:', error);
        showToast('Failed to delete message', 'error');
    }
}

// Utility functions
function formatDate(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

function formatYears(birth, death) {
    const birthYear = birth ? new Date(birth).getFullYear() : '?';
    const deathYear = death ? new Date(death).getFullYear() : 'Present';
    return `${birthYear} - ${deathYear}`;
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
