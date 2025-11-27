// /js/app.js - Supabase Auth
import { supabase } from '/js/supabase-client.js';
import { signOut } from '/js/auth-manager.js';
import { showToast } from '/js/utils/toasts.js';
import { updateMenuBadges } from '/js/utils/badge-updater.js';
import { initReferralTracking } from '/js/utils/referral-tracker.js';

document.addEventListener('DOMContentLoaded', () => {
  /* ---------- Service Worker: simple, no auto-reload ---------- */
  if ('serviceWorker' in navigator) {
    const SW_VERSION = 'v42';            // bump this when you deploy
    const SW_URL = `/serviceworker.js?sw=${SW_VERSION}`;

    navigator.serviceWorker.register(SW_URL, { scope: '/' })
      .then(reg => {
        console.log('[SW] registered:', SW_URL, 'scope:', reg.scope);
        // We DO NOT call reg.update(), DO NOT postMessage('SKIP_WAITING'),
        // and DO NOT listen for controllerchange → no reload loops.
      })
      .catch(err => console.warn('[SW] register failed:', err));
  }

  /* ---------- Referral Tracking ---------- */
  initReferralTracking();

  /* ---------- App state ---------- */
  const appRoot = document.getElementById('app-root');
  let currentUnloadListener = null;
  let currentPageCleanup = null;
  let authInitialized = false;
  let currentUser = null;

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
    console.log('[Router] router() called for:', path);

    // Show loading screen until auth is initialized (prevent race condition)
    if (!authInitialized) {
      console.log('[Router] Auth not initialized, showing loading...');
      appRoot.innerHTML = `
        <div class="container mt-5 text-center">
          <div class="spinner-border text-primary" role="status">
            <span class="visually-hidden">Loading...</span>
          </div>
          <p class="mt-3 text-muted">Loading application...</p>
        </div>
      `;
      return; // Wait for onAuthStateChange to call router again
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

    // Clean up any stale Bootstrap modal backdrops from previous pages
    document.querySelectorAll('.modal-backdrop').forEach(el => el.remove());
    document.body.classList.remove('modal-open');
    document.body.style.removeProperty('overflow');
    document.body.style.removeProperty('padding-right');

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
        currentPageCleanup = await loadScoutModePage(appRoot, currentUser);
      } else if (path === '/scout-leaderboard') {
        setPageTitle('Scout Leaderboard');
        const { loadScoutLeaderboardPage } = await import('./pages/scout-leaderboard.js');
        await loadScoutLeaderboardPage(appRoot);
      } else if (path === '/curator-panel') {
        // Redirect to memorial list instead of showing dashboard
        handleNavigation('/memorial-list?status=published');
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
      } else if (path === '/order-tag' || path.startsWith('/order-tag/')) {
        setPageTitle('Order Tag');
        const { loadOrderTagPage } = await import('./pages/order-tag.js');
        // Support both /order-tag?id=xxx and /order-tag/xxx formats
        const memorialIdOrSlug = path.startsWith('/order-tag/')
          ? decodeURIComponent(path.split('/order-tag/')[1])
          : urlParams.get('id');
        await loadOrderTagPage(appRoot, memorialIdOrSlug);
      } else if (path === '/order-book' || path.startsWith('/order-book/')) {
        setPageTitle('Order Book');
        const { loadOrderBookPage } = await import('./pages/order-book.js');
        // Support both /order-book?id=xxx and /order-book/xxx formats
        const memorialIdOrSlug = path.startsWith('/order-book/')
          ? decodeURIComponent(path.split('/order-book/')[1])
          : urlParams.get('id');
        await loadOrderBookPage(appRoot, memorialIdOrSlug);
      } else if (path === '/legacy-messages' || path.startsWith('/legacy-messages/')) {
        setPageTitle('Legacy Messages');
        const { loadLegacyMessagesPage } = await import('./pages/legacy-messages.js');
        const memorialId = path.startsWith('/legacy-messages/')
          ? decodeURIComponent(path.split('/legacy-messages/')[1])
          : urlParams.get('id');
        await loadLegacyMessagesPage(appRoot, memorialId);
      } else if (path === '/welcome') {
        setPageTitle('Welcome');
        const { loadWelcomePage } = await import('./pages/welcome.js');
        await loadWelcomePage(appRoot, urlParams.get('id'));
      } else if (path === '/family-tree') {
        setPageTitle('Family Tree');
        const { loadFamilyTreePage } = await import('./pages/family-tree.js');
        await loadFamilyTreePage(appRoot, urlParams.get('id'));
      } else if (path === '/admin') {
        setPageTitle('Admin Dashboard');
        const { loadAdminPage } = await import('./pages/admin.js');
        await loadAdminPage(appRoot);
      } else if (path === '/tributes-list') {
        setPageTitle('Pending Tributes');
        const { loadTributesListPage } = await import('./pages/tributes-list.js');
        await loadTributesListPage(appRoot);
      } else if (path === '/partners') {
        setPageTitle('Partner Program');
        const { loadPartnersPage } = await import('./pages/partners.js');
        await loadPartnersPage(appRoot);
      } else if (path === '/partner-dashboard') {
        setPageTitle('Partner Dashboard');
        const { loadPartnerDashboardPage } = await import('./pages/partner-dashboard.js');
        await loadPartnerDashboardPage(appRoot);
      } else if (path === '/order-success') {
        setPageTitle('Order Confirmed');
        const { loadOrderSuccessPage } = await import('./pages/order-success.js');
        await loadOrderSuccessPage(appRoot);
      } else if (path === '/wholesale') {
        setPageTitle('Wholesale Program');
        const { loadWholesalePage } = await import('./pages/wholesale.js');
        await loadWholesalePage(appRoot);
      } else if (path === '/wholesale-dashboard') {
        setPageTitle('Wholesale Dashboard');
        const { loadWholesaleDashboardPage } = await import('./pages/wholesale-dashboard.js');
        await loadWholesaleDashboardPage(appRoot);
      } else if (path === '/accept-invite') {
        setPageTitle('Accept Invite');
        const { loadAcceptInvitePage } = await import('./pages/accept-invite.js');
        await loadAcceptInvitePage(appRoot, urlParams);
      } else if (path === '/import-family-tree') {
        setPageTitle('Import Family Tree');
        const { loadGedcomImportPage } = await import('./pages/gedcom-import.js');
        await loadGedcomImportPage(appRoot);
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

  // Handle navigation via link clicks - use capture phase to ensure we catch all clicks
  document.addEventListener('click', e => {
    const { target } = e;
    const link = target.closest('a[data-route], a[data-route-mobile]');

    if (link) {
      e.preventDefault();
      e.stopPropagation();
      const href = link.getAttribute('href');
      console.log('[Router] Navigating to:', href);
      handleNavigation(href);

      // Close mobile menu on click
      if (link.hasAttribute('data-route-mobile')) closeCardMenu();
    }
  }, true); // Use capture phase

  // Handle browser back/forward
  window.addEventListener('popstate', router);

  // Function to handle navigation
  function handleNavigation(path) {
    const currentFull = window.location.pathname + window.location.search;
    if (currentFull !== path) {
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

  // Supabase Auth State Listener
  supabase.auth.onAuthStateChange((event, session) => {
    console.log('[Auth] State change:', event, session ? 'logged in' : 'logged out');
    const user = session?.user || null;
    currentUser = user;
    const isLoggedIn = !!user;

    // Add/remove logged-in class on body for new navigation
    document.body.classList.toggle('logged-in', isLoggedIn);

    // Toggle desktop navigation (marketing vs curator) - OLD NAV
    document.getElementById('marketing-nav-desktop')?.classList.toggle('d-none', isLoggedIn);
    document.getElementById('curator-nav-desktop')?.classList.toggle('d-none', !isLoggedIn);
    document.getElementById('signInLink-desktop')?.classList.toggle('d-none', isLoggedIn);
    document.getElementById('userDropdown-desktop')?.classList.toggle('d-none', !isLoggedIn);

    // Toggle mobile navigation and sign in button - OLD NAV
    document.getElementById('mobile-signin-btn')?.classList.toggle('d-none', isLoggedIn);
    document.getElementById('curator-nav-menu-items')?.classList.toggle('d-none', !isLoggedIn);

    // Update NEW navigation with user info
    if (isLoggedIn) {
      updateNewNavigation(user);
    }

    // Update notification badges when logged in (non-blocking)
    if (isLoggedIn) {
      updateMenuBadges(user).catch(err => console.warn('[Auth] Badge update failed:', err));
      updateNewNavBadges(user).catch(err => console.warn('[Auth] New nav badge update failed:', err));
    }

    if (!authInitialized) {
      authInitialized = true;
      const initialPath = window.location.pathname;

      if (isLoggedIn && initialPath === '/login') {
        handleNavigation('/memorial-list?status=published');
        return; // handleNavigation calls router()
      }
      if (isLoggedIn && initialPath === '/signup') {
        handleNavigation('/memorial-list?status=published');
        return;
      }
      if (!isLoggedIn && initialPath === '/curator-panel') {
        handleNavigation('/login');
        return;
      }
      if (!isLoggedIn && initialPath === '/memorial-form') {
        handleNavigation('/login');
        return;
      }
      if (!isLoggedIn && initialPath === '/memorial-list') {
        handleNavigation('/login');
        return;
      }
      if (!isLoggedIn && initialPath === '/scout-mode') {
        handleNavigation('/login');
        return;
      }
    }

    // Call router for initial page load
    console.log('[Router] Calling router for path:', window.location.pathname);
    router();
  });

  // ===== NEW NAVIGATION HANDLERS =====

  // Update new navigation with user info
  function updateNewNavigation(user) {
    if (!user) return;

    const email = user.email || '';
    const displayName = user.user_metadata?.display_name || email.split('@')[0] || 'User';
    const initials = displayName.charAt(0).toUpperCase();

    // Update all name/email displays
    const nameEls = ['app-user-name', 'mobile-menu-name'];
    const emailEls = ['app-user-email', 'mobile-menu-email'];

    nameEls.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.textContent = displayName;
    });

    emailEls.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.textContent = email;
    });

    // Update avatar initials
    const avatarEls = ['app-user-avatar', 'app-user-avatar-mobile', 'mobile-menu-avatar'];
    avatarEls.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = initials;
    });

    // Load scout stats
    loadScoutStats(user.id);

    // Load memorial count
    loadMemorialCount(user.id);

    // Check if admin
    checkAdminStatus(user);
  }

  // Load scout stats for navigation display
  async function loadScoutStats(userId) {
    try {
      const { data } = await supabase
        .from('scout_stats')
        .select('total_points, current_level')
        .eq('user_id', userId)
        .single();

      const points = data?.total_points || 0;
      const level = data?.current_level || 1;

      // Update points displays
      const pointsEl = document.getElementById('app-scout-points');
      if (pointsEl) pointsEl.textContent = `${points} pts`;

      const statEls = ['user-stat-points', 'mobile-stat-points'];
      statEls.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.textContent = points;
      });

      const levelEls = ['user-stat-level', 'mobile-stat-level'];
      levelEls.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.textContent = level;
      });
    } catch (err) {
      console.warn('[Nav] Failed to load scout stats:', err);
    }
  }

  // Load memorial count for navigation display
  async function loadMemorialCount(userId) {
    try {
      const { count } = await supabase
        .from('memorials')
        .select('id', { count: 'exact', head: true })
        .contains('curator_ids', [userId]);

      const memorialEls = ['user-stat-memorials', 'mobile-stat-memorials'];
      memorialEls.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.textContent = count || 0;
      });
    } catch (err) {
      console.warn('[Nav] Failed to load memorial count:', err);
    }
  }

  // Check admin status
  async function checkAdminStatus(user) {
    // Simple check: certain email domains or specific emails
    const adminEmails = ['rich@headstonelegacy.com', 'admin@headstonelegacy.com'];
    const isAdmin = adminEmails.includes(user.email);

    const adminDesktop = document.getElementById('admin-link-desktop');
    const adminMobile = document.getElementById('admin-link-mobile');

    if (adminDesktop) adminDesktop.style.display = isAdmin ? 'flex' : 'none';
    if (adminMobile) adminMobile.style.display = isAdmin ? 'flex' : 'none';
  }

  // Update new nav badges
  async function updateNewNavBadges(user) {
    try {
      // Get draft count
      const { count: draftCount } = await supabase
        .from('memorials')
        .select('id', { count: 'exact', head: true })
        .contains('curator_ids', [user.id])
        .eq('status', 'draft');

      // Get pending tribute count
      const { data: memorials } = await supabase
        .from('memorials')
        .select('id')
        .contains('curator_ids', [user.id]);

      const memorialIds = memorials?.map(m => m.id) || [];
      let tributeCount = 0;

      if (memorialIds.length > 0) {
        const { count } = await supabase
          .from('tributes')
          .select('id', { count: 'exact', head: true })
          .in('memorial_id', memorialIds)
          .eq('status', 'pending');
        tributeCount = count || 0;
      }

      // Update draft badges
      const draftBadgeIds = ['nav-draft-badge', 'mobile-menu-draft-badge'];
      draftBadgeIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
          if (draftCount > 0) {
            el.textContent = draftCount;
            el.style.display = 'flex';
          } else {
            el.style.display = 'none';
          }
        }
      });

      // Update tribute badges
      const tributeBadgeIds = ['nav-tribute-badge', 'bottom-nav-tribute-badge', 'mobile-menu-tribute-badge'];
      tributeBadgeIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
          if (tributeCount > 0) {
            el.textContent = tributeCount;
            el.style.display = 'flex';
          } else {
            el.style.display = 'none';
          }
        }
      });
    } catch (err) {
      console.warn('[Nav] Failed to update badges:', err);
    }
  }

  // Desktop user dropdown toggle
  const userBtn = document.getElementById('app-user-btn');
  const userDropdown = document.getElementById('app-user-dropdown');

  if (userBtn && userDropdown) {
    userBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = userDropdown.classList.contains('show');
      userDropdown.classList.toggle('show', !isOpen);
      userBtn.setAttribute('aria-expanded', !isOpen);
    });

    // Close on outside click
    document.addEventListener('click', (e) => {
      if (!userDropdown.contains(e.target) && !userBtn.contains(e.target)) {
        userDropdown.classList.remove('show');
        userBtn.setAttribute('aria-expanded', 'false');
      }
    });
  }

  // Mobile menu handlers
  const mobileMenu = document.getElementById('app-mobile-menu');
  const mobileMenuToggle = document.getElementById('app-mobile-menu-toggle');
  const mobileMenuClose = document.getElementById('app-mobile-menu-close');
  const bottomNavMore = document.getElementById('app-bottom-nav-more');

  function openMobileMenu() {
    mobileMenu?.classList.add('show');
    document.body.style.overflow = 'hidden';
  }

  function closeMobileMenu() {
    mobileMenu?.classList.remove('show');
    document.body.style.overflow = '';
  }

  if (mobileMenuToggle) {
    mobileMenuToggle.addEventListener('click', openMobileMenu);
  }

  if (mobileMenuClose) {
    mobileMenuClose.addEventListener('click', closeMobileMenu);
  }

  if (bottomNavMore) {
    bottomNavMore.addEventListener('click', openMobileMenu);
  }

  // Close mobile menu on backdrop click
  if (mobileMenu) {
    mobileMenu.addEventListener('click', (e) => {
      if (e.target === mobileMenu) {
        closeMobileMenu();
      }
    });
  }

  // Close mobile menu on link click
  document.querySelectorAll('#app-mobile-menu [data-route-mobile]').forEach(link => {
    link.addEventListener('click', () => {
      closeMobileMenu();
    });
  });

  // Update active nav item on route change
  function updateActiveNavItem(path) {
    // Remove all active states
    document.querySelectorAll('.app-nav-item, .app-bottom-nav-item, .app-mobile-menu-item').forEach(el => {
      el.classList.remove('active');
    });

    // Determine which nav item should be active
    let activeNav = null;
    if (path.includes('/memorial-list') && path.includes('status=draft')) {
      activeNav = 'drafts';
    } else if (path.includes('/memorial-list') || path === '/memorial-form') {
      activeNav = 'memorials';
    } else if (path.includes('/scout')) {
      activeNav = 'scout';
    } else if (path.includes('/tributes')) {
      activeNav = 'tributes';
    }

    if (activeNav) {
      document.querySelectorAll(`[data-nav="${activeNav}"]`).forEach(el => {
        el.classList.add('active');
      });
    }
  }

  // ===== END NEW NAVIGATION HANDLERS =====

  // Sign out handlers
  const signOutDesktop = document.getElementById('signOutLink-desktop');
  const signOutMenu = document.getElementById('signOutLink-menu');
  const appSignoutBtn = document.getElementById('app-signout-btn');
  const appMobileSignoutBtn = document.getElementById('app-mobile-signout-btn');

  async function handleSignOut(e) {
    e.preventDefault();
    e.stopPropagation();
    console.log('[Auth] Sign out clicked');
    const success = await signOut();
    if (success) {
      showToast('Signed out successfully.', 'success');
      closeCardMenu();
      // Force page reload to clear all state
      window.location.href = '/login';
    }
  }

  if (signOutDesktop) {
    signOutDesktop.addEventListener('click', handleSignOut);
  }
  if (signOutMenu) {
    signOutMenu.addEventListener('click', handleSignOut);
  }
  if (appSignoutBtn) {
    appSignoutBtn.addEventListener('click', handleSignOut);
  }
  if (appMobileSignoutBtn) {
    appMobileSignoutBtn.addEventListener('click', (e) => {
      closeMobileMenu();
      handleSignOut(e);
    });
  }

});
