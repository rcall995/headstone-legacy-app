import { signIn } from '/js/auth-manager.js';
import { GoogleAuthProvider, signInWithPopup } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { auth } from '/js/firebase-config.js';
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
                    window.dispatchEvent(new CustomEvent('navigate', { detail: '/curator-panel' }));
                }
            });
        }

        if (googleBtn) {
            googleBtn.addEventListener('click', async () => {
                try {
                    googleBtn.disabled = true;
                    googleBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Signing in...';

                    const provider = new GoogleAuthProvider();
                    provider.setCustomParameters({
                        prompt: 'select_account'
                    });

                    const result = await signInWithPopup(auth, provider);
                    console.log('Google sign-in successful:', result.user.email);

                    showToast('Signed in with Google!', 'success');
                    window.dispatchEvent(new CustomEvent('navigate', { detail: '/curator-panel' }));
                } catch (error) {
                    console.error("Google sign-in error:", error);
                    console.error("Error code:", error.code);
                    console.error("Error message:", error.message);

                    let errorMessage = 'Failed to sign in with Google. ';

                    if (error.code === 'auth/unauthorized-domain') {
                        errorMessage += 'This domain is not authorized. Please contact support.';
                    } else if (error.code === 'auth/popup-blocked') {
                        errorMessage += 'Popup was blocked. Please allow popups for this site.';
                    } else if (error.code === 'auth/popup-closed-by-user') {
                        errorMessage += 'Sign-in was cancelled.';
                    } else if (error.code === 'auth/cancelled-popup-request') {
                        errorMessage += 'Another sign-in popup is already open.';
                    } else {
                        errorMessage += error.message;
                    }

                    showToast(errorMessage, 'error');
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