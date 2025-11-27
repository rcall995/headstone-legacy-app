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

// --- OG META TAG UPDATES ---
function updateOpenGraphTags(data) {
    const baseUrl = 'https://www.headstonelegacy.com';
    const memorialUrl = `${baseUrl}/memorial?id=${data.id}`;
    const title = `${data.name || 'Memorial'} - Headstone Legacy`;
    const bioText = data.bio || data.story;
    const description = bioText
        ? bioText.substring(0, 160) + (bioText.length > 160 ? '...' : '')
        : `View the memorial page for ${data.name || 'a loved one'}. Light a candle, leave a tribute, and explore their life story.`;
    const image = data.main_photo || `${baseUrl}/images/og-image.jpg`;

    // Update document title
    document.title = title;

    // Helper to update or create meta tags
    function setMeta(property, content, isProperty = true) {
        const attr = isProperty ? 'property' : 'name';
        let meta = document.querySelector(`meta[${attr}="${property}"]`);
        if (!meta) {
            meta = document.createElement('meta');
            meta.setAttribute(attr, property);
            document.head.appendChild(meta);
        }
        meta.setAttribute('content', content);
    }

    // Open Graph tags
    setMeta('og:title', title);
    setMeta('og:description', description);
    setMeta('og:image', image);
    setMeta('og:url', memorialUrl);
    setMeta('og:type', 'profile');

    // Twitter Card tags
    setMeta('twitter:title', title, false);
    setMeta('twitter:description', description, false);
    setMeta('twitter:image', image, false);

    // Update canonical URL
    let canonical = document.querySelector('link[rel="canonical"]');
    if (!canonical) {
        canonical = document.createElement('link');
        canonical.setAttribute('rel', 'canonical');
        document.head.appendChild(canonical);
    }
    canonical.setAttribute('href', memorialUrl);
}

// --- VIEW COUNT FUNCTIONS ---
async function incrementViewCount(memorialId) {
    // Use session storage to prevent counting multiple views in same session
    const viewKey = `memorial_viewed_${memorialId}`;
    if (sessionStorage.getItem(viewKey)) {
        console.log('[Views] Already counted this session');
        return;
    }

    try {
        const { error } = await supabase.rpc('increment_view_count', { memorial_id: memorialId });
        if (error) {
            // Fallback to direct update if RPC doesn't exist
            if (error.code === '42883') { // function does not exist
                const { error: updateError } = await supabase
                    .from('memorials')
                    .update({ view_count: supabase.raw('view_count + 1') })
                    .eq('id', memorialId);
                if (!updateError) {
                    sessionStorage.setItem(viewKey, 'true');
                }
            } else {
                console.warn('[Views] Error incrementing:', error);
            }
        } else {
            sessionStorage.setItem(viewKey, 'true');
        }
    } catch (err) {
        console.warn('[Views] Failed to increment view count:', err);
    }
}

function renderViewCount(count) {
    const viewCountEl = document.getElementById('view-count');
    if (viewCountEl) {
        viewCountEl.textContent = (count || 0).toLocaleString();
    }
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
    // Check both 'bio' and 'story' fields for backwards compatibility
    const bioText = data.bio || data.story;
    if (bioText) {
        bioCard.style.display = 'block';
        const escapedStory = escapeHtml(bioText).replace(/\n/g, '<br>');
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
            const isHistorical = item.type === 'historical';
            const bulletIcon = isHistorical ? '<i class="fas fa-globe-americas"></i>' : '<i class="fas fa-star"></i>';
            timelineHTML += `
                <li class="timeline-item ${isHistorical ? 'timeline-item-historical' : ''}">
                    <div class="timeline-bullet">${bulletIcon}</div>
                    <div class="timeline-content">
                        <div class="timeline-item-year">${item.year}${ageDisplay}</div>
                        <p>${escapeHtml(item.title || item.event)}</p>
                        ${item.description ? `<small class="text-muted">${escapeHtml(item.description)}</small>` : ''}
                    </div>
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

    // Only show relatives that are NOT linked to a memorial
    // Linked relatives will appear in the Family Tree section instead
    const unlinkedRelatives = relatives.filter(r => !r.memorialId);

    if (unlinkedRelatives.length > 0) {
        familyCard.style.display = 'block';
        let familyHTML = `
            <div class="card-body">
                <h5 class="card-title"><i class="fas fa-users me-2"></i> Family</h5>
                <ul class="list-group list-group-flush">
        `;
        unlinkedRelatives.forEach(relative => {
            familyHTML += `
                <li class="list-group-item d-flex justify-content-between align-items-center">
                    <div>
                        <strong>${escapeHtml(relative.name)}</strong><br>
                        <small class="text-muted">${escapeHtml(relative.relationship)}</small>
                    </div>
                </li>
            `;
        });
        familyHTML += `</ul></div>`;
        familyCard.innerHTML = familyHTML;
    } else {
        familyCard.style.display = 'none';
    }
}

// Render connected memorials from the family tree
async function renderFamilyTree(memorialId) {
    const familyTreeCard = document.getElementById('family-tree-card');
    const contentContainer = document.getElementById('family-tree-content');

    if (!familyTreeCard || !contentContainer) return;

    try {
        const response = await fetch(`/api/connections/tree?memorialId=${encodeURIComponent(memorialId)}`);

        if (!response.ok) {
            familyTreeCard.style.display = 'none';
            return;
        }

        const { connections, totalConnections } = await response.json();

        if (totalConnections === 0) {
            familyTreeCard.style.display = 'none';
            return;
        }

        // Build HTML for each relationship category
        let html = '';

        const categories = [
            { key: 'parents', title: 'Parents', icon: 'fa-user-tie' },
            { key: 'spouse', title: 'Spouse', icon: 'fa-heart' },
            { key: 'siblings', title: 'Siblings', icon: 'fa-user-friends' },
            { key: 'children', title: 'Children', icon: 'fa-child' },
            { key: 'grandparents', title: 'Grandparents', icon: 'fa-user-clock' },
            { key: 'grandchildren', title: 'Grandchildren', icon: 'fa-baby' },
            { key: 'other', title: 'Other Family', icon: 'fa-users' }
        ];

        categories.forEach(cat => {
            const members = connections[cat.key];
            if (members && members.length > 0) {
                html += `
                    <div class="family-tree-section">
                        <div class="family-tree-section-title">
                            <i class="fas ${cat.icon} me-2"></i>${cat.title}
                        </div>
                        <div class="family-tree-grid">
                            ${members.map(member => renderFamilyMemberCard(member)).join('')}
                        </div>
                    </div>
                `;
            }
        });

        if (html) {
            contentContainer.innerHTML = html;
            familyTreeCard.style.display = 'block';
        } else {
            familyTreeCard.style.display = 'none';
        }

    } catch (error) {
        console.error('Error loading family tree:', error);
        familyTreeCard.style.display = 'none';
    }
}

function renderFamilyMemberCard(member) {
    const initial = member.name ? member.name[0].toUpperCase() : '?';
    const dateRange = formatMemberDateRange(member.birthDate, member.deathDate);

    return `
        <a href="/memorial?id=${encodeURIComponent(member.memorialId)}" class="family-member-card" data-route>
            ${member.photo
                ? `<img src="${member.photo}" alt="${escapeHtml(member.name)}" class="family-member-photo">`
                : `<div class="family-member-placeholder">${initial}</div>`
            }
            <div class="family-member-name">${escapeHtml(member.name)}</div>
            <div class="family-member-relation">${escapeHtml(member.relationshipLabel || member.relationshipType)}</div>
            ${dateRange ? `<div class="family-member-dates">${dateRange}</div>` : ''}
        </a>
    `;
}

function formatMemberDateRange(birthDate, deathDate) {
    if (!birthDate && !deathDate) return '';

    const birthYear = birthDate ? new Date(birthDate).getFullYear() : '?';
    const deathYear = deathDate ? new Date(deathDate).getFullYear() : '?';

    if (birthYear === '?' && deathYear === '?') return '';
    return `${birthYear} - ${deathYear}`;
}

// --- FAMILY NEARBY FUNCTIONS ---
let familyNearbyPinModal = null;
let selectedFamilyMember = null;

async function renderFamilyNearby(memorialId, memorialData) {
    const familyNearbyCard = document.getElementById('family-nearby-card');
    const familyNearbyList = document.getElementById('family-nearby-list');

    if (!familyNearbyCard || !familyNearbyList) return;

    try {
        const response = await fetch(`/api/family/list?memorialId=${encodeURIComponent(memorialId)}&includeLinked=true`);

        if (!response.ok) {
            familyNearbyCard.style.display = 'none';
            return;
        }

        const { familyMembers, linkedMemorials, summary } = await response.json();

        // Only show if there are family members that need pinning
        if (!familyMembers.all || familyMembers.all.length === 0) {
            familyNearbyCard.style.display = 'none';
            return;
        }

        // Build HTML for family members
        let html = '';

        // Show family members that need pins first (can be helped by visitors)
        if (familyMembers.needsPin && familyMembers.needsPin.length > 0) {
            html += `
                <div class="family-nearby-section mb-3">
                    <div class="d-flex align-items-center gap-2 mb-2">
                        <span class="badge bg-warning text-dark">
                            <i class="fas fa-map-marker-alt me-1"></i>Needs Location
                        </span>
                        <small class="text-muted">Can you help find their grave?</small>
                    </div>
                    <div class="row g-2">
                        ${familyMembers.needsPin.map(fm => renderFamilyNearbyCard(fm, true, memorialData)).join('')}
                    </div>
                </div>
            `;
        }

        // Show already pinned family members
        if (familyMembers.pinned && familyMembers.pinned.length > 0) {
            html += `
                <div class="family-nearby-section mb-3">
                    <div class="d-flex align-items-center gap-2 mb-2">
                        <span class="badge bg-success">
                            <i class="fas fa-check me-1"></i>Located
                        </span>
                    </div>
                    <div class="row g-2">
                        ${familyMembers.pinned.map(fm => renderFamilyNearbyCard(fm, false, memorialData, linkedMemorials)).join('')}
                    </div>
                </div>
            `;
        }

        // Show those with their own memorial
        if (familyMembers.hasMemorial && familyMembers.hasMemorial.length > 0) {
            html += `
                <div class="family-nearby-section mb-3">
                    <div class="d-flex align-items-center gap-2 mb-2">
                        <span class="badge bg-info">
                            <i class="fas fa-link me-1"></i>Has Memorial
                        </span>
                    </div>
                    <div class="row g-2">
                        ${familyMembers.hasMemorial.map(fm => renderFamilyNearbyCardLinked(fm, linkedMemorials)).join('')}
                    </div>
                </div>
            `;
        }

        // Show unknown burial status
        if (familyMembers.unknown && familyMembers.unknown.length > 0) {
            html += `
                <div class="family-nearby-section">
                    <div class="d-flex align-items-center gap-2 mb-2">
                        <span class="badge bg-secondary">
                            <i class="fas fa-question me-1"></i>Unknown Location
                        </span>
                    </div>
                    <div class="row g-2">
                        ${familyMembers.unknown.map(fm => renderFamilyNearbyCard(fm, false, memorialData)).join('')}
                    </div>
                </div>
            `;
        }

        if (html) {
            familyNearbyList.innerHTML = html;
            familyNearbyCard.style.display = 'block';

            // Set up pin button handlers
            setupFamilyPinHandlers(memorialId, memorialData);
        } else {
            familyNearbyCard.style.display = 'none';
        }

    } catch (error) {
        console.error('Error loading family nearby:', error);
        familyNearbyCard.style.display = 'none';
    }
}

function renderFamilyNearbyCard(member, needsPin, memorialData) {
    const initial = member.name ? member.name[0].toUpperCase() : '?';
    const dateRange = formatMemberDateRange(member.birth_date, member.death_date);
    const burialInfo = getBurialStatusText(member.burial_status, member.cemetery_name);

    return `
        <div class="col-6 col-md-4">
            <div class="family-nearby-card ${needsPin ? 'needs-pin' : ''}" data-family-id="${member.id}">
                ${member.headstone_photo_url
                    ? `<img src="${member.headstone_photo_url}" alt="${escapeHtml(member.name)}" class="family-nearby-photo">`
                    : `<div class="family-nearby-placeholder"><i class="fas fa-user"></i></div>`
                }
                <div class="family-nearby-info">
                    <div class="family-nearby-name">${escapeHtml(member.name)}</div>
                    <div class="family-nearby-relation">${escapeHtml(member.relationship)}</div>
                    ${dateRange ? `<div class="family-nearby-dates">${dateRange}</div>` : ''}
                    ${burialInfo ? `<div class="family-nearby-burial">${burialInfo}</div>` : ''}
                </div>
                ${needsPin ? `
                    <button class="btn btn-sm btn-warning family-pin-btn"
                            data-family-id="${member.id}"
                            data-family-name="${escapeHtml(member.name)}"
                            data-family-relationship="${escapeHtml(member.relationship)}">
                        <i class="fas fa-map-pin me-1"></i>I Found This Grave
                    </button>
                ` : ''}
            </div>
        </div>
    `;
}

function renderFamilyNearbyCardLinked(member, linkedMemorials) {
    const linkedMemorial = linkedMemorials[member.linked_memorial_id];
    if (!linkedMemorial) return '';

    const initial = linkedMemorial.name ? linkedMemorial.name[0].toUpperCase() : '?';
    const dateRange = formatMemberDateRange(linkedMemorial.birth_date, linkedMemorial.death_date);

    return `
        <div class="col-6 col-md-4">
            <a href="/memorial?id=${encodeURIComponent(member.linked_memorial_id)}" class="family-nearby-card linked" data-route>
                ${linkedMemorial.main_photo
                    ? `<img src="${linkedMemorial.main_photo}" alt="${escapeHtml(linkedMemorial.name)}" class="family-nearby-photo">`
                    : `<div class="family-nearby-placeholder"><i class="fas fa-user"></i></div>`
                }
                <div class="family-nearby-info">
                    <div class="family-nearby-name">${escapeHtml(linkedMemorial.name)}</div>
                    <div class="family-nearby-relation">${escapeHtml(member.relationship)}</div>
                    ${dateRange ? `<div class="family-nearby-dates">${dateRange}</div>` : ''}
                    <div class="family-nearby-link">
                        <i class="fas fa-external-link-alt me-1"></i>View Memorial
                    </div>
                </div>
            </a>
        </div>
    `;
}

function getBurialStatusText(status, cemeteryName) {
    switch (status) {
        case 'same_cemetery':
            return `<i class="fas fa-map-marker-alt me-1"></i>Same cemetery`;
        case 'nearby_cemetery':
            return cemeteryName ? `<i class="fas fa-map-marker-alt me-1"></i>${escapeHtml(cemeteryName)}` : '<i class="fas fa-map-marker-alt me-1"></i>Nearby cemetery';
        case 'different_cemetery':
            return cemeteryName ? `<i class="fas fa-map me-1"></i>${escapeHtml(cemeteryName)}` : '<i class="fas fa-map me-1"></i>Different location';
        default:
            return '';
    }
}

function setupFamilyPinHandlers(memorialId, memorialData) {
    // Set up click handlers for pin buttons
    document.querySelectorAll('.family-pin-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const familyId = btn.dataset.familyId;
            const familyName = btn.dataset.familyName;
            const familyRelationship = btn.dataset.familyRelationship;
            openFamilyPinModal(familyId, familyName, familyRelationship, memorialId, memorialData);
        });
    });
}

async function openFamilyPinModal(familyId, familyName, relationship, memorialId, memorialData) {
    selectedFamilyMember = { id: familyId, name: familyName, relationship };

    // Create modal if it doesn't exist
    let modalEl = document.getElementById('familyPinModal');
    if (!modalEl) {
        const modalHTML = `
            <div class="modal fade" id="familyPinModal" tabindex="-1">
                <div class="modal-dialog modal-dialog-centered">
                    <div class="modal-content">
                        <div class="modal-header" style="background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%);">
                            <h5 class="modal-title">
                                <i class="fas fa-map-marker-alt text-warning me-2"></i>
                                Pin Relative's Grave
                            </h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <div class="text-center mb-3">
                                <p class="mb-2">You're helping locate:</p>
                                <h5 id="pin-family-name" class="mb-1"></h5>
                                <p class="text-muted mb-0" id="pin-family-relationship"></p>
                            </div>

                            <div class="alert alert-info small">
                                <i class="fas fa-info-circle me-2"></i>
                                Stand at or near the headstone and use your current location, or take a photo of the headstone.
                            </div>

                            <div id="pin-location-status" class="mb-3">
                                <button type="button" class="btn btn-primary w-100" id="get-pin-location-btn">
                                    <i class="fas fa-crosshairs me-2"></i>Use My Current Location
                                </button>
                            </div>

                            <div id="pin-location-result" class="mb-3" style="display: none;">
                                <div class="d-flex align-items-center gap-2 text-success mb-2">
                                    <i class="fas fa-check-circle"></i>
                                    <span>Location captured!</span>
                                </div>
                                <div id="pin-map-preview" style="height: 150px; border-radius: 8px; overflow: hidden;"></div>
                            </div>

                            <div class="mb-3">
                                <label class="form-label">
                                    <i class="fas fa-camera me-2"></i>Headstone Photo (Optional)
                                </label>
                                <input type="file" class="form-control" id="pin-photo-input" accept="image/*" capture="environment">
                                <div id="pin-photo-preview" class="mt-2" style="display: none;">
                                    <img id="pin-photo-img" class="img-fluid rounded" style="max-height: 150px;">
                                </div>
                            </div>

                            <div class="mb-3">
                                <label class="form-label">Your Name (Optional)</label>
                                <input type="text" class="form-control" id="pin-visitor-name" placeholder="Help the family know who helped">
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                            <button type="button" class="btn btn-warning" id="submit-pin-btn" disabled>
                                <i class="fas fa-map-pin me-2"></i>Submit Pin
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHTML);
        modalEl = document.getElementById('familyPinModal');

        // Set up handlers
        setupPinModalHandlers(memorialId);
    }

    // Update modal content
    document.getElementById('pin-family-name').textContent = familyName;
    document.getElementById('pin-family-relationship').textContent = `${relationship} of ${memorialData.name}`;

    // Reset state
    document.getElementById('pin-location-result').style.display = 'none';
    document.getElementById('get-pin-location-btn').disabled = false;
    document.getElementById('submit-pin-btn').disabled = true;
    document.getElementById('pin-photo-input').value = '';
    document.getElementById('pin-photo-preview').style.display = 'none';
    document.getElementById('pin-visitor-name').value = '';
    window.pinLocationData = null;

    // Show modal
    familyNearbyPinModal = new bootstrap.Modal(modalEl);
    familyNearbyPinModal.show();
}

function setupPinModalHandlers(memorialId) {
    // Get location button
    document.getElementById('get-pin-location-btn').addEventListener('click', async () => {
        const btn = document.getElementById('get-pin-location-btn');
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>Getting location...';

        try {
            const position = await new Promise((resolve, reject) => {
                navigator.geolocation.getCurrentPosition(resolve, reject, {
                    enableHighAccuracy: true,
                    timeout: 15000,
                    maximumAge: 0
                });
            });

            window.pinLocationData = {
                lat: position.coords.latitude,
                lng: position.coords.longitude,
                accuracy: position.coords.accuracy
            };

            // Show location result
            document.getElementById('pin-location-result').style.display = 'block';
            btn.innerHTML = '<i class="fas fa-check me-2"></i>Location Captured';
            btn.classList.remove('btn-primary');
            btn.classList.add('btn-success');

            // Render mini map preview
            const mapContainer = document.getElementById('pin-map-preview');
            if (window.mapboxgl) {
                const miniMap = new mapboxgl.Map({
                    container: mapContainer,
                    style: 'mapbox://styles/mapbox/satellite-streets-v12',
                    center: [window.pinLocationData.lng, window.pinLocationData.lat],
                    zoom: 18,
                    interactive: false
                });

                new mapboxgl.Marker({ color: '#f59e0b' })
                    .setLngLat([window.pinLocationData.lng, window.pinLocationData.lat])
                    .addTo(miniMap);
            }

            // Enable submit button
            document.getElementById('submit-pin-btn').disabled = false;

        } catch (error) {
            console.error('Geolocation error:', error);
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-crosshairs me-2"></i>Use My Current Location';

            let errorMessage = 'Could not get your location.';
            if (error.code === 1) errorMessage = 'Location access denied. Please enable location services.';
            else if (error.code === 2) errorMessage = 'Location unavailable. Please try again.';
            else if (error.code === 3) errorMessage = 'Location request timed out. Please try again.';

            showToast(errorMessage, 'warning');
        }
    });

    // Photo input handler
    document.getElementById('pin-photo-input').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (e) => {
                document.getElementById('pin-photo-img').src = e.target.result;
                document.getElementById('pin-photo-preview').style.display = 'block';
            };
            reader.readAsDataURL(file);
        }
    });

    // Submit pin handler
    document.getElementById('submit-pin-btn').addEventListener('click', async () => {
        if (!window.pinLocationData || !selectedFamilyMember) {
            showToast('Please capture your location first', 'warning');
            return;
        }

        const btn = document.getElementById('submit-pin-btn');
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>Submitting...';

        try {
            // Upload photo if provided
            let photoUrl = null;
            const photoFile = document.getElementById('pin-photo-input').files[0];
            if (photoFile) {
                const formData = new FormData();
                formData.append('file', photoFile);
                formData.append('folder', 'family-pins');

                const uploadResponse = await fetch('/api/tools/upload', {
                    method: 'POST',
                    body: formData
                });

                if (uploadResponse.ok) {
                    const uploadData = await uploadResponse.json();
                    photoUrl = uploadData.url;
                }
            }

            // Get auth token if logged in
            const { data: { session } } = await supabase.auth.getSession();
            const headers = {
                'Content-Type': 'application/json'
            };
            if (session?.access_token) {
                headers['Authorization'] = `Bearer ${session.access_token}`;
            }

            // Submit pin
            const response = await fetch('/api/family/pin-relative', {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    familyMemberId: selectedFamilyMember.id,
                    memorialId: memorialId,
                    gravesiteLat: window.pinLocationData.lat,
                    gravesiteLng: window.pinLocationData.lng,
                    gravesiteAccuracy: window.pinLocationData.accuracy,
                    photoUrl,
                    visitorName: document.getElementById('pin-visitor-name').value || null,
                    deviceId: getDeviceId()
                })
            });

            const result = await response.json();

            if (response.ok && result.success) {
                familyNearbyPinModal.hide();

                let message = `Thank you for helping locate ${selectedFamilyMember.name}'s grave!`;
                if (result.points?.earned) {
                    message += ` You earned ${result.points.earned} points!`;
                }
                showToast(message, 'success');

                // Refresh the family nearby section
                await renderFamilyNearby(memorialId, currentMemorialData);
            } else {
                throw new Error(result.error || 'Failed to submit pin');
            }

        } catch (error) {
            console.error('Pin submission error:', error);
            showToast(error.message || 'Failed to submit pin. Please try again.', 'danger');
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-map-pin me-2"></i>Submit Pin';
        }
    });
}

function getDeviceId() {
    let deviceId = localStorage.getItem('hl_device_id');
    if (!deviceId) {
        deviceId = 'dev_' + Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
        localStorage.setItem('hl_device_id', deviceId);
    }
    return deviceId;
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

async function renderResidencesMap(data) {
    const residencesMapCard = document.getElementById('residences-map-card');
    const residences = data.residences || [];

    // Clean up existing map before creating a new one
    if (residencesMap) {
        try {
            residencesMap.remove();
        } catch (err) {
            console.warn('Error cleaning up residences map:', err);
        }
        residencesMap = null;
    }

    if (residences.length === 0) {
        residencesMapCard.style.display = 'none';
        return;
    }

    // Get residences with locations, or geocode them on the fly
    let geocodedResidences = residences.filter(r => r.location && r.location.lat && r.location.lng);

    // If no residences have locations, try to geocode them
    if (geocodedResidences.length === 0) {
        for (const residence of residences) {
            if (!residence.address) continue;
            try {
                const response = await fetch('/api/geo/geocode', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ address: residence.address })
                });
                if (response.ok) {
                    const { lat, lng } = await response.json();
                    geocodedResidences.push({ ...residence, location: { lat, lng } });
                }
            } catch (e) {
                console.warn('Could not geocode residence:', residence.address);
            }
        }
    }

    geocodedResidences = geocodedResidences.sort((a, b) => (getYear(a.startYear) || 0) - (getYear(b.startYear) || 0));

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

        // Clear the container to prevent "should be empty" warning
        const mapContainer = document.getElementById('residences-map-container');
        if (mapContainer) mapContainer.innerHTML = '';

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
                // Check if source already exists to prevent duplicate errors
                if (!residencesMap.getSource('route')) {
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
                }
                // Fit bounds with generous padding to show all markers clearly
                residencesMap.fitBounds(bounds, {
                    padding: { top: 50, bottom: 50, left: 50, right: 50 },
                    maxZoom: 12
                });
            } else if (coordinates.length === 1) {
                // Single marker - zoom to a reasonable level
                residencesMap.setCenter(coordinates[0]);
                residencesMap.setZoom(10);
            }
        });
    } else {
        residencesMapCard.style.display = 'none';
    }
}

function renderCemeteryMap(data) {
    const mapCard = document.getElementById('map-card');

    // Clean up existing map before creating a new one
    if (gravesiteMap) {
        try {
            gravesiteMap.remove();
        } catch (err) {
            console.warn('Error cleaning up cemetery map:', err);
        }
        gravesiteMap = null;
    }

    // Cemetery/base location (for blue marker) - Priority: cemetery_lat/lng, then location_lat/lng
    let cemeteryLat, cemeteryLng, locationName;

    if (data.cemetery_lat && data.cemetery_lng) {
        cemeteryLat = data.cemetery_lat;
        cemeteryLng = data.cemetery_lng;
        locationName = data.cemetery_name || 'Cemetery Location';
    } else if (data.location_lat && data.location_lng) {
        cemeteryLat = data.location_lat;
        cemeteryLng = data.location_lng;
        locationName = data.cemetery_name || data.name || 'Memorial Location';
    } else if (data.gravesite_lat && data.gravesite_lng) {
        // Only gravesite available - use it as base
        cemeteryLat = data.gravesite_lat;
        cemeteryLng = data.gravesite_lng;
        locationName = data.cemetery_name || 'Gravesite Location';
    } else {
        mapCard.style.display = 'none';
        return;
    }

    // Use these for backwards compatibility with rest of function
    const lat = cemeteryLat;
    const lng = cemeteryLng;

    if (typeof mapboxgl === 'undefined') {
        console.error('Mapbox GL library is not loaded');
        mapCard.innerHTML = '<div class="alert alert-warning m-3">Map library failed to load.</div>';
        mapCard.style.display = 'block';
        return;
    }

    mapCard.style.display = 'block';

    // Check if gravesite is pinned
    const hasGravesite = data.gravesite_lat && data.gravesite_lng;

    // Determine directions destination - use gravesite if available, otherwise cemetery
    const directionsLat = hasGravesite ? data.gravesite_lat : lat;
    const directionsLng = hasGravesite ? data.gravesite_lng : lng;
    const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${directionsLat},${directionsLng}`;

    // Check if current user is a curator (for showing pin button)
    const isCurator = currentUser && data.curator_ids?.includes(currentUser.id);

    mapCard.innerHTML = `
        <div class="card-body">
            <h5 class="card-title"><i class="fas fa-map-marked-alt me-2"></i> Cemetery Location</h5>
            ${data.cemetery_address ? `<p class="text-muted mb-2">${escapeHtml(data.cemetery_address)}</p>` : ''}
            <div class="d-flex flex-wrap gap-2 mb-3">
                <a href="${directionsUrl}" target="_blank" class="btn btn-sm btn-outline-primary">
                    <i class="fas fa-directions me-1"></i> Get Directions
                </a>
                ${isCurator ? `
                    <button type="button" class="btn btn-sm ${hasGravesite ? 'btn-outline-success' : 'btn-outline-secondary'}" id="pin-gravesite-btn">
                        <i class="fas fa-map-pin me-1"></i> ${hasGravesite ? 'Update Gravesite Pin' : 'Pin Exact Gravesite'}
                    </button>
                ` : ''}
            </div>
            ${hasGravesite ? `
                <div class="alert alert-success py-2 mb-3">
                    <i class="fas fa-check-circle me-2"></i>
                    <strong>Exact gravesite pinned!</strong> The red pin shows the precise grave location.
                </div>
            ` : ''}
            <div id="cemetery-map-container" style="height: 350px; border-radius: 8px; overflow: hidden;"></div>
            <div id="nearby-memorials-container" class="mt-3"></div>
        </div>
    `;

    mapboxgl.accessToken = config.MAPBOX_ACCESS_TOKEN;

    setTimeout(() => {
        // Center on gravesite if available, otherwise cemetery
        const centerLat = hasGravesite ? data.gravesite_lat : lat;
        const centerLng = hasGravesite ? data.gravesite_lng : lng;

        gravesiteMap = new mapboxgl.Map({
            container: 'cemetery-map-container',
            style: hasGravesite ? 'mapbox://styles/mapbox/satellite-streets-v12' : 'mapbox://styles/mapbox/streets-v12',
            center: [centerLng, centerLat],
            zoom: hasGravesite ? 18 : 15
        });

        // Cemetery marker (blue)
        new mapboxgl.Marker({ color: '#0d6efd' })
            .setLngLat([lng, lat])
            .setPopup(
                new mapboxgl.Popup({ offset: 25 })
                    .setHTML(`<h6>${escapeHtml(locationName)}</h6><p class="mb-0 small">Cemetery entrance</p>`)
            )
            .addTo(gravesiteMap);

        // Gravesite marker (red) if available
        if (hasGravesite) {
            new mapboxgl.Marker({ color: '#dc3545' })
                .setLngLat([data.gravesite_lng, data.gravesite_lat])
                .setPopup(
                    new mapboxgl.Popup({ offset: 25 })
                        .setHTML(`<h6>${escapeHtml(data.name || 'Gravesite')}</h6><p class="mb-0 small"><i class="fas fa-map-pin me-1"></i>Exact grave location</p>`)
                )
                .addTo(gravesiteMap);
        }

        gravesiteMap.addControl(new mapboxgl.NavigationControl(), 'top-right');

        findNearbyMemorials(lat, lng, data.id, data.cemetery_name);
    }, 100);

    // Setup pin gravesite button handler
    if (isCurator) {
        document.getElementById('pin-gravesite-btn')?.addEventListener('click', () => {
            openPinGravesiteModal(data.id, lat, lng, data.gravesite_lat, data.gravesite_lng);
        });
    }
}

// Modal for pinning gravesite from memorial page
async function openPinGravesiteModal(memorialId, cemeteryLat, cemeteryLng, existingGravesiteLat, existingGravesiteLng) {
    // Create modal if it doesn't exist
    let modal = document.getElementById('pinGravesiteModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.className = 'modal fade';
        modal.id = 'pinGravesiteModal';
        modal.innerHTML = `
            <div class="modal-dialog modal-lg modal-dialog-centered">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title"><i class="fas fa-map-pin me-2 text-danger"></i>Pin Exact Gravesite</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        <div class="gravesite-options mb-3">
                            <button type="button" class="btn btn-primary me-2" id="gravesite-use-gps">
                                <i class="fas fa-crosshairs me-2"></i>Use My GPS
                            </button>
                            <span class="text-muted">or click on the map to place pin</span>
                        </div>
                        <div id="gravesite-modal-map" style="height: 400px; border-radius: 8px; overflow: hidden;"></div>
                        <p class="text-muted small mt-2 mb-0" id="gravesite-modal-coords"></p>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                        <button type="button" class="btn btn-success" id="save-gravesite-pin" disabled>
                            <i class="fas fa-check me-2"></i>Save Location
                        </button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }

    const bsModal = new bootstrap.Modal(modal);
    let modalMap = null;
    let tempMarker = null;
    let tempLocation = null;

    modal.addEventListener('shown.bs.modal', () => {
        // Initialize map
        const initialCenter = existingGravesiteLat
            ? [existingGravesiteLng, existingGravesiteLat]
            : [cemeteryLng, cemeteryLat];

        modalMap = new mapboxgl.Map({
            container: 'gravesite-modal-map',
            style: 'mapbox://styles/mapbox/satellite-streets-v12',
            center: initialCenter,
            zoom: existingGravesiteLat ? 18 : 17
        });

        modalMap.addControl(new mapboxgl.NavigationControl());

        // Show existing gravesite marker
        if (existingGravesiteLat) {
            tempLocation = { lat: existingGravesiteLat, lng: existingGravesiteLng };
            tempMarker = new mapboxgl.Marker({ color: '#dc3545', draggable: true })
                .setLngLat([existingGravesiteLng, existingGravesiteLat])
                .addTo(modalMap);

            tempMarker.on('dragend', () => {
                const pos = tempMarker.getLngLat();
                tempLocation = { lat: pos.lat, lng: pos.lng };
                document.getElementById('gravesite-modal-coords').textContent = `${pos.lat.toFixed(6)}, ${pos.lng.toFixed(6)}`;
                document.getElementById('save-gravesite-pin').disabled = false;
            });

            document.getElementById('gravesite-modal-coords').textContent = `${existingGravesiteLat.toFixed(6)}, ${existingGravesiteLng.toFixed(6)}`;
            document.getElementById('save-gravesite-pin').disabled = false;
        }

        // Handle map click
        modalMap.on('click', (e) => {
            const { lng, lat } = e.lngLat;
            tempLocation = { lat, lng };

            if (tempMarker) tempMarker.remove();
            tempMarker = new mapboxgl.Marker({ color: '#dc3545', draggable: true })
                .setLngLat([lng, lat])
                .addTo(modalMap);

            tempMarker.on('dragend', () => {
                const pos = tempMarker.getLngLat();
                tempLocation = { lat: pos.lat, lng: pos.lng };
                document.getElementById('gravesite-modal-coords').textContent = `${pos.lat.toFixed(6)}, ${pos.lng.toFixed(6)}`;
            });

            document.getElementById('gravesite-modal-coords').textContent = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
            document.getElementById('save-gravesite-pin').disabled = false;
        });

        // GPS button handler
        document.getElementById('gravesite-use-gps').onclick = async () => {
            const gpsBtn = document.getElementById('gravesite-use-gps');
            gpsBtn.disabled = true;
            gpsBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Getting GPS...';

            try {
                const position = await new Promise((resolve, reject) => {
                    navigator.geolocation.getCurrentPosition(resolve, reject, {
                        enableHighAccuracy: true,
                        timeout: 15000,
                        maximumAge: 0
                    });
                });

                const { latitude, longitude, accuracy } = position.coords;
                tempLocation = { lat: latitude, lng: longitude, accuracy };

                if (tempMarker) tempMarker.remove();
                tempMarker = new mapboxgl.Marker({ color: '#dc3545', draggable: true })
                    .setLngLat([longitude, latitude])
                    .addTo(modalMap);

                modalMap.flyTo({ center: [longitude, latitude], zoom: 18 });

                const accuracyText = accuracy < 10 ? '(excellent)' : accuracy < 30 ? '(good)' : '(approximate)';
                document.getElementById('gravesite-modal-coords').textContent = `${latitude.toFixed(6)}, ${longitude.toFixed(6)} ±${Math.round(accuracy)}m ${accuracyText}`;
                document.getElementById('save-gravesite-pin').disabled = false;

                showToast('GPS location captured!', 'success');
            } catch (error) {
                showToast('Could not get GPS location', 'error');
            } finally {
                gpsBtn.disabled = false;
                gpsBtn.innerHTML = '<i class="fas fa-crosshairs me-2"></i>Use My GPS';
            }
        };

        // Save button handler
        document.getElementById('save-gravesite-pin').onclick = async () => {
            if (!tempLocation) return;

            const saveBtn = document.getElementById('save-gravesite-pin');
            saveBtn.disabled = true;
            saveBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Saving...';

            try {
                const { error } = await supabase
                    .from('memorials')
                    .update({
                        gravesite_lat: tempLocation.lat,
                        gravesite_lng: tempLocation.lng,
                        gravesite_accuracy: tempLocation.accuracy || null
                    })
                    .eq('id', memorialId);

                if (error) throw error;

                showToast('Gravesite location saved!', 'success');
                bsModal.hide();

                // Reload the page to show updated map
                window.location.reload();
            } catch (error) {
                console.error('Error saving gravesite:', error);
                showToast('Failed to save gravesite location', 'error');
                saveBtn.disabled = false;
                saveBtn.innerHTML = '<i class="fas fa-check me-2"></i>Save Location';
            }
        };
    }, { once: true });

    // Cleanup on close
    modal.addEventListener('hidden.bs.modal', () => {
        if (modalMap) {
            modalMap.remove();
            modalMap = null;
        }
        if (tempMarker) {
            tempMarker = null;
        }
    }, { once: true });

    bsModal.show();
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

        // Get the actual count from candles table (more reliable than stored count)
        const { count, error: countError } = await supabase
            .from('candles')
            .select('*', { count: 'exact', head: true })
            .eq('memorial_id', memorialId);

        const newCount = count || 1;

        // Update the memorial's candle count to stay in sync
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


// --- TAB MANAGEMENT ---
function setupTabs(data) {
    // Show/hide tabs based on content availability
    const hasPhotos = data.photos && data.photos.length > 0;
    const hasFamily = (data.relatives && data.relatives.length > 0);
    const hasResidences = data.residences && data.residences.length > 0;
    const hasCemetery = data.cemetery_lat || data.location_lat;
    const hasPlaces = hasResidences || hasCemetery;

    // Gallery tab
    const galleryTabItem = document.getElementById('gallery-tab-item');
    if (galleryTabItem) {
        galleryTabItem.style.display = hasPhotos ? 'block' : 'none';
    }

    // Family tab - will also show if family tree has connections (checked after render)
    const familyTabItem = document.getElementById('family-tab-item');
    if (familyTabItem) {
        familyTabItem.style.display = hasFamily ? 'block' : 'none';
    }

    // Places tab
    const placesTabItem = document.getElementById('places-tab-item');
    if (placesTabItem) {
        placesTabItem.style.display = hasPlaces ? 'block' : 'none';
    }

    // Handle map resize when Places tab is shown
    const placesTab = document.getElementById('places-tab');
    if (placesTab) {
        placesTab.addEventListener('shown.bs.tab', () => {
            // Resize maps when tab becomes visible
            setTimeout(() => {
                if (residencesMap) {
                    residencesMap.resize();
                }
                if (gravesiteMap) {
                    gravesiteMap.resize();
                }
            }, 100);
        });
    }
}

// Update family tab visibility after family tree loads
function updateFamilyTabVisibility() {
    const familyTabItem = document.getElementById('family-tab-item');
    const familyCard = document.getElementById('family-card');
    const familyTreeCard = document.getElementById('family-tree-card');

    const hasFamilyContent =
        (familyCard && familyCard.style.display !== 'none') ||
        (familyTreeCard && familyTreeCard.style.display !== 'none');

    if (familyTabItem) {
        familyTabItem.style.display = hasFamilyContent ? 'block' : 'none';
    }
}

// --- QR CODE HANDLERS ---
function setupQRCodeHandlers(memorialId, data) {
    const qrModal = document.getElementById('qrCodeModal');
    const qrContainer = document.getElementById('qr-code-container');
    const orderTagBtn = document.getElementById('order-tag-btn');
    const downloadQrBtn = document.getElementById('download-qr-btn');

    if (!qrModal || !qrContainer) return;

    // Set up Order Tag button href - use slug if available, otherwise ID
    if (orderTagBtn) {
        const tagIdentifier = data.slug || memorialId;
        orderTagBtn.href = `/order-tag/${encodeURIComponent(tagIdentifier)}`;
    }

    // Set up Order Book button href
    const orderBookBtn = document.getElementById('order-book-btn');
    if (orderBookBtn) {
        const bookIdentifier = data.slug || memorialId;
        orderBookBtn.href = `/order-book/${encodeURIComponent(bookIdentifier)}`;
    }

    let qrGenerated = false;

    // Generate QR code when modal is shown
    qrModal.addEventListener('shown.bs.modal', () => {
        if (qrGenerated) return; // Only generate once

        // Clear container
        qrContainer.innerHTML = '';

        // Generate QR code pointing to the welcome page
        const welcomeUrl = `https://www.headstonelegacy.com/welcome?id=${memorialId}`;

        // Use QRCode.js library (loaded in index.html)
        if (typeof QRCode !== 'undefined') {
            new QRCode(qrContainer, {
                text: welcomeUrl,
                width: 200,
                height: 200,
                colorDark: '#000000',
                colorLight: '#ffffff',
                correctLevel: QRCode.CorrectLevel.H
            });
            qrGenerated = true;
        } else {
            qrContainer.innerHTML = '<p class="text-danger">QR Code library not loaded</p>';
        }
    });

    // Download QR code button
    if (downloadQrBtn) {
        downloadQrBtn.addEventListener('click', () => {
            const canvas = qrContainer.querySelector('canvas');
            if (canvas) {
                const link = document.createElement('a');
                link.download = `${data.name || 'memorial'}-qrcode.png`;
                link.href = canvas.toDataURL('image/png');
                link.click();
            } else {
                showToast('Please wait for QR code to generate', 'warning');
            }
        });
    }
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
    renderCemeteryMap(data);

    // Set up tabs before async operations
    setupTabs(data);

    // Load family tree and update tab visibility
    await renderFamilyTree(memorialId);
    updateFamilyTabVisibility();

    // Load family members nearby (for visitor pinning)
    await renderFamilyNearby(memorialId, data);

    // Render residence map (async geocoding)
    await renderResidencesMap(data);

    // Store memorial data for reminder functions
    currentMemorialData = data;

    // Update Open Graph meta tags for social sharing
    updateOpenGraphTags(data);

    // Render and increment view count
    renderViewCount(data.view_count);
    incrementViewCount(memorialId);

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

    // Set up QR code handlers
    setupQRCodeHandlers(memorialId, data);

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
            setupTabs(updatedData);
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
