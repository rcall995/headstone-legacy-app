import { supabase } from '/js/supabase-client.js';
import { showToast } from '/js/utils/toasts.js';

let currentInviteToken = null;

async function initializeAcceptInvite(appRoot, urlParams) {
    const inviteToken = urlParams.get('token');

    if (!inviteToken) {
        showError(appRoot, 'No invite token provided. Please check your invite link.');
        return;
    }

    currentInviteToken = inviteToken;

    // Check if user is signed in
    const { data: { user } } = await supabase.auth.getUser();

    if (user) {
        // User is signed in - try to accept the invite
        await attemptAcceptInvite(appRoot, inviteToken, user);
    } else {
        // User needs to sign in
        await showSignInRequired(appRoot, inviteToken);
    }
}

async function attemptAcceptInvite(appRoot, inviteToken, user) {
    const loading = appRoot.querySelector('#invite-loading');
    const acceptSection = appRoot.querySelector('#invite-accept');

    try {
        const { data: { session } } = await supabase.auth.getSession();

        const response = await fetch('/api/collaborators/accept', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.access_token}`
            },
            body: JSON.stringify({ inviteToken })
        });

        const data = await response.json();

        if (loading) loading.style.display = 'none';

        if (response.ok) {
            // Success!
            showSuccess(appRoot, data.message, data.memorial?.id);
        } else if (response.status === 403 && data.error?.includes('sign in with')) {
            // Wrong email - show sign in with correct email
            showError(appRoot, data.error);
        } else if (data.memorial) {
            // Already accepted
            showSuccess(appRoot, 'You already have access to this memorial', data.memorial.id);
        } else {
            // Show accept confirmation
            // First, we need to get invite details - let's show accept UI
            if (acceptSection) {
                acceptSection.style.display = 'block';
                // Try to get more details...
            }
            throw new Error(data.error);
        }

    } catch (error) {
        console.error('Accept invite error:', error);
        showError(appRoot, error.message || 'Failed to accept invite');
    }
}

async function showSignInRequired(appRoot, inviteToken) {
    const loading = appRoot.querySelector('#invite-loading');
    const signinSection = appRoot.querySelector('#invite-signin');

    if (loading) loading.style.display = 'none';
    if (signinSection) signinSection.style.display = 'block';

    // Note: We can't fetch invite details without auth, so we show generic message
    // The actual memorial name would require a public API endpoint

    // Setup sign in buttons
    appRoot.querySelector('#google-signin-btn')?.addEventListener('click', async () => {
        const { error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo: `${window.location.origin}/accept-invite?token=${inviteToken}`
            }
        });
        if (error) showToast('Sign in failed: ' + error.message, 'error');
    });

    appRoot.querySelector('#email-signin-btn')?.addEventListener('click', () => {
        // Redirect to login with return URL
        window.dispatchEvent(new CustomEvent('navigate', {
            detail: `/login?redirect=${encodeURIComponent(`/accept-invite?token=${inviteToken}`)}`
        }));
    });
}

function showSuccess(appRoot, message, memorialId) {
    const loading = appRoot.querySelector('#invite-loading');
    const success = appRoot.querySelector('#invite-success');
    const successMsg = appRoot.querySelector('#success-message');
    const viewBtn = appRoot.querySelector('#view-memorial-after-accept');

    if (loading) loading.style.display = 'none';
    if (success) success.style.display = 'block';
    if (successMsg) successMsg.textContent = message;

    if (viewBtn && memorialId) {
        viewBtn.href = `/memorial?id=${memorialId}`;
    }
}

function showError(appRoot, message) {
    const loading = appRoot.querySelector('#invite-loading');
    const error = appRoot.querySelector('#invite-error');
    const errorMsg = appRoot.querySelector('#error-message');

    if (loading) loading.style.display = 'none';
    if (error) error.style.display = 'block';
    if (errorMsg) errorMsg.textContent = message;
}

// Listen for auth state changes (user signs in)
supabase.auth.onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_IN' && currentInviteToken && session?.user) {
        // User just signed in - try to accept the invite
        const appRoot = document.querySelector('.accept-invite-page');
        if (appRoot) {
            // Hide signin section, show loading
            const signinSection = appRoot.querySelector('#invite-signin');
            const loading = appRoot.querySelector('#invite-loading');
            if (signinSection) signinSection.style.display = 'none';
            if (loading) loading.style.display = 'block';

            await attemptAcceptInvite(appRoot, currentInviteToken, session.user);
        }
    }
});

export async function loadAcceptInvitePage(appRoot, urlParams) {
    try {
        const response = await fetch('/pages/accept-invite.html');
        if (!response.ok) throw new Error('Page not found');
        appRoot.innerHTML = await response.text();
        await initializeAcceptInvite(appRoot, urlParams);
    } catch (error) {
        console.error('Failed to load accept invite page:', error);
        appRoot.innerHTML = `
            <div class="container py-5 text-center">
                <h4>Error loading page</h4>
                <p class="text-muted">${error.message}</p>
            </div>
        `;
    }
}
