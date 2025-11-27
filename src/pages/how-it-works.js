// /src/pages/how-it-works.js
// Redirect to get-started page (combined pages)

export async function loadHowItWorksPage(appRoot) {
    // Redirect to the combined get-started page
    window.dispatchEvent(new CustomEvent('navigate', { detail: '/get-started' }));
}
