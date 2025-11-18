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
                const provider = new GoogleAuthProvider();
                try {
                    await signInWithPopup(auth, provider);
                    showToast('Signed in with Google!', 'success');
                    window.dispatchEvent(new CustomEvent('navigate', { detail: '/curator-panel' }));
                } catch (error) {
                    console.error("Google sign-in error:", error);
                    showToast(`Google sign-in failed: ${error.message}`, 'error');
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