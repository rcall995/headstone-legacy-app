// /src/pages/get-started.js

export async function loadGetStartedPage(appRoot) {
    try {
        const response = await fetch('/pages/get-started.html');
        if (!response.ok) {
            throw new Error('Could not load get-started page content');
        }
        appRoot.innerHTML = await response.text();
    } catch (error) { // Added curly braces here
        console.error('Failed to load Get Started page:', error);
        appRoot.innerHTML = `<p class="text-danger text-center">Error loading page.</p>`;
    }
}