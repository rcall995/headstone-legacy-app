// /js/pages/accept-executor.js - Accept executor invitation
import { supabase } from '/js/supabase-client.js';
import { showToast } from '/js/utils/toasts.js';

let executorToken = null;
let memorialInfo = null;

export async function loadAcceptExecutorPage(appRoot, urlParams) {
    try {
        const response = await fetch('/pages/accept-executor.html');
        if (!response.ok) throw new Error('Could not load accept-executor.html');
        appRoot.innerHTML = await response.text();

        // Get token from URL
        executorToken = urlParams?.get('token') || new URLSearchParams(window.location.search).get('token');

        if (!executorToken) {
            showInvalidState('No invitation token provided');
            return;
        }

        // Check auth
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
            // Save token to session storage for after login
            sessionStorage.setItem('executor_token', executorToken);
            showLoginState();
            return;
        }

        // Verify token and get memorial info
        await verifyInvitation(user);

    } catch (error) {
        console.error('Error loading accept executor page:', error);
        showInvalidState(error.message);
    }
}

async function verifyInvitation(user) {
    try {
        // Query memorial by executor_token
        const { data: memorial, error } = await supabase
            .from('memorials')
            .select('id, name, executor_email, executor_token, executor_id')
            .eq('executor_token', executorToken)
            .single();

        if (error || !memorial) {
            showInvalidState('This invitation link is invalid or has expired');
            return;
        }

        // Check if user email matches
        if (user.email?.toLowerCase() !== memorial.executor_email?.toLowerCase()) {
            showInvalidState(`This invitation was sent to ${memorial.executor_email}. Please sign in with that email address.`);
            return;
        }

        memorialInfo = memorial;
        showInviteState(memorial);

    } catch (err) {
        console.error('Verification error:', err);
        showInvalidState('Failed to verify invitation');
    }
}

function showLoadingState() {
    hideAllStates();
    document.getElementById('executor-loading').style.display = 'flex';
}

function showInvalidState(message) {
    hideAllStates();
    document.getElementById('invalid-message').textContent = message;
    document.getElementById('executor-invalid').style.display = 'flex';
}

function showLoginState() {
    hideAllStates();
    // Update login link to include token
    const loginLink = document.querySelector('#executor-login a');
    if (loginLink) {
        loginLink.href = `/login?redirect=/accept-executor?token=${executorToken}`;
    }
    document.getElementById('executor-login').style.display = 'flex';
}

function showInviteState(memorial) {
    hideAllStates();
    document.getElementById('inviter-name').textContent = memorial.name;
    document.getElementById('executor-invite').style.display = 'flex';

    // Setup button handlers
    document.getElementById('accept-btn').addEventListener('click', () => handleResponse('accept'));
    document.getElementById('decline-btn').addEventListener('click', () => handleResponse('decline'));
}

function showSuccessState(title, message) {
    hideAllStates();
    document.getElementById('success-title').textContent = title;
    document.getElementById('success-message').textContent = message;
    document.getElementById('executor-success').style.display = 'flex';
}

function hideAllStates() {
    document.querySelectorAll('.executor-state').forEach(el => el.style.display = 'none');
}

async function handleResponse(action) {
    const acceptBtn = document.getElementById('accept-btn');
    const declineBtn = document.getElementById('decline-btn');

    acceptBtn.disabled = true;
    declineBtn.disabled = true;

    if (action === 'accept') {
        acceptBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Accepting...';
    } else {
        declineBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Declining...';
    }

    try {
        const { data: { session } } = await supabase.auth.getSession();

        const response = await fetch('/api/executor/accept', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.access_token}`
            },
            body: JSON.stringify({
                executorToken,
                action
            })
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.error || 'Failed to process request');
        }

        if (action === 'accept') {
            showSuccessState(
                "You're Now an Executor",
                result.message || `You have accepted the executor role for ${memorialInfo?.name}'s legacy.`
            );
        } else {
            showSuccessState(
                'Invitation Declined',
                'You have declined the executor role.'
            );
        }

        // Clear saved token
        sessionStorage.removeItem('executor_token');

    } catch (error) {
        console.error('Response error:', error);
        showToast(error.message, 'error');
        acceptBtn.disabled = false;
        declineBtn.disabled = false;
        acceptBtn.innerHTML = '<i class="fas fa-check"></i> Accept Executor Role';
        declineBtn.innerHTML = 'Decline';
    }
}
