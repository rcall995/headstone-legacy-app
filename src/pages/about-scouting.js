// /js/pages/about-scouting.js - Scout landing page

export async function loadAboutScoutingPage(appRoot) {
    try {
        const response = await fetch('/pages/about-scouting.html');
        if (!response.ok) throw new Error('Could not load about-scouting.html');
        appRoot.innerHTML = await response.text();

        // Smooth scroll for anchor links
        const learnMoreBtn = appRoot.querySelector('a[href="#how-it-works"]');
        if (learnMoreBtn) {
            learnMoreBtn.addEventListener('click', (e) => {
                e.preventDefault();
                const target = document.getElementById('how-it-works');
                if (target) {
                    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
            });
        }
    } catch (error) {
        console.error('Error loading about scouting page:', error);
        appRoot.innerHTML = '<p class="text-danger text-center">Error loading page. Please try again.</p>';
    }
}
