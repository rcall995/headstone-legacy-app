// /src/pages/how-it-works.js

export async function loadHowItWorksPage(appRoot) {
    try {
        const response = await fetch('/pages/how-it-works.html');
        if (!response.ok) {
            throw new Error('Could not load the page content.');
        }
        appRoot.innerHTML = await response.text();
    } catch (error) { // Added curly braces here
        console.error('Failed to load How It Works page:', error);
        appRoot.innerHTML = `<p class="text-danger text-center">Error loading page content.</p>`;
    }
}