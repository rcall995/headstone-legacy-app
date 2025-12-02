// /js/pages/plan-your-legacy.js - Living Legacy landing page

export async function loadPlanYourLegacyPage(appRoot) {
    try {
        const response = await fetch('/pages/plan-your-legacy.html');
        if (!response.ok) throw new Error('Could not load plan-your-legacy.html');
        appRoot.innerHTML = await response.text();

        // Smooth scroll for anchor links
        const howItWorksBtn = appRoot.querySelector('a[href="#how-it-works"]');
        if (howItWorksBtn) {
            howItWorksBtn.addEventListener('click', (e) => {
                e.preventDefault();
                const target = document.getElementById('how-it-works');
                if (target) {
                    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
            });
        }
    } catch (error) {
        console.error('Error loading plan your legacy page:', error);
        appRoot.innerHTML = '<p class="text-danger text-center">Error loading page. Please try again.</p>';
    }
}
