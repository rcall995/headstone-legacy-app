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
let currentMode = null; // 'single', 'multi', or 'wanted'
let wantedGraves = [];
let currentWantedFilter = 'all';
let userLocation = null;

// Batch mode state
let batchCemetery = { name: '', address: '', lat: null, lng: null };
let batchCaptures = []; // Array of { photoUrl, localUrl, lat, lng, timestamp }
let batchGpsWatchId = null; // GPS watch ID for continuous tracking
let batchCurrentPosition = { lat: null, lng: null }; // Current GPS position
let batchCameraStream = null; // Camera stream for inline preview

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
  wantedGraves = [];
  currentWantedFilter = 'all';

  // Reset batch state
  batchCemetery = { name: '', address: '', lat: null, lng: null };
  // Revoke any batch capture URLs
  batchCaptures.forEach(c => {
    if (c.localUrl) URL.revokeObjectURL(c.localUrl);
  });
  batchCaptures = [];
  batchCurrentPosition = { lat: null, lng: null };

  // Stop GPS watch
  if (batchGpsWatchId !== null) {
    navigator.geolocation.clearWatch(batchGpsWatchId);
    batchGpsWatchId = null;
  }

  // Stop camera stream
  if (batchCameraStream) {
    batchCameraStream.getTracks().forEach(track => track.stop());
    batchCameraStream = null;
  }

  // Hide batch screens
  document.getElementById('batch-cemetery-screen')?.classList.add('d-none');
  document.getElementById('batch-capture-screen')?.classList.add('d-none');
}

// ========== WANTED GRAVES FUNCTIONS ==========
async function fetchWantedGraves(filter = 'all') {
  const loadingEl = document.getElementById('wanted-loading');
  const emptyEl = document.getElementById('wanted-empty');
  const listEl = document.getElementById('wanted-list');

  if (loadingEl) loadingEl.classList.remove('d-none');
  if (emptyEl) emptyEl.classList.add('d-none');
  if (listEl) listEl.classList.add('d-none');

  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      showToast('Please sign in to view wanted graves', 'error');
      return;
    }

    let url = '/api/scouts/wanted-graves';
    const params = new URLSearchParams();

    if (filter && filter !== 'all') {
      params.append('filter', filter);
    }

    // Add location for distance calculation if available
    if (userLocation) {
      params.append('lat', userLocation.lat);
      params.append('lng', userLocation.lng);
    }

    if (params.toString()) {
      url += '?' + params.toString();
    }

    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${session.access_token}`
      }
    });

    if (!response.ok) throw new Error('Failed to fetch wanted graves');

    const data = await response.json();
    wantedGraves = data.graves || [];

    // Update stats
    document.getElementById('wanted-total').textContent = data.total || wantedGraves.length;
    document.getElementById('wanted-nearby').textContent = data.nearby || 0;

    // Update badge count on main screen
    const countBadge = document.getElementById('wanted-count-badge');
    if (countBadge) countBadge.textContent = data.total || wantedGraves.length;

    renderWantedGraves();
  } catch (error) {
    console.error('[scout-mode] fetch wanted graves failed:', error);
    showToast('Failed to load wanted graves', 'error');
  } finally {
    if (loadingEl) loadingEl.classList.add('d-none');
  }
}

function renderWantedGraves() {
  const emptyEl = document.getElementById('wanted-empty');
  const listEl = document.getElementById('wanted-list');

  if (!wantedGraves.length) {
    if (emptyEl) emptyEl.classList.remove('d-none');
    if (listEl) listEl.classList.add('d-none');
    return;
  }

  if (emptyEl) emptyEl.classList.add('d-none');
  if (listEl) {
    listEl.classList.remove('d-none');
    listEl.innerHTML = wantedGraves.map(grave => {
      const tags = [];
      if (grave.needsCemetery) {
        tags.push('<span class="wanted-tag needs-cemetery"><i class="fas fa-church me-1"></i>Needs Cemetery</span>');
      }
      if (grave.needsPin || !grave.hasLocation) {
        tags.push('<span class="wanted-tag needs-pin"><i class="fas fa-map-pin me-1"></i>Needs GPS Pin</span>');
      }
      tags.push('<span class="wanted-tag bonus-points"><i class="fas fa-star me-1"></i>2.5x Points</span>');

      const dates = formatDates(grave.birthDate, grave.deathDate);
      const hint = grave.searchHints || (grave.cemetery ? `Cemetery: ${escapeHtml(grave.cemetery)}` : 'No hints available');

      return `
        <div class="wanted-grave-card" data-id="${grave.id}">
          <div class="wanted-grave-header">
            <div class="wanted-grave-icon">
              <i class="fas fa-search"></i>
            </div>
            <div class="wanted-grave-info">
              <h4 class="wanted-grave-name">${escapeHtml(grave.name)}</h4>
              <p class="wanted-grave-dates">${dates}</p>
            </div>
          </div>
          <div class="wanted-grave-tags">${tags.join('')}</div>
          ${hint ? `<div class="wanted-grave-hint"><i class="fas fa-lightbulb"></i><span>${escapeHtml(hint)}</span></div>` : ''}
          <div class="wanted-grave-actions">
            <button class="wanted-action-btn find-grave-btn" data-id="${grave.id}">
              <i class="fas fa-map-marked-alt"></i>
              I Found This Grave
            </button>
          </div>
        </div>
      `;
    }).join('');

    // Add event listeners for action buttons
    listEl.querySelectorAll('.find-grave-btn').forEach(btn => {
      btn.addEventListener('click', () => openFindGraveFlow(btn.dataset.id));
    });
  }
}

function formatDates(birthDate, deathDate) {
  // Extract year from date strings
  const birthYear = birthDate ? new Date(birthDate).getFullYear() : null;
  const deathYear = deathDate ? new Date(deathDate).getFullYear() : null;

  if (birthYear && deathYear) {
    return `${birthYear} - ${deathYear}`;
  } else if (birthYear) {
    return `Born ${birthYear}`;
  } else if (deathYear) {
    return `Died ${deathYear}`;
  }
  return 'Dates unknown';
}

async function openFindGraveFlow(graveId) {
  const grave = wantedGraves.find(g => g.id === graveId);
  if (!grave) return;

  // Navigate to single pin mode with pre-selected memorial
  currentMode = 'single-wanted';

  // Hide wanted graves screen, show wizard screen
  document.getElementById('wanted-graves-screen')?.classList.add('d-none');
  document.getElementById('scout-wizard-screen')?.classList.remove('d-none');

  // Get user's location or use default
  const center = userLocation ? [userLocation.lng, userLocation.lat] : DEFAULT_CENTER;
  initScoutMap(center);
  showWantedPinUI(grave);
}

function showWantedPinUI(grave) {
  showCenterPinHUD();

  // Add top instruction bar
  if (!document.querySelector('.scout-top-bar')) {
    const topBar = document.createElement('div');
    topBar.className = 'scout-top-bar';
    topBar.innerHTML = `
      <div class="scout-instruction">
        <h4><i class="fas fa-crosshairs"></i> Locate ${escapeHtml(grave.name)}</h4>
        <p>Pan and zoom to place the pin on their gravesite</p>
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
        <button id="scout-confirm-btn" class="scout-btn primary wanted">
          <i class="fas fa-check"></i>
          Submit Location
        </button>
      </div>
    `;
    document.body.appendChild(bottomBar);

    // Add event listeners
    document.getElementById('scout-cancel-btn')?.addEventListener('click', () => {
      cleanupScoutMode();
      // Return to wanted graves screen
      document.getElementById('scout-wizard-screen')?.classList.add('d-none');
      document.getElementById('wanted-graves-screen')?.classList.remove('d-none');
      fetchWantedGraves(currentWantedFilter);
    });

    document.getElementById('scout-confirm-btn')?.addEventListener('click', async () => {
      if (!scoutMap) return showToast('Map not ready yet.', 'error');

      const btn = document.getElementById('scout-confirm-btn');
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Submitting...';

      try {
        const c = scoutMap.getCenter();
        await submitWantedLocation(grave.id, c.lat, c.lng);
      } catch (error) {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-check"></i> Submit Location';
      }
    });
  }
}

async function submitWantedLocation(memorialId, lat, lng) {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      showToast('Please sign in to submit location', 'error');
      return;
    }

    const response = await fetch('/api/scouts/submit-location', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`
      },
      body: JSON.stringify({
        memorialId,
        gravesiteLat: lat,
        gravesiteLng: lng,
        gravesiteAccuracy: 10 // Default accuracy
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to submit location');
    }

    const result = await response.json();

    showToast(`Location submitted! You earned ${result.points.earned} bonus points!`, 'success');

    // Show badges if any
    if (result.newBadges?.length) {
      result.newBadges.forEach(badge => {
        setTimeout(() => {
          showToast(`New Badge: ${badge.name}! ${badge.description}`, 'success');
        }, 1500);
      });
    }

    cleanupScoutMode();
    window.dispatchEvent(new CustomEvent('navigate', { detail: '/scout-mode' }));
  } catch (error) {
    console.error('[scout-mode] submit location failed:', error);
    showToast(error.message || 'Failed to submit location', 'error');
    throw error;
  }
}

// ========== BATCH MODE FUNCTIONS ==========
async function reverseGeocode(lat, lng) {
  try {
    const response = await fetch(`/api/geo/geocode?lat=${lat}&lng=${lng}`);
    if (!response.ok) throw new Error('Geocode failed');
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('[scout-mode] reverse geocode failed:', error);
    return null;
  }
}

async function startBatchMode() {
  currentMode = 'multi';
  const btn = document.getElementById('multi-pin-btn');

  if (btn) {
    btn.disabled = true;
    const originalContent = btn.innerHTML;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span>';

    // Get user's current location
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          btn.disabled = false;
          btn.innerHTML = originalContent;

          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          batchCemetery.lat = lat;
          batchCemetery.lng = lng;

          // Show cemetery confirmation screen
          document.getElementById('scout-choice-screen')?.classList.add('d-none');
          document.getElementById('batch-cemetery-screen')?.classList.remove('d-none');

          // Update GPS display
          document.getElementById('batchGpsCoords').textContent =
            `${lat.toFixed(6)}, ${lng.toFixed(6)}`;

          // Reverse geocode for address
          document.getElementById('batchCemeteryAddress').value = 'Looking up address...';
          const geoData = await reverseGeocode(lat, lng);

          if (geoData?.address) {
            document.getElementById('batchCemeteryAddress').value = geoData.address;
          } else {
            document.getElementById('batchCemeteryAddress').value = 'Address not found';
          }

          // Enable the start button
          document.getElementById('batch-start-capture-btn').disabled = false;
        },
        (error) => {
          btn.disabled = false;
          btn.innerHTML = originalContent;
          showToast('Could not get your location. Please enable GPS.', 'error');
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    } else {
      btn.disabled = false;
      btn.innerHTML = originalContent;
      showToast('Geolocation is not supported.', 'error');
    }
  }
}

async function startBatchCapture() {
  const cemeteryName = document.getElementById('batchCemeteryName')?.value?.trim() || 'Unknown Cemetery';
  batchCemetery.name = cemeteryName;

  // Show capture screen
  document.getElementById('batch-cemetery-screen')?.classList.add('d-none');
  document.getElementById('batch-capture-screen')?.classList.remove('d-none');

  // Update cemetery display
  document.getElementById('batch-cemetery-display').textContent = cemeteryName;

  // Reset captures for this session
  batchCaptures = [];
  updateBatchUI();

  // Start continuous GPS tracking
  if (navigator.geolocation) {
    // Set initial position from cemetery
    batchCurrentPosition = { lat: batchCemetery.lat, lng: batchCemetery.lng };

    batchGpsWatchId = navigator.geolocation.watchPosition(
      (pos) => {
        batchCurrentPosition = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude
        };
        console.log('[batch] GPS updated:', batchCurrentPosition);
      },
      (err) => {
        console.warn('[batch] GPS watch error:', err);
      },
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 10000 }
    );
  }

  // Initialize inline camera
  await initBatchCamera();
}

async function initBatchCamera() {
  const videoEl = document.getElementById('batch-camera-video');
  const viewfinderFrame = document.querySelector('.viewfinder-frame');
  const fallbackMsg = document.querySelector('.viewfinder-hint');

  if (!videoEl) return;

  try {
    // Request camera access
    batchCameraStream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: 'environment', // Use back camera
        width: { ideal: 1920 },
        height: { ideal: 1080 }
      },
      audio: false
    });

    videoEl.srcObject = batchCameraStream;
    await videoEl.play();
    videoEl.classList.add('active');

    // Hide the viewfinder frame since we have live video
    if (viewfinderFrame) viewfinderFrame.style.display = 'none';
    if (fallbackMsg) fallbackMsg.textContent = 'Tap camera to capture';

    console.log('[batch] Camera initialized successfully');

  } catch (err) {
    console.warn('[batch] Camera access denied or unavailable:', err);
    // Fall back to file input method - show the frame
    if (viewfinderFrame) viewfinderFrame.style.display = '';
    if (fallbackMsg) fallbackMsg.textContent = 'Tap camera button to take photo';
  }
}

function updateBatchUI() {
  // Update count
  document.getElementById('batch-count').textContent = batchCaptures.length;

  // Update done button state
  document.getElementById('batch-done-btn').disabled = batchCaptures.length === 0;

  // Update photo strip
  const strip = document.getElementById('batch-photos-strip');
  if (batchCaptures.length > 0) {
    strip.classList.remove('d-none');
    strip.innerHTML = batchCaptures.map((capture, idx) => `
      <img src="${capture.localUrl}" class="batch-photo-thumb ${idx === batchCaptures.length - 1 ? 'latest' : ''}"
           data-index="${idx}" alt="Capture ${idx + 1}">
    `).join('');
  } else {
    strip.classList.add('d-none');
  }
}

function triggerBatchCapture() {
  const videoEl = document.getElementById('batch-camera-video');

  // If we have a live video stream, capture from it
  if (batchCameraStream && videoEl && videoEl.videoWidth > 0) {
    captureFromVideoStream(videoEl);
  } else {
    // Fall back to file input
    document.getElementById('batch-camera-input')?.click();
  }
}

function captureFromVideoStream(videoEl) {
  // Create canvas to capture frame
  const canvas = document.createElement('canvas');
  canvas.width = videoEl.videoWidth;
  canvas.height = videoEl.videoHeight;

  const ctx = canvas.getContext('2d');
  ctx.drawImage(videoEl, 0, 0);

  // Convert to blob
  canvas.toBlob(async (blob) => {
    if (blob) {
      // Create a File object from the blob
      const file = new File([blob], `capture-${Date.now()}.jpg`, { type: 'image/jpeg' });
      await handleBatchPhoto(file);
    }
  }, 'image/jpeg', 0.85);
}

async function handleBatchPhoto(file) {
  if (!file) return;

  // Flash effect
  const flash = document.createElement('div');
  flash.className = 'capture-flash';
  document.body.appendChild(flash);
  setTimeout(() => flash.remove(), 300);

  // Use continuously tracked GPS position (updated by watchPosition)
  // This gives us the actual position when photo is taken, not a delayed lookup
  const coords = {
    lat: batchCurrentPosition.lat || batchCemetery.lat,
    lng: batchCurrentPosition.lng || batchCemetery.lng
  };

  console.log('[batch] Photo captured at GPS:', coords);
  const localUrl = URL.createObjectURL(file);

  // Add to captures
  batchCaptures.push({
    file,
    localUrl,
    lat: coords.lat,
    lng: coords.lng,
    timestamp: Date.now()
  });

  // Show preview of last capture
  const previewImg = document.getElementById('batch-preview-img');
  const previewDiv = document.getElementById('batch-preview');
  const viewfinder = document.getElementById('batch-viewfinder');

  if (previewImg && previewDiv && viewfinder) {
    previewImg.src = localUrl;
    viewfinder.classList.add('d-none');
    previewDiv.classList.remove('d-none');

    // After 1.5 seconds, return to viewfinder for next capture
    setTimeout(() => {
      previewDiv.classList.add('d-none');
      viewfinder.classList.remove('d-none');
    }, 1500);
  }

  updateBatchUI();
  showToast(`#${batchCaptures.length} captured!`, 'success');
}

async function saveBatchCaptures() {
  if (batchCaptures.length === 0) return;

  const btn = document.getElementById('batch-done-btn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span>';

  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      showToast('Please sign in to save.', 'error');
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-check"></i><span class="done-label">Done</span>';
      return;
    }

    const savedCount = { success: 0, failed: 0 };

    // Create clean cemetery name for naming (remove special chars, limit length)
    const cleanCemeteryName = batchCemetery.name
      .replace(/[^a-zA-Z0-9\s]/g, '')
      .replace(/\s+/g, '_')
      .substring(0, 30) || 'Cemetery';

    for (let i = 0; i < batchCaptures.length; i++) {
      const capture = batchCaptures[i];
      const sequenceNum = String(i + 1).padStart(2, '0');

      try {
        // Upload photo
        const fileName = `${user.id}/${Date.now()}-headstone-${Math.random().toString(36).substring(2, 8)}.jpg`;
        const { error: uploadError } = await supabase.storage
          .from('scouted-photos')
          .upload(fileName, capture.file);

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from('scouted-photos')
          .getPublicUrl(fileName);

        // Create memorial draft with auto-generated name
        const memorialId = `scout-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
        const autoName = `${cleanCemeteryName}_${sequenceNum}`;

        const { error: insertError } = await supabase
          .from('memorials')
          .insert({
            id: memorialId,
            name: autoName,
            main_photo: publicUrl,
            gravesite_lat: capture.lat,
            gravesite_lng: capture.lng,
            gravesite_accuracy: 10,
            cemetery_name: batchCemetery.name,
            status: 'draft',
            tier: 'memorial',
            curator_ids: [user.id],
            curators: [{ uid: user.id, email: user.email }],
            source: 'scout-batch',
            needs_location: false // GPS is known
          });

        if (insertError) throw insertError;
        savedCount.success++;
      } catch (err) {
        console.error('[scout-mode] failed to save capture:', err);
        savedCount.failed++;
      }
    }

    showToast(
      `Saved ${savedCount.success} memorial${savedCount.success !== 1 ? 's' : ''} as drafts!` +
      (savedCount.failed > 0 ? ` (${savedCount.failed} failed)` : ''),
      savedCount.failed > 0 ? 'warning' : 'success'
    );

    cleanupScoutMode();
    window.dispatchEvent(new CustomEvent('navigate', { detail: '/memorial-list?status=draft' }));
  } catch (error) {
    console.error('[scout-mode] save batch failed:', error);
    showToast('Failed to save captures.', 'error');
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-check"></i><span class="done-label">Done</span>';
  }
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
    // Batch mode now uses new photo-first flow
    document.getElementById('multi-pin-btn')?.addEventListener('click', () => startBatchMode());

    // Batch mode cemetery screen handlers
    document.getElementById('batch-cemetery-back-btn')?.addEventListener('click', () => {
      document.getElementById('batch-cemetery-screen')?.classList.add('d-none');
      document.getElementById('scout-choice-screen')?.classList.remove('d-none');
      currentMode = null;
    });

    document.getElementById('batch-start-capture-btn')?.addEventListener('click', () => startBatchCapture());

    // Batch mode capture screen handlers
    document.getElementById('batch-capture-btn')?.addEventListener('click', () => triggerBatchCapture());

    document.getElementById('batch-camera-input')?.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (file) handleBatchPhoto(file);
      e.target.value = ''; // Reset so same file can be captured again
    });

    document.getElementById('batch-cancel-btn')?.addEventListener('click', () => {
      if (batchCaptures.length > 0) {
        if (!confirm(`You have ${batchCaptures.length} unsaved captures. Cancel anyway?`)) return;
      }
      cleanupScoutMode();
      document.getElementById('batch-capture-screen')?.classList.add('d-none');
      document.getElementById('scout-choice-screen')?.classList.remove('d-none');
    });

    document.getElementById('batch-done-btn')?.addEventListener('click', () => saveBatchCaptures());

    // Wanted Graves button handler
    document.getElementById('wanted-graves-btn')?.addEventListener('click', () => {
      currentMode = 'wanted';

      // Try to get user location first
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          pos => {
            userLocation = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          },
          () => {
            userLocation = null;
          },
          { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
        );
      }

      // Hide choice screen, show wanted graves screen
      document.getElementById('scout-choice-screen')?.classList.add('d-none');
      document.getElementById('wanted-graves-screen')?.classList.remove('d-none');

      // Fetch wanted graves
      fetchWantedGraves('all');
    });

    // Wanted graves back button
    document.getElementById('wanted-back-btn')?.addEventListener('click', () => {
      document.getElementById('wanted-graves-screen')?.classList.add('d-none');
      document.getElementById('scout-choice-screen')?.classList.remove('d-none');
      currentMode = null;
    });

    // Wanted graves filter tabs
    document.querySelectorAll('.wanted-filter-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.wanted-filter-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        currentWantedFilter = tab.dataset.filter;
        fetchWantedGraves(currentWantedFilter);
      });
    });

    // Fetch wanted count for badge on initial load
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          const response = await fetch('/api/scouts/wanted-graves', {
            headers: { 'Authorization': `Bearer ${session.access_token}` }
          });
          if (response.ok) {
            const data = await response.json();
            const countBadge = document.getElementById('wanted-count-badge');
            if (countBadge) countBadge.textContent = data.total || 0;
          }
        }
      } catch (e) {
        console.warn('[scout-mode] failed to fetch wanted count:', e);
      }
    })();

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
