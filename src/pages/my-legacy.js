// /js/pages/my-legacy.js - Living Legacy Dashboard
import { supabase } from '/js/supabase-client.js';
import { showToast } from '/js/utils/toasts.js';

let currentUser = null;
let userLegacy = null;
let legacyMessages = [];

/* ------------------- Load Page ------------------- */
export async function loadMyLegacyPage(appRoot) {
    try {
        const response = await fetch('/pages/my-legacy.html');
        if (!response.ok) throw new Error('Could not load my-legacy.html');
        appRoot.innerHTML = await response.text();

        // Check auth state
        const { data: { user } } = await supabase.auth.getUser();
        currentUser = user;

        const loadingEl = document.getElementById('legacy-loading');
        const notLoggedInEl = document.getElementById('legacy-not-logged-in');
        const dashboardEl = document.getElementById('legacy-dashboard');
        const createCtaEl = document.getElementById('legacy-create-cta');

        if (!currentUser) {
            loadingEl.style.display = 'none';
            notLoggedInEl.style.display = 'block';
            return;
        }

        // Load user's living legacy
        await loadUserLegacy();

        loadingEl.style.display = 'none';

        if (userLegacy) {
            dashboardEl.style.display = 'block';
            renderDashboard();
        } else {
            createCtaEl.style.display = 'block';
        }

        // Setup event listeners
        setupEventListeners();

    } catch (error) {
        console.error('Error loading my legacy page:', error);
        appRoot.innerHTML = '<p class="text-danger text-center">Error loading page. Please try again.</p>';
    }
}

/* ------------------- Load User's Living Legacy ------------------- */
async function loadUserLegacy() {
    try {
        // Find user's living legacy memorial
        const { data, error } = await supabase
            .from('memorials')
            .select('*')
            .contains('curator_ids', [currentUser.id])
            .eq('status', 'living_legacy')
            .maybeSingle();

        if (error && error.code !== 'PGRST116') {
            console.error('Error loading legacy:', error);
        }

        userLegacy = data;

        // Load messages if legacy exists
        if (userLegacy) {
            await loadLegacyMessages();
        }
    } catch (err) {
        console.error('Error in loadUserLegacy:', err);
    }
}

/* ------------------- Load Legacy Messages ------------------- */
async function loadLegacyMessages() {
    if (!userLegacy) return;

    try {
        const { data, error } = await supabase
            .from('legacy_messages')
            .select('*')
            .eq('memorial_id', userLegacy.id)
            .eq('is_pre_need', true)
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Error loading messages:', error);
            return;
        }

        legacyMessages = data || [];
    } catch (err) {
        console.error('Error in loadLegacyMessages:', err);
    }
}

/* ------------------- Render Dashboard ------------------- */
function renderDashboard() {
    renderProfile();
    renderStoryProgress();
    renderMessages();
    renderExecutor();
}

/* ------------------- Render Profile ------------------- */
function renderProfile() {
    if (!userLegacy) return;

    // Update profile photo
    const photoWrapper = document.getElementById('profile-photo-wrapper');
    if (photoWrapper) {
        if (userLegacy.main_photo) {
            photoWrapper.innerHTML = `<img src="${userLegacy.main_photo}" alt="${userLegacy.name}">`;
        } else {
            photoWrapper.innerHTML = `<div class="profile-photo-placeholder"><i class="fas fa-user"></i></div>`;
        }
    }

    // Update name
    const nameEl = document.getElementById('profile-name');
    if (nameEl) {
        nameEl.textContent = userLegacy.name || 'Your Name';
    }

    // Update dates
    const datesEl = document.getElementById('profile-dates');
    if (datesEl) {
        const birthDate = userLegacy.birth_date
            ? new Date(userLegacy.birth_date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
            : 'Not set';
        datesEl.innerHTML = `<i class="fas fa-birthday-cake"></i><span>Born: ${birthDate}</span>`;
    }
}

/* ------------------- Render Story Progress ------------------- */
function renderStoryProgress() {
    const statusEl = document.getElementById('story-status');
    const previewEl = document.getElementById('story-preview');
    const btnTextEl = document.getElementById('write-story-text');

    if (!userLegacy || !userLegacy.bio) {
        if (statusEl) statusEl.innerHTML = '<span class="status-badge not-started">Not started</span>';
        if (previewEl) previewEl.textContent = 'Tell your story in your own words. Share the moments that mattered, the lessons you learned, and the people who shaped you.';
        if (btnTextEl) btnTextEl.textContent = 'Start Writing';
    } else {
        const wordCount = userLegacy.bio.split(/\s+/).length;
        if (statusEl) statusEl.innerHTML = `<span class="status-badge in-progress">${wordCount} words</span>`;
        if (previewEl) previewEl.textContent = userLegacy.bio.substring(0, 150) + (userLegacy.bio.length > 150 ? '...' : '');
        if (btnTextEl) btnTextEl.textContent = 'Continue Writing';
    }
}

/* ------------------- Render Messages ------------------- */
function renderMessages() {
    const countEl = document.getElementById('messages-count');
    const listEl = document.getElementById('messages-list');

    if (countEl) {
        countEl.textContent = `${legacyMessages.length} message${legacyMessages.length !== 1 ? 's' : ''}`;
    }

    if (!listEl) return;

    if (legacyMessages.length === 0) {
        listEl.innerHTML = '';
        return;
    }

    // Show only first 2 messages in preview
    const previewMessages = legacyMessages.slice(0, 2);
    listEl.innerHTML = previewMessages.map(msg => {
        return `
            <div class="message-preview-item" data-id="${msg.id}">
                <div class="message-preview-icon">
                    <i class="fas fa-envelope"></i>
                </div>
                <div class="message-preview-info">
                    <strong>${msg.title || 'Untitled'}</strong>
                    <span>To: ${msg.recipient_name}</span>
                </div>
            </div>
        `;
    }).join('');

    if (legacyMessages.length > 2) {
        listEl.innerHTML += `<p class="text-muted small text-center mt-2 mb-0">+${legacyMessages.length - 2} more messages</p>`;
    }
}

/* ------------------- Get Delivery Description ------------------- */
function getDeliveryDescription(msg) {
    switch (msg.delivery_type) {
        case 'date':
            return `Delivers on ${new Date(msg.delivery_date).toLocaleDateString()}`;
        case 'milestone':
            const milestoneNames = {
                '18th_birthday': '18th birthday',
                '21st_birthday': '21st birthday',
                'graduation': 'graduation',
                'wedding': 'wedding day',
                'first_child': 'first child',
                'retirement': 'retirement'
            };
            return `Delivers on their ${milestoneNames[msg.milestone_type] || msg.milestone_type}`;
        case 'anniversary':
            const annTypes = { 'birth': 'birthday', 'death': 'passing anniversary', 'christmas': 'Christmas' };
            return `Delivers every ${annTypes[msg.anniversary_type] || msg.anniversary_type}`;
        case 'conditional':
            return `"Open when" message`;
        default:
            return 'Scheduled delivery';
    }
}

/* ------------------- Get Message Icon ------------------- */
function getMessageIcon(msg) {
    const icons = {
        'date': '<i class="fas fa-calendar-day"></i>',
        'milestone': '<i class="fas fa-star"></i>',
        'anniversary': '<i class="fas fa-redo"></i>',
        'conditional': '<i class="fas fa-envelope"></i>'
    };
    return icons[msg.delivery_type] || '<i class="fas fa-envelope"></i>';
}

/* ------------------- Render Executor ------------------- */
function renderExecutor() {
    const contentEl = document.getElementById('executor-content');
    const btnTextEl = document.getElementById('manage-executor-text');

    if (!contentEl) return;

    if (!userLegacy?.executor_email) {
        contentEl.innerHTML = `<p class="executor-status not-set">No executor designated yet</p>`;
        if (btnTextEl) btnTextEl.textContent = 'Designate Executor';
    } else {
        const statusText = userLegacy.executor_id ? 'Accepted' : 'Invitation pending';
        const statusIcon = userLegacy.executor_id
            ? '<i class="fas fa-check-circle"></i>'
            : '<i class="fas fa-clock text-warning"></i>';

        contentEl.innerHTML = `
            <div class="executor-assigned">
                <div class="executor-assigned-avatar">
                    ${statusIcon}
                </div>
                <div class="executor-assigned-info">
                    <strong>${userLegacy.executor_name || userLegacy.executor_email}</strong>
                    <span>${statusText}</span>
                </div>
            </div>
        `;
        if (btnTextEl) btnTextEl.textContent = 'Change Executor';
    }
}

/* ------------------- Setup Event Listeners ------------------- */
function setupEventListeners() {
    // Create Legacy button
    document.getElementById('create-legacy-btn')?.addEventListener('click', createLegacy);

    // Write Story button
    document.getElementById('write-story-btn')?.addEventListener('click', () => {
        if (userLegacy) {
            window.location.href = `/memorial-form?id=${userLegacy.id}&mode=legacy`;
        }
    });

    // Edit Profile button
    document.getElementById('edit-profile-btn')?.addEventListener('click', (e) => {
        e.preventDefault();
        if (userLegacy) {
            window.location.href = `/memorial-form?id=${userLegacy.id}&mode=legacy`;
        }
    });

    // Create Message button
    document.getElementById('create-message-btn')?.addEventListener('click', (e) => {
        e.preventDefault();
        openMessageModal();
    });

    // Manage Executor button
    document.getElementById('manage-executor-btn')?.addEventListener('click', (e) => {
        e.preventDefault();
        openExecutorModal();
    });

    // Delivery type change
    document.getElementById('delivery-type')?.addEventListener('change', handleDeliveryTypeChange);

    // Open When buttons
    document.querySelectorAll('.open-when-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.open-when-btn').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            document.getElementById('open-when-condition').value = btn.dataset.condition;
        });
    });

    // Save Message button
    document.getElementById('save-message-btn')?.addEventListener('click', saveMessage);

    // Save Executor button
    document.getElementById('save-executor-btn')?.addEventListener('click', saveExecutor);
}

/* ------------------- Create Legacy ------------------- */
async function createLegacy() {
    const btn = document.getElementById('create-legacy-btn');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creating...';

    try {
        // Get user profile for name
        const { data: profile } = await supabase
            .from('profiles')
            .select('display_name, email')
            .eq('id', currentUser.id)
            .single();

        // Generate unique ID
        const slug = (profile?.display_name || 'my-legacy')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .substring(0, 30);
        const uniqueId = `${slug}-${Date.now().toString(36)}`;

        // Create living legacy memorial
        const { data, error } = await supabase
            .from('memorials')
            .insert({
                id: uniqueId,
                name: profile?.display_name || 'My Legacy',
                status: 'living_legacy',
                curator_ids: [currentUser.id],
                curators: [{ id: currentUser.id, email: profile?.email, role: 'owner' }]
            })
            .select()
            .single();

        if (error) throw error;

        userLegacy = data;
        showToast('Your legacy has been created!', 'success');

        // Redirect to edit
        window.location.href = `/memorial-form?id=${data.id}&mode=legacy`;

    } catch (error) {
        console.error('Error creating legacy:', error);
        showToast('Failed to create legacy. Please try again.', 'error');
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-plus"></i> Create My Legacy';
    }
}

/* ------------------- Message Modal ------------------- */
function openMessageModal() {
    // Reset form
    document.getElementById('message-form').reset();
    document.querySelectorAll('.delivery-fields').forEach(el => el.style.display = 'none');
    document.querySelectorAll('.open-when-btn').forEach(btn => btn.classList.remove('selected'));

    const modal = new bootstrap.Modal(document.getElementById('messageModal'));
    modal.show();
}

function handleDeliveryTypeChange(e) {
    const type = e.target.value;
    document.querySelectorAll('.delivery-fields').forEach(el => el.style.display = 'none');

    if (type === 'date') {
        document.getElementById('date-fields').style.display = 'block';
    } else if (type === 'milestone') {
        document.getElementById('milestone-fields').style.display = 'block';
    } else if (type === 'anniversary') {
        document.getElementById('anniversary-fields').style.display = 'block';
    } else if (type === 'conditional') {
        document.getElementById('conditional-fields').style.display = 'block';
    }
}

async function saveMessage() {
    const btn = document.getElementById('save-message-btn');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';

    try {
        const deliveryType = document.getElementById('delivery-type').value;
        const messageData = {
            memorial_id: userLegacy.id,
            created_by: currentUser.id,
            message_type: 'text',
            title: document.getElementById('message-title').value || null,
            content: document.getElementById('message-content').value,
            recipient_name: document.getElementById('recipient-name').value,
            recipient_email: document.getElementById('recipient-email').value,
            recipient_relationship: document.getElementById('recipient-relationship').value || null,
            delivery_type: deliveryType,
            is_pre_need: true,
            status: 'scheduled'
        };

        // Add delivery-specific fields
        if (deliveryType === 'date') {
            messageData.delivery_date = document.getElementById('delivery-date').value;
        } else if (deliveryType === 'milestone') {
            messageData.milestone_type = document.getElementById('milestone-type').value;
        } else if (deliveryType === 'anniversary') {
            messageData.anniversary_type = document.getElementById('anniversary-type').value;
            messageData.years_after = parseInt(document.getElementById('years-after').value) || 1;
        }

        const { data, error } = await supabase
            .from('legacy_messages')
            .insert(messageData)
            .select()
            .single();

        if (error) throw error;

        legacyMessages.unshift(data);
        renderMessages();

        bootstrap.Modal.getInstance(document.getElementById('messageModal')).hide();
        showToast('Message saved successfully!', 'success');

    } catch (error) {
        console.error('Error saving message:', error);
        showToast('Failed to save message. Please try again.', 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-save"></i> Save Message';
    }
}

async function deleteMessage(messageId) {
    if (!confirm('Are you sure you want to delete this message?')) return;

    try {
        const { error } = await supabase
            .from('legacy_messages')
            .delete()
            .eq('id', messageId);

        if (error) throw error;

        legacyMessages = legacyMessages.filter(m => m.id !== messageId);
        renderMessages();
        showToast('Message deleted.', 'success');

    } catch (error) {
        console.error('Error deleting message:', error);
        showToast('Failed to delete message.', 'error');
    }
}

/* ------------------- Executor Modal ------------------- */
function openExecutorModal() {
    document.getElementById('executor-form').reset();
    if (userLegacy?.executor_email) {
        document.getElementById('executor-email').value = userLegacy.executor_email;
    }

    const modal = new bootstrap.Modal(document.getElementById('executorModal'));
    modal.show();
}

async function saveExecutor() {
    const btn = document.getElementById('save-executor-btn');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';

    try {
        const email = document.getElementById('executor-email').value;
        const name = document.getElementById('executor-name').value;

        // Call the API to invite executor
        const { data: { session } } = await supabase.auth.getSession();

        const response = await fetch('/api/executor/invite', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.access_token}`
            },
            body: JSON.stringify({
                memorialId: userLegacy.id,
                executorEmail: email,
                executorName: name || null
            })
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.error || 'Failed to invite executor');
        }

        userLegacy.executor_email = email;
        userLegacy.executor_name = name;
        userLegacy.executor_id = null;
        renderExecutor();

        bootstrap.Modal.getInstance(document.getElementById('executorModal')).hide();

        // Show success message based on email status
        if (result.emailSent) {
            showToast(`Invitation email sent to ${email}!`, 'success');
        } else if (result.acceptUrl) {
            showToast('Executor saved! Share the invite link with them.', 'success');
            // Copy URL to clipboard as backup
            navigator.clipboard?.writeText(result.acceptUrl);
        } else {
            showToast(result.message, 'success');
        }

    } catch (error) {
        console.error('Error saving executor:', error);
        showToast(error.message || 'Failed to update executor. Please try again.', 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-user-shield"></i> Save Executor';
    }
}
