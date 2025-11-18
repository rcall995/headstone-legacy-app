// memorial-template.js
import { db, auth } from '/js/firebase-config.js';
import { doc, onSnapshot, collection, query, where, orderBy, getDocs, addDoc, serverTimestamp, getDoc, documentId, updateDoc, GeoPoint } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { config } from '/js/config.js';
import { showToast } from '/js/utils/toasts.js';

// --- MODULE STATE ---
let unsubscribeMemorial = null;
let gravesiteMap = null;
let residencesMap = null;
let galleryImages = [];

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
    document.getElementById('display-dates').textContent = `${formatDateString(data.birthDate)} - ${formatDateString(data.deathDate)}`;
    const mainMediaEl = document.getElementById('display-main-media');
    if (data.mainPhoto) {
        // Use DOM methods instead of innerHTML to prevent XSS
        mainMediaEl.innerHTML = '';
        const img = document.createElement('img');
        img.src = data.mainPhoto;
        img.alt = data.name || 'Memorial photo';
        img.className = 'img-fluid rounded shadow';
        mainMediaEl.appendChild(img);
    } else {
        mainMediaEl.innerHTML = '';
    }
    const editBtn = document.getElementById('edit-memorial-button');
    const user = auth.currentUser;
    if (user && data.curatorIds?.includes(user.uid)) {
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
        // Escape the story content to prevent XSS, but preserve line breaks
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
    const birthYear = getYear(data.birthDate);
    const deathYear = getYear(data.deathDate);
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
            const age = calculateAge(data.birthDate, item.year);
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
                        <strong>${relative.name}</strong><br>
                        <small class="text-muted">${relative.relationship}</small>
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
            const age = calculateAge(data.birthDate, residence.startYear);
            const ageDisplay = age !== null ? ` (Age ${age})` : '';
            residencesHTML += `
                <li class="list-group-item">
                    <strong>${residence.address}</strong><br>
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

        // Check if Mapbox GL is loaded
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

                // Escape HTML to prevent XSS
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

    // Priority: 1) cemeteryLocation, 2) location (from Scout mode), 3) none
    let lat, lng, locationName;

    if (data.cemeteryLocation && data.cemeteryLocation.latitude && data.cemeteryLocation.longitude) {
        lat = data.cemeteryLocation.latitude;
        lng = data.cemeteryLocation.longitude;
        locationName = data.cemeteryName || 'Cemetery Location';
    } else if (data.location && data.location.latitude && data.location.longitude) {
        lat = data.location.latitude;
        lng = data.location.longitude;
        locationName = data.cemeteryName || data.name || 'Memorial Location';
    } else {
        mapCard.style.display = 'none';
        return;
    }

    // Check if Mapbox GL is loaded
    if (typeof mapboxgl === 'undefined') {
        console.error('Mapbox GL library is not loaded');
        mapCard.innerHTML = '<div class="alert alert-warning m-3">Map library failed to load.</div>';
        mapCard.style.display = 'block';
        return;
    }

    mapCard.style.display = 'block';

    // Create directions link to Google Maps
    const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;

    mapCard.innerHTML = `
        <div class="card-body">
            <h5 class="card-title"><i class="fas fa-map-marked-alt me-2"></i> Cemetery Location</h5>
            ${data.cemeteryAddress ? `<p class="text-muted mb-2">${escapeHtml(data.cemeteryAddress)}</p>` : ''}
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

        // Add marker
        const markerColor = data.cemeteryLocation ? '#dc3545' : '#0d6efd'; // Red for cemetery, blue for memorial
        new mapboxgl.Marker({ color: markerColor })
            .setLngLat([lng, lat])
            .setPopup(
                new mapboxgl.Popup({ offset: 25 })
                    .setHTML(`<h6>${escapeHtml(locationName)}</h6>`)
            )
            .addTo(gravesiteMap);

        gravesiteMap.addControl(new mapboxgl.NavigationControl(), 'top-right');

        // Find and display nearby memorials
        findNearbyMemorials(lat, lng, data.id, data.cemeteryName);
    }, 100);
}

// Function to find nearby memorials (within ~500m)
async function findNearbyMemorials(lat, lng, currentMemorialId, cemeteryName) {
    try {
        const memorialsRef = collection(db, 'memorials');
        const memorialsQuery = query(
            memorialsRef,
            where('status', 'in', ['published', 'approved'])
        );

        const snapshot = await getDocs(memorialsQuery);
        const nearby = [];

        snapshot.forEach(doc => {
            if (doc.id === currentMemorialId) return; // Skip current memorial

            const memorial = doc.data();
            const memLat = memorial.cemeteryLocation?.latitude || memorial.location?.latitude;
            const memLng = memorial.cemeteryLocation?.longitude || memorial.location?.longitude;

            if (memLat && memLng) {
                // Calculate distance using Haversine formula
                const distance = calculateDistance(lat, lng, memLat, memLng);

                // If within 500 meters, consider it nearby
                if (distance < 0.5) {
                    nearby.push({
                        id: doc.id,
                        name: memorial.name,
                        distance: distance,
                        cemeteryName: memorial.cemeteryName
                    });
                }
            }
        });

        // Display nearby memorials
        if (nearby.length > 0) {
            const container = document.getElementById('nearby-memorials-container');
            if (container) {
                nearby.sort((a, b) => a.distance - b.distance); // Sort by distance
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

// Calculate distance between two coordinates in kilometers (Haversine formula)
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth's radius in km
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


// --- PAGE INITIALIZATION ---
async function initializePage(appRoot, memorialId) {
    if (unsubscribeMemorial) {
        unsubscribeMemorial();
    }

    const memorialRef = doc(db, "memorials", memorialId);
    unsubscribeMemorial = onSnapshot(memorialRef, (docSnap) => {
        if (docSnap.exists()) {
            const data = { id: docSnap.id, ...docSnap.data() };
            
            renderHeader(data);
            renderBio(data);
            renderTimeline(data);
            renderGallery(data);
            renderFamily(data);
            renderResidences(data);
            renderResidencesMap(data);
            renderCemeteryMap(data);

            document.getElementById('memorial-layout-container').style.display = 'block';
            document.getElementById('no-memorial-message').style.display = 'none';
        } else {
            console.warn("Memorial not found");
            document.getElementById('memorial-layout-container').style.display = 'none';
            document.getElementById('no-memorial-message').style.display = 'block';
        }
    }, (error) => {
        console.error("Error loading memorial in real-time:", error);
        showToast("Error loading memorial data.", "error");
    });
}

// --- PUBLIC EXPORTS FOR THE ROUTER ---
export async function loadMemorialPage(appRoot, memorialId) {
    try {
        // This assumes your HTML file is in /pages/memorial-template.html
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
        if (unsubscribeMemorial) {
            console.log(`Detaching real-time listener for memorial ${memorialId}`);
            unsubscribeMemorial();
            unsubscribeMemorial = null;
        }

        // Cleanup cemetery map
        if (gravesiteMap) {
            try {
                gravesiteMap.remove();
            } catch (err) {
                console.error('Error removing gravesite map:', err);
            }
            gravesiteMap = null;
        }

        // Cleanup residences map
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