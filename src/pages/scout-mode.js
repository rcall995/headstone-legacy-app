// /js/pages/scout-mode.js - Supabase version with App-like UI
import { supabase } from '/js/supabase-client.js';
import { config } from '/js/config.js';
import { showToast } from '/js/utils/toasts.js';
import { awardPoints, showGamificationToasts } from '/js/utils/scout-gamification.js';

let scoutMap = null;
let addPinModalInstance = null;
let currentPinCoords = null;
let currentPhotoFiles = [];
let pinnedRelatives = [];
let resizeListener = null;
let currentMode = null; // 'single' or 'multi'

const DEFAULT_CENTER = [-98.5, 39.8];

function cleanupScoutMode() {
  // Remove resize listener
  if (resizeListener) {
    window.removeEventListener('resize', resizeListener);
    resizeListener = null;
  }

  // Remove mapbox instance properly
  if (scoutMap) {
    try {
      scoutMap.remove();
    } catch (err) {
      console.warn('[scout-mode] map cleanup error:', err);
    }
    scoutMap = null;
  }

  // Remove HUD elements
  document.getElementById('scout-hud')?.remove();
  document.querySelector('.scout-top-bar')?.remove();
  document.querySelector('.scout-bottom-bar')?.remove();
  document.getElementById('multi-pin-ui')?.remove();

  // Remove dynamically created map element
  const createdMap = document.getElementById('scout-map');
  if (createdMap && createdMap.parentElement) {
    createdMap.parentElement.removeChild(createdMap);
  }

  // Reset any existing map element
  const existingMap = document.getElementById('map');
  existingMap?.classList.remove('scout-active');

  // Remove body class
  document.body.classList.remove('scout-active');

  // Properly dispose of Bootstrap modal
  if (addPinModalInstance) {
    try {
      addPinModalInstance.hide();
      addPinModalInstance.dispose();
    } catch (err) {
      console.warn('[scout-mode] modal cleanup error:', err);
    }
    addPinModalInstance = null;
  }

  // Revoke any object URLs to prevent memory leaks
  const preview = document.getElementById('pin-photo-preview');
  if (preview && preview.src && preview.src.startsWith('blob:')) {
    URL.revokeObjectURL(preview.src);
  }

  // Reset state
  currentPinCoords = null;
  currentPhotoFiles = [];
  pinnedRelatives = [];
  currentMode = null;
}

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

    scoutMap.addControl(new mapboxgl.NavigationControl(), 'top-right');
    const geolocate = new mapboxgl.GeolocateControl({
      positionOptions: { enableHighAccuracy: true },
      trackUserLocation: true,
      showUserHeading: true
    });
    scoutMap.addControl(geolocate, 'top-left');

    scoutMap.on('load', () => setTimeout(() => scoutMap?.resize(), 0));

    resizeListener = () => scoutMap?.resize();
    window.addEventListener('resize', resizeListener);

    activateMapFullScreen();
  } catch (err) {
    console.error('[scout-mode] map init failed:', err);
    showToast('Could not load the map.', 'error');
  }
}

function showCenterPinHUD() {
  if (!document.getElementById('scout-hud')) {
    const hud = document.createElement('div');
    hud.id = 'scout-hud';
    hud.className = 'scout-hud';
    hud.innerHTML = `
      <div class="center">
        <div class="scout-center-pin" aria-hidden="true">📍</div>
      </div>
    `;
    document.body.appendChild(hud);
  }
}

function showSinglePinUI() {
  showCenterPinHUD();

  // Add top instruction bar
  if (!document.querySelector('.scout-top-bar')) {
    const topBar = document.createElement('div');
    topBar.className = 'scout-top-bar';
    topBar.innerHTML = `
      <div class="scout-instruction">
        <h4><i class="fas fa-crosshairs"></i> Position the Pin</h4>
        <p>Pan and zoom to place the pin on the exact gravesite</p>
      </div>
    `;
    document.body.appendChild(topBar);
  }

  // Add bottom action bar
  if (!document.querySelector('.scout-bottom-bar')) {
    const bottomBar = document.createElement('div');
    bottomBar.className = 'scout-bottom-bar';
    bottomBar.innerHTML = `
      <div class="scout-action-buttons">
        <button id="scout-cancel-btn" class="scout-btn secondary">
          <i class="fas fa-times"></i>
          Cancel
        </button>
        <button id="scout-confirm-btn" class="scout-btn primary">
          <i class="fas fa-check"></i>
          Set Location
        </button>
      </div>
    `;
    document.body.appendChild(bottomBar);

    // Add event listeners
    document.getElementById('scout-cancel-btn')?.addEventListener('click', () => {
      cleanupScoutMode();
      window.dispatchEvent(new CustomEvent('navigate', { detail: '/memorial-list?status=published' }));
    });

    document.getElementById('scout-confirm-btn')?.addEventListener('click', () => {
      if (!scoutMap) return showToast('Map not ready yet.', 'error');
      const c = scoutMap.getCenter();
      const path = `/memorial-form?new=true&lat=${c.lat}&lng=${c.lng}`;
      cleanupScoutMode();
      window.dispatchEvent(new CustomEvent('navigate', { detail: path }));
    });
  }
}

function showMultiPinUI() {
  showCenterPinHUD();

  // Create multi-pin UI container
  if (!document.getElementById('multi-pin-ui')) {
    const ui = document.createElement('div');
    ui.id = 'multi-pin-ui';
    ui.innerHTML = `
      <div class="multi-pin-header">
        <div class="multi-pin-title">
          <i class="fas fa-layer-group"></i>
          <span>Batch Mode</span>
          <span class="pin-count-badge" id="pin-count-badge">0 pins</span>
        </div>
        <div class="multi-pin-actions">
          <button id="multi-cancel-btn" class="scout-icon-btn danger" title="Cancel">
            <i class="fas fa-times"></i>
          </button>
        </div>
      </div>
      <div id="pinned-relatives-list"></div>
    `;
    document.body.appendChild(ui);

    // Cancel button
    document.getElementById('multi-cancel-btn')?.addEventListener('click', () => {
      if (pinnedRelatives.length > 0) {
        if (!confirm('You have unsaved pins. Are you sure you want to cancel?')) return;
      }
      cleanupScoutMode();
      window.dispatchEvent(new CustomEvent('navigate', { detail: '/memorial-list?status=published' }));
    });
  }

  // Add bottom action bar for multi-pin
  if (!document.querySelector('.scout-bottom-bar')) {
    const bottomBar = document.createElement('div');
    bottomBar.className = 'scout-bottom-bar';
    bottomBar.innerHTML = `
      <div class="scout-action-buttons">
        <button id="add-pin-btn" class="scout-btn secondary">
          <i class="fas fa-plus"></i>
          Add Pin Here
        </button>
        <button id="save-pins-btn" class="scout-btn primary" disabled>
          <i class="fas fa-save"></i>
          Save All
        </button>
      </div>
    `;
    document.body.appendChild(bottomBar);

    // Add pin button
    document.getElementById('add-pin-btn')?.addEventListener('click', () => {
      if (!scoutMap) return showToast('Map not ready yet.', 'error');
      currentPinCoords = scoutMap.getCenter();
      document.getElementById('addPinForm')?.reset();
      const preview = document.getElementById('pin-photo-preview');
      const placeholder = document.getElementById('upload-placeholder');
      if (preview) {
        preview.src = '#';
        preview.classList.add('d-none');
      }
      if (placeholder) {
        placeholder.style.display = '';
      }
      currentPhotoFiles = [];
      addPinModalInstance?.show();
    });

    // Save all pins button
    document.getElementById('save-pins-btn')?.addEventListener('click', saveAllPins);
  }

  renderPinnedRelatives();
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function renderPinnedRelatives() {
  const listEl = document.getElementById('pinned-relatives-list');
  const countBadge = document.getElementById('pin-count-badge');
  const saveBtn = document.getElementById('save-pins-btn');

  if (!listEl) return;

  // Update count badge
  if (countBadge) {
    countBadge.textContent = `${pinnedRelatives.length} pin${pinnedRelatives.length !== 1 ? 's' : ''}`;
  }

  // Update save button state
  if (saveBtn) {
    saveBtn.disabled = pinnedRelatives.length === 0;
  }

  if (pinnedRelatives.length === 0) {
    listEl.innerHTML = `
      <div class="pin-list-empty">
        <i class="fas fa-map-marker-alt"></i>
        <p>No pins added yet</p>
        <small>Tap "Add Pin Here" to mark a location</small>
      </div>
    `;
  } else {
    listEl.innerHTML = pinnedRelatives.map((pin, i) => `
      <div class="pin-item">
        <div class="pin-item-icon">
          <i class="fas fa-map-pin"></i>
        </div>
        <span class="pin-item-name">${escapeHtml(pin.name)}</span>
        <button class="pin-item-remove remove-pin-btn" data-index="${i}" aria-label="Remove pin">
          <i class="fas fa-trash-alt"></i>
        </button>
      </div>
    `).join('');

    // Add remove handlers
    listEl.querySelectorAll('.remove-pin-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.index, 10);
        if (!Number.isNaN(idx)) {
          pinnedRelatives.splice(idx, 1);
          renderPinnedRelatives();
        }
      });
    });
  }
}

async function saveAllPins() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return showToast('You must be signed in to save pins.', 'error');
  if (!pinnedRelatives.length) return;

  const btn = document.getElementById('save-pins-btn');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner-border spinner-border-sm"></span> Saving...`;
  }

  try {
    const memorialsToInsert = pinnedRelatives.map(pin => ({
      id: `scout-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
      name: pin.name,
      location_lat: pin.coords.lat,
      location_lng: pin.coords.lng,
      is_location_exact: true,
      status: 'draft',
      tier: 'memorial',
      curator_ids: [user.id],
      curators: [{ uid: user.id, email: user.email }],
      main_photo: pin.photoUrl || null
    }));

    const { error } = await supabase
      .from('memorials')
      .insert(memorialsToInsert);

    if (error) throw error;

    // Award scout points for pins and photos
    const pinsCount = pinnedRelatives.length;
    const photosCount = pinnedRelatives.filter(p => p.photoUrl).length;
    const gamificationResult = await awardPoints(user.id, pinsCount, photosCount);

    showToast(`${pinnedRelatives.length} memorial(s) saved as drafts!`, 'success');

    // Show gamification notifications
    showGamificationToasts(gamificationResult);

    cleanupScoutMode();
    window.dispatchEvent(new CustomEvent('navigate', { detail: '/memorial-list?status=draft' }));
  } catch (e) {
    console.error('[scout-mode] save pins failed:', e);
    showToast('An error occurred while saving the pins.', 'error');
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `<i class="fas fa-save"></i> Save All`;
    }
  }
}

export async function loadScoutModePage(appRoot) {
  cleanupScoutMode();

  try {
    const resp = await fetch('/pages/scout-mode.html');
    if (!resp.ok) throw new Error('Could not load scout-mode.html');
    appRoot.innerHTML = await resp.text();

    // Back button handler
    document.getElementById('back-to-dashboard-btn')?.addEventListener('click', (e) => {
      e.preventDefault();
      cleanupScoutMode();
      window.dispatchEvent(new CustomEvent('navigate', { detail: '/memorial-list?status=published' }));
    });

    // Initialize modal
    const addPinModalEl = document.getElementById('addPinModal');
    if (addPinModalEl && window.bootstrap?.Modal) {
      addPinModalInstance = new bootstrap.Modal(addPinModalEl);
    }

    // Mode selection handlers
    const start = (mode) => {
      currentMode = mode;

      const proceed = (center) => {
        document.getElementById('scout-choice-screen')?.classList.add('d-none');
        document.getElementById('scout-wizard-screen')?.classList.remove('d-none');

        initScoutMap(center);

        if (mode === 'single') {
          showSinglePinUI();
        } else {
          showMultiPinUI();
        }
      };

      // Show loading state
      const btn = mode === 'single' ? document.getElementById('single-pin-btn') : document.getElementById('multi-pin-btn');
      if (btn) {
        btn.disabled = true;
        const originalContent = btn.innerHTML;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span>';

        const restoreBtn = () => {
          btn.disabled = false;
          btn.innerHTML = originalContent;
        };

        if (navigator.geolocation) {
          navigator.geolocation.getCurrentPosition(
            pos => {
              restoreBtn();
              proceed([pos.coords.longitude, pos.coords.latitude]);
            },
            () => {
              restoreBtn();
              showToast('Location disabled. Using default view.', 'info');
              proceed(DEFAULT_CENTER);
            },
            { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
          );
        } else {
          restoreBtn();
          proceed(DEFAULT_CENTER);
        }
      }
    };

    document.getElementById('single-pin-btn')?.addEventListener('click', () => start('single'));
    document.getElementById('multi-pin-btn')?.addEventListener('click', () => start('multi'));

    // Photo upload handling
    document.getElementById('pinPhoto')?.addEventListener('change', (e) => {
      const f = e.target.files?.[0];
      currentPhotoFiles = f ? [f] : [];
      const preview = document.getElementById('pin-photo-preview');
      const placeholder = document.getElementById('upload-placeholder');

      if (preview && placeholder) {
        if (f) {
          preview.src = URL.createObjectURL(f);
          preview.classList.remove('d-none');
          placeholder.style.display = 'none';
        } else {
          preview.src = '#';
          preview.classList.add('d-none');
          placeholder.style.display = '';
        }
      }
    });

    // Save pin in modal
    document.getElementById('savePinNameBtn')?.addEventListener('click', async () => {
      const btn = document.getElementById('savePinNameBtn');
      const name = (document.getElementById('pinName')?.value || '').trim();
      if (!name) return showToast('Please enter a name.', 'error');

      btn.disabled = true;
      btn.innerHTML = `<span class="spinner-border spinner-border-sm"></span> Saving...`;

      let photoUrl = null;
      if (currentPhotoFiles.length) {
        try {
          const { data: { user } } = await supabase.auth.getUser();
          const f = currentPhotoFiles[0];
          const filePath = `${user?.id || 'anonymous'}/${Date.now()}-${f.name.replace(/[^a-zA-Z0-9.]/g, '_')}`;

          const { error: uploadError } = await supabase.storage
            .from('scouted-photos')
            .upload(filePath, f);

          if (uploadError) throw uploadError;

          const { data: { publicUrl } } = supabase.storage
            .from('scouted-photos')
            .getPublicUrl(filePath);

          photoUrl = publicUrl;
        } catch (e) {
          console.warn('[scout-mode] photo upload failed:', e);
          showToast('Photo upload failed. Pin saved without photo.', 'error');
        }
      }

      pinnedRelatives.push({ name, coords: currentPinCoords, photoUrl });
      renderPinnedRelatives();
      addPinModalInstance?.hide();
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-plus"></i> Add Pin';
      showToast(`Added: ${name}`, 'success');
    });

  } catch (error) {
    console.error("Failed to load Scout Mode page:", error);
    appRoot.innerHTML = `
      <div class="container py-5 text-center">
        <div class="alert alert-danger">
          <i class="fas fa-exclamation-triangle me-2"></i>
          Error loading Scout Mode
        </div>
        <a href="/memorial-list" class="btn btn-primary" data-route>
          Return to Dashboard
        </a>
      </div>
    `;
  }

  return cleanupScoutMode;
}
