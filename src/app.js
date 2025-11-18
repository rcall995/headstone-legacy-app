// /js/app.js
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { auth } from '/js/firebase-config.js';
import { showToast } from '/js/utils/toasts.js';

document.addEventListener('DOMContentLoaded', () => {
  /* ---------- Service Worker: simple, no auto-reload ---------- */
  if ('serviceWorker' in navigator) {
    const SW_VERSION = 'v24';            // bump this when you deploy
    const SW_URL = `/serviceworker.js?sw=${SW_VERSION}`;

    navigator.serviceWorker.register(SW_URL, { scope: '/' })
      .then(reg => {
        console.log('[SW] registered:', SW_URL, 'scope:', reg.scope);
        // We DO NOT call reg.update(), DO NOT postMessage('SKIP_WAITING'),
        // and DO NOT listen for controllerchange → no reload loops.
      })
      .catch(err => console.warn('[SW] register failed:', err));
  }

  /* ---------- App state ---------- */
  const appRoot = document.getElementById('app-root');
  let currentUnloadListener = null;
  let currentPageCleanup = null;
  let authInitialized = false;

  const menuToggleBtn    = document.getElementById('mobile-menu-trigger');
  const cardMenuCloseBtn = document.getElementById('card-menu-close-btn');

  function openCardMenu() {
    const overlay = document.getElementById('card-menu-overlay');
    if (overlay) {
      overlay.classList.add('active');
      document.body.classList.add('menu-open');
    }
  }

  function closeCardMenu() {
    const overlay = document.getElementById('card-menu-overlay');
    if (overlay) {
      overlay.classList.remove('active');
      document.body.classList.remove('menu-open');
    }
  }

  /* ---------- Page Title Management ---------- */
  function setPageTitle(title) {
    document.title = title ? `${title} - Headstone Legacy` : 'Headstone Legacy';
  }

  /* ---------- Routing logic ---------- */
  async function router() {
    const path = window.location.pathname;
    const urlParams = new URLSearchParams(window.location.search);

    // Show loading screen until auth is initialized (prevent race condition)
    if (!authInitialized) {
      appRoot.innerHTML = `
        <div class="container mt-5 text-center">
          <div class="spinner-border text-primary" role="status">
            <span class="visually-hidden">Loading...</span>
          </div>
          <p class="mt-3 text-muted">Loading application...</p>
        </div>
      `;
      return; // Wait for onAuthStateChanged to call router again
    }

    // Call previous page cleanup if it exists
    if (currentPageCleanup) {
      currentPageCleanup();
      currentPageCleanup = null;
    }

    // Unregister any previous unload listener
    if (currentUnloadListener) {
      window.removeEventListener('beforeunload', currentUnloadListener);
      currentUnloadListener = null;
    }

    // Set body classes for page-specific styling
    document.body.classList.remove('dashboard-page-active', 'memorial-page-active', 'scout-active');
    if (path.startsWith('/curator') || path.startsWith('/memorial-list') || path.startsWith('/memorial-form') || path.startsWith('/tributes')) {
      document.body.classList.add('dashboard-page-active');
    } else if (path === '/memorial' || path === '/family-tree') {
      document.body.classList.add('memorial-page-active');
    } else if (path === '/scout-mode') {
      document.body.classList.add('scout-active');
    }

    try {
      if (path === '/') {
        setPageTitle('Home');
        const { loadHomePage } = await import('./pages/home.js');
        await loadHomePage(appRoot);
      } else if (path === '/login') {
        setPageTitle('Sign In');
        const { loadLoginPage } = await import('./pages/login.js');
        await loadLoginPage(appRoot);
      } else if (path === '/signup') {
        setPageTitle('Sign Up');
        const { loadSignupPage } = await import('./pages/signup.js');
        await loadSignupPage(appRoot);
      } else if (path === '/get-started') {
        setPageTitle('Get Started');
        const { loadGetStartedPage } = await import('./pages/get-started.js');
        await loadGetStartedPage(appRoot);
      } else if (path === '/how-it-works') {
        setPageTitle('How It Works');
        const { loadHowItWorksPage } = await import('./pages/how-it-works.js');
        await loadHowItWorksPage(appRoot);
      } else if (path === '/scout') {
        setPageTitle('About Scouting');
        const { loadScoutPage } = await import('./pages/scout.js');
        await loadScoutPage(appRoot);
      } else if (path === '/scout-mode') {
        setPageTitle('Scout Mode');
        const { loadScoutModePage } = await import('./pages/scout-mode.js');
        currentPageCleanup = await loadScoutModePage(appRoot, auth.currentUser);
      } else if (path === '/curator-panel') {
        setPageTitle('Dashboard');
        const { loadCuratorPanel } = await import('./pages/curator-panel.js');
        await loadCuratorPanel(appRoot);
      } else if (path === '/memorial-form') {
        setPageTitle('Memorial Form');
        const { loadMemorialForm } = await import('./pages/memorial-form.js');
        await loadMemorialForm(appRoot, urlParams);
      } else if (path === '/memorial-list') {
        setPageTitle('My Memorials');
        const { loadMemorialsPage } = await import('./pages/memorial-list.js');
        await loadMemorialsPage(appRoot, urlParams);
      } else if (path === '/memorial') {
        setPageTitle('Memorial');
        const { loadMemorialPage, setOnUnload } = await import('./pages/memorial-template.js');
        await loadMemorialPage(appRoot, urlParams.get('id'));
        currentUnloadListener = setOnUnload(urlParams.get('id'));
      } else if (path === '/order-tag') {
        setPageTitle('Order Tag');
        const { loadOrderTagPage } = await import('./pages/order-tag.js');
        await loadOrderTagPage(appRoot, urlParams.get('id'));
      } else if (path === '/welcome') {
        setPageTitle('Welcome');
        const { loadWelcomePage } = await import('./pages/welcome.js');
        await loadWelcomePage(appRoot, urlParams.get('id'));
      } else if (path === '/family-tree') {
        setPageTitle('Family Tree');
        const { loadFamilyTreePage } = await import('./pages/family-tree.js');
        await loadFamilyTreePage(appRoot, urlParams.get('id'));
      } else {
        setPageTitle('404 Not Found');
        appRoot.innerHTML = `<p class="text-center text-danger">404: Page not found.</p>`;
      }
    } catch (error) {
      console.error(`Failed to load page for ${path}`, error);

      // Helper function to escape HTML
      function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
      }

      // Provide helpful error UI with retry option
      appRoot.innerHTML = `
        <div class="container mt-5 text-center">
          <div class="alert alert-danger" role="alert">
            <h4 class="alert-heading"><i class="fas fa-exclamation-triangle me-2"></i>Page Load Error</h4>
            <p>We encountered an error loading this page.</p>
            <hr>
            <p class="mb-0"><small>${escapeHtml(error.message)}</small></p>
          </div>
          <button id="retry-page-load" class="btn btn-primary me-2">
            <i class="fas fa-redo me-2"></i>Try Again
          </button>
          <a href="/" class="btn btn-outline-secondary" data-route>
            <i class="fas fa-home me-2"></i>Go Home
          </a>
        </div>
      `;

      // Add retry button handler
      document.getElementById('retry-page-load')?.addEventListener('click', () => {
        router(); // Retry loading the same route
      });

      showToast(`Error loading page. Please try again.`, 'error');
    }
  }

  // Handle navigation via link clicks
  document.body.addEventListener('click', e => {
    const { target } = e;
    const isLink = target.matches('a[data-route], a[data-route] *');
    const isMobileNav = target.matches('a[data-route-mobile], a[data-route-mobile] *');

    if (isLink || isMobileNav) {
      e.preventDefault();
      const href = target.closest('a').getAttribute('href');
      handleNavigation(href);

      // Close mobile menu on click
      if (isMobileNav) closeCardMenu();
    }
  });

  // Handle browser back/forward
  window.addEventListener('popstate', router);

  // Function to handle navigation
  function handleNavigation(path) {
    if (window.location.pathname !== path) {
      window.history.pushState({}, path, path);
    }
    router();
  }

  // *** ADDED THIS BLOCK TO FIX NAVIGATION ***
  // Listen for custom navigate events dispatched from other modules
  window.addEventListener('navigate', (e) => {
    const path = e.detail;
    if (path) {
      handleNavigation(path);
    }
  });
  // *****************************************

  // Mobile menu actions
  menuToggleBtn?.addEventListener('click', openCardMenu);
  cardMenuCloseBtn?.addEventListener('click', closeCardMenu);
  document.getElementById('card-menu-overlay')?.addEventListener('click', (e) => {
    // Only close if clicking directly on the overlay (backdrop), not on child elements
    if (e.target.id === 'card-menu-overlay') {
      closeCardMenu();
    }
  });

  // small visual effect
  document.addEventListener('mousemove', e => {
    const el = document.querySelector('.dashboard-theme-wrapper, body.memorial-page-active');
    if (el) {
      el.classList.add('spotlight-active');
      const r = el.getBoundingClientRect();
      el.style.setProperty('--mouse-x', `${e.clientX - r.left}px`);
      el.style.setProperty('--mouse-y', `${e.clientY - r.top}px`);
    }
  });
  document.addEventListener('mouseleave', () => {
    const el = document.querySelector('.dashboard-theme-wrapper, body.memorial-page-active');
    el?.classList.remove('spotlight-active');
  });

  onAuthStateChanged(auth, async (user) => {
    const isLoggedIn = !!(user && !user.isAnonymous);
    document.getElementById('signInLink-desktop')?.classList.toggle('d-none', isLoggedIn);
    document.getElementById('userDropdown-desktop')?.classList.toggle('d-none', !isLoggedIn);
    document.getElementById('mobile-signin-btn')?.classList.toggle('d-none', isLoggedIn);
    document.getElementById('curator-nav-menu-items')?.classList.toggle('d-none', !isLoggedIn);

    if (!authInitialized) {
      authInitialized = true;
      const initial = window.location.pathname + window.location.search;
      if (isLoggedIn && initial === '/login') handleNavigation('/curator-panel');
      if (isLoggedIn && initial === '/signup') handleNavigation('/curator-panel');
      if (!isLoggedIn && initial === '/curator-panel') handleNavigation('/login');
      if (!isLoggedIn && initial === '/memorial-form') handleNavigation('/login');
      if (!isLoggedIn && initial === '/memorial-list') handleNavigation('/login');
      if (!isLoggedIn && initial === '/scout-mode') handleNavigation('/login');
      router();
    }
  });

  // Sign out handlers
  document.getElementById('signOutLink-desktop')?.addEventListener('click', async (e) => {
    e.preventDefault();
    await signOut(auth);
    showToast('Signed out successfully.', 'success');
    handleNavigation('/login');
  });

  document.getElementById('signOutLink-menu')?.addEventListener('click', async (e) => {
    e.preventDefault();
    await signOut(auth);
    showToast('Signed out successfully.', 'success');
    closeCardMenu();
    handleNavigation('/login');
  });

});