import { supabase } from '/js/supabase-client.js';
import { showToast } from '/js/utils/toasts.js';

// --- Module-level State Variables ---
let currentStep = 1;
const TOTAL_STEPS = 5;
const commonRelationships = ["Spouse", "Parent", "Father", "Mother", "Son", "Daughter", "Sibling", "Brother", "Sister", "Grandparent", "Grandfather", "Grandmother", "Grandchild", "Grandson", "Granddaughter"];
let originalAddress = '';
let cemeteryLocation = null; // Store geocoded cemetery location { lat, lng }
let cemeteryMapPreview = null; // Map instance for preview
let lifePathMapInstance = null; // Map instance for life journey
let isGeocoding = false; // Prevent duplicate geocoding requests
let headstonePhotoFile = null; // Store the headstone photo
let geocodedResidenceLocations = {}; // Store geocoded residence locations by address

// Gravesite pin state
let gravesiteLocation = null; // Store gravesite location { lat, lng, accuracy }
let gravesiteMapPicker = null; // Map instance for gravesite picker

// Memorial linking state
let memorialSearchModal = null;
let currentLinkingRelativeGroup = null; // The relative field being linked
let searchDebounceTimer = null;
let pendingConnections = []; // Connections to create when saving

// Family nearby state
let familyNearbyMembers = []; // Loaded family members from DB
let familyNearbyToDelete = []; // IDs to delete on save
const burialStatusOptions = [
    { value: 'same_cemetery', label: 'Same cemetery', description: 'Buried in this same cemetery' },
    { value: 'nearby_cemetery', label: 'Nearby cemetery', description: 'Buried in a nearby cemetery' },
    { value: 'different_cemetery', label: 'Different cemetery', description: 'Buried elsewhere' },
    { value: 'unknown', label: 'Unknown', description: 'Burial location unknown' }
];

function navigateToStep(stepNumber) {
    currentStep = stepNumber;
    document.querySelectorAll('.wizard-step').forEach(step => {
        const isActive = parseInt(step.dataset.step) === currentStep;
        step.style.display = isActive ? 'block' : 'none';
    });
    document.querySelectorAll('.wizard-progress-step').forEach(step => {
        const stepNum = parseInt(step.dataset.step);
        step.classList.toggle('active', stepNum === currentStep);
        step.classList.toggle('completed', stepNum < currentStep);
    });
}

function adjustFormForTier(form, tier) {
    const isHistorian = tier === 'historian';
    const isStoryteller = tier === 'storyteller' || isHistorian;

    document.querySelector('.wizard-progress-step[data-step="4"]').style.display = isStoryteller ? 'flex' : 'none';
    document.querySelector('.wizard-progress-step[data-step="5"]').style.display = isHistorian ? 'flex' : 'none';

    const photoGallery = form.querySelector('#photo-gallery-section');
    if (photoGallery) {
        photoGallery.style.display = isStoryteller ? 'block' : 'none';
    }
}

function initializeWizard(appRoot) {
    const nextBtn = appRoot.querySelector('#next-step-btn');
    const prevBtn = appRoot.querySelector('#prev-step-btn');
    const progressSteps = appRoot.querySelectorAll('.wizard-progress-step');
    const tierRadioButtons = appRoot.querySelectorAll('input[name="tier"]');

    tierRadioButtons.forEach(radio => {
        radio.addEventListener('change', () => {
            const tierCards = appRoot.querySelectorAll('.tier-card');
            tierCards.forEach(card => card.classList.remove('selected'));
            radio.closest('.tier-card')?.classList.add('selected');
            adjustFormForTier(appRoot.querySelector('#memorialForm'), radio.value);
        });
    });

    nextBtn?.addEventListener('click', () => {
        if (currentStep < TOTAL_STEPS) navigateToStep(currentStep + 1);
    });
    prevBtn?.addEventListener('click', () => {
        if (currentStep > 1) navigateToStep(currentStep - 1);
    });
    progressSteps.forEach(step => {
        step.addEventListener('click', () => navigateToStep(parseInt(step.dataset.step)));
    });
}

function generateSlugId(name) {
    if (!name || name.trim() === '') return `memorial-${Math.random().toString(36).substring(2, 10)}`;
    const slug = name.toLowerCase().trim().replace(/[^\w\s-]/g, '').replace(/[\s_-]+/g, '-').replace(/^-+|-+$/g, '');
    const randomSuffix = Math.random().toString(36).substring(2, 8);
    return `${slug}-${randomSuffix}`;
}

// --- Cemetery Geocoding Functions ---

// Use GPS to get current location and reverse geocode to address
async function useMyLocation(appRoot) {
    const locationBtn = appRoot.querySelector('#use-my-location-btn');
    const addressInput = appRoot.querySelector('#memorial-cemetery-address');
    const statusEl = appRoot.querySelector('#geocode-status');

    if (!navigator.geolocation) {
        showToast('Geolocation is not supported by your browser', 'error');
        return;
    }

    locationBtn.disabled = true;
    locationBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span>';
    statusEl.textContent = 'Getting your location...';

    try {
        // Get current position
        const position = await new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 0
            });
        });

        const { latitude, longitude } = position.coords;
        statusEl.textContent = 'Finding address...';

        // Get session for API call
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
            throw new Error('You must be signed in to use location services');
        }

        // Reverse geocode using Mapbox API via our backend
        const response = await fetch('/api/geo/reverse', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.access_token}`
            },
            body: JSON.stringify({ lat: latitude, lng: longitude })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Could not find address');
        }

        const { address } = await response.json();

        if (address) {
            addressInput.value = address;
            cemeteryLocation = { lat: latitude, lng: longitude };
            statusEl.innerHTML = '<i class="fas fa-check-circle text-success"></i> Location found';
            showToast('Location found! You can edit the address if needed.', 'success');
            showCemeteryMapPreview(appRoot, latitude, longitude, address);
        } else {
            throw new Error('No address found for this location');
        }
    } catch (error) {
        console.error('Location error:', error);
        if (error.code === 1) {
            showToast('Location access denied. Please enable location services.', 'error');
        } else if (error.code === 2) {
            showToast('Could not determine your location. Please try again.', 'error');
        } else if (error.code === 3) {
            showToast('Location request timed out. Please try again.', 'error');
        } else {
            showToast(error.message || 'Could not get your location', 'error');
        }
        statusEl.innerHTML = '<i class="fas fa-exclamation-circle text-danger"></i> Location failed';
    } finally {
        locationBtn.disabled = false;
        locationBtn.innerHTML = '<i class="fas fa-crosshairs"></i>';
    }
}

// --- Gravesite Pin Functions ---

// Update UI to show gravesite is set
function updateGravesiteUI() {
    const notSetEl = document.getElementById('gravesite-not-set');
    const isSetEl = document.getElementById('gravesite-is-set');
    const coordsEl = document.getElementById('gravesite-coords');
    const statusCard = document.getElementById('gravesite-status-card');

    if (gravesiteLocation) {
        notSetEl.style.display = 'none';
        isSetEl.style.display = 'flex';
        statusCard.classList.add('has-pin');

        // Show coordinates and accuracy
        let coordsText = `${gravesiteLocation.lat.toFixed(6)}, ${gravesiteLocation.lng.toFixed(6)}`;
        if (gravesiteLocation.accuracy) {
            const accuracyClass = gravesiteLocation.accuracy < 10 ? 'excellent' : gravesiteLocation.accuracy < 30 ? 'good' : 'poor';
            coordsText += ` <span class="gps-accuracy-indicator ${accuracyClass}"><i class="fas fa-satellite"></i> ±${Math.round(gravesiteLocation.accuracy)}m</span>`;
        }
        coordsEl.innerHTML = coordsText;
    } else {
        notSetEl.style.display = 'flex';
        isSetEl.style.display = 'none';
        statusCard.classList.remove('has-pin');
        coordsEl.textContent = '';
    }
}

// Use GPS to pin exact gravesite location
async function setGravesiteGPS() {
    const gpsBtn = document.getElementById('set-gravesite-gps-btn');
    const updateBtn = document.getElementById('update-gravesite-btn');
    const activeBtn = gravesiteLocation ? updateBtn : gpsBtn;

    if (!navigator.geolocation) {
        showToast('Geolocation is not supported by your browser', 'error');
        return;
    }

    activeBtn.disabled = true;
    activeBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Getting GPS...';

    try {
        const position = await new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, {
                enableHighAccuracy: true,
                timeout: 15000,
                maximumAge: 0
            });
        });

        const { latitude, longitude, accuracy } = position.coords;

        gravesiteLocation = {
            lat: latitude,
            lng: longitude,
            accuracy: accuracy
        };

        updateGravesiteUI();
        showToast('Gravesite location pinned!', 'success');

    } catch (error) {
        console.error('GPS error:', error);
        if (error.code === 1) {
            showToast('Location access denied. Please enable location services.', 'error');
        } else if (error.code === 2) {
            showToast('Could not determine your location. Try moving to a better spot.', 'error');
        } else if (error.code === 3) {
            showToast('Location request timed out. Please try again.', 'error');
        } else {
            showToast('Could not get GPS location', 'error');
        }
    } finally {
        activeBtn.disabled = false;
        if (gravesiteLocation) {
            activeBtn.innerHTML = '<i class="fas fa-sync-alt me-1"></i>Update';
        } else {
            activeBtn.innerHTML = '<i class="fas fa-crosshairs me-2"></i>Use My GPS';
        }
    }
}

// Open map picker modal for gravesite - uses center-pin UX like Scout Mode
function openGravesiteMapPicker() {
    // Create modal if it doesn't exist
    let modal = document.getElementById('gravesiteMapModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.className = 'modal fade';
        modal.id = 'gravesiteMapModal';
        modal.innerHTML = `
            <div class="modal-dialog modal-lg modal-dialog-centered">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title"><i class="fas fa-map-pin me-2 text-danger"></i>Pin Gravesite Location</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body p-0">
                        <div class="gravesite-map-instructions" style="padding: 12px 16px; background: #f8f9fa; border-bottom: 1px solid #dee2e6;">
                            <i class="fas fa-crosshairs text-primary me-2"></i>
                            <strong>Drag the map</strong> to position the pin on the exact gravesite location.
                        </div>
                        <div id="gravesite-map-picker" class="gravesite-map-picker" style="height: 400px; position: relative;">
                            <!-- Center pin overlay -->
                            <div id="center-pin-marker" style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -100%); z-index: 10; pointer-events: none; font-size: 36px; text-shadow: 0 2px 4px rgba(0,0,0,0.3);">📍</div>
                        </div>
                        <div style="padding: 12px 16px; background: #f8f9fa; border-top: 1px solid #dee2e6;">
                            <p class="text-muted small mb-0" id="gravesite-picker-coords">Move the map to select location</p>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                        <button type="button" class="btn btn-primary" id="confirm-gravesite-pin">
                            <i class="fas fa-check me-2"></i>Confirm Location
                        </button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }

    const bsModal = new bootstrap.Modal(modal);

    modal.addEventListener('shown.bs.modal', () => {
        // Determine initial center - use existing gravesite or cemetery location or default
        let initialCenter = [-98.5795, 39.8283]; // Center of US
        let initialZoom = 4;

        if (gravesiteLocation) {
            initialCenter = [gravesiteLocation.lng, gravesiteLocation.lat];
            initialZoom = 18;
        } else if (cemeteryLocation) {
            initialCenter = [cemeteryLocation.lng, cemeteryLocation.lat];
            initialZoom = 17;
        }

        // Initialize or update map
        if (!gravesiteMapPicker) {
            gravesiteMapPicker = new mapboxgl.Map({
                container: 'gravesite-map-picker',
                style: 'mapbox://styles/mapbox/satellite-streets-v12',
                center: initialCenter,
                zoom: initialZoom
            });

            gravesiteMapPicker.addControl(new mapboxgl.NavigationControl(), 'top-right');

            // Add geolocate control
            const geolocate = new mapboxgl.GeolocateControl({
                positionOptions: { enableHighAccuracy: true },
                trackUserLocation: false,
                showUserHeading: false
            });
            gravesiteMapPicker.addControl(geolocate, 'top-left');

            // Update coordinates as map moves
            gravesiteMapPicker.on('move', () => {
                const center = gravesiteMapPicker.getCenter();
                document.getElementById('gravesite-picker-coords').textContent =
                    `Location: ${center.lat.toFixed(6)}, ${center.lng.toFixed(6)}`;
            });

            gravesiteMapPicker.on('load', () => {
                gravesiteMapPicker.resize();
                // Initial coordinates display
                const center = gravesiteMapPicker.getCenter();
                document.getElementById('gravesite-picker-coords').textContent =
                    `Location: ${center.lat.toFixed(6)}, ${center.lng.toFixed(6)}`;
            });
        } else {
            gravesiteMapPicker.setCenter(initialCenter);
            gravesiteMapPicker.setZoom(initialZoom);
            setTimeout(() => gravesiteMapPicker.resize(), 100);
            // Update coordinates display
            const center = gravesiteMapPicker.getCenter();
            document.getElementById('gravesite-picker-coords').textContent =
                `Location: ${center.lat.toFixed(6)}, ${center.lng.toFixed(6)}`;
        }
    }, { once: true });

    // Handle confirm button - get center of map
    document.getElementById('confirm-gravesite-pin').onclick = () => {
        if (gravesiteMapPicker) {
            const center = gravesiteMapPicker.getCenter();
            gravesiteLocation = {
                lat: center.lat,
                lng: center.lng,
                accuracy: null // Manual pin has no GPS accuracy
            };
            updateGravesiteUI();
            showToast('Gravesite location pinned!', 'success');
            bsModal.hide();
        } else {
            showToast('Map not ready, please try again', 'warning');
        }
    };

    bsModal.show();
}

// Remove gravesite pin
function removeGravesitePin() {
    gravesiteLocation = null;
    updateGravesiteUI();
    showToast('Gravesite pin removed', 'info');
}

async function geocodeCemeteryAddress(appRoot) {
    // Prevent duplicate requests
    if (isGeocoding) return;

    const addressInput = appRoot.querySelector('#memorial-cemetery-address');
    const geocodeBtn = appRoot.querySelector('#geocode-cemetery-btn');
    const statusEl = appRoot.querySelector('#geocode-status');
    const address = addressInput.value.trim();

    if (!address) {
        showToast('Please enter a cemetery address first', 'error');
        return;
    }

    isGeocoding = true;
    geocodeBtn.disabled = true;
    geocodeBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span>';
    statusEl.textContent = '';

    try {
        // Get session for API call
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
            throw new Error('You must be signed in to verify locations');
        }

        const response = await fetch('/api/geo/geocode', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.access_token}`
            },
            body: JSON.stringify({ address })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Geocoding failed');
        }

        const { lat, lng } = await response.json();

        if (lat && lng) {
            cemeteryLocation = { lat, lng };
            statusEl.innerHTML = '<i class="fas fa-check-circle text-success"></i> Location verified';
            showToast('Cemetery location verified successfully', 'success');
            showCemeteryMapPreview(appRoot, lat, lng, address);
        } else {
            throw new Error('Invalid location data received');
        }
    } catch (error) {
        console.error('Geocoding error:', error);
        showToast('Could not locate address. Please check and try again.', 'error');
        statusEl.innerHTML = '<i class="fas fa-exclamation-circle text-danger"></i> Location not found';
        cemeteryLocation = null;
    } finally {
        isGeocoding = false;
        geocodeBtn.disabled = false;
        geocodeBtn.innerHTML = '<i class="fas fa-map-marker-alt"></i> Verify';
    }
}

function showCemeteryMapPreview(appRoot, lat, lng, address) {
    if (typeof mapboxgl === 'undefined') {
        console.error('Mapbox GL not loaded');
        return;
    }

    const mapContainer = appRoot.querySelector('#cemetery-map-preview');
    mapContainer.style.display = 'block';

    // Remove existing map if any
    if (cemeteryMapPreview) {
        cemeteryMapPreview.remove();
        cemeteryMapPreview = null;
    }

    // Import config for mapbox token
    import('/js/config.js').then(configModule => {
        mapboxgl.accessToken = configModule.config.MAPBOX_ACCESS_TOKEN;

        cemeteryMapPreview = new mapboxgl.Map({
            container: mapContainer,
            style: 'mapbox://styles/mapbox/streets-v12',
            center: [lng, lat],
            zoom: 14
        });

        // Add marker
        new mapboxgl.Marker({ color: '#dc3545' })
            .setLngLat([lng, lat])
            .setPopup(new mapboxgl.Popup({ offset: 25 }).setHTML(`<h6>Cemetery Location</h6><p>${address}</p>`))
            .addTo(cemeteryMapPreview);

        cemeteryMapPreview.addControl(new mapboxgl.NavigationControl(), 'top-right');
    }).catch(err => {
        console.error('Error loading config:', err);
    });
}

function cleanupCemeteryMapPreview() {
    if (cemeteryMapPreview) {
        try {
            cemeteryMapPreview.remove();
        } catch (err) {
            console.error('Error removing cemetery map preview:', err);
        }
        cemeteryMapPreview = null;
    }
}

function cleanupLifePathMap() {
    if (lifePathMapInstance) {
        try {
            lifePathMapInstance.remove();
        } catch (err) {
            console.error('Error removing life path map:', err);
        }
        lifePathMapInstance = null;
    }
}

// --- Headstone Photo Upload ---
function setupHeadstonePhoto(appRoot) {
    const fileInput = appRoot.querySelector('#headstone-photo-input');
    const preview = appRoot.querySelector('#headstone-preview');
    const uploadContent = appRoot.querySelector('#headstone-upload-content');
    const uploadArea = appRoot.querySelector('#headstone-upload-area');
    const removeBtn = appRoot.querySelector('#headstone-remove-btn');

    if (!fileInput) return;

    fileInput.addEventListener('change', (e) => {
        const file = e.target.files?.[0];
        if (file) {
            headstonePhotoFile = file;
            const url = URL.createObjectURL(file);
            preview.src = url;
            preview.classList.remove('d-none');
            uploadContent.style.display = 'none';
            uploadArea.classList.add('has-image');
            removeBtn.classList.remove('d-none');
        }
    });

    removeBtn?.addEventListener('click', () => {
        headstonePhotoFile = null;
        preview.src = '';
        preview.classList.add('d-none');
        uploadContent.style.display = 'flex';
        uploadArea.classList.remove('has-image');
        removeBtn.classList.add('d-none');
        fileInput.value = '';
    });
}


// --- Life Path Map Functions ---
async function updateLifePathMap(appRoot) {
    const residences = getDynamicFieldValues(appRoot, 'residences');
    const mapContainer = appRoot.querySelector('#life-path-map');

    if (!mapContainer || residences.length === 0) {
        if (mapContainer) mapContainer.style.display = 'none';
        return;
    }

    // Geocode all addresses
    const locations = [];
    const { data: { session } } = await supabase.auth.getSession();

    for (const residence of residences) {
        if (!residence.address) continue;

        try {
            const response = await fetch('/api/geo/geocode', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session?.access_token || ''}`
                },
                body: JSON.stringify({ address: residence.address })
            });

            if (response.ok) {
                const { lat, lng } = await response.json();
                locations.push({
                    ...residence,
                    lat,
                    lng
                });
                // Store geocoded location for saving later
                geocodedResidenceLocations[residence.address] = { lat, lng };
            }
        } catch (error) {
            console.warn('Could not geocode:', residence.address);
        }
    }

    if (locations.length === 0) {
        mapContainer.style.display = 'none';
        return;
    }

    mapContainer.style.display = 'block';

    // Clean up existing map
    cleanupLifePathMap();

    try {
        const configModule = await import('/js/config.js');
        mapboxgl.accessToken = configModule.config.MAPBOX_ACCESS_TOKEN;

        // Calculate bounds
        const bounds = new mapboxgl.LngLatBounds();
        locations.forEach(loc => bounds.extend([loc.lng, loc.lat]));

        lifePathMapInstance = new mapboxgl.Map({
            container: mapContainer,
            style: 'mapbox://styles/mapbox/light-v11',
            bounds: bounds,
            fitBoundsOptions: { padding: 50 }
        });

        lifePathMapInstance.on('load', () => {
            // Add markers for each location
            locations.forEach((loc, index) => {
                const el = document.createElement('div');
                el.className = 'life-path-marker';
                el.innerHTML = `<span>${index + 1}</span>`;
                el.style.cssText = `
                    width: 30px;
                    height: 30px;
                    background: linear-gradient(135deg, #005F60, #007a7a);
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: white;
                    font-weight: bold;
                    font-size: 12px;
                    border: 3px solid white;
                    box-shadow: 0 2px 6px rgba(0,0,0,0.3);
                `;

                new mapboxgl.Marker(el)
                    .setLngLat([loc.lng, loc.lat])
                    .setPopup(new mapboxgl.Popup({ offset: 25 }).setHTML(`
                        <strong>${loc.address}</strong><br>
                        ${loc.startYear ? loc.startYear : ''} ${loc.startYear && loc.endYear ? '-' : ''} ${loc.endYear ? loc.endYear : ''}
                    `))
                    .addTo(lifePathMapInstance);
            });

            // Draw line connecting locations if more than one
            if (locations.length > 1) {
                lifePathMapInstance.addSource('route', {
                    type: 'geojson',
                    data: {
                        type: 'Feature',
                        properties: {},
                        geometry: {
                            type: 'LineString',
                            coordinates: locations.map(loc => [loc.lng, loc.lat])
                        }
                    }
                });

                lifePathMapInstance.addLayer({
                    id: 'route',
                    type: 'line',
                    source: 'route',
                    layout: {
                        'line-join': 'round',
                        'line-cap': 'round'
                    },
                    paint: {
                        'line-color': '#005F60',
                        'line-width': 3,
                        'line-dasharray': [2, 2]
                    }
                });
            }
        });

        lifePathMapInstance.addControl(new mapboxgl.NavigationControl(), 'top-right');
    } catch (err) {
        console.error('Error creating life path map:', err);
    }
}

// --- Photo Upload Functions (Supabase Storage) ---
async function uploadPhotoToStorage(file, memorialId, photoType = 'main') {
    if (!file) return null;

    // Validate file
    if (!file.type.startsWith('image/')) {
        throw new Error('File must be an image');
    }

    if (file.size > 10 * 1024 * 1024) { // 10MB limit
        throw new Error('Image must be smaller than 10MB');
    }

    const timestamp = Date.now();
    const filename = `${photoType}_${timestamp}_${file.name.replace(/[^a-zA-Z0-9.]/g, '_')}`;
    const filePath = `${memorialId}/${filename}`;

    const { data, error } = await supabase.storage
        .from('memorials')
        .upload(filePath, file, {
            cacheControl: '3600',
            upsert: false
        });

    if (error) {
        console.error('Upload error:', error);
        throw error;
    }

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
        .from('memorials')
        .getPublicUrl(filePath);

    return publicUrl;
}

async function handlePhotoUploads(appRoot, memorialId) {
    const mainPhotoInput = appRoot.querySelector('#main-photo');
    const galleryPhotosInput = appRoot.querySelector('#memorial-photos');
    const uploadedPhotos = {};

    try {
        // Upload headstone photo if captured
        if (headstonePhotoFile) {
            uploadedPhotos.headstonePhoto = await uploadPhotoToStorage(headstonePhotoFile, memorialId, 'headstone');
        }

        // Upload main photo if selected
        if (mainPhotoInput && mainPhotoInput.files.length > 0) {
            const mainPhoto = mainPhotoInput.files[0];
            uploadedPhotos.mainPhoto = await uploadPhotoToStorage(mainPhoto, memorialId, 'main');
        }

        // Upload gallery photos if selected
        if (galleryPhotosInput && galleryPhotosInput.files.length > 0) {
            const galleryFiles = Array.from(galleryPhotosInput.files);
            const galleryUrls = [];

            for (let i = 0; i < Math.min(galleryFiles.length, 20); i++) { // Limit to 20 photos
                const url = await uploadPhotoToStorage(galleryFiles[i], memorialId, `gallery_${i}`);
                galleryUrls.push(url);
            }

            uploadedPhotos.photos = galleryUrls;
        }

        return uploadedPhotos;
    } catch (error) {
        console.error('Photo upload failed:', error);
        throw error;
    }
}

function showPhotoPreview(appRoot, inputId, previewId) {
    const input = appRoot.querySelector(`#${inputId}`);
    const preview = appRoot.querySelector(`#${previewId}`);

    if (!input || !preview) return;

    input.addEventListener('change', (e) => {
        preview.innerHTML = '';
        const files = Array.from(e.target.files);
        const MAX_FILE_SIZE_MB = 10;
        const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

        files.slice(0, 20).forEach((file, index) => {
            // Validate file type immediately
            if (!file.type.startsWith('image/')) {
                showToast(`${file.name} is not an image file`, 'error');
                return;
            }

            // Validate file size BEFORE attempting to read
            if (file.size > MAX_FILE_SIZE_BYTES) {
                const sizeMB = (file.size / 1024 / 1024).toFixed(2);
                showToast(`${file.name} is too large (${sizeMB}MB). Maximum size is ${MAX_FILE_SIZE_MB}MB.`, 'error');
                return;
            }

            if (file.type.startsWith('image/')) {
                const reader = new FileReader();
                reader.onload = (event) => {
                    const col = document.createElement('div');
                    col.className = 'col-md-3 mb-2';
                    col.innerHTML = `
                        <div class="position-relative">
                            <img src="${event.target.result}" class="img-thumbnail" style="width: 100%; height: 150px; object-fit: cover;">
                            <button type="button" class="btn btn-sm btn-danger position-absolute top-0 end-0 m-1" data-remove-index="${index}">
                                <i class="fas fa-times"></i>
                            </button>
                        </div>
                    `;

                    const removeBtn = col.querySelector('[data-remove-index]');
                    removeBtn.addEventListener('click', () => {
                        col.remove();
                        // Remove file from input (requires rebuilding FileList)
                        const dt = new DataTransfer();
                        Array.from(input.files).forEach((f, i) => {
                            if (i !== index) dt.items.add(f);
                        });
                        input.files = dt.files;
                    });

                    preview.appendChild(col);
                };
                reader.readAsDataURL(file);
            }
        });
    });
}

async function saveMemorial(e, memorialId, appRoot, desiredStatus = 'draft') {
    e.preventDefault();
    const form = appRoot.querySelector('#memorialForm');
    if (!form.checkValidity()) {
        form.classList.add('was-validated');
        navigateToStep(1);
        showToast("Please fill out all required fields.", "error");
        return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        showToast("You must be signed in to save.", "error");
        return;
    }

    const saveButton = appRoot.querySelector(desiredStatus === 'draft' ? '#save-draft-button' : '#publish-button');
    saveButton.disabled = true;
    saveButton.innerHTML = `<span class="spinner-border spinner-border-sm"></span> Saving...`;

    try {
        const memorialName = appRoot.querySelector('#memorial-name').value;
        const newMemorialId = memorialId || generateSlugId(memorialName);

        const memorialData = {
            id: newMemorialId,
            name: memorialName,
            title: appRoot.querySelector('#memorial-title').value,
            birth_date: appRoot.querySelector('#memorial-birth-date').value,
            death_date: appRoot.querySelector('#memorial-death-date').value,
            bio: appRoot.querySelector('#memorial-story').value,
            cemetery_name: appRoot.querySelector('#memorial-cemetery-name').value,
            cemetery_address: appRoot.querySelector('#memorial-cemetery-address').value,
            relatives: getDynamicFieldValues(appRoot, 'relatives'),
            milestones: getDynamicFieldValues(appRoot, 'milestones'),
            residences: getDynamicFieldValues(appRoot, 'residences'),
            status: desiredStatus,
            tier: appRoot.querySelector('input[name="tier"]:checked')?.value || 'memorial',
        };

        // Add cemetery location if it was geocoded
        if (cemeteryLocation) {
            memorialData.cemetery_lat = cemeteryLocation.lat;
            memorialData.cemetery_lng = cemeteryLocation.lng;
        }

        // Add gravesite location if it was set
        if (gravesiteLocation) {
            memorialData.gravesite_lat = gravesiteLocation.lat;
            memorialData.gravesite_lng = gravesiteLocation.lng;
            memorialData.gravesite_accuracy = gravesiteLocation.accuracy || null;
        }

        if (!memorialId) {
            memorialData.curator_ids = [user.id];
            memorialData.curators = [{ uid: user.id, email: user.email }];
        }

        // Upload photos first
        saveButton.innerHTML = `<span class="spinner-border spinner-border-sm"></span> Uploading photos...`;
        const uploadedPhotos = await handlePhotoUploads(appRoot, newMemorialId);

        // Add photo URLs to memorial data
        if (uploadedPhotos.headstonePhoto) memorialData.headstone_photo = uploadedPhotos.headstonePhoto;
        if (uploadedPhotos.mainPhoto) memorialData.main_photo = uploadedPhotos.mainPhoto;
        if (uploadedPhotos.photos) memorialData.photos = uploadedPhotos.photos;

        // Use INSERT for new memorials, UPDATE for existing ones
        // (upsert doesn't work well with RLS policies that check curator_ids)
        let error;
        if (!memorialId) {
            // New memorial - INSERT
            const result = await supabase
                .from('memorials')
                .insert(memorialData);
            error = result.error;
        } else {
            // Existing memorial - UPDATE (don't send id in the update data)
            const { id, ...updateData } = memorialData;
            const result = await supabase
                .from('memorials')
                .update(updateData)
                .eq('id', memorialId);
            error = result.error;
        }

        if (error) throw error;

        // Create any pending family connections
        await createPendingConnections(newMemorialId);

        // Save family nearby members
        await saveFamilyNearby(newMemorialId);

        showToast(`Memorial ${desiredStatus}!`, 'success');

        // If published, show success modal with share options and tag upsell
        if (desiredStatus === 'published') {
            showSuccessModal(appRoot, newMemorialId, memorialData.name);
        } else {
            // For drafts, just navigate to list
            window.dispatchEvent(new CustomEvent('navigate', { detail: `/memorial-list?status=${desiredStatus}` }));
        }
    } catch (error) {
        console.error("Error saving memorial:", error);
        // Provide clearer error messages for common issues
        if (error.code === '42501' || error.message?.includes('row-level security')) {
            showToast("You don't have permission to edit this memorial. Only curators can make changes.", 'error');
        } else {
            showToast(`Error saving memorial: ${error.message}`, 'error');
        }
    } finally {
        saveButton.disabled = false;
        saveButton.innerHTML = desiredStatus === 'draft' ? 'Save Draft' : 'Publish';
    }
}

function showSuccessModal(appRoot, memorialId, memorialName) {
    const modal = new bootstrap.Modal(appRoot.querySelector('#successModal'));

    // Set memorial name in modal
    const nameEl = appRoot.querySelector('#success-memorial-name');
    if (nameEl) nameEl.textContent = `"${memorialName}" is now live!`;

    const memorialUrl = `${window.location.origin}/memorial?id=${memorialId}`;

    // Copy link button
    appRoot.querySelector('#copy-link-btn')?.addEventListener('click', () => {
        navigator.clipboard.writeText(memorialUrl).then(() => {
            showToast('Link copied to clipboard!', 'success');
        });
    });

    // WhatsApp share
    const whatsappBtn = appRoot.querySelector('#share-whatsapp-btn');
    if (whatsappBtn) {
        const text = encodeURIComponent(`I just created a memorial for ${memorialName}. View it here: ${memorialUrl}`);
        whatsappBtn.href = `https://wa.me/?text=${text}`;
    }

    // Email share
    const emailBtn = appRoot.querySelector('#share-email-btn');
    if (emailBtn) {
        const subject = encodeURIComponent(`Memorial for ${memorialName}`);
        const body = encodeURIComponent(`I created a digital memorial for ${memorialName}.\n\nView it here: ${memorialUrl}\n\nYou can add photos, stories, and tributes.`);
        emailBtn.href = `mailto:?subject=${subject}&body=${body}`;
    }

    // Helper to clean up modal and navigate
    function cleanupAndNavigate(path) {
        // Hide modal first
        modal.hide();
        // Remove any leftover modal backdrops
        document.querySelectorAll('.modal-backdrop').forEach(el => el.remove());
        document.body.classList.remove('modal-open');
        document.body.style.removeProperty('overflow');
        document.body.style.removeProperty('padding-right');
        // Navigate after cleanup
        window.dispatchEvent(new CustomEvent('navigate', { detail: path }));
    }

    // View memorial button
    const viewBtn = appRoot.querySelector('#view-memorial-btn');
    if (viewBtn) {
        viewBtn.href = `/memorial?id=${memorialId}`;
        viewBtn.setAttribute('data-route', '');
        viewBtn.addEventListener('click', (e) => {
            e.preventDefault();
            cleanupAndNavigate(`/memorial?id=${memorialId}`);
        });
    }

    // Order tag button
    const orderTagBtn = appRoot.querySelector('#order-tag-from-success-btn');
    if (orderTagBtn) {
        orderTagBtn.href = `/order-tag?id=${memorialId}`;
        orderTagBtn.setAttribute('data-route', '');
        orderTagBtn.addEventListener('click', (e) => {
            e.preventDefault();
            cleanupAndNavigate(`/order-tag?id=${memorialId}`);
        });
    }

    modal.show();
}

function getDynamicFieldValues(appRoot, type) {
    const container = appRoot.querySelector(`#${type}-container`);
    if (!container) return [];

    return Array.from(container.querySelectorAll('.dynamic-input-group')).map(group => {
        if (type === 'relatives') {
            const nameInput = group.querySelector('.relative-name-input');
            if (!nameInput || !nameInput.value) return null;
            const relationshipSelect = group.querySelector('.relative-relationship-input');
            const otherInput = group.querySelector('.relative-other-input');
            const relationship = relationshipSelect.value === 'Other' ? otherInput.value : relationshipSelect.value;
            return {
                name: nameInput.value,
                relationship: relationship || '',
                memorialId: group.querySelector('.relative-memorial-id').value || '',
                dates: group.querySelector('.relative-dates').value || ''
            };
        }
        if (type === 'milestones') {
            const titleInput = group.querySelector('.milestone-title-input');
            if (!titleInput || !titleInput.value) return null;
            return {
                title: titleInput.value,
                description: group.querySelector('.milestone-desc-input').value || '',
                year: group.querySelector('.milestone-year-input').value || '',
            };
        }
        if (type === 'residences') {
            const addressInput = group.querySelector('.residence-address-input');
            if (!addressInput || !addressInput.value) return null;
            const address = addressInput.value;
            const residence = {
                address: address,
                startYear: group.querySelector('.residence-start-input').value || '',
                endYear: group.querySelector('.residence-end-input').value || '',
            };
            // Include geocoded location if available
            if (geocodedResidenceLocations[address]) {
                residence.location = geocodedResidenceLocations[address];
            }
            return residence;
        }
        return null;
    }).filter(Boolean);
}

function addDynamicField(appRoot, type, values = {}) {
    const container = appRoot.querySelector(`#${type}-container`);
    if (!container) return;
    const newField = document.createElement('div');
    newField.className = 'row g-2 mb-2 dynamic-input-group align-items-center';
    let newFieldHtml = '';

    if (type === 'relatives') {
        newFieldHtml = `
            <div class="col-md-5"><input type="text" class="form-control form-control-sm relative-name-input" placeholder="Name" value="${values.name || ''}" required></div>
            <div class="col-md-4">
                <select class="form-select form-select-sm relative-relationship-input">
                    <option value="" disabled ${!values.relationship ? 'selected' : ''}>Relationship</option>
                    ${commonRelationships.map(r => `<option value="${r}" ${values.relationship === r ? 'selected' : ''}>${r}</option>`).join('')}
                    <option value="Other">Other</option>
                </select>
                <input type="text" class="form-control form-control-sm mt-1 relative-other-input" style="display: none;" placeholder="e.g. Mentor">
            </div>
            <div class="col-md-2 d-flex gap-1"><button type="button" class="btn btn-sm btn-outline-primary link-btn" title="Link to existing memorial">Link</button></div>
            <div class="col-md-1"><button type="button" class="btn btn-sm btn-outline-danger remove-btn">×</button></div>
            <input type="hidden" class="relative-memorial-id" value="${values.memorialId || ''}">
            <input type="hidden" class="relative-dates" value="${values.dates || ''}">
        `;
    } else if (type === 'milestones') {
        newFieldHtml = `
            <div class="col-5"><input type="text" class="form-control form-control-sm milestone-title-input" placeholder="Title" value="${values.title || ''}"></div>
            <div class="col-3"><input type="text" class="form-control form-control-sm milestone-year-input" placeholder="Year" value="${values.year || ''}"></div>
            <div class="col-3"><input type="text" class="form-control form-control-sm milestone-desc-input" placeholder="Description" value="${values.description || ''}"></div>
            <div class="col-1"><button type="button" class="btn btn-sm btn-outline-danger remove-btn">×</button></div>
        `;
    } else if (type === 'residences') {
        newFieldHtml = `
            <div class="col-6"><input type="text" class="form-control form-control-sm residence-address-input" placeholder="Address" value="${values.address || ''}"></div>
            <div class="col-2"><input type="text" class="form-control form-control-sm residence-start-input" placeholder="Start Year" value="${values.startYear || ''}"></div>
            <div class="col-2"><input type="text" class="form-control form-control-sm residence-end-input" placeholder="End Year" value="${values.endYear || ''}"></div>
            <div class="col-2"><button type="button" class="btn btn-sm btn-outline-danger remove-btn">×</button></div>
        `;
    }
    newField.innerHTML = newFieldHtml;
    newField.querySelector('.remove-btn')?.addEventListener('click', (e) => e.target.closest('.dynamic-input-group').remove());

    // Add link button handler for relatives
    if (type === 'relatives') {
        const linkBtn = newField.querySelector('.link-btn');
        linkBtn?.addEventListener('click', () => {
            openMemorialSearchModal(newField, appRoot);
        });

        // If already linked, show linked state
        if (values.memorialId) {
            linkBtn?.classList.add('linked');
            if (linkBtn) {
                linkBtn.innerHTML = '<i class="fas fa-check"></i>';
                linkBtn.title = 'Already linked to a memorial';
            }
            // Add badge
            const nameInputCol = newField.querySelector('.relative-name-input')?.parentElement;
            if (nameInputCol) {
                const badge = document.createElement('span');
                badge.className = 'relative-linked-badge';
                badge.innerHTML = `<i class="fas fa-link"></i> Linked`;
                nameInputCol.appendChild(badge);
            }
        }
    }

    container.appendChild(newField);
}

function populateForm(data, appRoot) {
    // Clear existing dynamic fields before populating to prevent duplicates
    // (This can happen if router runs twice due to auth state changes)
    const relativesContainer = appRoot.querySelector('#relatives-container');
    const milestonesContainer = appRoot.querySelector('#milestones-container');
    const residencesContainer = appRoot.querySelector('#residences-container');

    if (relativesContainer) relativesContainer.innerHTML = '';
    if (milestonesContainer) milestonesContainer.innerHTML = '';
    if (residencesContainer) residencesContainer.innerHTML = '';

    appRoot.querySelector('#memorial-name').value = data.name || '';
    appRoot.querySelector('#memorial-title').value = data.title || '';
    appRoot.querySelector('#memorial-birth-date').value = data.birth_date || '';
    appRoot.querySelector('#memorial-death-date').value = data.death_date || '';
    appRoot.querySelector('#memorial-story').value = data.bio || data.story || '';
    appRoot.querySelector('#memorial-cemetery-name').value = data.cemetery_name || '';
    appRoot.querySelector('#memorial-cemetery-address').value = data.cemetery_address || '';
    originalAddress = data.cemetery_address || '';

    // Load cemetery location if it exists
    if (data.cemetery_lat && data.cemetery_lng) {
        cemeteryLocation = { lat: data.cemetery_lat, lng: data.cemetery_lng };
        const statusEl = appRoot.querySelector('#geocode-status');
        if (statusEl) {
            statusEl.innerHTML = '<i class="fas fa-check-circle text-success"></i> Location verified';
        }
        showCemeteryMapPreview(
            appRoot,
            data.cemetery_lat,
            data.cemetery_lng,
            data.cemetery_address || 'Cemetery Location'
        );
    } else if (data.location_lat && data.location_lng) {
        // Fallback to general location if no cemetery-specific location (from Scout mode)
        cemeteryLocation = { lat: data.location_lat, lng: data.location_lng };
        const statusEl = appRoot.querySelector('#geocode-status');
        if (statusEl) {
            statusEl.innerHTML = '<i class="fas fa-map-pin text-info"></i> Using memorial location';
        }
        showCemeteryMapPreview(
            appRoot,
            data.location_lat,
            data.location_lng,
            data.cemetery_address || data.cemetery_name || 'Memorial Location'
        );
    }

    // Load gravesite location if it exists
    if (data.gravesite_lat && data.gravesite_lng) {
        gravesiteLocation = {
            lat: data.gravesite_lat,
            lng: data.gravesite_lng,
            accuracy: data.gravesite_accuracy || null
        };
        updateGravesiteUI();
    }

    if (data.tier) {
        const tierRadioButton = appRoot.querySelector(`input[name="tier"][value="${data.tier}"]`);
        if (tierRadioButton) {
            tierRadioButton.checked = true;
            tierRadioButton.dispatchEvent(new Event('change'));
        }
    }

    if (data.relatives && Array.isArray(data.relatives)) {
        data.relatives.forEach(relative => addDynamicField(appRoot, 'relatives', relative));
    }
    if (data.milestones && Array.isArray(data.milestones)) {
        data.milestones.forEach(milestone => addDynamicField(appRoot, 'milestones', milestone));
    }
    if (data.residences && Array.isArray(data.residences)) {
        data.residences.forEach(residence => {
            addDynamicField(appRoot, 'residences', residence);
            // Load existing geocoded locations
            if (residence.location && residence.address) {
                geocodedResidenceLocations[residence.address] = residence.location;
            }
        });
    }

    // Load existing headstone photo if present
    if (data.headstone_photo) {
        const preview = appRoot.querySelector('#headstone-preview');
        const uploadContent = appRoot.querySelector('#headstone-upload-content');
        const uploadArea = appRoot.querySelector('#headstone-upload-area');
        const removeBtn = appRoot.querySelector('#headstone-remove-btn');

        if (preview && uploadContent) {
            preview.src = data.headstone_photo;
            preview.classList.remove('d-none');
            uploadContent.style.display = 'none';
            uploadArea?.classList.add('has-image');
            removeBtn?.classList.remove('d-none');
        }
    }

    // Load existing main photo if present
    if (data.main_photo) {
        const previewContainer = appRoot.querySelector('#main-photo-preview');
        if (previewContainer) {
            previewContainer.innerHTML = `
                <div class="existing-photo-preview d-flex align-items-center gap-3 p-3 bg-light rounded mt-2">
                    <div class="position-relative" style="flex-shrink: 0;">
                        <img src="${data.main_photo}" class="rounded" style="width: 120px; height: 120px; object-fit: cover;">
                        <span class="badge bg-success position-absolute top-0 start-0">Current</span>
                    </div>
                    <div>
                        <strong class="d-block text-dark">Photo already uploaded</strong>
                        <small class="text-muted">Select a new file above to replace it</small>
                    </div>
                </div>
            `;
        }
    }

    // Load existing gallery photos if present
    if (data.photos && Array.isArray(data.photos) && data.photos.length > 0) {
        const galleryPreview = appRoot.querySelector('#photos-preview');
        if (galleryPreview) {
            galleryPreview.innerHTML = data.photos.map((photoUrl, index) => `
                <div class="col-md-3 mb-2 existing-photo-preview">
                    <div class="position-relative">
                        <img src="${photoUrl}" class="img-thumbnail" style="width: 100%; height: 150px; object-fit: cover;">
                        <span class="badge bg-secondary position-absolute top-0 start-0 m-1">${index + 1}</span>
                    </div>
                </div>
            `).join('');

            // Add note about adding more photos
            const noteEl = document.createElement('div');
            noteEl.className = 'col-12 mt-2';
            noteEl.innerHTML = '<small class="text-muted"><i class="fas fa-info-circle me-1"></i>Select new files to add more photos to the gallery</small>';
            galleryPreview.appendChild(noteEl);
        }
    }
}

// --- Collaborators Functions ---
let currentMemorialIdForCollaborators = null;
let currentUserRole = null;
let collaboratorsLoadingPromise = null; // Prevent concurrent loads

async function initializeCollaborators(appRoot, memorialId) {
    if (!memorialId) return;

    currentMemorialIdForCollaborators = memorialId;

    // Show the collaborators section
    const section = appRoot.querySelector('#collaborators-section');
    if (section) section.style.display = 'block';

    // Load collaborators
    await loadCollaborators(appRoot, memorialId);

    // Setup invite button
    appRoot.querySelector('#send-invite-btn')?.addEventListener('click', () => sendInvite(appRoot, memorialId));
}

async function loadCollaborators(appRoot, memorialId) {
    // If already loading, wait for the existing request to complete
    if (collaboratorsLoadingPromise) {
        return collaboratorsLoadingPromise;
    }

    const loading = appRoot.querySelector('#collaborators-loading');
    const empty = appRoot.querySelector('#collaborators-empty');
    const container = appRoot.querySelector('#collaborators-container');
    const inviteForm = appRoot.querySelector('.collaborator-invite-form');

    if (loading) loading.style.display = 'block';
    if (empty) empty.style.display = 'none';
    if (container) container.innerHTML = '';

    const loadPromise = (async () => {
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) return;

            const response = await fetch(`/api/collaborators/list?memorialId=${encodeURIComponent(memorialId)}`, {
                headers: {
                    'Authorization': `Bearer ${session.access_token}`
                }
            });

            if (!response.ok) {
                throw new Error('Failed to load collaborators');
            }

            const { collaborators, currentUserRole: role, canInvite } = await response.json();
            currentUserRole = role;

            // Show/hide invite form based on permission
            if (inviteForm) {
                inviteForm.style.display = canInvite ? 'block' : 'none';
            }

            if (loading) loading.style.display = 'none';

            // Clear container again in case a race condition occurred
            if (container) container.innerHTML = '';

            if (!collaborators || collaborators.length === 0) {
                if (empty) empty.style.display = 'block';
                return;
            }

            // Render collaborators
            collaborators.forEach(collab => {
                const card = createCollaboratorCard(collab, appRoot, memorialId);
                container.appendChild(card);
            });

        } catch (error) {
            console.error('Error loading collaborators:', error);
            if (loading) loading.style.display = 'none';
            showToast('Could not load collaborators', 'error');
        } finally {
            collaboratorsLoadingPromise = null;
        }
    })();

    collaboratorsLoadingPromise = loadPromise;
    return loadPromise;
}

function createCollaboratorCard(collab, appRoot, memorialId) {
    const card = document.createElement('div');
    card.className = `collaborator-card ${collab.status === 'pending' ? 'pending' : ''}`;

    const initial = (collab.displayName || collab.email || '?')[0].toUpperCase();
    const isOwner = currentUserRole === 'owner';
    const isPending = collab.status === 'pending';
    const canManage = isOwner && collab.role !== 'owner';

    card.innerHTML = `
        <div class="collaborator-avatar">
            ${collab.avatarUrl ? `<img src="${collab.avatarUrl}" alt="">` : initial}
        </div>
        <div class="collaborator-info">
            <div class="collaborator-name">${collab.displayName || collab.email}</div>
            <div class="collaborator-email">${collab.email}${isPending ? ' (invite pending)' : ''}</div>
        </div>
        <span class="collaborator-role ${isPending ? 'pending' : collab.role}">
            ${isPending ? 'Pending' : collab.role}
        </span>
        ${canManage ? `
            <div class="collaborator-actions">
                ${isPending ? `
                    <button class="btn btn-sm btn-outline-primary copy-invite-btn" title="Copy invite link">
                        <i class="fas fa-link"></i>
                    </button>
                ` : ''}
                <button class="btn btn-sm btn-outline-danger remove-collab-btn" title="Remove">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        ` : ''}
    `;

    // Add event listeners
    const copyBtn = card.querySelector('.copy-invite-btn');
    if (copyBtn) {
        copyBtn.addEventListener('click', async () => {
            try {
                const { data: { session } } = await supabase.auth.getSession();
                const response = await fetch('/api/collaborators/manage', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${session.access_token}`
                    },
                    body: JSON.stringify({
                        collaboratorId: collab.id,
                        memorialId,
                        action: 'resend_invite'
                    })
                });
                const { inviteUrl } = await response.json();
                await navigator.clipboard.writeText(inviteUrl);
                showToast('Invite link copied!', 'success');
            } catch (e) {
                showToast('Failed to copy link', 'error');
            }
        });
    }

    const removeBtn = card.querySelector('.remove-collab-btn');
    if (removeBtn) {
        removeBtn.addEventListener('click', async () => {
            if (!confirm(`Remove ${collab.email} from this memorial?`)) return;

            try {
                const { data: { session } } = await supabase.auth.getSession();
                const response = await fetch('/api/collaborators/manage', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${session.access_token}`
                    },
                    body: JSON.stringify({
                        collaboratorId: collab.id,
                        memorialId,
                        action: 'remove'
                    })
                });

                if (response.ok) {
                    card.remove();
                    showToast('Collaborator removed', 'success');
                } else {
                    throw new Error('Failed to remove');
                }
            } catch (e) {
                showToast('Failed to remove collaborator', 'error');
            }
        });
    }

    return card;
}

async function sendInvite(appRoot, memorialId) {
    const emailInput = appRoot.querySelector('#invite-email');
    const roleSelect = appRoot.querySelector('#invite-role');
    const sendBtn = appRoot.querySelector('#send-invite-btn');

    const email = emailInput?.value.trim();
    const role = roleSelect?.value;

    if (!email) {
        showToast('Please enter an email address', 'error');
        return;
    }

    if (!email.includes('@')) {
        showToast('Please enter a valid email address', 'error');
        return;
    }

    sendBtn.disabled = true;
    sendBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span>';

    try {
        const { data: { session } } = await supabase.auth.getSession();

        const response = await fetch('/api/collaborators/invite', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.access_token}`
            },
            body: JSON.stringify({
                memorialId,
                email,
                role
            })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to send invite');
        }

        showToast(data.message, 'success');

        // Show invite URL for copying
        if (data.invite?.inviteUrl && data.invite.status === 'pending') {
            const urlBox = document.createElement('div');
            urlBox.className = 'invite-url-box';
            urlBox.innerHTML = `
                <code>${data.invite.inviteUrl}</code>
                <button class="btn btn-sm btn-success copy-url-btn">
                    <i class="fas fa-copy"></i> Copy
                </button>
            `;
            appRoot.querySelector('.collaborator-invite-form').appendChild(urlBox);

            urlBox.querySelector('.copy-url-btn').addEventListener('click', async () => {
                await navigator.clipboard.writeText(data.invite.inviteUrl);
                showToast('Link copied!', 'success');
            });

            // Remove after 30 seconds
            setTimeout(() => urlBox.remove(), 30000);
        }

        // Clear input and reload list
        emailInput.value = '';
        await loadCollaborators(appRoot, memorialId);

    } catch (error) {
        console.error('Invite error:', error);
        showToast(error.message, 'error');
    } finally {
        sendBtn.disabled = false;
        sendBtn.innerHTML = '<i class="fas fa-paper-plane me-1"></i>Send Invite';
    }
}

// --- Family Nearby Functions ---
async function initializeFamilyNearby(appRoot, memorialId) {
    // Reset state
    familyNearbyMembers = [];
    familyNearbyToDelete = [];

    // Wire up add button
    appRoot.querySelector('#add-family-nearby-btn')?.addEventListener('click', () => {
        addFamilyNearbyField(appRoot, {});
    });

    // Load existing family members if editing
    if (memorialId) {
        await loadFamilyNearby(appRoot, memorialId);
    }
}

async function loadFamilyNearby(appRoot, memorialId) {
    const container = appRoot.querySelector('#family-nearby-container');
    if (!container) return;

    try {
        const response = await fetch(`/api/family/list?memorialId=${encodeURIComponent(memorialId)}`);
        if (!response.ok) return;

        const { familyMembers } = await response.json();
        familyNearbyMembers = familyMembers.all || [];

        // Render existing members
        container.innerHTML = '';
        familyNearbyMembers.forEach(member => {
            addFamilyNearbyField(appRoot, member);
        });
    } catch (error) {
        console.error('Error loading family nearby:', error);
    }
}

function addFamilyNearbyField(appRoot, values = {}) {
    const container = appRoot.querySelector('#family-nearby-container');
    if (!container) return;

    const fieldId = values.id || `new_${Date.now()}`;
    const newField = document.createElement('div');
    newField.className = 'family-nearby-field card mb-3';
    newField.dataset.familyId = fieldId;

    newField.innerHTML = `
        <div class="card-body py-2 px-3">
            <div class="row g-2 align-items-center">
                <div class="col-md-3">
                    <input type="text" class="form-control form-control-sm family-nearby-name"
                           placeholder="Name" value="${escapeHtml(values.name || '')}" required>
                </div>
                <div class="col-md-2">
                    <select class="form-select form-select-sm family-nearby-relationship">
                        <option value="" disabled ${!values.relationship ? 'selected' : ''}>Relation</option>
                        ${commonRelationships.map(r => `<option value="${r}" ${values.relationship === r ? 'selected' : ''}>${r}</option>`).join('')}
                    </select>
                </div>
                <div class="col-md-3">
                    <select class="form-select form-select-sm family-nearby-burial-status">
                        ${burialStatusOptions.map(opt =>
                            `<option value="${opt.value}" ${values.burial_status === opt.value ? 'selected' : ''}>${opt.label}</option>`
                        ).join('')}
                    </select>
                </div>
                <div class="col-md-3">
                    <input type="text" class="form-control form-control-sm family-nearby-cemetery"
                           placeholder="Cemetery name (optional)" value="${escapeHtml(values.cemetery_name || '')}">
                </div>
                <div class="col-md-1 text-end">
                    <button type="button" class="btn btn-sm btn-outline-danger family-nearby-remove" title="Remove">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            </div>
            <div class="row g-2 mt-1">
                <div class="col-md-3">
                    <input type="date" class="form-control form-control-sm family-nearby-birth"
                           placeholder="Birth date" value="${values.birth_date || ''}">
                    <small class="text-muted">Birth date</small>
                </div>
                <div class="col-md-3">
                    <input type="date" class="form-control form-control-sm family-nearby-death"
                           placeholder="Death date" value="${values.death_date || ''}">
                    <small class="text-muted">Death date</small>
                </div>
                ${values.gravesite_lat ? `
                    <div class="col-md-6">
                        <span class="badge bg-success"><i class="fas fa-check me-1"></i>Location pinned</span>
                    </div>
                ` : ''}
            </div>
        </div>
    `;

    // Wire up remove button
    newField.querySelector('.family-nearby-remove')?.addEventListener('click', () => {
        if (values.id) {
            familyNearbyToDelete.push(values.id);
        }
        newField.remove();
    });

    container.appendChild(newField);
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function collectFamilyNearbyData(appRoot) {
    const container = appRoot.querySelector('#family-nearby-container');
    if (!container) return [];

    const fields = container.querySelectorAll('.family-nearby-field');
    const data = [];

    fields.forEach(field => {
        const name = field.querySelector('.family-nearby-name')?.value?.trim();
        if (!name) return; // Skip empty entries

        data.push({
            id: field.dataset.familyId?.startsWith('new_') ? null : field.dataset.familyId,
            name,
            relationship: field.querySelector('.family-nearby-relationship')?.value || null,
            burial_status: field.querySelector('.family-nearby-burial-status')?.value || 'unknown',
            cemetery_name: field.querySelector('.family-nearby-cemetery')?.value?.trim() || null,
            birth_date: field.querySelector('.family-nearby-birth')?.value || null,
            death_date: field.querySelector('.family-nearby-death')?.value || null
        });
    });

    return data;
}

async function saveFamilyNearby(memorialId) {
    const appRoot = document.querySelector('.memorial-form-app');
    if (!appRoot) return;

    const familyData = collectFamilyNearbyData(appRoot);

    try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;

        // Delete removed members
        for (const id of familyNearbyToDelete) {
            await fetch('/api/family/manage', {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.access_token}`
                },
                body: JSON.stringify({ id })
            });
        }

        // Create or update members
        for (const member of familyData) {
            if (member.id) {
                // Update existing
                await fetch('/api/family/manage', {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${session.access_token}`
                    },
                    body: JSON.stringify({
                        id: member.id,
                        name: member.name,
                        relationship: member.relationship,
                        burialStatus: member.burial_status,
                        cemeteryName: member.cemetery_name,
                        birthDate: member.birth_date,
                        deathDate: member.death_date
                    })
                });
            } else {
                // Create new
                await fetch('/api/family/manage', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${session.access_token}`
                    },
                    body: JSON.stringify({
                        memorialId,
                        name: member.name,
                        relationship: member.relationship,
                        burialStatus: member.burial_status,
                        cemeteryName: member.cemetery_name,
                        birthDate: member.birth_date,
                        deathDate: member.death_date
                    })
                });
            }
        }

        // Reset delete list
        familyNearbyToDelete = [];
    } catch (error) {
        console.error('Error saving family nearby:', error);
    }
}

// --- Biography Helper Functions ---
let bioHelperModal = null;

function initializeBioHelper(appRoot) {
    const modalEl = appRoot.querySelector('#bioHelperModal');
    if (!modalEl) return;

    bioHelperModal = new bootstrap.Modal(modalEl);

    // Open modal button
    appRoot.querySelector('#open-bio-helper-btn')?.addEventListener('click', () => {
        const personName = appRoot.querySelector('#memorial-name').value || 'this person';
        appRoot.querySelector('#bio-helper-person-name').textContent = personName;

        // Reset the form
        resetBioHelper(appRoot);
        bioHelperModal.show();
    });

    // Track progress as user types
    const promptInputs = appRoot.querySelectorAll('.bio-prompt-input');
    promptInputs.forEach(input => {
        input.addEventListener('input', () => updateBioHelperProgress(appRoot));
    });

    // Generate button
    appRoot.querySelector('#generate-bio-btn')?.addEventListener('click', () => generateBiography(appRoot));

    // Use biography button
    appRoot.querySelector('#use-bio-btn')?.addEventListener('click', () => {
        const generatedBio = appRoot.querySelector('#bio-preview-content').value;
        const storyTextarea = appRoot.querySelector('#memorial-story');
        if (storyTextarea && generatedBio) {
            storyTextarea.value = generatedBio;
            showToast('Biography added to your story!', 'success');
            bioHelperModal.hide();
        }
    });
}

function resetBioHelper(appRoot) {
    // Clear all prompt inputs
    appRoot.querySelectorAll('.bio-prompt-input').forEach(input => {
        input.value = '';
        input.closest('.bio-prompt-card')?.classList.remove('has-answer');
    });

    // Reset progress
    updateBioHelperProgress(appRoot);

    // Hide preview section
    const previewSection = appRoot.querySelector('#bio-preview-section');
    if (previewSection) previewSection.style.display = 'none';

    // Hide use button, show generate button
    const generateBtn = appRoot.querySelector('#generate-bio-btn');
    const useBtn = appRoot.querySelector('#use-bio-btn');
    if (generateBtn) generateBtn.style.display = '';
    if (useBtn) useBtn.style.display = 'none';

    // Hide error
    const errorEl = appRoot.querySelector('#bio-helper-error');
    if (errorEl) errorEl.style.display = 'none';
}

function updateBioHelperProgress(appRoot) {
    const inputs = appRoot.querySelectorAll('.bio-prompt-input');
    let answered = 0;

    inputs.forEach(input => {
        const hasValue = input.value.trim().length > 0;
        input.closest('.bio-prompt-card')?.classList.toggle('has-answer', hasValue);
        if (hasValue) answered++;
    });

    const progressBar = appRoot.querySelector('#bio-helper-progress-bar');
    const progressText = appRoot.querySelector('#bio-helper-progress-text');
    const generateBtn = appRoot.querySelector('#generate-bio-btn');

    const percentage = (answered / inputs.length) * 100;

    if (progressBar) progressBar.style.width = `${percentage}%`;
    if (progressText) progressText.textContent = `${answered} of ${inputs.length} questions answered`;
    if (generateBtn) generateBtn.disabled = answered === 0;
}

async function generateBiography(appRoot) {
    const generateBtn = appRoot.querySelector('#generate-bio-btn');
    const useBtn = appRoot.querySelector('#use-bio-btn');
    const previewSection = appRoot.querySelector('#bio-preview-section');
    const previewContent = appRoot.querySelector('#bio-preview-content');
    const errorEl = appRoot.querySelector('#bio-helper-error');

    // Gather answers
    const answers = {
        family: appRoot.querySelector('#bio-prompt-family')?.value.trim() || '',
        career: appRoot.querySelector('#bio-prompt-career')?.value.trim() || '',
        earlylife: appRoot.querySelector('#bio-prompt-earlylife')?.value.trim() || '',
        hobbies: appRoot.querySelector('#bio-prompt-hobbies')?.value.trim() || '',
        personality: appRoot.querySelector('#bio-prompt-personality')?.value.trim() || '',
        community: appRoot.querySelector('#bio-prompt-community')?.value.trim() || '',
        remember: appRoot.querySelector('#bio-prompt-remember')?.value.trim() || ''
    };

    // Check at least one answer
    if (!Object.values(answers).some(v => v)) {
        showToast('Please answer at least one question', 'error');
        return;
    }

    // Get other data
    const name = appRoot.querySelector('#memorial-name')?.value || 'Unknown';
    const birthDate = appRoot.querySelector('#memorial-birth-date')?.value || '';
    const deathDate = appRoot.querySelector('#memorial-death-date')?.value || '';

    // Show loading state
    generateBtn.disabled = true;
    generateBtn.classList.add('loading');
    generateBtn.innerHTML = '<i class="fas fa-spinner me-2"></i>Generating...';
    errorEl.style.display = 'none';

    try {
        const response = await fetch('/api/ai/generate-biography', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                name,
                birthDate,
                deathDate,
                answers
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to generate biography');
        }

        const { biography } = await response.json();

        // Display the biography in editable textarea
        previewContent.value = biography;
        previewSection.style.display = 'block';

        // Show use button
        useBtn.style.display = '';

        // Scroll to preview
        previewSection.scrollIntoView({ behavior: 'smooth', block: 'center' });

        showToast('Biography generated! Edit if needed, then click "Use This Biography".', 'success');

    } catch (error) {
        console.error('Biography generation error:', error);
        errorEl.textContent = error.message || 'Failed to generate biography. Please try again.';
        errorEl.style.display = 'block';
    } finally {
        generateBtn.disabled = false;
        generateBtn.classList.remove('loading');
        generateBtn.innerHTML = '<i class="fas fa-magic me-2"></i>Generate Biography';
        updateBioHelperProgress(appRoot);
    }
}

// --- Memorial Search/Linking Functions ---
function initializeMemorialSearch(appRoot, currentMemorialId) {
    const modalEl = appRoot.querySelector('#memorialSearchModal');
    if (!modalEl) return;

    memorialSearchModal = new bootstrap.Modal(modalEl);
    const searchInput = appRoot.querySelector('#memorial-search-input');
    const resultsContainer = appRoot.querySelector('#memorial-search-results');
    const selectedContainer = appRoot.querySelector('#memorial-search-selected');
    const confirmBtn = appRoot.querySelector('#confirm-memorial-link-btn');
    const clearBtn = appRoot.querySelector('#clear-memorial-selection');

    // Debounced search
    searchInput?.addEventListener('input', (e) => {
        clearTimeout(searchDebounceTimer);
        const query = e.target.value.trim();

        if (query.length < 2) {
            resultsContainer.innerHTML = `
                <div class="search-empty-state text-center py-4 text-muted">
                    <i class="fas fa-users fa-2x mb-2 opacity-50"></i>
                    <p class="mb-0">Type a name to search existing memorials</p>
                </div>
            `;
            return;
        }

        resultsContainer.innerHTML = `
            <div class="search-loading">
                <i class="fas fa-spinner fa-spin me-2"></i>Searching...
            </div>
        `;

        searchDebounceTimer = setTimeout(() => searchMemorials(query, currentMemorialId, resultsContainer, appRoot), 300);
    });

    // Clear selection
    clearBtn?.addEventListener('click', () => {
        clearMemorialSelection(appRoot);
    });

    // Confirm link
    confirmBtn?.addEventListener('click', () => {
        confirmMemorialLink(appRoot);
    });

    // Reset on modal close
    modalEl.addEventListener('hidden.bs.modal', () => {
        searchInput.value = '';
        clearMemorialSelection(appRoot);
        resultsContainer.innerHTML = `
            <div class="search-empty-state text-center py-4 text-muted">
                <i class="fas fa-users fa-2x mb-2 opacity-50"></i>
                <p class="mb-0">Type a name to search existing memorials</p>
            </div>
        `;
        currentLinkingRelativeGroup = null;
    });
}

async function searchMemorials(query, excludeId, resultsContainer, appRoot) {
    try {
        const excludeParam = excludeId ? `&exclude=${encodeURIComponent(excludeId)}` : '';
        const response = await fetch(`/api/memorials/search?q=${encodeURIComponent(query)}${excludeParam}`);

        if (!response.ok) throw new Error('Search failed');

        const { results } = await response.json();

        if (!results || results.length === 0) {
            resultsContainer.innerHTML = `
                <div class="search-no-results">
                    <i class="fas fa-search fa-2x mb-2 opacity-50"></i>
                    <p class="mb-0">No memorials found for "${query}"</p>
                    <small class="text-muted">Try a different name or create a new memorial later</small>
                </div>
            `;
            return;
        }

        resultsContainer.innerHTML = results.map(m => `
            <div class="memorial-search-result" data-memorial-id="${m.id}" data-memorial-name="${m.name}" data-memorial-dates="${m.dateRange || ''}" data-memorial-photo="${m.photo || ''}">
                ${m.photo
                    ? `<img src="${m.photo}" alt="" class="memorial-search-photo">`
                    : `<div class="memorial-search-photo-placeholder">${m.name[0].toUpperCase()}</div>`
                }
                <div class="memorial-search-info">
                    <div class="memorial-search-name">${m.name}</div>
                    ${m.dateRange ? `<div class="memorial-search-dates">${m.dateRange}</div>` : ''}
                </div>
                <i class="fas fa-chevron-right text-muted"></i>
            </div>
        `).join('');

        // Add click handlers
        resultsContainer.querySelectorAll('.memorial-search-result').forEach(el => {
            el.addEventListener('click', () => selectMemorial(el, appRoot));
        });

    } catch (error) {
        console.error('Memorial search error:', error);
        resultsContainer.innerHTML = `
            <div class="search-no-results text-danger">
                <i class="fas fa-exclamation-circle fa-2x mb-2"></i>
                <p class="mb-0">Search failed. Please try again.</p>
            </div>
        `;
    }
}

function selectMemorial(element, appRoot) {
    const id = element.dataset.memorialId;
    const name = element.dataset.memorialName;
    const dates = element.dataset.memorialDates;
    const photo = element.dataset.memorialPhoto;

    // Update UI
    const selectedContainer = appRoot.querySelector('#memorial-search-selected');
    const confirmBtn = appRoot.querySelector('#confirm-memorial-link-btn');

    appRoot.querySelector('#selected-memorial-id').value = id;
    appRoot.querySelector('#selected-memorial-name').textContent = name;
    appRoot.querySelector('#selected-memorial-dates').textContent = dates;

    const photoEl = appRoot.querySelector('#selected-memorial-photo');
    if (photo) {
        photoEl.src = photo;
        photoEl.style.display = 'block';
    } else {
        photoEl.style.display = 'none';
    }

    selectedContainer.classList.remove('d-none');
    confirmBtn.disabled = false;

    // Highlight selected result
    appRoot.querySelectorAll('.memorial-search-result').forEach(el => el.classList.remove('selected'));
    element.classList.add('selected');
}

function clearMemorialSelection(appRoot) {
    const selectedContainer = appRoot.querySelector('#memorial-search-selected');
    const confirmBtn = appRoot.querySelector('#confirm-memorial-link-btn');

    appRoot.querySelector('#selected-memorial-id').value = '';
    selectedContainer.classList.add('d-none');
    confirmBtn.disabled = true;

    appRoot.querySelectorAll('.memorial-search-result').forEach(el => el.classList.remove('selected'));
}

function confirmMemorialLink(appRoot) {
    const selectedId = appRoot.querySelector('#selected-memorial-id').value;
    const selectedName = appRoot.querySelector('#selected-memorial-name').textContent;

    if (!selectedId || !currentLinkingRelativeGroup) return;

    // Update the relative field with the linked memorial ID
    const memorialIdInput = currentLinkingRelativeGroup.querySelector('.relative-memorial-id');
    if (memorialIdInput) {
        memorialIdInput.value = selectedId;
    }

    // IMPORTANT: Fill in the name field with the linked memorial's name
    const nameInput = currentLinkingRelativeGroup.querySelector('.relative-name-input');
    if (nameInput && selectedName) {
        nameInput.value = selectedName;
    }

    // Update the Link button to show it's linked
    const linkBtn = currentLinkingRelativeGroup.querySelector('.link-btn');
    if (linkBtn) {
        linkBtn.classList.add('linked');
        linkBtn.innerHTML = '<i class="fas fa-check"></i>';
        linkBtn.title = `Linked to ${selectedName}`;
    }

    // Add a visual badge
    const existingBadge = currentLinkingRelativeGroup.querySelector('.relative-linked-badge');
    if (!existingBadge) {
        if (nameInput) {
            const badge = document.createElement('span');
            badge.className = 'relative-linked-badge';
            badge.innerHTML = `<i class="fas fa-link"></i> Linked`;
            nameInput.parentElement.appendChild(badge);
        }
    }

    // Store the pending connection
    const relationshipSelect = currentLinkingRelativeGroup.querySelector('.relative-relationship-input');
    const relationship = relationshipSelect?.value || 'Other';

    // Check if connection already pending
    const existingIndex = pendingConnections.findIndex(c => c.connectedMemorialId === selectedId);
    if (existingIndex >= 0) {
        pendingConnections[existingIndex].relationship = relationship;
    } else {
        pendingConnections.push({
            connectedMemorialId: selectedId,
            relationship: relationship
        });
    }

    showToast(`Linked to ${selectedName}`, 'success');
    memorialSearchModal.hide();
}

function openMemorialSearchModal(relativeGroup, appRoot) {
    currentLinkingRelativeGroup = relativeGroup;

    // Pre-fill search with relative's name if available
    const nameInput = relativeGroup.querySelector('.relative-name-input');
    const searchInput = appRoot.querySelector('#memorial-search-input');

    // Show modal first
    memorialSearchModal.show();

    // Then pre-fill and trigger search after modal is visible
    if (nameInput?.value && searchInput) {
        setTimeout(() => {
            searchInput.value = nameInput.value;
            searchInput.dispatchEvent(new Event('input'));
            searchInput.focus();
        }, 150);
    } else if (searchInput) {
        // Focus the search input even if no name pre-filled
        setTimeout(() => searchInput.focus(), 150);
    }
}

async function createPendingConnections(memorialId) {
    if (pendingConnections.length === 0) return;

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    for (const connection of pendingConnections) {
        try {
            await fetch('/api/connections/create', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.access_token}`
                },
                body: JSON.stringify({
                    memorialId,
                    connectedMemorialId: connection.connectedMemorialId,
                    relationship: connection.relationship
                })
            });
        } catch (error) {
            console.error('Failed to create connection:', error);
        }
    }

    // Clear pending connections
    pendingConnections = [];
}

async function initializePage(appRoot, urlParams) {
    initializeWizard(appRoot);
    const memorialId = urlParams.get('id');
    const tierFromURL = urlParams.get('tier');

    if (tierFromURL && !memorialId) {
        const tierRadioButton = appRoot.querySelector(`input[name="tier"][value="${tierFromURL}"]`);
        if (tierRadioButton) {
            tierRadioButton.checked = true;
            tierRadioButton.dispatchEvent(new Event('change'));
        }
    }

    if (memorialId) {
        const { data, error } = await supabase
            .from('memorials')
            .select('*')
            .eq('id', memorialId)
            .single();

        if (error) {
            console.error('Error loading memorial:', error);
            showToast('Memorial not found.', 'error');
            return;
        }

        if (data) {
            populateForm(data, appRoot);
            // Initialize collaborators for existing memorials
            initializeCollaborators(appRoot, memorialId);
        }
    }

    // Initialize family nearby (works for both new and existing memorials)
    await initializeFamilyNearby(appRoot, memorialId);

    navigateToStep(1);

    appRoot.querySelector('#add-milestone-button')?.addEventListener('click', () => addDynamicField(appRoot, 'milestones'));
    appRoot.querySelector('#add-relative-button')?.addEventListener('click', () => addDynamicField(appRoot, 'relatives'));
    appRoot.querySelector('#add-residence-button')?.addEventListener('click', () => {
        addDynamicField(appRoot, 'residences');
        // Debounce map update
        clearTimeout(window.lifePathMapTimeout);
        window.lifePathMapTimeout = setTimeout(() => updateLifePathMap(appRoot), 1000);
    });

    // Setup headstone photo upload
    setupHeadstonePhoto(appRoot);

    // Setup Biography Helper
    initializeBioHelper(appRoot);

    // Setup Memorial Search/Linking
    initializeMemorialSearch(appRoot, memorialId);

    // Wire up cemetery location buttons
    appRoot.querySelector('#use-my-location-btn')?.addEventListener('click', () => useMyLocation(appRoot));
    appRoot.querySelector('#geocode-cemetery-btn')?.addEventListener('click', () => geocodeCemeteryAddress(appRoot));

    // Wire up gravesite pin buttons
    appRoot.querySelector('#set-gravesite-gps-btn')?.addEventListener('click', setGravesiteGPS);
    appRoot.querySelector('#set-gravesite-map-btn')?.addEventListener('click', openGravesiteMapPicker);
    appRoot.querySelector('#update-gravesite-btn')?.addEventListener('click', setGravesiteGPS);
    appRoot.querySelector('#remove-gravesite-btn')?.addEventListener('click', removeGravesitePin);

    // Auto-geocode when user leaves the address field (if address changed and not empty)
    const addressInput = appRoot.querySelector('#memorial-cemetery-address');
    if (addressInput) {
        addressInput.addEventListener('blur', () => {
            const currentAddress = addressInput.value.trim();
            if (currentAddress && currentAddress !== originalAddress && currentAddress.length > 10) {
                // Auto-geocode if address is new and substantial
                setTimeout(() => geocodeCemeteryAddress(appRoot), 300);
            }
        });
    }

    // Setup photo previews
    showPhotoPreview(appRoot, 'main-photo', 'main-photo-preview');
    showPhotoPreview(appRoot, 'memorial-photos', 'photos-preview');

    appRoot.querySelector('#memorialForm')?.addEventListener('submit', (e) => saveMemorial(e, memorialId, appRoot, 'draft'));
    appRoot.querySelector('#save-draft-button')?.addEventListener('click', (e) => saveMemorial(e, memorialId, appRoot, 'draft'));
    appRoot.querySelector('#publish-button')?.addEventListener('click', (e) => saveMemorial(e, memorialId, appRoot, 'published'));
}

// Cleanup on page unload
export function cleanupMemorialForm() {
    cleanupCemeteryMapPreview();
    cleanupLifePathMap();
    cemeteryLocation = null;
    headstonePhotoFile = null;
    collaboratorsLoadingPromise = null;
    currentMemorialIdForCollaborators = null;
    currentUserRole = null;
    pendingConnections = [];
    currentLinkingRelativeGroup = null;
    geocodedResidenceLocations = {};
    if (bioHelperModal) {
        bioHelperModal.hide();
        bioHelperModal = null;
    }
    if (memorialSearchModal) {
        memorialSearchModal.hide();
        memorialSearchModal = null;
    }
}

export async function loadMemorialForm(appRoot, urlParams) {
    try {
        const response = await fetch('/pages/memorial-form.html');
        if (!response.ok) throw new Error('HTML content not found');
        appRoot.innerHTML = await response.text();
        await initializePage(appRoot, urlParams);
    } catch (error) {
        console.error("Failed to load memorial form page:", error);
    }
}
