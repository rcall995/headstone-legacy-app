// /js/pages/signup.js
import { signUp } from '/js/auth-manager.js';
import { showToast } from '/js/utils/toasts.js';
import { auth } from '/js/firebase-config.js';
import { GoogleAuthProvider, signInWithPopup } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

export async function loadSignupPage(appRoot) {
    try {
        // Fetch the signup HTML page content
        const response = await fetch('/pages/signup.html');
        if (!response.ok) throw new Error('Could not load signup page content');
        appRoot.innerHTML = await response.text();

        // Get the form and the login link
        const form = document.getElementById('signup-form');
        const loginLink = document.getElementById('login-link');
        const googleSignupBtn = document.getElementById('google-signup-btn');

        // Google signup handler
        if (googleSignupBtn) {
            googleSignupBtn.addEventListener('click', async () => {
                try {
                    googleSignupBtn.disabled = true;
                    googleSignupBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Signing in with Google...';

                    const provider = new GoogleAuthProvider();
                    provider.setCustomParameters({
                        prompt: 'select_account'
                    });

                    const result = await signInWithPopup(auth, provider);
                    console.log('Google signup successful:', result.user.email);

                    showToast('Account created successfully!', 'success');
                    window.dispatchEvent(new CustomEvent('navigate', { detail: '/memorial-list?status=published' }));
                } catch (error) {
                    console.error('Google signup error:', error);
                    console.error("Error code:", error.code);
                    console.error("Error message:", error.message);

                    let errorMessage = 'Failed to sign up with Google. ';

                    if (error.code === 'auth/unauthorized-domain') {
                        errorMessage += 'This domain is not authorized. Please contact support.';
                    } else if (error.code === 'auth/popup-blocked') {
                        errorMessage += 'Popup was blocked. Please allow popups for this site.';
                    } else if (error.code === 'auth/popup-closed-by-user') {
                        errorMessage += 'Sign-up was cancelled.';
                    } else if (error.code === 'auth/cancelled-popup-request') {
                        errorMessage += 'Another sign-up popup is already open.';
                    } else {
                        errorMessage += error.message || 'Unknown error occurred';
                    }

                    showToast(errorMessage, 'error');
                    googleSignupBtn.disabled = false;
                    googleSignupBtn.innerHTML = '<i class="fab fa-google me-2"></i>Continue with Google';
                }
            });
        }

        // Add event listener for form submission
        if (form) {
            form.addEventListener('submit', async (e) => {
                e.preventDefault();
                const name = form.querySelector('#name').value.trim();
                const email = form.querySelector('#email').value.trim();
                const password = form.querySelector('#password').value;

                // Validate name
                if (!name || name.length < 2) {
                    showToast('Please enter your full name (at least 2 characters)', 'error');
                    return;
                }

                // Validate email format
                const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                if (!emailRegex.test(email)) {
                    showToast('Please enter a valid email address', 'error');
                    return;
                }

                // SIMPLIFIED: Only require 6+ characters (reduced friction)
                if (password.length < 6) {
                    showToast('Password must be at least 6 characters', 'error');
                    return;
                }

                // Pass the name to the signUp function
                const success = await signUp(name, email, password);
                if (success) {
                    // Navigate to memorial list on successful sign up
                    showToast('Welcome! Your account has been created.', 'success');
                    window.dispatchEvent(new CustomEvent('navigate', { detail: '/memorial-list?status=published' }));
                }
            });
        }

        // Add event listener for the login link
        if (loginLink) {
            loginLink.addEventListener('click', (e) => {
                e.preventDefault();
                window.dispatchEvent(new CustomEvent('navigate', { detail: '/login' }));
            });
        }

    } catch (error) {
        console.error("Failed to load signup page:", error);
        appRoot.innerHTML = `<p class="text-danger text-center">Error loading signup page.</p>`;
    }
}