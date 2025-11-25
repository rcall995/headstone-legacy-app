import { supabase } from '/js/supabase-client.js';
import { showToast } from '/js/utils/toasts.js';

// --- Module-level State Variables ---
let currentStep = 1;
const TOTAL_STEPS = 5;
const commonRelationships = ["Spouse", "Parent", "Father", "Mother", "Son", "Daughter", "Sibling", "Brother", "Sister", "Grandparent", "Grandfather", "Grandmother", "Grandchild", "Grandson", "Granddaughter"];
let originalAddress = '';
let cemeteryLocation = null; // Store geocoded cemetery location { lat, lng }
let cemeteryMapPreview = null; // Map instance for preview

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
async function geocodeCemeteryAddress(appRoot) {
    const addressInput = appRoot.querySelector('#memorial-cemetery-address');
    const geocodeBtn = appRoot.querySelector('#geocode-cemetery-btn');
    const statusEl = appRoot.querySelector('#geocode-status');
    const address = addressInput.value.trim();

    if (!address) {
        showToast('Please enter a cemetery address first', 'error');
        return;
    }

    geocodeBtn.disabled = true;
    geocodeBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Locating...';
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
        geocodeBtn.disabled = false;
        geocodeBtn.innerHTML = '<i class="fas fa-map-marker-alt"></i> Verify Location';
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
            name_lowercase: memorialName.toLowerCase(),
            title: appRoot.querySelector('#memorial-title').value,
            birth_date: appRoot.querySelector('#memorial-birth-date').value,
            death_date: appRoot.querySelector('#memorial-death-date').value,
            story: appRoot.querySelector('#memorial-story').value,
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

        if (!memorialId) {
            memorialData.curator_ids = [user.id];
            memorialData.curators = [{ uid: user.id, email: user.email }];
        }

        // Upload photos first
        saveButton.innerHTML = `<span class="spinner-border spinner-border-sm"></span> Uploading photos...`;
        const uploadedPhotos = await handlePhotoUploads(appRoot, newMemorialId);

        // Add photo URLs to memorial data
        if (uploadedPhotos.mainPhoto) memorialData.main_photo = uploadedPhotos.mainPhoto;
        if (uploadedPhotos.photos) memorialData.photos = uploadedPhotos.photos;

        // Save/update memorial using upsert
        const { error } = await supabase
            .from('memorials')
            .upsert(memorialData, { onConflict: 'id' });

        if (error) throw error;

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
        showToast(`Error saving memorial: ${error.message}`, 'error');
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

    // View memorial button
    const viewBtn = appRoot.querySelector('#view-memorial-btn');
    if (viewBtn) {
        viewBtn.href = `/memorial?id=${memorialId}`;
        viewBtn.setAttribute('data-route', '');
        viewBtn.addEventListener('click', (e) => {
            e.preventDefault();
            modal.hide();
            window.dispatchEvent(new CustomEvent('navigate', { detail: `/memorial?id=${memorialId}` }));
        });
    }

    // Order tag button
    const orderTagBtn = appRoot.querySelector('#order-tag-from-success-btn');
    if (orderTagBtn) {
        orderTagBtn.href = `/order-tag?id=${memorialId}`;
        orderTagBtn.setAttribute('data-route', '');
        orderTagBtn.addEventListener('click', (e) => {
            e.preventDefault();
            modal.hide();
            window.dispatchEvent(new CustomEvent('navigate', { detail: `/order-tag?id=${memorialId}` }));
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
            return {
                address: addressInput.value,
                startYear: group.querySelector('.residence-start-input').value || '',
                endYear: group.querySelector('.residence-end-input').value || '',
            };
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
    container.appendChild(newField);
}

function populateForm(data, appRoot) {
    appRoot.querySelector('#memorial-name').value = data.name || '';
    appRoot.querySelector('#memorial-title').value = data.title || '';
    appRoot.querySelector('#memorial-birth-date').value = data.birth_date || '';
    appRoot.querySelector('#memorial-death-date').value = data.death_date || '';
    appRoot.querySelector('#memorial-story').value = data.story || '';
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
        data.residences.forEach(residence => addDynamicField(appRoot, 'residences', residence));
    }
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
        }
    }

    navigateToStep(1);

    appRoot.querySelector('#add-milestone-button')?.addEventListener('click', () => addDynamicField(appRoot, 'milestones'));
    appRoot.querySelector('#add-relative-button')?.addEventListener('click', () => addDynamicField(appRoot, 'relatives'));
    appRoot.querySelector('#add-residence-button')?.addEventListener('click', () => addDynamicField(appRoot, 'residences'));

    // Wire up cemetery geocoding button
    appRoot.querySelector('#geocode-cemetery-btn')?.addEventListener('click', () => geocodeCemeteryAddress(appRoot));

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
    appRoot.querySelector('#publish-button')?.addEventListener('click', (e) => saveMemorial(e, memorialId, appRoot, 'published'));
}

// Cleanup on page unload
export function cleanupMemorialForm() {
    cleanupCemeteryMapPreview();
    cemeteryLocation = null;
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
