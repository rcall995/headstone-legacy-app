// /src/pages/scout.js

export async function loadScoutPage(appRoot) {
    try {
        const response = await fetch('/pages/scout.html');
        if (!response.ok) {
            throw new Error('Could not load the page content.');
        }
        appRoot.innerHTML = await response.text();
    } catch (error) { // Added curly braces here
        console.error('Failed to load About Scouting page:', error);
        appRoot.innerHTML = `<p class="text-danger text-center">Error loading page content.</p>`;
    }
}