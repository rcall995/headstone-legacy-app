import { signIn, signInWithGoogle } from '/js/auth-manager.js';
import { supabase } from '/js/supabase-client.js';
import { showToast } from '/js/utils/toasts.js';

export async function loadLoginPage(appRoot) {
    try {
        const response = await fetch('/pages/login.html');
        if (!response.ok) throw new Error('Could not load login page content');
        appRoot.innerHTML = await response.text();

        const form = document.getElementById('login-form');
        const googleBtn = document.getElementById('google-signin');
        const signupBtn = document.getElementById('signup-button');

        if (form) {
            form.addEventListener('submit', async (e) => {
                e.preventDefault();
                const email = form.querySelector('#email').value;
                const password = form.querySelector('#password').value;

                const success = await signIn(email, password);
                if (success) {
                    window.dispatchEvent(new CustomEvent('navigate', { detail: '/memorial-list?status=published' }));
                }
            });
        }

        if (googleBtn) {
            googleBtn.addEventListener('click', async () => {
                try {
                    googleBtn.disabled = true;
                    googleBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Signing in...';

                    await signInWithGoogle();
                    // Supabase will redirect to OAuth provider, then back to our site
                    // The auth state change will be handled by the listener in app.js
                } catch (error) {
                    console.error("Google sign-in error:", error);
                    showToast('Failed to sign in with Google. ' + error.message, 'error');
                    googleBtn.disabled = false;
                    googleBtn.innerHTML = '<i class="fab fa-google me-2"></i>Continue with Google';
                }
            });
        }

        if (signupBtn) {
            signupBtn.addEventListener('click', () => {
                window.dispatchEvent(new CustomEvent('navigate', { detail: '/signup' }));
            });
        }
    } catch (error) {
        console.error("Failed to load login page:", error);
        appRoot.innerHTML = `<p class="text-danger text-center">Error loading login page.</p>`;
    }
}
