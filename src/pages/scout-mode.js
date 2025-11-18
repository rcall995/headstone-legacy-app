// /js/pages/scout-mode.js
import { db, auth, storage } from '/js/firebase-config.js';
import { collection, addDoc, serverTimestamp, GeoPoint } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
import { config } from '/js/config.js';
import { showToast } from '/js/utils/toasts.js';

let scoutMap = null;
let addPinModalInstance = null;
let currentPinCoords = null;
let currentPhotoFiles = [];
let pinnedRelatives = [];
let resizeListener = null; // Track resize listener for cleanup

const DEFAULT_CENTER = [-98.5, 39.8]; // fallback center (USA)

/* ---------------- styles for full-screen map + HUD ---------------- */
function ensureScoutStyles() {
  if (document.getElementById('scout-style-tag')) return;
  const css = `
  #scout-map.scout-active, #map.scout-active {
    position: fixed; inset: 0; width: 100%; height: 100vh; min-height: 420px; z-index: 1;
  }
  .scout-hud { position: fixed; inset: 0; z-index: 3; pointer-events: none; }
  .scout-hud .center { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -60%); }
  .scout-center-pin { font-size: 28px; line-height: 1; pointer-events:none; }
  .scout-cta {
    position: fixed;
    left: 50%;
    transform: translateX(-50%);
    bottom: 20px;
    bottom: max(20px, env(safe-area-inset-bottom));
    z-index: 4;
    pointer-events: auto;
  }
  .scout-cta .btn { padding: 12px 20px; font-size: 1.05rem; min-height: 44px; }
  #multi-pin-ui {
    position: fixed;
    top: 20px;
    top: max(20px, env(safe-area-inset-top));
    left: 50%;
    transform: translateX(-50%);
    z-index: 4;
    pointer-events: auto;
    max-width: 90%;
    width: auto;
  }
  #pinned-relatives-list {
    background: rgba(255,255,255,0.95);
    border-radius: 8px;
    padding: 1rem;
    max-height: 200px;
    overflow-y: auto;
  }
  `;
  const style = document.createElement('style');
  style.id = 'scout-style-tag';
  style.textContent = css;
  document.head.appendChild(style);
}

/* ---------------- cleanup ---------------- */
function cleanupScoutMode() {
  // Remove resize listener to prevent memory leak
  if (resizeListener) {
    window.removeEventListener('resize', resizeListener);
    resizeListener = null;
  }

  // Remove mapbox map instance
  try { scoutMap?.remove(); } catch {}
  scoutMap = null;

  // Remove HUD + CTA
  document.getElementById('scout-hud')?.remove();
  document.querySelector('.scout-cta')?.remove();

  // If we created #scout-map, remove it
  const createdMap = document.getElementById('scout-map');
  createdMap?.parentElement?.removeChild(createdMap);

  // If page had an existing #map, drop full-screen class
  const existingMap = document.getElementById('map');
  existingMap?.classList.remove('scout-active');

  // Remove scout-active class from body
  document.body.classList.remove('scout-active');

  // Modal + state
  addPinModalInstance?.hide?.();
  addPinModalInstance = null;
  currentPinCoords = null;
  currentPhotoFiles = [];
  pinnedRelatives = [];
}

/* ---------------- map helpers ---------------- */
function getOrCreateMapEl() {
  let el = document.getElementById('map') || document.getElementById('scout-map');
  if (!el) {
    el = document.createElement('div');
    el.id = 'scout-map';
    document.body.appendChild(el);
  }
  return el;
}
function activateMapFullScreen() {
  const el = document.getElementById('map') || document.getElementById('scout-map');
  el?.classList.add('scout-active');
}

function initScoutMap(center) {
  if (scoutMap) return;

  // Check if Mapbox GL is loaded
  if (typeof mapboxgl === 'undefined') {
    console.error('Mapbox GL library is not loaded');
    showToast('Map library failed to load. Please refresh the page.', 'error');
    return;
  }

  try {
    mapboxgl.accessToken = config.MAPBOX_ACCESS_TOKEN;
    const containerEl = getOrCreateMapEl();
    scoutMap = new mapboxgl.Map({
      container: containerEl,
      style: 'mapbox://styles/mapbox/satellite-streets-v12',
      center: center || DEFAULT_CENTER,
      zoom: 18,
      interactive: true
    });

    // Controls
    scoutMap.addControl(new mapboxgl.NavigationControl(), 'top-right');
    // Crosshair / recenter control
    const geolocate = new mapboxgl.GeolocateControl({
      positionOptions: { enableHighAccuracy: true },
      trackUserLocation: true,
      showUserHeading: true
    });
    scoutMap.addControl(geolocate, 'top-left');

    scoutMap.on('load', () => setTimeout(() => scoutMap?.resize(), 0));

    // Store resize listener reference for cleanup
    resizeListener = () => scoutMap?.resize();
    window.addEventListener('resize', resizeListener);

    activateMapFullScreen();
  } catch (err) {
    console.error('[scout-mode] map init failed:', err);
    showToast('Could not load the map.', 'error');
  }
}

/* ---------------- Center Pin HUD (used by both modes) ---------------- */
function showCenterPinHUD() {
  if (!document.getElementById('scout-hud')) {
    const hud = document.createElement('div');
    hud.id = 'scout-hud';
    hud.className = 'scout-hud';
    hud.innerHTML = `<div class="center"><div class="scout-center-pin" aria-hidden="true">📍</div></div>`;
    document.body.appendChild(hud);
  }
}

/* ---------------- Single-pin HUD + Confirm CTA ---------------- */
function showSinglePinHUDAndCTA() {
  // Show center pin HUD
  showCenterPinHUD();

  // Confirm CTA (always visible)
  let ctaBtn = document.getElementById('scout-confirm-fallback');
  if (!ctaBtn) {
    const wrap = document.createElement('div');
    wrap.className = 'scout-cta';
    wrap.innerHTML = `<button id="scout-confirm-fallback" class="btn btn-success shadow">Set Pin Location</button>`;
    document.body.appendChild(wrap);
    ctaBtn = document.getElementById('scout-confirm-fallback');
  } else {
    ctaBtn.closest('.scout-cta').style.display = '';
  }

  ctaBtn.onclick = () => {
    if (!scoutMap) return showToast('Map not ready yet.', 'error');
    const c = scoutMap.getCenter();
    const path = `/memorial-form?new=true&lat=${c.lat}&lng=${c.lng}`;
    cleanupScoutMode(); // ensure no overlay blocks the form
    window.dispatchEvent(new CustomEvent('navigate', { detail: path }));
  };
}

/* ---------------- Multi-pin helpers ---------------- */
function renderPinnedRelatives() {
  const listEl = document.getElementById('pinned-relatives-list');
  if (!listEl) return;
  if (pinnedRelatives.length === 0) {
    listEl.innerHTML = '<p class="text-muted small">No relatives pinned yet.</p>';
  } else {
    // Helper function to escape HTML and prevent XSS
    const escapeHtml = (text) => {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    };

    listEl.innerHTML = `
      <ul class="list-group">
        ${pinnedRelatives.map((pin, i) => `
          <li class="list-group-item d-flex justify-content-between align-items-center">
            ${escapeHtml(pin.name)}
            <button class="btn btn-sm btn-outline-danger remove-pin-btn" data-index="${i}" aria-label="Remove pin">×</button>
          </li>
        `).join('')}
      </ul>
    `;
  }
  const saveBtn = document.getElementById('save-pins-btn');
  if (saveBtn) saveBtn.disabled = pinnedRelatives.length === 0;
}

async function saveAllPins() {
  const user = auth.currentUser;
  if (!user) return showToast('You must be signed in to save pins.', 'error');
  if (!pinnedRelatives.length) return;

  const btn = document.getElementById('save-pins-btn');
  if (btn) { btn.disabled = true; btn.innerHTML = `<span class="spinner-border spinner-border-sm"></span> Saving...`; }

  try {
    await Promise.all(pinnedRelatives.map(pin => {
      const data = {
        name: pin.name,
        name_lowercase: pin.name.toLowerCase(),
        location: new GeoPoint(pin.coords.lat, pin.coords.lng),
        isLocationExact: true,
        status: 'draft',
        tier: 'memorial',
        curatorIds: [user.uid],
        curators: [{ uid: user.uid, email: user.email }],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        mainPhoto: pin.photoUrl || null
      };
      return addDoc(collection(db, 'memorials'), data);
    }));
    showToast(`${pinnedRelatives.length} pinned memorial(s) saved as drafts.`, 'success');
    cleanupScoutMode();
    window.dispatchEvent(new CustomEvent('navigate', { detail: '/curator-panel' }));
  } catch (e) {
    console.error('[scout-mode] save pins failed:', e);
    showToast('An error occurred while saving the pins.', 'error');
    if (btn) { btn.disabled = false; btn.innerHTML = `<i class="fas fa-save me-2"></i>Save Pins & Finish`; }
  }
}

/* ---------------- Page entry ---------------- */
export async function loadScoutModePage(appRoot) {
  cleanupScoutMode();
  ensureScoutStyles();

  try {
    const resp = await fetch('/pages/scout-mode.html');
    if (!resp.ok) throw new Error('Could not load scout-mode.html');
    appRoot.innerHTML = await resp.text();

    // Make helper text readable on dark
    document.querySelectorAll('#step-1 p, #step-2 p, #scout-choice-screen p').forEach(p => {
      p.classList.remove('text-muted');
      p.classList.add('text-light');
      p.style.opacity = '0.9';
    });

    // Back button in header (if present)
    document.getElementById('back-to-dashboard-btn')?.addEventListener('click', (e) => {
      e.preventDefault();
      cleanupScoutMode();
      window.dispatchEvent(new CustomEvent('navigate', { detail: '/curator-panel' }));
    });

    // Modal (multi-pin)
    const addPinModalEl = document.getElementById('addPinModal');
    if (addPinModalEl && window.bootstrap?.Modal) {
      addPinModalInstance = new bootstrap.Modal(addPinModalEl);
    }

    const start = (mode) => {
      const proceed = (center) => {
        document.getElementById('scout-choice-screen')?.classList.add('d-none');
        document.getElementById('scout-wizard-screen')?.classList.remove('d-none');

        initScoutMap(center);

        if (mode === 'single') {
          showSinglePinHUDAndCTA();
        } else {
          // Multi-pin mode: show center pin HUD + UI controls
          showCenterPinHUD();
          document.getElementById('multi-pin-ui')?.classList.remove('d-none');
          renderPinnedRelatives();
        }
      };

      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          pos => proceed([pos.coords.longitude, pos.coords.latitude]),
          () => { showToast('Location disabled. Using a default map view.', 'info'); proceed(DEFAULT_CENTER); },
          { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
        );
      } else {
        proceed(DEFAULT_CENTER);
      }
    };

    // Choice buttons
    document.getElementById('single-pin-btn')?.addEventListener('click', () => start('single'));
    document.getElementById('multi-pin-btn')?.addEventListener('click', () => start('multi'));
    // Optional alternate ids (if present)
    document.getElementById('single-pin-mode-btn')?.addEventListener('click', () => start('single'));
    document.getElementById('multi-pin-mode-btn')?.addEventListener('click', () => start('multi'));

    // Confirm button that may exist inside the wizard template
    document.getElementById('confirm-location-btn')?.addEventListener('click', () => {
      if (!scoutMap) return showToast('Map not ready yet.', 'error');
      const c = scoutMap.getCenter();
      cleanupScoutMode();
      window.dispatchEvent(new CustomEvent('navigate', { detail: `/memorial-form?new=true&lat=${c.lat}&lng=${c.lng}` }));
    });

    // Multi-pin flow
    document.getElementById('add-pin-btn')?.addEventListener('click', () => {
      if (!scoutMap) return showToast('Map not ready yet.', 'error');
      currentPinCoords = scoutMap.getCenter();
      document.getElementById('addPinForm')?.reset();
      const preview = document.getElementById('pin-photo-preview');
      if (preview) { preview.src = '#'; preview.classList.add('d-none'); }
      currentPhotoFiles = [];
      addPinModalInstance?.show();
    });

    document.getElementById('pinPhoto')?.addEventListener('change', (e) => {
      const f = e.target.files?.[0];
      currentPhotoFiles = f ? [f] : [];
      const preview = document.getElementById('pin-photo-preview');
      if (preview) {
        if (f) { preview.src = URL.createObjectURL(f); preview.classList.remove('d-none'); }
        else { preview.src = '#'; preview.classList.add('d-none'); }
      }
    });

    document.getElementById('savePinNameBtn')?.addEventListener('click', async () => {
      const btn = document.getElementById('savePinNameBtn');
      const name = (document.getElementById('pinName')?.value || '').trim();
      if (!name) return showToast('Please enter a name.', 'error');

      btn.disabled = true;
      btn.innerHTML = `<span class="spinner-border spinner-border-sm"></span> Saving...`;

      let photoUrl = null;
      if (currentPhotoFiles.length) {
        try {
          const user = auth.currentUser;
          const f = currentPhotoFiles[0];
          const p = `scouted-photos/${user?.uid || 'anonymous'}/${Date.now()}-${f.name}`;
          const sref = ref(storage, p);
          const snap = await uploadBytes(sref, f);
          photoUrl = await getDownloadURL(snap.ref);
        } catch (e) {
          console.warn('[scout-mode] photo upload failed:', e);
          showToast('Photo upload failed. Pin saved without photo.', 'error');
        }
      }

      pinnedRelatives.push({ name, coords: currentPinCoords, photoUrl });
      renderPinnedRelatives();
      addPinModalInstance?.hide();
      btn.disabled = false;
      btn.innerHTML = 'Save Pin';
    });

    document.getElementById('pinned-relatives-list')?.addEventListener('click', (e) => {
      const btn = e.target.closest('.remove-pin-btn');
      if (!btn) return;
      const idx = parseInt(btn.dataset.index, 10);
      if (!Number.isNaN(idx)) {
        pinnedRelatives.splice(idx, 1);
        renderPinnedRelatives();
      }
    });

    document.getElementById('save-pins-btn')?.addEventListener('click', saveAllPins);
  } catch (error) {
    console.error("Failed to load Scout Mode page:", error);
    appRoot.innerHTML = `<p class="text-danger text-center">Error loading Scout Mode.</p>`;
  }

  return cleanupScoutMode;
}
