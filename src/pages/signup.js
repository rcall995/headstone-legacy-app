// /js/pages/signup.js
import { signUp } from '/js/auth-manager.js';
import { showToast } from '/js/utils/toasts.js';

export async function loadSignupPage(appRoot) {
    try {
        // Fetch the signup HTML page content
        const response = await fetch('/pages/signup.html');
        if (!response.ok) throw new Error('Could not load signup page content');
        appRoot.innerHTML = await response.text();

        // Get the form and the login link
        const form = document.getElementById('signup-form');
        const loginLink = document.getElementById('login-link');

        // Add event listener for form submission
        if (form) {
            form.addEventListener('submit', async (e) => {
                e.preventDefault();
                const name = form.querySelector('#name').value.trim();
                const email = form.querySelector('#email').value.trim();
                const password = form.querySelector('#password').value;
                const confirmPassword = form.querySelector('#confirm-password')?.value;

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

                // Validate password strength
                if (password.length < 8) {
                    showToast('Password must be at least 8 characters long', 'error');
                    return;
                }

                if (!/[A-Z]/.test(password)) {
                    showToast('Password must contain at least one uppercase letter', 'error');
                    return;
                }

                if (!/[a-z]/.test(password)) {
                    showToast('Password must contain at least one lowercase letter', 'error');
                    return;
                }

                if (!/[0-9]/.test(password)) {
                    showToast('Password must contain at least one number', 'error');
                    return;
                }

                // Check password confirmation if field exists
                if (confirmPassword !== undefined && password !== confirmPassword) {
                    showToast('Passwords do not match', 'error');
                    return;
                }

                // Pass the name to the signUp function
                const success = await signUp(name, email, password);
                if (success) {
                    // Navigate to the curator panel on successful sign up
                    showToast('Account created successfully! You are now logged in.', 'success');
                    window.dispatchEvent(new CustomEvent('navigate', { detail: '/curator-panel' }));
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