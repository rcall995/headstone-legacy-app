// memorial-template.js - Supabase version
import { supabase } from '/js/supabase-client.js';
import { config } from '/js/config.js';
import { showToast } from '/js/utils/toasts.js';

// --- MODULE STATE ---
let memorialSubscription = null;
let gravesiteMap = null;
let residencesMap = null;
let galleryImages = [];
let currentUser = null;
let currentMemorialId = null;
let currentMemorialData = null;
let lightCandleModal = null;
let recentCandlesModal = null;
let reminderModal = null;
let manageRemindersModal = null;
let tributeModal = null;
let tributePhotoFile = null;
let voiceRecordingModal = null;
let mediaRecorder = null;
let audioChunks = [];
let recordedBlob = null;
let uploadedAudioFile = null;
let recordingTimer = null;
let recordingSeconds = 0;
let shareModal = null;

// --- HISTORICAL DATA ---
const historicalEvents = [
    { year: 1776, event: 'U.S. Declaration of Independence is signed', type: 'historical' },
    { year: 1804, event: 'Lewis and Clark Expedition begins', type: 'historical' },
    { year: 1825, event: 'Erie Canal opens, connecting the Great Lakes to the Atlantic', type: 'historical' },
    { year: 1849, event: 'The California Gold Rush begins', type: 'historical' },
    { year: 1861, event: 'The American Civil War begins', type: 'historical' },
    { year: 1869, event: 'First Transcontinental Railroad is completed in the U.S.', type: 'historical' },
    { year: 1876, event: 'Alexander Graham Bell is granted a patent for the telephone', type: 'historical' },
    { year: 1903, event: 'The Wright brothers make the first successful powered airplane flight', type: 'historical' },
    { year: 1908, event: 'The Ford Model T is introduced, revolutionizing transportation', type: 'historical' },
    { year: 1914, event: 'World War I Begins', type: 'historical' },
    { year: 1920, event: 'The 19th Amendment gives U.S. women the right to vote', type: 'historical' },
    { year: 1929, event: 'The Great Depression Begins', type: 'historical' },
    { year: 1939, event: 'World War II Begins', type: 'historical' },
    { year: 1941, event: 'The Attack on Pearl Harbor occurs', type: 'historical' },
    { year: 1950, event: 'The Korean War begins', type: 'historical' },
    { year: 1957, event: 'Sputnik 1 is launched by the Soviet Union, starting the Space Race', type: 'historical' },
    { year: 1963, event: 'Martin Luther King Jr. delivers his "I Have a Dream" speech', type: 'historical' },
    { year: 1969, event: 'Apollo 11 lands on the Moon', type: 'historical' },
    { year: 1989, event: 'The Berlin Wall falls, signaling the end of the Cold War', type: 'historical' },
    { year: 1991, event: 'The World Wide Web becomes publicly available', type: 'historical' },
    { year: 2001, event: 'The September 11th Attacks occur', type: 'historical' },
    { year: 2007, event: 'The first Apple iPhone is released', type: 'historical' },
    { year: 2020, event: 'The COVID-19 Pandemic Begins', type: 'historical' },
];

// --- UTILITY FUNCTIONS ---
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function getYear(dateString) {
    if (!dateString || typeof dateString !== 'string') return null;
    if (/^\d{4}$/.test(dateString)) return parseInt(dateString);
    const date = new Date(dateString);
    return isNaN(date.getFullYear()) ? null : date.getFullYear();
}

function formatDateString(dateString) {
    if (!dateString) return '';
    if (/^\d{4}$/.test(dateString)) return dateString;
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return dateString;
    const options = { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' };
    return date.toLocaleDateString('en-US', options);
}

function calculateAge(birthDateString, eventYear) {
    if (!birthDateString || !eventYear) return null;
    const birthYear = getYear(birthDateString);
    const eventYr = getYear(eventYear.toString());
    if (birthYear === null || eventYr === null || eventYr < birthYear) return null;
    return eventYr - birthYear;
}


// --- RENDER FUNCTIONS ---
function renderHeader(data) {
    document.getElementById('display-name').textContent = data.name || 'Unnamed Memorial';
    document.getElementById('display-dates').textContent = `${formatDateString(data.birth_date)} - ${formatDateString(data.death_date)}`;
    const mainMediaEl = document.getElementById('display-main-media');
    if (data.main_photo) {
        mainMediaEl.innerHTML = '';
        const img = document.createElement('img');
        img.src = data.main_photo;
        img.alt = data.name || 'Memorial photo';
        img.className = 'img-fluid rounded shadow';
        mainMediaEl.appendChild(img);
    } else {
        mainMediaEl.innerHTML = '';
    }
    const editBtn = document.getElementById('edit-memorial-button');
    if (currentUser && data.curator_ids?.includes(currentUser.id)) {
        editBtn.style.display = 'inline-block';
        editBtn.href = `/memorial-form?id=${data.id}`;
    } else {
        editBtn.style.display = 'none';
    }
}

function renderBio(data) {
    const bioCard = document.getElementById('bio-card');
    if (data.story) {
        bioCard.style.display = 'block';
        const escapedStory = escapeHtml(data.story).replace(/\n/g, '<br>');
        bioCard.innerHTML = `
            <div class="card-body">
                <h5 class="card-title"><i class="fas fa-book-open me-2"></i> Biography</h5>
                <p>${escapedStory}</p>
            </div>
        `;
    } else {
        bioCard.style.display = 'none';
    }
}

function renderTimeline(data) {
    const timelineCard = document.getElementById('timeline-card');
    const birthYear = getYear(data.birth_date);
    const deathYear = getYear(data.death_date);
    const personalMilestones = (data.milestones || []).map(m => ({ ...m, type: 'personal' }));
    let lifetimeEvents = [];
    if (birthYear && deathYear) {
        lifetimeEvents = historicalEvents.filter(e => e.year >= birthYear && e.year <= deathYear);
    }

    const allEvents = [...personalMilestones, ...lifetimeEvents].sort((a, b) => (getYear(a.year) || 0) - (getYear(b.year) || 0));

    if (allEvents.length > 0) {
        timelineCard.style.display = 'block';
        let timelineHTML = `
            <div class="card-body">
                <h5 class="card-title"><i class="fas fa-stream me-2"></i> Life Timeline</h5>
                <ul class="timeline">
        `;
        allEvents.forEach(item => {
            const age = calculateAge(data.birth_date, item.year);
            const ageDisplay = age !== null ? ` (Age ${age})` : '';
            timelineHTML += `
                <li class="timeline-item ${item.type === 'historical' ? 'timeline-item-historical' : ''}">
                    <div class="timeline-item-year">${item.year}${ageDisplay}</div>
                    <p>${item.title || item.event}</p>
                    ${item.description ? `<small class="text-muted">${item.description}</small>` : ''}
                </li>
            `;
        });
        timelineHTML += `</ul></div>`;
        timelineCard.innerHTML = timelineHTML;
    } else {
        timelineCard.style.display = 'none';
    }
}

function renderGallery(data) {
    const galleryCard = document.getElementById('gallery-card');
    galleryImages = data.photos || [];
    if (galleryImages.length > 0) {
        galleryCard.style.display = 'block';
        let galleryHTML = `
            <div class="card-body">
                <h5 class="card-title"><i class="fas fa-images me-2"></i> Photo Gallery</h5>
                <div class="row g-2">
        `;
        galleryImages.forEach((url, index) => {
            galleryHTML += `
                <div class="col-4 col-md-3">
                    <a href="#" class="photo-gallery-item" data-bs-toggle="modal" data-bs-target="#imageZoomModal" data-index="${index}">
                        <img src="${url}" class="img-fluid" alt="Gallery image ${index + 1}">
                    </a>
                </div>
            `;
        });
        galleryHTML += `</div></div>`;
        galleryCard.innerHTML = galleryHTML;
    } else {
        galleryCard.style.display = 'none';
    }
}

function renderFamily(data) {
    const familyCard = document.getElementById('family-card');
    const relatives = data.relatives || [];
    if (relatives.length > 0) {
        familyCard.style.display = 'block';
        let familyHTML = `
            <div class="card-body">
                <h5 class="card-title"><i class="fas fa-users me-2"></i> Family</h5>
                <ul class="list-group list-group-flush">
        `;
        relatives.forEach(relative => {
            familyHTML += `
                <li class="list-group-item d-flex justify-content-between align-items-center">
                    <div>
                        <strong>${escapeHtml(relative.name)}</strong><br>
                        <small class="text-muted">${escapeHtml(relative.relationship)}</small>
                    </div>
                    ${relative.memorialId ? `<a href="/memorial?id=${relative.memorialId}" class="btn btn-sm btn-outline-secondary" data-route>View</a>` : ''}
                </li>
            `;
        });
        familyHTML += `</ul></div>`;
        familyCard.innerHTML = familyHTML;
    } else {
        familyCard.style.display = 'none';
    }
}

function renderResidences(data) {
    const residencesCard = document.getElementById('residences-card');
    const residences = data.residences || [];
    if (residences.length > 0) {
        residencesCard.style.display = 'block';
        let residencesHTML = `
            <div class="card-body">
                <h5 class="card-title"><i class="fas fa-home me-2"></i> Residences</h5>
                <ul class="list-group list-group-flush">
        `;
        residences.forEach(residence => {
            const age = calculateAge(data.birth_date, residence.startYear);
            const ageDisplay = age !== null ? ` (Age ${age})` : '';
            residencesHTML += `
                <li class="list-group-item">
                    <strong>${escapeHtml(residence.address)}</strong><br>
                    <small class="text-muted">${residence.startYear || ''}${ageDisplay} - ${residence.endYear || ''}</small>
                </li>
            `;
        });
        residencesHTML += `</ul></div>`;
        residencesCard.innerHTML = residencesHTML;
    } else {
        residencesCard.style.display = 'none';
    }
}

function renderResidencesMap(data) {
    const residencesMapCard = document.getElementById('residences-map-card');
    const geocodedResidences = (data.residences || [])
        .filter(r => r.location && r.location.lat && r.location.lng)
        .sort((a, b) => (getYear(a.startYear) || 0) - (getYear(b.startYear) || 0));

    if (geocodedResidences.length > 0) {
        residencesMapCard.style.display = 'block';

        if (typeof mapboxgl === 'undefined') {
            console.error('Mapbox GL library is not loaded');
            const container = document.getElementById('residences-map-container');
            if (container) {
                container.innerHTML = '<div class="alert alert-warning">Map library failed to load. Please refresh the page.</div>';
            }
            return;
        }

        mapboxgl.accessToken = config.MAPBOX_ACCESS_TOKEN;
        residencesMap = new mapboxgl.Map({
            container: 'residences-map-container',
            style: 'mapbox://styles/mapbox/streets-v12',
            center: [geocodedResidences[0].location.lng, geocodedResidences[0].location.lat],
            zoom: 5
        });

        residencesMap.on('load', () => {
            const coordinates = [];
            const bounds = new mapboxgl.LngLatBounds();

            geocodedResidences.forEach((residence, index) => {
                const coords = [residence.location.lng, residence.location.lat];
                coordinates.push(coords);

                const popupHTML = `<h6>${escapeHtml(`${index + 1}. ${residence.address}`)}</h6><p>${escapeHtml(residence.startYear || '')} - ${escapeHtml(residence.endYear || '')}</p>`;

                new mapboxgl.Marker()
                    .setLngLat(coords)
                    .setPopup(new mapboxgl.Popup({ offset: 25 }).setHTML(popupHTML))
                    .addTo(residencesMap);
                bounds.extend(coords);
            });

            if (coordinates.length > 1) {
                residencesMap.addSource('route', {
                    'type': 'geojson',
                    'data': {
                        'type': 'Feature',
                        'properties': {},
                        'geometry': {
                            'type': 'LineString',
                            'coordinates': coordinates
                        }
                    }
                });
                residencesMap.addLayer({
                    'id': 'route',
                    'type': 'line',
                    'source': 'route',
                    'layout': {
                        'line-join': 'round',
                        'line-cap': 'round'
                    },
                    'paint': {
                        'line-color': '#005F60',
                        'line-width': 3
                    }
                });
                residencesMap.fitBounds(bounds, { padding: 60 });
            }
        });
    } else {
        residencesMapCard.style.display = 'none';
    }
}

function renderCemeteryMap(data) {
    const mapCard = document.getElementById('map-card');

    // Priority: 1) cemetery_lat/lng, 2) location_lat/lng (from Scout mode), 3) none
    let lat, lng, locationName;

    if (data.cemetery_lat && data.cemetery_lng) {
        lat = data.cemetery_lat;
        lng = data.cemetery_lng;
        locationName = data.cemetery_name || 'Cemetery Location';
    } else if (data.location_lat && data.location_lng) {
        lat = data.location_lat;
        lng = data.location_lng;
        locationName = data.cemetery_name || data.name || 'Memorial Location';
    } else {
        mapCard.style.display = 'none';
        return;
    }

    if (typeof mapboxgl === 'undefined') {
        console.error('Mapbox GL library is not loaded');
        mapCard.innerHTML = '<div class="alert alert-warning m-3">Map library failed to load.</div>';
        mapCard.style.display = 'block';
        return;
    }

    mapCard.style.display = 'block';

    const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;

    mapCard.innerHTML = `
        <div class="card-body">
            <h5 class="card-title"><i class="fas fa-map-marked-alt me-2"></i> Cemetery Location</h5>
            ${data.cemetery_address ? `<p class="text-muted mb-2">${escapeHtml(data.cemetery_address)}</p>` : ''}
            <div class="mb-2">
                <a href="${directionsUrl}" target="_blank" class="btn btn-sm btn-outline-primary">
                    <i class="fas fa-directions me-1"></i> Get Directions
                </a>
            </div>
            <div id="cemetery-map-container" style="height: 350px; border-radius: 8px; overflow: hidden;"></div>
            <div id="nearby-memorials-container" class="mt-3"></div>
        </div>
    `;

    mapboxgl.accessToken = config.MAPBOX_ACCESS_TOKEN;

    setTimeout(() => {
        gravesiteMap = new mapboxgl.Map({
            container: 'cemetery-map-container',
            style: 'mapbox://styles/mapbox/streets-v12',
            center: [lng, lat],
            zoom: 15
        });

        const markerColor = data.cemetery_lat ? '#dc3545' : '#0d6efd';
        new mapboxgl.Marker({ color: markerColor })
            .setLngLat([lng, lat])
            .setPopup(
                new mapboxgl.Popup({ offset: 25 })
                    .setHTML(`<h6>${escapeHtml(locationName)}</h6>`)
            )
            .addTo(gravesiteMap);

        gravesiteMap.addControl(new mapboxgl.NavigationControl(), 'top-right');

        findNearbyMemorials(lat, lng, data.id, data.cemetery_name);
    }, 100);
}

// Function to find nearby memorials (within ~500m)
async function findNearbyMemorials(lat, lng, currentMemorialId, cemeteryName) {
    try {
        const { data: memorials, error } = await supabase
            .from('memorials')
            .select('id, name, cemetery_name, cemetery_lat, cemetery_lng, location_lat, location_lng')
            .in('status', ['published', 'approved']);

        if (error) throw error;

        const nearby = [];

        memorials.forEach(memorial => {
            if (memorial.id === currentMemorialId) return;

            const memLat = memorial.cemetery_lat || memorial.location_lat;
            const memLng = memorial.cemetery_lng || memorial.location_lng;

            if (memLat && memLng) {
                const distance = calculateDistance(lat, lng, memLat, memLng);

                if (distance < 0.5) {
                    nearby.push({
                        id: memorial.id,
                        name: memorial.name,
                        distance: distance,
                        cemeteryName: memorial.cemetery_name
                    });
                }
            }
        });

        if (nearby.length > 0) {
            const container = document.getElementById('nearby-memorials-container');
            if (container) {
                nearby.sort((a, b) => a.distance - b.distance);
                const nearbyHTML = `
                    <hr>
                    <h6 class="text-muted">
                        <i class="fas fa-map-pin me-2"></i>
                        Nearby Memorials ${cemeteryName ? `in ${escapeHtml(cemeteryName)}` : ''}
                    </h6>
                    <div class="list-group list-group-flush">
                        ${nearby.slice(0, 5).map(m => `
                            <a href="/memorial?id=${m.id}" class="list-group-item list-group-item-action" data-route>
                                <div class="d-flex w-100 justify-content-between">
                                    <h6 class="mb-1">${escapeHtml(m.name)}</h6>
                                    <small>${(m.distance * 1000).toFixed(0)}m away</small>
                                </div>
                            </a>
                        `).join('')}
                    </div>
                `;
                container.innerHTML = nearbyHTML;
            }
        }
    } catch (error) {
        console.error('Error finding nearby memorials:', error);
    }
}

function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

function toRad(degrees) {
    return degrees * (Math.PI / 180);
}


// --- CANDLE FUNCTIONS ---
function renderCandleCount(count) {
    const countEl = document.getElementById('candle-count');
    if (countEl) {
        countEl.textContent = count || 0;
    }

    // Animate flame if there are candles
    const flameEl = document.getElementById('candle-flame');
    if (flameEl && count > 0) {
        flameEl.classList.add('lit');
    }
}

async function loadRecentCandles(memorialId) {
    const listEl = document.getElementById('recent-candles-list');
    if (!listEl) return;

    try {
        const { data: candles, error } = await supabase
            .from('candles')
            .select('*')
            .eq('memorial_id', memorialId)
            .order('lit_at', { ascending: false })
            .limit(20);

        if (error) throw error;

        if (!candles || candles.length === 0) {
            listEl.innerHTML = `
                <div class="text-center text-muted py-4">
                    <i class="fas fa-fire fa-2x mb-2 opacity-50"></i>
                    <p>No candles have been lit yet.</p>
                    <p class="small">Be the first to light a candle in memory.</p>
                </div>
            `;
            return;
        }

        listEl.innerHTML = candles.map(candle => `
            <div class="candle-entry d-flex align-items-start gap-3">
                <div class="candle-entry-icon">
                    <i class="fas fa-fire"></i>
                </div>
                <div class="flex-grow-1">
                    <div class="d-flex justify-content-between align-items-start">
                        <strong>${escapeHtml(candle.lit_by_name || 'Someone')}</strong>
                        <span class="candle-entry-time">${formatTimeAgo(candle.lit_at)}</span>
                    </div>
                    ${candle.message ? `<p class="mb-0 small text-muted">${escapeHtml(candle.message)}</p>` : ''}
                </div>
            </div>
        `).join('');

    } catch (error) {
        console.error('Error loading candles:', error);
        listEl.innerHTML = `<div class="text-center text-danger py-4">Error loading candles.</div>`;
    }
}

async function lightCandle(memorialId, name, message) {
    try {
        const { data: { user } } = await supabase.auth.getUser();

        const candleData = {
            memorial_id: memorialId,
            lit_by_name: name || 'Anonymous',
            lit_by_user_id: user?.id || null,
            message: message || null
        };

        const { error } = await supabase
            .from('candles')
            .insert([candleData]);

        if (error) throw error;

        // Update the memorial's candle count
        const { data: memorial } = await supabase
            .from('memorials')
            .select('candle_count')
            .eq('id', memorialId)
            .single();

        const newCount = (memorial?.candle_count || 0) + 1;

        await supabase
            .from('memorials')
            .update({ candle_count: newCount })
            .eq('id', memorialId);

        // Update UI
        renderCandleCount(newCount);

        return true;
    } catch (error) {
        console.error('Error lighting candle:', error);
        throw error;
    }
}

function formatTimeAgo(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;

    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function setupCandleHandlers(memorialId) {
    // Initialize modals
    const lightCandleModalEl = document.getElementById('lightCandleModal');
    const recentCandlesModalEl = document.getElementById('recentCandlesModal');

    if (lightCandleModalEl && window.bootstrap?.Modal) {
        lightCandleModal = new bootstrap.Modal(lightCandleModalEl);
    }
    if (recentCandlesModalEl && window.bootstrap?.Modal) {
        recentCandlesModal = new bootstrap.Modal(recentCandlesModalEl);
    }

    // Light candle button opens modal
    document.getElementById('light-candle-btn')?.addEventListener('click', () => {
        document.getElementById('light-candle-form')?.reset();
        lightCandleModal?.show();
    });

    // Confirm light candle
    document.getElementById('confirm-light-candle-btn')?.addEventListener('click', async () => {
        const btn = document.getElementById('confirm-light-candle-btn');
        const name = document.getElementById('candle-name')?.value?.trim() || '';
        const message = document.getElementById('candle-message')?.value?.trim() || '';

        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Lighting...';

        try {
            await lightCandle(memorialId, name, message);
            lightCandleModal?.hide();
            showToast('Your candle has been lit. Thank you for honoring this memory.', 'success');

            // Show success animation on the main candle
            const flameEl = document.getElementById('candle-flame');
            if (flameEl) {
                flameEl.classList.add('lit');
                flameEl.style.transform = 'translateX(-50%) scale(1.5)';
                setTimeout(() => {
                    flameEl.style.transform = '';
                }, 500);
            }
        } catch (error) {
            showToast('Could not light candle. Please try again.', 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-fire me-2"></i>Light Candle';
        }
    });

    // Click on candle count to view recent candles
    document.getElementById('candle-count')?.addEventListener('click', () => {
        loadRecentCandles(memorialId);
        recentCandlesModal?.show();
    });

    // Add view candles link
    const candleStats = document.querySelector('.candle-stats');
    if (candleStats && !document.getElementById('view-candles-link')) {
        const viewLink = document.createElement('span');
        viewLink.id = 'view-candles-link';
        viewLink.textContent = 'View all';
        viewLink.addEventListener('click', () => {
            loadRecentCandles(memorialId);
            recentCandlesModal?.show();
        });
        candleStats.appendChild(viewLink);
    }
}


// --- REMINDER FUNCTIONS ---
function formatDateForReminder(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return '';
    return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', timeZone: 'UTC' });
}

function setupReminderDatePreviews(data) {
    const birthdayPreview = document.getElementById('birthday-date-preview');
    const anniversaryPreview = document.getElementById('anniversary-date-preview');

    if (birthdayPreview && data.birth_date) {
        birthdayPreview.textContent = `(${formatDateForReminder(data.birth_date)})`;
    }
    if (anniversaryPreview && data.death_date) {
        anniversaryPreview.textContent = `(${formatDateForReminder(data.death_date)})`;
    }

    // Disable checkboxes if dates are missing
    const birthdayCheckbox = document.getElementById('reminder-birthday');
    const anniversaryCheckbox = document.getElementById('reminder-anniversary');

    if (birthdayCheckbox && !data.birth_date) {
        birthdayCheckbox.disabled = true;
        birthdayCheckbox.checked = false;
        if (birthdayPreview) birthdayPreview.textContent = '(date not available)';
    }
    if (anniversaryCheckbox && !data.death_date) {
        anniversaryCheckbox.disabled = true;
        anniversaryCheckbox.checked = false;
        if (anniversaryPreview) anniversaryPreview.textContent = '(date not available)';
    }
}

async function saveReminders(memorialId, email, reminders) {
    try {
        const { data: { user } } = await supabase.auth.getUser();

        const remindersToInsert = reminders.map(r => ({
            memorial_id: memorialId,
            user_id: user?.id || null,
            email: email,
            reminder_type: r.type,
            custom_date: r.customDate || null,
            is_active: true
        }));

        const { error } = await supabase
            .from('anniversary_reminders')
            .insert(remindersToInsert);

        if (error) throw error;

        return true;
    } catch (error) {
        console.error('Error saving reminders:', error);
        throw error;
    }
}

async function loadUserReminders(memorialId) {
    const listEl = document.getElementById('user-reminders-list');
    if (!listEl) return;

    try {
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
            listEl.innerHTML = `
                <div class="text-center text-muted py-4">
                    <p>Sign in to manage your reminders.</p>
                    <a href="/login" class="btn btn-primary" data-route>Sign In</a>
                </div>
            `;
            return;
        }

        const { data: reminders, error } = await supabase
            .from('anniversary_reminders')
            .select('*')
            .eq('memorial_id', memorialId)
            .eq('user_id', user.id);

        if (error) throw error;

        if (!reminders || reminders.length === 0) {
            listEl.innerHTML = `
                <div class="text-center text-muted py-4">
                    <i class="fas fa-bell-slash fa-2x mb-2 opacity-50"></i>
                    <p>You haven't set any reminders for this memorial yet.</p>
                </div>
            `;
            return;
        }

        const reminderTypeIcons = {
            birthday: { icon: 'fa-birthday-cake', color: 'text-info', label: 'Birthday' },
            death_anniversary: { icon: 'fa-heart', color: 'text-danger', label: 'Death Anniversary' },
            custom: { icon: 'fa-calendar', color: 'text-success', label: 'Custom Date' }
        };

        listEl.innerHTML = reminders.map(r => {
            const typeInfo = reminderTypeIcons[r.reminder_type] || reminderTypeIcons.custom;
            return `
                <div class="d-flex align-items-center justify-content-between p-2 border-bottom">
                    <div>
                        <i class="fas ${typeInfo.icon} ${typeInfo.color} me-2"></i>
                        <span>${typeInfo.label}</span>
                        ${r.custom_date ? `<small class="text-muted ms-2">(${formatDateForReminder(r.custom_date)})</small>` : ''}
                    </div>
                    <div>
                        <span class="badge ${r.is_active ? 'bg-success' : 'bg-secondary'}">${r.is_active ? 'Active' : 'Paused'}</span>
                        <button class="btn btn-sm btn-outline-danger ms-2 delete-reminder-btn" data-id="${r.id}">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
            `;
        }).join('');

        // Add delete handlers
        listEl.querySelectorAll('.delete-reminder-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const reminderId = btn.dataset.id;
                if (confirm('Delete this reminder?')) {
                    await deleteReminder(reminderId);
                    loadUserReminders(memorialId);
                }
            });
        });

    } catch (error) {
        console.error('Error loading reminders:', error);
        listEl.innerHTML = `<div class="text-center text-danger py-4">Error loading reminders.</div>`;
    }
}

async function deleteReminder(reminderId) {
    try {
        const { error } = await supabase
            .from('anniversary_reminders')
            .delete()
            .eq('id', reminderId);

        if (error) throw error;
        showToast('Reminder deleted', 'success');
    } catch (error) {
        console.error('Error deleting reminder:', error);
        showToast('Could not delete reminder', 'error');
    }
}

function setupReminderHandlers(memorialId, memorialData) {
    // Initialize modals
    const reminderModalEl = document.getElementById('reminderModal');
    const manageRemindersModalEl = document.getElementById('manageRemindersModal');

    if (reminderModalEl && window.bootstrap?.Modal) {
        reminderModal = new bootstrap.Modal(reminderModalEl);
    }
    if (manageRemindersModalEl && window.bootstrap?.Modal) {
        manageRemindersModal = new bootstrap.Modal(manageRemindersModalEl);
    }

    // Set up date previews
    setupReminderDatePreviews(memorialData);

    // Pre-fill email if user is logged in
    if (currentUser?.email) {
        const emailInput = document.getElementById('reminder-email');
        if (emailInput) emailInput.value = currentUser.email;
    }

    // Reminder button click
    document.getElementById('reminder-btn')?.addEventListener('click', async () => {
        // Check if user already has reminders
        if (currentUser) {
            const { data: existing } = await supabase
                .from('anniversary_reminders')
                .select('id')
                .eq('memorial_id', memorialId)
                .eq('user_id', currentUser.id)
                .limit(1);

            if (existing && existing.length > 0) {
                // Show manage modal instead
                loadUserReminders(memorialId);
                manageRemindersModal?.show();
                return;
            }
        }
        reminderModal?.show();
    });

    // Save reminder button
    document.getElementById('save-reminder-btn')?.addEventListener('click', async () => {
        const btn = document.getElementById('save-reminder-btn');
        const email = document.getElementById('reminder-email')?.value?.trim();
        const birthdayChecked = document.getElementById('reminder-birthday')?.checked;
        const anniversaryChecked = document.getElementById('reminder-anniversary')?.checked;

        if (!email) {
            showToast('Please enter your email address', 'error');
            return;
        }

        if (!birthdayChecked && !anniversaryChecked) {
            showToast('Please select at least one reminder type', 'error');
            return;
        }

        const reminders = [];
        if (birthdayChecked && memorialData.birth_date) {
            reminders.push({ type: 'birthday' });
        }
        if (anniversaryChecked && memorialData.death_date) {
            reminders.push({ type: 'death_anniversary' });
        }

        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Saving...';

        try {
            await saveReminders(memorialId, email, reminders);
            reminderModal?.hide();
            showToast('Reminders set! You\'ll receive emails before each date.', 'success');
        } catch (error) {
            showToast('Could not save reminders. Please try again.', 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-bell me-2"></i>Set Reminders';
        }
    });

    // Add new reminder button in manage modal
    document.getElementById('add-new-reminder-btn')?.addEventListener('click', () => {
        manageRemindersModal?.hide();
        reminderModal?.show();
    });
}


// --- TRIBUTE FUNCTIONS ---
async function loadTributes(memorialId, isCurator = false) {
    const listEl = document.getElementById('tributes-list');
    const noTributesEl = document.getElementById('no-tributes-message');
    if (!listEl) return;

    try {
        // For curators, show all tributes including pending
        // For visitors, only show approved
        let query = supabase
            .from('tributes')
            .select('*')
            .eq('memorial_id', memorialId)
            .order('created_at', { ascending: false });

        if (!isCurator) {
            query = query.eq('status', 'approved');
        }

        const { data: tributes, error } = await query;

        if (error) throw error;

        if (!tributes || tributes.length === 0) {
            listEl.style.display = 'none';
            noTributesEl.style.display = 'block';
            return;
        }

        listEl.style.display = 'block';
        noTributesEl.style.display = 'none';

        listEl.innerHTML = tributes.map(tribute => `
            <div class="tribute-item" data-tribute-id="${tribute.id}">
                <div class="d-flex justify-content-between align-items-start mb-2">
                    <div>
                        <span class="tribute-author">${escapeHtml(tribute.author_name)}</span>
                        ${tribute.status === 'pending' && isCurator ? '<span class="tribute-pending-badge ms-2">Pending Approval</span>' : ''}
                    </div>
                    <span class="tribute-date">${formatTimeAgo(tribute.created_at)}</span>
                </div>
                <p class="tribute-message mb-0">${escapeHtml(tribute.message)}</p>
                ${tribute.photo_url ? `<img src="${tribute.photo_url}" alt="Tribute photo" class="tribute-photo" onclick="window.open('${tribute.photo_url}', '_blank')">` : ''}
                ${isCurator && tribute.status === 'pending' ? `
                    <div class="mt-3 pt-2 border-top">
                        <button class="btn btn-sm btn-success approve-tribute-btn" data-id="${tribute.id}">
                            <i class="fas fa-check me-1"></i>Approve
                        </button>
                        <button class="btn btn-sm btn-outline-danger reject-tribute-btn ms-2" data-id="${tribute.id}">
                            <i class="fas fa-times me-1"></i>Reject
                        </button>
                    </div>
                ` : ''}
            </div>
        `).join('');

        // Add moderation handlers for curators
        if (isCurator) {
            listEl.querySelectorAll('.approve-tribute-btn').forEach(btn => {
                btn.addEventListener('click', async () => {
                    await updateTributeStatus(btn.dataset.id, 'approved', memorialId);
                });
            });
            listEl.querySelectorAll('.reject-tribute-btn').forEach(btn => {
                btn.addEventListener('click', async () => {
                    if (confirm('Reject this tribute? It will be permanently deleted.')) {
                        await updateTributeStatus(btn.dataset.id, 'rejected', memorialId);
                    }
                });
            });
        }

    } catch (error) {
        console.error('Error loading tributes:', error);
        listEl.innerHTML = `<div class="text-center text-danger py-4">Error loading tributes.</div>`;
    }
}

async function updateTributeStatus(tributeId, status, memorialId) {
    try {
        if (status === 'rejected') {
            const { error } = await supabase
                .from('tributes')
                .delete()
                .eq('id', tributeId);
            if (error) throw error;
        } else {
            const { error } = await supabase
                .from('tributes')
                .update({ status })
                .eq('id', tributeId);
            if (error) throw error;
        }

        showToast(status === 'approved' ? 'Tribute approved!' : 'Tribute rejected', 'success');
        const isCurator = currentUser && currentMemorialData?.curator_ids?.includes(currentUser.id);
        loadTributes(memorialId, isCurator);
    } catch (error) {
        console.error('Error updating tribute:', error);
        showToast('Could not update tribute', 'error');
    }
}

async function submitTribute(memorialId, name, email, message, photoFile) {
    try {
        let photoUrl = null;

        // Upload photo if provided
        if (photoFile) {
            const fileExt = photoFile.name.split('.').pop();
            const fileName = `${memorialId}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;

            const { error: uploadError } = await supabase.storage
                .from('tributes')
                .upload(fileName, photoFile);

            if (uploadError) {
                console.warn('Photo upload failed:', uploadError);
                showToast('Photo upload failed, submitting tribute without photo', 'warning');
            } else {
                const { data: { publicUrl } } = supabase.storage
                    .from('tributes')
                    .getPublicUrl(fileName);
                photoUrl = publicUrl;
            }
        }

        const { data: { user } } = await supabase.auth.getUser();

        const tributeData = {
            memorial_id: memorialId,
            author_name: name,
            author_email: email || null,
            author_user_id: user?.id || null,
            message: message,
            photo_url: photoUrl,
            status: 'pending'
        };

        const { error } = await supabase
            .from('tributes')
            .insert([tributeData]);

        if (error) throw error;

        return true;
    } catch (error) {
        console.error('Error submitting tribute:', error);
        throw error;
    }
}

function setupTributeHandlers(memorialId, isCurator) {
    // Initialize modal
    const tributeModalEl = document.getElementById('tributeModal');
    if (tributeModalEl && window.bootstrap?.Modal) {
        tributeModal = new bootstrap.Modal(tributeModalEl);
    }

    // Open tribute modal
    const openTributeModal = () => {
        document.getElementById('tribute-form')?.reset();
        document.getElementById('tribute-photo-preview').style.display = 'none';
        tributePhotoFile = null;

        // Pre-fill email if logged in
        if (currentUser?.email) {
            document.getElementById('tribute-email').value = currentUser.email;
        }

        tributeModal?.show();
    };

    document.getElementById('add-tribute-btn')?.addEventListener('click', openTributeModal);
    document.getElementById('first-tribute-btn')?.addEventListener('click', openTributeModal);

    // Photo preview
    document.getElementById('tribute-photo')?.addEventListener('change', (e) => {
        const file = e.target.files?.[0];
        const previewEl = document.getElementById('tribute-photo-preview');
        const previewImg = previewEl?.querySelector('img');

        if (file && previewEl && previewImg) {
            tributePhotoFile = file;
            previewImg.src = URL.createObjectURL(file);
            previewEl.style.display = 'block';
        }
    });

    // Remove photo
    document.getElementById('remove-tribute-photo')?.addEventListener('click', () => {
        tributePhotoFile = null;
        document.getElementById('tribute-photo').value = '';
        document.getElementById('tribute-photo-preview').style.display = 'none';
    });

    // Submit tribute
    document.getElementById('submit-tribute-btn')?.addEventListener('click', async () => {
        const btn = document.getElementById('submit-tribute-btn');
        const name = document.getElementById('tribute-name')?.value?.trim();
        const email = document.getElementById('tribute-email')?.value?.trim();
        const message = document.getElementById('tribute-message')?.value?.trim();

        if (!name) {
            showToast('Please enter your name', 'error');
            return;
        }
        if (!message) {
            showToast('Please enter a message', 'error');
            return;
        }

        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Submitting...';

        try {
            await submitTribute(memorialId, name, email, message, tributePhotoFile);
            tributeModal?.hide();
            showToast('Thank you! Your tribute has been submitted and will appear after review.', 'success');

            // Reload tributes if curator (to see pending)
            if (isCurator) {
                loadTributes(memorialId, true);
            }
        } catch (error) {
            showToast('Could not submit tribute. Please try again.', 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-paper-plane me-2"></i>Submit Tribute';
        }
    });
}


// --- VOICE RECORDING FUNCTIONS ---
async function loadVoiceRecordings(memorialId, isCurator = false) {
    const listEl = document.getElementById('voice-recordings-list');
    const noVoiceEl = document.getElementById('no-voice-message');
    if (!listEl) return;

    try {
        let query = supabase
            .from('voice_recordings')
            .select('*')
            .eq('memorial_id', memorialId)
            .order('created_at', { ascending: false });

        if (!isCurator) {
            query = query.eq('status', 'approved');
        }

        const { data: recordings, error } = await query;

        if (error) throw error;

        if (!recordings || recordings.length === 0) {
            listEl.style.display = 'none';
            noVoiceEl.style.display = 'block';
            return;
        }

        listEl.style.display = 'block';
        noVoiceEl.style.display = 'none';

        listEl.innerHTML = recordings.map(rec => `
            <div class="voice-recording-item" data-recording-id="${rec.id}">
                <div class="d-flex justify-content-between align-items-start mb-2">
                    <div>
                        <span class="voice-author">${escapeHtml(rec.recorded_by_name)}</span>
                        ${rec.title ? `<span class="text-muted">- ${escapeHtml(rec.title)}</span>` : ''}
                        ${rec.status === 'pending' && isCurator ? '<span class="voice-pending-badge ms-2">Pending Approval</span>' : ''}
                    </div>
                    <span class="voice-date">${formatTimeAgo(rec.created_at)}</span>
                </div>
                <audio controls class="voice-player">
                    <source src="${rec.audio_url}" type="audio/mpeg">
                    Your browser does not support the audio element.
                </audio>
                ${rec.description ? `<p class="voice-description">${escapeHtml(rec.description)}</p>` : ''}
                ${isCurator && rec.status === 'pending' ? `
                    <div class="mt-3 pt-2 border-top">
                        <button class="btn btn-sm btn-success approve-voice-btn" data-id="${rec.id}">
                            <i class="fas fa-check me-1"></i>Approve
                        </button>
                        <button class="btn btn-sm btn-outline-danger reject-voice-btn ms-2" data-id="${rec.id}">
                            <i class="fas fa-times me-1"></i>Reject
                        </button>
                    </div>
                ` : ''}
            </div>
        `).join('');

        // Add moderation handlers for curators
        if (isCurator) {
            listEl.querySelectorAll('.approve-voice-btn').forEach(btn => {
                btn.addEventListener('click', async () => {
                    await updateVoiceStatus(btn.dataset.id, 'approved', memorialId);
                });
            });
            listEl.querySelectorAll('.reject-voice-btn').forEach(btn => {
                btn.addEventListener('click', async () => {
                    if (confirm('Reject this recording? It will be permanently deleted.')) {
                        await updateVoiceStatus(btn.dataset.id, 'rejected', memorialId);
                    }
                });
            });
        }

    } catch (error) {
        console.error('Error loading voice recordings:', error);
        listEl.innerHTML = `<div class="text-center text-danger py-4">Error loading recordings.</div>`;
    }
}

async function updateVoiceStatus(recordingId, status, memorialId) {
    try {
        if (status === 'rejected') {
            // First get the audio URL to delete from storage
            const { data: recording } = await supabase
                .from('voice_recordings')
                .select('audio_url')
                .eq('id', recordingId)
                .single();

            // Delete the audio file from storage
            if (recording?.audio_url) {
                const urlParts = recording.audio_url.split('/');
                const fileName = urlParts.slice(-2).join('/'); // Get memorialId/filename
                await supabase.storage.from('voice-recordings').remove([fileName]);
            }

            const { error } = await supabase
                .from('voice_recordings')
                .delete()
                .eq('id', recordingId);
            if (error) throw error;
        } else {
            const { error } = await supabase
                .from('voice_recordings')
                .update({ status })
                .eq('id', recordingId);
            if (error) throw error;
        }

        showToast(status === 'approved' ? 'Recording approved!' : 'Recording rejected', 'success');
        const isCurator = currentUser && currentMemorialData?.curator_ids?.includes(currentUser.id);
        loadVoiceRecordings(memorialId, isCurator);
    } catch (error) {
        console.error('Error updating recording:', error);
        showToast('Could not update recording', 'error');
    }
}

async function submitVoiceRecording(memorialId, audioBlob, name, email, title, description) {
    try {
        // Upload audio to Supabase Storage
        const fileExt = 'webm';
        const fileName = `${memorialId}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
            .from('voice-recordings')
            .upload(fileName, audioBlob, {
                contentType: 'audio/webm'
            });

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
            .from('voice-recordings')
            .getPublicUrl(fileName);

        const { data: { user } } = await supabase.auth.getUser();

        const recordingData = {
            memorial_id: memorialId,
            recorded_by_name: name,
            recorded_by_email: email || null,
            recorded_by_user_id: user?.id || null,
            audio_url: publicUrl,
            title: title || null,
            description: description || null,
            status: 'pending'
        };

        const { error } = await supabase
            .from('voice_recordings')
            .insert([recordingData]);

        if (error) throw error;

        return true;
    } catch (error) {
        console.error('Error submitting voice recording:', error);
        throw error;
    }
}

function formatRecordingTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function resetVoiceModal() {
    // Reset state
    recordedBlob = null;
    uploadedAudioFile = null;
    recordingSeconds = 0;
    if (recordingTimer) {
        clearInterval(recordingTimer);
        recordingTimer = null;
    }

    // Reset UI
    document.getElementById('voice-mode-selection').style.display = 'block';
    document.getElementById('live-recording-ui').style.display = 'none';
    document.getElementById('upload-audio-ui').style.display = 'none';
    document.getElementById('voice-form-fields').style.display = 'none';
    document.getElementById('submit-voice-btn').style.display = 'none';
    document.getElementById('recording-preview').style.display = 'none';
    document.getElementById('upload-preview').style.display = 'none';
    document.getElementById('recording-visualizer').style.display = 'none';
    document.getElementById('recording-timer').textContent = '0:00';
    document.getElementById('start-recording-btn').style.display = 'flex';
    document.getElementById('stop-recording-btn').style.display = 'none';
    document.getElementById('start-recording-btn').classList.remove('recording');
    document.getElementById('recording-status').textContent = 'Click the microphone to start recording';
    document.getElementById('voice-form')?.reset();
    document.getElementById('voice-file').value = '';
}

function setupVoiceHandlers(memorialId, isCurator) {
    // Initialize modal
    const voiceModalEl = document.getElementById('voiceRecordingModal');
    if (voiceModalEl && window.bootstrap?.Modal) {
        voiceRecordingModal = new bootstrap.Modal(voiceModalEl);

        // Reset modal when closed
        voiceModalEl.addEventListener('hidden.bs.modal', resetVoiceModal);
    }

    // Open voice modal
    const openVoiceModal = () => {
        resetVoiceModal();
        // Pre-fill email if logged in
        if (currentUser?.email) {
            document.getElementById('voice-email').value = currentUser.email;
        }
        voiceRecordingModal?.show();
    };

    document.getElementById('add-voice-btn')?.addEventListener('click', openVoiceModal);
    document.getElementById('first-voice-btn')?.addEventListener('click', openVoiceModal);

    // Mode selection
    document.getElementById('record-live-btn')?.addEventListener('click', () => {
        document.getElementById('voice-mode-selection').style.display = 'none';
        document.getElementById('live-recording-ui').style.display = 'block';
    });

    document.getElementById('upload-audio-btn')?.addEventListener('click', () => {
        document.getElementById('voice-mode-selection').style.display = 'none';
        document.getElementById('upload-audio-ui').style.display = 'block';
    });

    // Live recording
    document.getElementById('start-recording-btn')?.addEventListener('click', async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRecorder = new MediaRecorder(stream);
            audioChunks = [];

            mediaRecorder.ondataavailable = (event) => {
                audioChunks.push(event.data);
            };

            mediaRecorder.onstop = () => {
                recordedBlob = new Blob(audioChunks, { type: 'audio/webm' });
                const audioUrl = URL.createObjectURL(recordedBlob);
                document.getElementById('recording-playback').src = audioUrl;
                document.getElementById('recording-preview').style.display = 'block';
                document.getElementById('voice-form-fields').style.display = 'block';
                document.getElementById('submit-voice-btn').style.display = 'inline-block';
                document.getElementById('recording-status').textContent = 'Recording complete! Review and submit.';
                document.getElementById('recording-visualizer').style.display = 'none';

                // Stop all tracks
                stream.getTracks().forEach(track => track.stop());
            };

            mediaRecorder.start();

            // Update UI
            document.getElementById('start-recording-btn').style.display = 'none';
            document.getElementById('stop-recording-btn').style.display = 'flex';
            document.getElementById('start-recording-btn').classList.add('recording');
            document.getElementById('recording-visualizer').style.display = 'flex';
            document.getElementById('recording-status').textContent = 'Recording... Click stop when done.';

            // Start timer
            recordingSeconds = 0;
            recordingTimer = setInterval(() => {
                recordingSeconds++;
                document.getElementById('recording-timer').textContent = formatRecordingTime(recordingSeconds);

                // Max 3 minutes
                if (recordingSeconds >= 180) {
                    document.getElementById('stop-recording-btn').click();
                }
            }, 1000);

        } catch (error) {
            console.error('Error accessing microphone:', error);
            showToast('Could not access microphone. Please check permissions.', 'error');
        }
    });

    document.getElementById('stop-recording-btn')?.addEventListener('click', () => {
        if (mediaRecorder && mediaRecorder.state === 'recording') {
            mediaRecorder.stop();
            document.getElementById('stop-recording-btn').style.display = 'none';
            document.getElementById('start-recording-btn').style.display = 'flex';
            document.getElementById('start-recording-btn').classList.remove('recording');

            if (recordingTimer) {
                clearInterval(recordingTimer);
                recordingTimer = null;
            }
        }
    });

    document.getElementById('discard-recording-btn')?.addEventListener('click', () => {
        recordedBlob = null;
        recordingSeconds = 0;
        document.getElementById('recording-preview').style.display = 'none';
        document.getElementById('voice-form-fields').style.display = 'none';
        document.getElementById('submit-voice-btn').style.display = 'none';
        document.getElementById('recording-timer').textContent = '0:00';
        document.getElementById('recording-status').textContent = 'Click the microphone to start recording';
    });

    // File upload
    document.getElementById('voice-file')?.addEventListener('change', (e) => {
        const file = e.target.files?.[0];
        if (file) {
            // Check file size (10MB max)
            if (file.size > 10 * 1024 * 1024) {
                showToast('File too large. Maximum size is 10MB.', 'error');
                e.target.value = '';
                return;
            }

            uploadedAudioFile = file;
            const audioUrl = URL.createObjectURL(file);
            document.getElementById('upload-playback').src = audioUrl;
            document.getElementById('upload-preview').style.display = 'block';
            document.getElementById('voice-form-fields').style.display = 'block';
            document.getElementById('submit-voice-btn').style.display = 'inline-block';
        }
    });

    // Submit voice recording
    document.getElementById('submit-voice-btn')?.addEventListener('click', async () => {
        const btn = document.getElementById('submit-voice-btn');
        const name = document.getElementById('voice-name')?.value?.trim();
        const email = document.getElementById('voice-email')?.value?.trim();
        const title = document.getElementById('voice-title')?.value?.trim();
        const description = document.getElementById('voice-description')?.value?.trim();

        if (!name) {
            showToast('Please enter your name', 'error');
            return;
        }

        const audioToUpload = recordedBlob || uploadedAudioFile;
        if (!audioToUpload) {
            showToast('No audio to submit', 'error');
            return;
        }

        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Uploading...';

        try {
            await submitVoiceRecording(memorialId, audioToUpload, name, email, title, description);
            voiceRecordingModal?.hide();
            showToast('Thank you! Your voice recording has been submitted for review.', 'success');

            // Reload if curator
            if (isCurator) {
                loadVoiceRecordings(memorialId, true);
            }
        } catch (error) {
            showToast('Could not submit recording. Please try again.', 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-paper-plane me-2"></i>Submit Recording';
        }
    });
}


// --- SHARE FUNCTIONS ---
function setupShareHandlers(memorialId, memorialData) {
    // Initialize modal
    const shareModalEl = document.getElementById('shareModal');
    if (shareModalEl && window.bootstrap?.Modal) {
        shareModal = new bootstrap.Modal(shareModalEl);
    }

    const shareUrl = `${window.location.origin}/memorial?id=${memorialId}`;
    const shareTitle = `${memorialData.name || 'Memorial'} - Headstone Legacy`;
    const shareText = memorialData.name
        ? `Visit the memorial page for ${memorialData.name} to honor their memory, light a candle, or leave a tribute.`
        : 'Visit this memorial page to honor their memory, light a candle, or leave a tribute.';

    // Update share link display
    document.getElementById('share-link-display').textContent = shareUrl;
    document.getElementById('share-memorial-name').textContent = `Share ${memorialData.name || 'this memorial'} with friends and family`;

    // Check if native share is available
    if (navigator.share) {
        document.getElementById('native-share-option').style.display = 'block';
    }

    // Share button opens modal
    document.getElementById('share-btn')?.addEventListener('click', () => {
        shareModal?.show();
    });

    // Native share
    document.getElementById('native-share-btn')?.addEventListener('click', async (e) => {
        e.preventDefault();
        try {
            await navigator.share({
                title: shareTitle,
                text: shareText,
                url: shareUrl
            });
            shareModal?.hide();
        } catch (error) {
            if (error.name !== 'AbortError') {
                console.error('Error sharing:', error);
            }
        }
    });

    // Facebook share
    document.getElementById('share-facebook').href =
        `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`;

    // Twitter share
    document.getElementById('share-twitter').href =
        `https://twitter.com/intent/tweet?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(shareText)}`;

    // WhatsApp share
    document.getElementById('share-whatsapp').href =
        `https://wa.me/?text=${encodeURIComponent(shareText + ' ' + shareUrl)}`;

    // Email share
    document.getElementById('share-email').href =
        `mailto:?subject=${encodeURIComponent(shareTitle)}&body=${encodeURIComponent(shareText + '\n\n' + shareUrl)}`;

    // Copy link
    document.getElementById('copy-link-btn')?.addEventListener('click', async () => {
        const btn = document.getElementById('copy-link-btn');
        try {
            await navigator.clipboard.writeText(shareUrl);
            btn.innerHTML = '<i class="fas fa-check me-2"></i>Copied!';
            btn.classList.remove('btn-outline-primary');
            btn.classList.add('btn-success');
            showToast('Link copied to clipboard!', 'success');

            setTimeout(() => {
                btn.innerHTML = '<i class="fas fa-copy me-2"></i>Copy Link';
                btn.classList.remove('btn-success');
                btn.classList.add('btn-outline-primary');
            }, 2000);
        } catch (error) {
            console.error('Error copying to clipboard:', error);
            showToast('Could not copy link', 'error');
        }
    });
}


// --- PAGE INITIALIZATION ---
async function initializePage(appRoot, memorialId) {
    // Store memorial ID for candle functions
    currentMemorialId = memorialId;

    // Get current user
    const { data: { user } } = await supabase.auth.getUser();
    currentUser = user;

    // Fetch memorial data
    const { data, error } = await supabase
        .from('memorials')
        .select('*')
        .eq('id', memorialId)
        .single();

    if (error || !data) {
        console.warn("Memorial not found");
        document.getElementById('memorial-layout-container').style.display = 'none';
        document.getElementById('no-memorial-message').style.display = 'block';
        return;
    }

    // Render all sections
    renderHeader(data);
    renderBio(data);
    renderTimeline(data);
    renderGallery(data);
    renderFamily(data);
    renderResidences(data);
    renderResidencesMap(data);
    renderCemeteryMap(data);

    // Store memorial data for reminder functions
    currentMemorialData = data;

    // Render candle count and set up handlers
    renderCandleCount(data.candle_count || 0);
    setupCandleHandlers(memorialId);

    // Set up reminder handlers
    setupReminderHandlers(memorialId, data);

    // Set up tributes
    const isCurator = currentUser && data.curator_ids?.includes(currentUser.id);
    loadTributes(memorialId, isCurator);
    setupTributeHandlers(memorialId, isCurator);

    // Set up voice recordings
    loadVoiceRecordings(memorialId, isCurator);
    setupVoiceHandlers(memorialId, isCurator);

    // Set up share handlers
    setupShareHandlers(memorialId, data);

    document.getElementById('memorial-layout-container').style.display = 'block';
    document.getElementById('no-memorial-message').style.display = 'none';

    // Set up real-time subscription for updates
    memorialSubscription = supabase
        .channel(`memorial-${memorialId}`)
        .on('postgres_changes', {
            event: 'UPDATE',
            schema: 'public',
            table: 'memorials',
            filter: `id=eq.${memorialId}`
        }, (payload) => {
            const updatedData = payload.new;
            renderHeader(updatedData);
            renderBio(updatedData);
            renderTimeline(updatedData);
            renderGallery(updatedData);
            renderFamily(updatedData);
            renderResidences(updatedData);
        })
        .subscribe();
}

// --- PUBLIC EXPORTS FOR THE ROUTER ---
export async function loadMemorialPage(appRoot, memorialId) {
    try {
        const response = await fetch('/pages/memorial-template.html');
        if (!response.ok) throw new Error('HTML content not found');
        appRoot.innerHTML = await response.text();
        await initializePage(appRoot, memorialId);
    } catch (error) {
        console.error("Failed to load memorial page:", error);
        appRoot.innerHTML = `<p class="text-danger text-center">Error loading page.</p>`;
    }
}

export function setOnUnload(memorialId) {
    return () => {
        if (memorialSubscription) {
            console.log(`Detaching real-time listener for memorial ${memorialId}`);
            supabase.removeChannel(memorialSubscription);
            memorialSubscription = null;
        }

        if (gravesiteMap) {
            try {
                gravesiteMap.remove();
            } catch (err) {
                console.error('Error removing gravesite map:', err);
            }
            gravesiteMap = null;
        }

        if (residencesMap) {
            try {
                residencesMap.remove();
            } catch (err) {
                console.error('Error removing residences map:', err);
            }
            residencesMap = null;
        }
    };
}
