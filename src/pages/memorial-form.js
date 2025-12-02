import { supabase } from '/js/supabase-client.js';
import { showToast } from '/js/utils/toasts.js';

// --- Module-level State Variables ---
let currentStep = 1;
const TOTAL_STEPS = 5;
const commonRelationships = ["Spouse", "Father", "Mother", "Son", "Daughter", "Brother", "Sister", "Grandfather", "Grandmother", "Grandson", "Granddaughter", "Uncle", "Aunt", "Nephew", "Niece", "Cousin", "Stepfather", "Stepmother", "Stepson", "Stepdaughter", "Father-in-law", "Mother-in-law", "Son-in-law", "Daughter-in-law", "Brother-in-law", "Sister-in-law"];
let originalAddress = '';
let cemeteryLocation = null; // Store geocoded cemetery location { lat, lng }
let cemeteryMapPreview = null; // Map instance for preview
let lifePathMapInstance = null; // Map instance for life journey
let isGeocoding = false; // Prevent duplicate geocoding requests
let headstonePhotoFile = null; // Store the headstone photo
let customHeaderImageFile = null; // Store custom header background image
let geocodedResidenceLocations = {}; // Store geocoded residence locations by address

// Gravesite pin state
let gravesiteLocation = null; // Store gravesite location { lat, lng, accuracy }
let gravesiteMapPicker = null; // Map instance for gravesite picker

// Memorial linking state
let memorialSearchModal = null;
let familySuggestionsModal = null; // Modal for confirming suggested family connections
let currentLinkingRelativeGroup = null; // The relative field being linked
let searchDebounceTimer = null;
let pendingConnections = []; // Connections to create when saving
let pendingSuggestedConnections = []; // Suggested connections awaiting confirmation

// Current editing memorial ID (set when loading existing memorial)
let currentEditingMemorialId = null;

// Milestone wizard state
let milestoneWizardModal = null;
let milestoneWizardStep = 1;
const MILESTONE_WIZARD_STEPS = 6;

// Photo cropping state
let photoCropModal = null;
let cropper = null;
let originalImageDataUrl = null; // Store original image for re-cropping
let croppedImageBlob = null; // Store cropped image blob for upload

// Family nearby state
let familyNearbyMembers = []; // Loaded family members from DB
let familyNearbyToDelete = []; // IDs to delete on save

// Video recording state
let videoRecordModal = null;
let mediaStream = null;
let mediaRecorder = null;
let recordedChunks = [];
let recordingStartTime = null;
let recordingTimerInterval = null;
let pendingVideos = []; // Videos to upload when saving { blob, title, duration }
const MAX_VIDEO_SIZE = 50 * 1024 * 1024; // 50MB
const MAX_VIDEO_DURATION = 120; // 2 minutes

// Living Legacy message state
let legacyMessageModal = null;
let legacyMessages = []; // Loaded messages from DB

const burialStatusOptions = [
    { value: 'unknown', label: 'Unknown', description: 'Burial location unknown' },
    { value: 'same_cemetery', label: 'Same cemetery', description: 'Buried in this same cemetery' },
    { value: 'nearby_cemetery', label: 'Nearby cemetery', description: 'Buried in a nearby cemetery' },
    { value: 'different_cemetery', label: 'Different cemetery', description: 'Buried elsewhere' }
];

// Historical events for timeline
const historicalEvents = [
    { id: 'declaration', year: 1776, event: 'U.S. Declaration of Independence signed' },
    { id: 'civil-war', year: 1861, event: 'American Civil War begins' },
    { id: 'telephone', year: 1876, event: 'Telephone invented by Alexander Graham Bell' },
    { id: 'flight', year: 1903, event: 'Wright brothers achieve first powered flight' },
    { id: 'model-t', year: 1908, event: 'Ford Model T revolutionizes transportation' },
    { id: 'ww1', year: 1914, event: 'World War I begins' },
    { id: 'ww1-end', year: 1918, event: 'World War I ends' },
    { id: 'womens-vote', year: 1920, event: 'Women gain right to vote (19th Amendment)' },
    { id: 'depression', year: 1929, event: 'Great Depression begins' },
    { id: 'ww2', year: 1939, event: 'World War II begins' },
    { id: 'pearl-harbor', year: 1941, event: 'Attack on Pearl Harbor' },
    { id: 'ww2-end', year: 1945, event: 'World War II ends' },
    { id: 'korean-war', year: 1950, event: 'Korean War begins' },
    { id: 'korean-war-end', year: 1953, event: 'Korean War ends' },
    { id: 'sputnik', year: 1957, event: 'Space Race begins with Sputnik launch' },
    { id: 'jfk', year: 1963, event: 'President John F. Kennedy assassinated' },
    { id: 'mlk-speech', year: 1963, event: 'Martin Luther King Jr. "I Have a Dream" speech' },
    { id: 'moon-landing', year: 1969, event: 'Apollo 11 lands on the Moon' },
    { id: 'vietnam-end', year: 1975, event: 'Vietnam War ends' },
    { id: 'berlin-wall', year: 1989, event: 'Berlin Wall falls, Cold War ends' },
    { id: 'internet', year: 1991, event: 'World Wide Web becomes public' },
    { id: '9-11', year: 2001, event: 'September 11 attacks' },
    { id: 'iphone', year: 2007, event: 'First iPhone released' },
    { id: 'covid', year: 2020, event: 'COVID-19 pandemic begins' },
];

// Auth modal state
let authModal = null;
let pendingSaveStatus = null; // 'draft' or 'published'
let currentAppRoot = null;
const FORM_STORAGE_KEY = 'headstone_memorial_draft';

// Tier-based feature limits
let currentTier = 'basic'; // 'basic' (free) or 'premium' (paid)
const TIER_LIMITS = {
    basic: {
        maxPhotos: 10,
        allowVideos: false,
        allowLivingLegacy: false
    },
    premium: {
        maxPhotos: 999, // effectively unlimited
        allowVideos: true,
        allowLivingLegacy: true
    }
};

function getPhotoLimit() {
    return TIER_LIMITS[currentTier]?.maxPhotos || 10;
}

function canUploadVideos() {
    return TIER_LIMITS[currentTier]?.allowVideos || false;
}

// Apply tier-based UI restrictions
function applyTierRestrictions(appRoot) {
    const videoSection = appRoot.querySelector('#video-messages-section');
    const photoGallerySection = appRoot.querySelector('#photo-gallery-section');
    const photoHint = photoGallerySection?.querySelector('.form-text');
    const livingLegacySection = appRoot.querySelector('#living-legacy-section');
    const livingLegacyUpgradePrompt = appRoot.querySelector('#living-legacy-upgrade-prompt');
    const livingLegacyContent = appRoot.querySelector('#living-legacy-content');

    // Show/hide video section based on tier
    if (videoSection) {
        if (canUploadVideos()) {
            videoSection.style.display = 'block';
        } else {
            // Hide video section for basic tier
            videoSection.style.display = 'none';
        }
    }

    // Update photo limit hint
    if (photoHint) {
        const limit = getPhotoLimit();
        if (currentTier === 'basic') {
            photoHint.innerHTML = `Add up to ${limit} photos, 10MB each. <a href="/order-tag" data-route class="text-primary">Upgrade for unlimited</a>`;
        } else {
            photoHint.textContent = 'Add as many photos as you like, 10MB each';
        }
    }

    // Update Photo Gallery section title to show limit for basic tier
    if (photoGallerySection) {
        const sectionSubtitle = photoGallerySection.querySelector('.section-subtitle');
        if (sectionSubtitle) {
            if (currentTier === 'basic') {
                sectionSubtitle.textContent = `Add up to ${getPhotoLimit()} additional photos to create a beautiful gallery`;
            } else {
                sectionSubtitle.textContent = 'Add additional photos to create a beautiful gallery';
            }
        }
    }

    // Show Living Legacy section (always visible, but content differs by tier)
    if (livingLegacySection) {
        livingLegacySection.style.display = 'block';

        if (TIER_LIMITS[currentTier]?.allowLivingLegacy) {
            // Premium tier - show full functionality
            if (livingLegacyUpgradePrompt) livingLegacyUpgradePrompt.style.display = 'none';
            if (livingLegacyContent) livingLegacyContent.style.display = 'block';
        } else {
            // Basic tier - show upgrade prompt
            if (livingLegacyUpgradePrompt) livingLegacyUpgradePrompt.style.display = 'flex';
            if (livingLegacyContent) livingLegacyContent.style.display = 'none';
        }
    }
}

// Set tier and apply restrictions
function setTier(tier, appRoot) {
    currentTier = tier === 'premium' ? 'premium' : 'basic';
    const tierInput = appRoot?.querySelector('#memorial-tier');
    if (tierInput) {
        tierInput.value = currentTier;
    }
    if (appRoot) {
        applyTierRestrictions(appRoot);
    }
}

// Living Legacy mode state
let isLivingLegacyMode = false;

// Apply Living Legacy mode - hides death-related fields for pre-planned memorials
function applyLivingLegacyMode(appRoot) {
    isLivingLegacyMode = true;
    console.log('[memorial-form] Applying Living Legacy mode');

    // Add class to form for CSS-based hiding if needed
    const form = appRoot.querySelector('#memorialForm');
    if (form) form.classList.add('living-legacy-mode');

    // Hide Date of Death field group
    const deathDateGroup = appRoot.querySelector('#memorial-death-year')?.closest('.form-group');
    if (deathDateGroup) {
        deathDateGroup.style.display = 'none';
    }

    // Hide Place of Death field group
    const deathPlaceGroup = appRoot.querySelector('#memorial-death-place')?.closest('.form-group');
    if (deathPlaceGroup) {
        deathPlaceGroup.style.display = 'none';
    }

    // === STEP 1: About You ===
    const aboutTitle = appRoot.querySelector('.wizard-step[data-step="1"] .section-title');
    if (aboutTitle) {
        aboutTitle.innerHTML = '<i class="fas fa-user me-2"></i>About You <span class="badge bg-success ms-2">Living Legacy</span>';
    }

    // Update name field label and placeholder
    const nameLabel = appRoot.querySelector('label[for="memorial-name"]');
    if (nameLabel) {
        nameLabel.textContent = 'Your Name';
    }
    const nameInput = appRoot.querySelector('#memorial-name');
    if (nameInput) {
        nameInput.placeholder = 'Your full name';
    }

    // Update epitaph label and placeholder
    const titleLabel = appRoot.querySelector('label[for="memorial-title"]');
    if (titleLabel) {
        titleLabel.textContent = 'How Would You Describe Yourself?';
    }
    const titleInput = appRoot.querySelector('#memorial-title');
    if (titleInput) {
        titleInput.placeholder = 'e.g., Devoted Parent and Friend, or leave blank for now';
    }

    // Update birth date label to first-person
    const birthDateLabel = appRoot.querySelector('#memorial-birth-year')?.closest('.form-group')?.querySelector('.form-label');
    if (birthDateLabel) {
        birthDateLabel.textContent = 'Your Birthday';
    }

    // Update birth place label and placeholder
    const birthPlaceLabel = appRoot.querySelector('label[for="memorial-birth-place"]');
    if (birthPlaceLabel) {
        birthPlaceLabel.textContent = 'Where Were You Born?';
    }
    const birthPlaceInput = appRoot.querySelector('#memorial-birth-place');
    if (birthPlaceInput) {
        birthPlaceInput.placeholder = 'City, State or Country';
    }

    // === STEP 2: My Story ===
    const bioTitle = appRoot.querySelector('.wizard-step[data-step="2"] .section-title');
    if (bioTitle) {
        bioTitle.innerHTML = '<i class="fas fa-book-open me-2"></i>My Story';
    }
    const bioSubtitle = appRoot.querySelector('.wizard-step[data-step="2"] .section-subtitle');
    if (bioSubtitle) {
        bioSubtitle.textContent = 'Share your story, memories, and what makes you who you are';
    }

    // Update bio helper text
    const bioHelperStrong = appRoot.querySelector('.bio-helper-content strong');
    if (bioHelperStrong) {
        bioHelperStrong.textContent = 'Need help writing your story?';
    }
    const bioHelperText = appRoot.querySelector('.bio-helper-content p');
    if (bioHelperText) {
        bioHelperText.textContent = 'Answer a few questions and let AI help craft your story';
    }

    // Update story textarea placeholder
    const storyTextarea = appRoot.querySelector('#memorial-story');
    if (storyTextarea) {
        storyTextarea.placeholder = 'Write about yourself - your journey, values, accomplishments, and the moments that shaped you...';
    }

    // === STEP 3: Photo ===
    const photoTitle = appRoot.querySelector('.wizard-step[data-step="3"] .section-title');
    if (photoTitle && photoTitle.textContent.includes('Photo')) {
        photoTitle.innerHTML = '<i class="fas fa-camera me-2"></i>Your Photo';
    }
    const photoSubtitle = appRoot.querySelector('.wizard-step[data-step="3"] .section-subtitle');
    if (photoSubtitle) {
        photoSubtitle.textContent = 'This will be your primary photo displayed on your memorial';
    }

    // === STEP 4: Family & Timeline ===
    const familyTitle = appRoot.querySelector('.wizard-step[data-step="4"] .section-title');
    if (familyTitle && familyTitle.textContent.includes('Family')) {
        familyTitle.innerHTML = '<i class="fas fa-users me-2"></i>My Family & Timeline';
    }

    // Update relatives label
    const relativesLabel = appRoot.querySelector('label[for="relatives-container"]');
    if (relativesLabel) {
        relativesLabel.textContent = 'My Family Members';
    }

    // Update milestones subtitle
    const milestonesSubtitle = appRoot.querySelector('.wizard-step[data-step="4"] .section-subtitle');
    if (milestonesSubtitle && milestonesSubtitle.textContent.includes('their life')) {
        milestonesSubtitle.textContent = 'Add key moments and achievements from your life';
    }

    // === STEP 5: Resting Place (Optional for living) ===
    const cemeteryTitle = appRoot.querySelector('.wizard-step[data-step="5"] .section-title');
    if (cemeteryTitle) {
        cemeteryTitle.innerHTML = '<i class="fas fa-map-marker-alt me-2"></i>Resting Place <span class="badge bg-secondary ms-2">Optional</span>';
    }
    const cemeterySubtitle = appRoot.querySelector('.wizard-step[data-step="5"] .section-subtitle');
    if (cemeterySubtitle) {
        cemeterySubtitle.textContent = 'Where would you like to be laid to rest? (You can update this later)';
    }

    // === STEP 6: Privacy ===
    const privacySubtitle = appRoot.querySelector('.wizard-step[data-step="6"] .section-subtitle');
    if (privacySubtitle && privacySubtitle.textContent.includes('Choose what')) {
        privacySubtitle.textContent = 'Choose what to show on your memorial when it becomes public';
    }

    // === Buttons ===
    const publishBtn = appRoot.querySelector('#publish-button');
    if (publishBtn) {
        publishBtn.innerHTML = '<i class="fas fa-check-circle"></i><span>Save Legacy</span>';
    }

    const saveDraftBtn = appRoot.querySelector('#save-draft-button');
    if (saveDraftBtn) {
        saveDraftBtn.innerHTML = '<i class="fas fa-save"></i><span>Save Draft</span>';
    }

    // === Bio Helper Questions - Update to first-person ===
    const bioPrompts = {
        family: {
            question: 'Who are the important people in your life?',
            placeholder: 'e.g., Married to [spouse] for [years], parent of [children], grandparent of [number]...'
        },
        career: {
            question: 'What do you do for work?',
            placeholder: 'e.g., I work as a [job title], I\'ve been in this field for [years]...'
        },
        earlylife: {
            question: 'Where did you grow up and go to school?',
            placeholder: 'e.g., Born in [city], grew up in [place], graduated from [school]...'
        },
        hobbies: {
            question: 'What do you love doing?',
            placeholder: 'e.g., I love fishing, gardening, woodworking, cooking for my family...'
        },
        personality: {
            question: 'How would friends and family describe you?',
            placeholder: 'e.g., I\'m known for my sense of humor, my generosity, being a good listener...'
        },
        community: {
            question: 'Are you involved in church, military, or community?',
            placeholder: 'e.g., Active member at [church], [military branch] veteran, volunteer at [org]...'
        }
    };

    Object.entries(bioPrompts).forEach(([key, data]) => {
        const card = appRoot.querySelector(`.bio-prompt-card[data-prompt="${key}"]`);
        if (card) {
            const questionSpan = card.querySelector('.bio-prompt-header span');
            if (questionSpan) questionSpan.textContent = data.question;
            const textarea = card.querySelector('textarea');
            if (textarea) textarea.placeholder = data.placeholder;
        }
    });
}

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

// --- LOCAL STORAGE AUTO-SAVE ---
// Build date string from flexible date inputs
function buildDateFromFields(appRoot, prefix) {
    const year = appRoot.querySelector(`#memorial-${prefix}-year`)?.value;
    const month = appRoot.querySelector(`#memorial-${prefix}-month`)?.value;
    const day = appRoot.querySelector(`#memorial-${prefix}-day`)?.value;

    if (!year) return null;

    // If we have month and day, build full ISO date
    if (month && day) {
        const paddedDay = day.toString().padStart(2, '0');
        return `${year}-${month}-${paddedDay}`;
    }

    // If we have just month, use first of month
    if (month) {
        return `${year}-${month}-01`;
    }

    // Year only - return as YYYY-01-01 but we'll track it's year-only
    return `${year}-01-01`;
}

// Check if date has full details or just year
function isYearOnly(appRoot, prefix) {
    const month = appRoot.querySelector(`#memorial-${prefix}-month`)?.value;
    const day = appRoot.querySelector(`#memorial-${prefix}-day`)?.value;
    return !month && !day;
}

// Parse date string into flexible date fields
function populateDateFields(appRoot, prefix, dateStr) {
    if (!dateStr) return;

    // Parse the date - could be YYYY-MM-DD or just a year
    const parts = dateStr.split('-');
    const year = parts[0];
    const month = parts[1];
    const day = parts[2];

    // Set year
    const yearInput = appRoot.querySelector(`#memorial-${prefix}-year`);
    if (yearInput) yearInput.value = year;

    // If we have full date (not just year with defaults 01-01), expand and show month/day
    if (month && day && !(month === '01' && day === '01')) {
        const fullDateDiv = appRoot.querySelector(`#${prefix}-full-date`);
        const expandBtn = appRoot.querySelector(`.date-expand-btn[data-target="${prefix}"]`);

        if (fullDateDiv) fullDateDiv.classList.remove('d-none');
        if (expandBtn) expandBtn.classList.add('active');

        const monthInput = appRoot.querySelector(`#memorial-${prefix}-month`);
        const dayInput = appRoot.querySelector(`#memorial-${prefix}-day`);

        if (monthInput) monthInput.value = month;
        if (dayInput) dayInput.value = parseInt(day, 10); // Remove leading zero
    }
}

function saveFormToLocalStorage(appRoot) {
    try {
        const formData = {
            name: appRoot.querySelector('#memorial-name')?.value || '',
            title: appRoot.querySelector('#memorial-title')?.value || '',
            birthDate: buildDateFromFields(appRoot, 'birth'),
            birthYearOnly: isYearOnly(appRoot, 'birth'),
            birthPlace: appRoot.querySelector('#memorial-birth-place')?.value || '',
            deathDate: buildDateFromFields(appRoot, 'death'),
            deathYearOnly: isYearOnly(appRoot, 'death'),
            deathPlace: appRoot.querySelector('#memorial-death-place')?.value || '',
            story: appRoot.querySelector('#memorial-story')?.value || '',
            cemeteryName: appRoot.querySelector('#memorial-cemetery-name')?.value || '',
            cemeteryAddress: appRoot.querySelector('#memorial-cemetery-address')?.value || '',
            cemeteryLocation: cemeteryLocation,
            gravesiteLocation: gravesiteLocation,
            currentStep: currentStep,
            savedAt: new Date().toISOString()
        };
        localStorage.setItem(FORM_STORAGE_KEY, JSON.stringify(formData));
    } catch (e) {
        console.warn('Could not save form to localStorage:', e);
    }
}

function loadFormFromLocalStorage(appRoot) {
    try {
        const saved = localStorage.getItem(FORM_STORAGE_KEY);
        if (!saved) return false;

        const formData = JSON.parse(saved);

        // Check if data is less than 7 days old
        const savedDate = new Date(formData.savedAt);
        const daysSinceSave = (Date.now() - savedDate.getTime()) / (1000 * 60 * 60 * 24);
        if (daysSinceSave > 7) {
            clearFormLocalStorage();
            return false;
        }

        // Restore form fields
        if (formData.name) appRoot.querySelector('#memorial-name').value = formData.name;
        if (formData.title) appRoot.querySelector('#memorial-title').value = formData.title;
        if (formData.birthDate) populateDateFields(appRoot, 'birth', formData.birthDate);
        if (formData.birthPlace) appRoot.querySelector('#memorial-birth-place').value = formData.birthPlace;
        if (formData.deathDate) populateDateFields(appRoot, 'death', formData.deathDate);
        if (formData.deathPlace) appRoot.querySelector('#memorial-death-place').value = formData.deathPlace;
        if (formData.story) appRoot.querySelector('#memorial-story').value = formData.story;
        if (formData.cemeteryName) appRoot.querySelector('#memorial-cemetery-name').value = formData.cemeteryName;
        if (formData.cemeteryAddress) appRoot.querySelector('#memorial-cemetery-address').value = formData.cemeteryAddress;

        // Restore location data
        if (formData.cemeteryLocation) cemeteryLocation = formData.cemeteryLocation;
        if (formData.gravesiteLocation) gravesiteLocation = formData.gravesiteLocation;

        return true;
    } catch (e) {
        console.warn('Could not load form from localStorage:', e);
        return false;
    }
}

function clearFormLocalStorage() {
    try {
        localStorage.removeItem(FORM_STORAGE_KEY);
    } catch (e) {
        console.warn('Could not clear localStorage:', e);
    }
}

function setupAutoSave(appRoot) {
    // Auto-save on input changes (debounced)
    let autoSaveTimer = null;
    const formInputs = appRoot.querySelectorAll('input, textarea, select');

    formInputs.forEach(input => {
        input.addEventListener('input', () => {
            clearTimeout(autoSaveTimer);
            autoSaveTimer = setTimeout(() => saveFormToLocalStorage(appRoot), 1000);
        });
    });

    // Also save on step changes
    const originalNavigate = navigateToStep;
    // Note: We'll call saveFormToLocalStorage manually in step navigation
}

// --- AUTH MODAL FUNCTIONS ---
function initializeAuthModal(appRoot) {
    const modalEl = appRoot.querySelector('#authModal');
    if (!modalEl) return;

    authModal = new bootstrap.Modal(modalEl);

    // Sign up form handler
    const signupForm = appRoot.querySelector('#auth-signup-form');
    signupForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        await handleSignup(appRoot);
    });

    // Login form handler
    const loginForm = appRoot.querySelector('#auth-login-form');
    loginForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        await handleLogin(appRoot);
    });

    // Forgot password handler
    appRoot.querySelector('#auth-forgot-password')?.addEventListener('click', async (e) => {
        e.preventDefault();
        const email = appRoot.querySelector('#auth-login-email')?.value;
        if (!email) {
            showAuthError(appRoot, 'Please enter your email address first');
            return;
        }
        try {
            const { error } = await supabase.auth.resetPasswordForEmail(email);
            if (error) throw error;
            showToast('Password reset email sent! Check your inbox.', 'success');
        } catch (err) {
            showAuthError(appRoot, err.message);
        }
    });
}

async function handleSignup(appRoot) {
    const email = appRoot.querySelector('#auth-signup-email')?.value;
    const password = appRoot.querySelector('#auth-signup-password')?.value;
    const btn = appRoot.querySelector('#auth-signup-btn');

    if (!email || !password) {
        showAuthError(appRoot, 'Please fill in all fields');
        return;
    }

    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Creating account...';
    hideAuthError(appRoot);

    try {
        const { data, error } = await supabase.auth.signUp({
            email,
            password
        });

        if (error) throw error;

        // Close modal and continue save
        authModal.hide();
        showToast('Account created successfully!', 'success');

        // Continue with the pending save
        if (pendingSaveStatus) {
            await completeSaveAfterAuth(appRoot, pendingSaveStatus);
        }
    } catch (err) {
        showAuthError(appRoot, err.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-user-plus me-2"></i>Create Account & Save';
    }
}

async function handleLogin(appRoot) {
    const email = appRoot.querySelector('#auth-login-email')?.value;
    const password = appRoot.querySelector('#auth-login-password')?.value;
    const btn = appRoot.querySelector('#auth-login-btn');

    if (!email || !password) {
        showAuthError(appRoot, 'Please fill in all fields');
        return;
    }

    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Logging in...';
    hideAuthError(appRoot);

    try {
        const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password
        });

        if (error) throw error;

        // Close modal and continue save
        authModal.hide();
        showToast('Logged in successfully!', 'success');

        // Continue with the pending save
        if (pendingSaveStatus) {
            await completeSaveAfterAuth(appRoot, pendingSaveStatus);
        }
    } catch (err) {
        showAuthError(appRoot, err.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-sign-in-alt me-2"></i>Log In & Save';
    }
}

function showAuthError(appRoot, message) {
    const errorEl = appRoot.querySelector('#auth-error');
    const messageEl = appRoot.querySelector('#auth-error-message');
    if (errorEl && messageEl) {
        messageEl.textContent = message;
        errorEl.classList.remove('d-none');
    }
}

function hideAuthError(appRoot) {
    const errorEl = appRoot.querySelector('#auth-error');
    if (errorEl) {
        errorEl.classList.add('d-none');
    }
}

function showAuthModal(appRoot, saveStatus) {
    pendingSaveStatus = saveStatus;
    hideAuthError(appRoot);

    // Reset form fields
    appRoot.querySelector('#auth-signup-email').value = '';
    appRoot.querySelector('#auth-signup-password').value = '';
    appRoot.querySelector('#auth-login-email').value = '';
    appRoot.querySelector('#auth-login-password').value = '';

    authModal.show();
}

async function completeSaveAfterAuth(appRoot, status) {
    // Create a fake event to pass to saveMemorial
    const fakeEvent = { preventDefault: () => {} };
    await saveMemorial(fakeEvent, null, appRoot, status);
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
            updateGravesiteMapFromCemetery();
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

let gravesiteInlineMap = null;
let tempGravesiteLocation = null; // Temporary location while editing

// Initialize gravesite editor UI and event handlers
function initializeGravesiteEditor() {
    // Update UI based on current state
    updateGravesiteStatusUI();

    // Set Location button
    document.getElementById('gravesite-set-btn')?.addEventListener('click', openGravesiteEditor);

    // Adjust Location button
    document.getElementById('gravesite-adjust-btn')?.addEventListener('click', openGravesiteEditor);

    // Remove Location button
    document.getElementById('gravesite-remove-btn')?.addEventListener('click', removeGravesiteLocation);

    // Cancel button
    document.getElementById('gravesite-cancel-btn')?.addEventListener('click', closeGravesiteEditor);

    // Save Location button
    document.getElementById('gravesite-save-btn')?.addEventListener('click', saveGravesiteLocation);

    // GPS button
    document.getElementById('gravesite-gps-btn')?.addEventListener('click', useGPSForGravesite);
}

// Remove gravesite location
function removeGravesiteLocation() {
    if (!confirm('Are you sure you want to remove the gravesite location?')) {
        return;
    }

    gravesiteLocation = null;
    cemeteryLocation = null;

    // Clear any marker on the map
    if (gravesiteMarker) {
        gravesiteMarker.remove();
        gravesiteMarker = null;
    }

    updateGravesiteStatusUI();
    showToast('Gravesite location removed. Save the memorial to apply changes.', 'info');
}

// Update the status view UI
function updateGravesiteStatusUI() {
    const noLocationEl = document.getElementById('gravesite-no-location');
    const hasLocationEl = document.getElementById('gravesite-has-location');
    const coordsDisplayEl = document.getElementById('gravesite-coords-display');

    if (gravesiteLocation) {
        noLocationEl.style.display = 'none';
        hasLocationEl.style.display = 'block';
        coordsDisplayEl.textContent = `${gravesiteLocation.lat.toFixed(6)}, ${gravesiteLocation.lng.toFixed(6)}`;
    } else {
        noLocationEl.style.display = 'block';
        hasLocationEl.style.display = 'none';
    }
}

// Open the map editor
async function openGravesiteEditor() {
    const statusView = document.getElementById('gravesite-status-view');
    const mapEditor = document.getElementById('gravesite-map-editor');

    statusView.style.display = 'none';
    mapEditor.style.display = 'block';

    // Store current location in case of cancel
    tempGravesiteLocation = gravesiteLocation ? { ...gravesiteLocation } : null;

    // Initialize map if not already done
    if (!gravesiteInlineMap) {
        await initializeGravesiteMap();
    } else {
        // Resize and center on current location
        setTimeout(() => {
            gravesiteInlineMap.resize();
            if (gravesiteLocation) {
                gravesiteInlineMap.setCenter([gravesiteLocation.lng, gravesiteLocation.lat]);
                gravesiteInlineMap.setZoom(18);
            } else if (cemeteryLocation) {
                gravesiteInlineMap.setCenter([cemeteryLocation.lng, cemeteryLocation.lat]);
                gravesiteInlineMap.setZoom(17);
            }
        }, 100);
    }
}

// Initialize the map
async function initializeGravesiteMap() {
    const configModule = await import('/js/config.js');
    mapboxgl.accessToken = configModule.config.MAPBOX_ACCESS_TOKEN;

    let initialCenter = [-98.5795, 39.8283];
    let initialZoom = 4;

    if (gravesiteLocation) {
        initialCenter = [gravesiteLocation.lng, gravesiteLocation.lat];
        initialZoom = 18;
    } else if (cemeteryLocation) {
        initialCenter = [cemeteryLocation.lng, cemeteryLocation.lat];
        initialZoom = 17;
    }

    gravesiteInlineMap = new mapboxgl.Map({
        container: 'gravesite-inline-map',
        style: 'mapbox://styles/mapbox/satellite-streets-v12',
        center: initialCenter,
        zoom: initialZoom
    });

    gravesiteInlineMap.addControl(new mapboxgl.NavigationControl(), 'top-left');

    gravesiteInlineMap.on('move', () => {
        const center = gravesiteInlineMap.getCenter();
        const coordsText = document.getElementById('gravesite-coords-text');
        if (coordsText) {
            coordsText.textContent = `📍 ${center.lat.toFixed(6)}, ${center.lng.toFixed(6)}`;
        }
    });

    gravesiteInlineMap.on('load', () => {
        gravesiteInlineMap.resize();
    });
}

// Close editor without saving
function closeGravesiteEditor() {
    const statusView = document.getElementById('gravesite-status-view');
    const mapEditor = document.getElementById('gravesite-map-editor');

    mapEditor.style.display = 'none';
    statusView.style.display = 'block';

    // Restore previous location
    gravesiteLocation = tempGravesiteLocation;
    updateGravesiteStatusUI();
}

// Save the current map center as gravesite location
async function saveGravesiteLocation() {
    if (!gravesiteInlineMap) return;

    const center = gravesiteInlineMap.getCenter();
    gravesiteLocation = {
        lat: center.lat,
        lng: center.lng,
        accuracy: null
    };

    const statusView = document.getElementById('gravesite-status-view');
    const mapEditor = document.getElementById('gravesite-map-editor');

    mapEditor.style.display = 'none';
    statusView.style.display = 'block';

    updateGravesiteStatusUI();

    // If editing an existing memorial, save directly to database
    if (currentEditingMemorialId) {
        try {
            const { error } = await supabase
                .from('memorials')
                .update({
                    gravesite_lat: gravesiteLocation.lat,
                    gravesite_lng: gravesiteLocation.lng,
                    gravesite_accuracy: gravesiteLocation.accuracy
                })
                .eq('id', currentEditingMemorialId);

            if (error) {
                console.error('[memorial-form] Error saving gravesite location:', error);
                showToast('Gravesite location saved locally. Remember to publish to save permanently.', 'warning');
            } else {
                console.log('[memorial-form] Gravesite location saved to database');
                showToast('Gravesite location saved!', 'success');
            }
        } catch (err) {
            console.error('[memorial-form] Error saving gravesite:', err);
            showToast('Gravesite location saved locally. Remember to publish to save permanently.', 'warning');
        }
    } else {
        showToast('Gravesite location saved! Don\'t forget to publish your changes.', 'success');
    }
}

// Use GPS for gravesite
async function useGPSForGravesite() {
    const btn = document.getElementById('gravesite-gps-btn');
    if (!navigator.geolocation) {
        showToast('Geolocation not supported', 'error');
        return;
    }

    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

    try {
        const position = await new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 0
            });
        });

        const { latitude, longitude } = position.coords;
        gravesiteInlineMap.flyTo({
            center: [longitude, latitude],
            zoom: 18,
            duration: 1000
        });
        showToast('Map centered on your GPS location', 'info');
    } catch (err) {
        console.error('GPS error:', err);
        showToast('Could not get GPS location', 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-crosshairs"></i>';
    }
}

// Legacy function name for compatibility
function updateGravesiteUI() {
    updateGravesiteStatusUI();
}

// Center gravesite map on cemetery when cemetery location changes
function updateGravesiteMapFromCemetery() {
    // This will be used when opening the editor
}

// Show confirmation modal before setting gravesite location
function showGravesiteConfirmation(lat, lng, accuracy, onConfirm) {
    const cemeteryName = document.getElementById('memorial-cemetery-name')?.value?.trim() || '';
    const cemeteryAddress = document.getElementById('memorial-cemetery-address')?.value?.trim() || '';
    const memorialName = document.getElementById('memorial-name')?.value?.trim() || 'this person';

    // Create modal if it doesn't exist
    let modal = document.getElementById('gravesiteConfirmModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.className = 'modal fade';
        modal.id = 'gravesiteConfirmModal';
        modal.innerHTML = `
            <div class="modal-dialog modal-dialog-centered">
                <div class="modal-content">
                    <div class="modal-header bg-warning-subtle">
                        <h5 class="modal-title"><i class="fas fa-map-marker-alt me-2 text-danger"></i>Confirm Gravesite Location</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        <div class="alert alert-info mb-3">
                            <i class="fas fa-info-circle me-2"></i>
                            <strong>Please verify:</strong> You are about to pin the gravesite location for this memorial.
                        </div>
                        <div class="mb-3">
                            <strong>Memorial:</strong> <span id="confirm-memorial-name"></span>
                        </div>
                        <div class="mb-3" id="confirm-cemetery-info" style="display: none;">
                            <strong>Cemetery:</strong> <span id="confirm-cemetery-name"></span>
                            <div class="text-muted small" id="confirm-cemetery-address"></div>
                        </div>
                        <div class="mb-3">
                            <strong>GPS Coordinates:</strong>
                            <span class="font-monospace" id="confirm-gps-coords"></span>
                        </div>
                        <div class="alert alert-warning mb-0">
                            <i class="fas fa-exclamation-triangle me-2"></i>
                            <strong>Are you physically at the correct gravesite?</strong>
                            <div class="small mt-1">Make sure you're standing at the right grave before confirming. This helps visitors find the exact location.</div>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                        <button type="button" class="btn btn-success" id="confirm-gravesite-location-btn">
                            <i class="fas fa-check me-2"></i>Yes, Pin This Location
                        </button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }

    // Populate modal with details
    document.getElementById('confirm-memorial-name').textContent = memorialName;
    document.getElementById('confirm-gps-coords').textContent = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;

    const cemeteryInfoEl = document.getElementById('confirm-cemetery-info');
    if (cemeteryName || cemeteryAddress) {
        cemeteryInfoEl.style.display = 'block';
        document.getElementById('confirm-cemetery-name').textContent = cemeteryName || 'Not specified';
        document.getElementById('confirm-cemetery-address').textContent = cemeteryAddress || '';
    } else {
        cemeteryInfoEl.style.display = 'none';
    }

    const bsModal = new bootstrap.Modal(modal);

    // Handle confirm button
    document.getElementById('confirm-gravesite-location-btn').onclick = () => {
        onConfirm();
        bsModal.hide();
    };

    bsModal.show();
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

        // Show confirmation modal before saving
        showGravesiteConfirmation(latitude, longitude, accuracy, () => {
            gravesiteLocation = {
                lat: latitude,
                lng: longitude,
                accuracy: accuracy
            };
            updateGravesiteUI();
            showToast('Gravesite location pinned!', 'success');
        });

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
async function openGravesiteMapPicker() {
    // Ensure mapbox token is set
    const configModule = await import('/js/config.js');
    mapboxgl.accessToken = configModule.config.MAPBOX_ACCESS_TOKEN;

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

    // Handle confirm button - get center of map and show confirmation
    document.getElementById('confirm-gravesite-pin').onclick = () => {
        if (gravesiteMapPicker) {
            const center = gravesiteMapPicker.getCenter();
            bsModal.hide();

            // Show confirmation modal
            showGravesiteConfirmation(center.lat, center.lng, null, () => {
                gravesiteLocation = {
                    lat: center.lat,
                    lng: center.lng,
                    accuracy: null // Manual pin has no GPS accuracy
                };
                updateGravesiteUI();
                showToast('Gravesite location pinned!', 'success');
            });
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

// ========== HEADER BACKGROUND IMAGE ==========
// Fallback presets if API fails
const DEFAULT_HEADER_PRESETS = [
    { name: 'default', label: 'Teal', image_url: 'gradient:linear-gradient(135deg, #005F60 0%, #007a7a 50%, #00959a 100%)', is_default: true },
    { name: 'sunset-sky', label: 'Sunset', image_url: 'https://images.unsplash.com/photo-1495616811223-4d98c6e9c869?w=1920&h=400&fit=crop', preview_url: 'https://images.unsplash.com/photo-1495616811223-4d98c6e9c869?w=400&h=200&fit=crop' },
    { name: 'forest-path', label: 'Forest', image_url: 'https://images.unsplash.com/photo-1448375240586-882707db888b?w=1920&h=400&fit=crop', preview_url: 'https://images.unsplash.com/photo-1448375240586-882707db888b?w=400&h=200&fit=crop' },
    { name: 'ocean-waves', label: 'Beach', image_url: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=1920&h=400&fit=crop', preview_url: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=400&h=200&fit=crop' },
    { name: 'mountain-peaks', label: 'Mountains', image_url: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=1920&h=400&fit=crop', preview_url: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=400&h=200&fit=crop' },
    { name: 'clouds', label: 'Sky', image_url: 'https://images.unsplash.com/photo-1534088568595-a066f410bcda?w=1920&h=400&fit=crop', preview_url: 'https://images.unsplash.com/photo-1534088568595-a066f410bcda?w=400&h=200&fit=crop' },
    { name: 'starry-night', label: 'Stars', image_url: 'https://images.unsplash.com/photo-1519681393784-d120267933ba?w=1920&h=400&fit=crop', preview_url: 'https://images.unsplash.com/photo-1519681393784-d120267933ba?w=400&h=200&fit=crop' }
];

// Load header presets from API or use fallback
async function loadHeaderPresets() {
    try {
        const response = await fetch('/api/admin/header-presets');
        const data = await response.json();
        return data.presets || DEFAULT_HEADER_PRESETS;
    } catch (error) {
        console.log('[Header] Failed to load presets from API, using defaults:', error.message);
        return DEFAULT_HEADER_PRESETS;
    }
}

// Render preset grid dynamically
function renderPresetGrid(presetGrid, presets, selectedPreset = 'default') {
    presetGrid.innerHTML = presets.map(preset => {
        const isGradient = preset.image_url?.startsWith('gradient:');
        const isSelected = preset.name === selectedPreset || (preset.is_default && !selectedPreset);

        if (isGradient) {
            const gradientValue = preset.image_url.replace('gradient:', '');
            return `
                <div class="header-preset-item ${isSelected ? 'selected' : ''}" data-preset="${preset.name}" title="${preset.label}">
                    <div class="header-preset-preview" style="background: ${gradientValue};"></div>
                    <span class="header-preset-label">${preset.label}</span>
                </div>
            `;
        } else {
            const previewUrl = preset.preview_url || preset.image_url.replace('w=1920', 'w=400').replace('h=400', 'h=200');
            return `
                <div class="header-preset-item ${isSelected ? 'selected' : ''}" data-preset="${preset.name}" title="${preset.label}">
                    <img class="header-preset-preview" src="${previewUrl}" alt="${preset.label}">
                    <span class="header-preset-label">${preset.label}</span>
                </div>
            `;
        }
    }).join('');
}

async function setupHeaderImageSelector(appRoot) {
    const presetGrid = appRoot.querySelector('#header-preset-grid');
    const headerImageValue = appRoot.querySelector('#header-image-value');
    const headerImageType = appRoot.querySelector('#header-image-type');
    const customUpload = appRoot.querySelector('#header-image-upload');
    const previewContainer = appRoot.querySelector('#header-image-preview');
    const previewImg = previewContainer?.querySelector('.header-preview-img');
    const removeBtn = appRoot.querySelector('#remove-header-image');

    if (!presetGrid) {
        console.log('[Header] Preset grid not found');
        return;
    }

    console.log('[Header] Setting up header image selector');

    // Load and render presets dynamically
    const presets = await loadHeaderPresets();
    renderPresetGrid(presetGrid, presets, headerImageValue?.value);

    // Handle preset selection using event delegation
    presetGrid.addEventListener('click', (e) => {
        // Find the clicked preset item (or its parent)
        const item = e.target.closest('.header-preset-item');
        if (!item) return;

        // Prevent duplicate clicks
        e.stopPropagation();

        // Skip if already selected
        if (item.classList.contains('selected')) return;

        console.log('[Header] Preset clicked:', item.dataset.preset);

        // Clear custom image
        customHeaderImageFile = null;
        if (customUpload) customUpload.value = '';
        if (previewContainer) previewContainer.style.display = 'none';

        // Update selection
        presetGrid.querySelectorAll('.header-preset-item').forEach(i => i.classList.remove('selected'));
        item.classList.add('selected');

        // Update hidden fields
        const preset = item.dataset.preset;
        if (headerImageValue) headerImageValue.value = preset;
        if (headerImageType) headerImageType.value = 'preset';

        showToast(`Header background set to ${preset}`, 'success');
    });

    // Handle custom upload
    if (customUpload) {
        customUpload.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;

            console.log('[Header] Custom image selected:', file.name, file.size);

            // Validate file size (max 10MB)
            if (file.size > 10 * 1024 * 1024) {
                showToast('Image is too large. Maximum size is 10MB.', 'error');
                customUpload.value = '';
                return;
            }

            // Store file for upload
            customHeaderImageFile = file;

            // Show preview - use IDs for reliable selection
            const previewEl = appRoot.querySelector('#header-image-preview');
            const imgEl = appRoot.querySelector('#header-preview-img');

            console.log('[Header] Preview elements found:', !!previewEl, !!imgEl);

            const reader = new FileReader();
            reader.onload = (evt) => {
                console.log('[Header] FileReader loaded');
                if (imgEl) {
                    imgEl.src = evt.target.result;
                    console.log('[Header] Image src set');
                }
                if (previewEl) {
                    previewEl.style.display = 'block';
                    console.log('[Header] Preview shown');
                }

                // Deselect presets
                presetGrid.querySelectorAll('.header-preset-item').forEach(i => i.classList.remove('selected'));

                // Update hidden fields
                if (headerImageType) headerImageType.value = 'custom';

                showToast('Custom header image selected!', 'success');
            };
            reader.onerror = () => {
                console.error('[Header] FileReader error');
                showToast('Error reading image file', 'error');
            };
            reader.readAsDataURL(file);
        });
    } else {
        console.log('[Header] Custom upload input not found');
    }

    // Handle remove button
    if (removeBtn) {
        removeBtn.addEventListener('click', () => {
            customHeaderImageFile = null;
            if (customUpload) customUpload.value = '';
            if (previewContainer) previewContainer.style.display = 'none';

            // Select default preset
            presetGrid.querySelectorAll('.header-preset-item').forEach(i => i.classList.remove('selected'));
            const defaultItem = presetGrid.querySelector('[data-preset="default"]');
            if (defaultItem) defaultItem.classList.add('selected');

            if (headerImageValue) headerImageValue.value = 'default';
            if (headerImageType) headerImageType.value = 'preset';
        });
    }
}

// Get header image data for saving
function getHeaderImageData(appRoot) {
    const headerImageType = appRoot.querySelector('#header-image-type')?.value || 'preset';
    const headerImageValue = appRoot.querySelector('#header-image-value')?.value || 'default';

    console.log('[Header Save] Getting header data:', {
        type: headerImageType,
        value: headerImageValue,
        hasFile: !!customHeaderImageFile,
        fileName: customHeaderImageFile?.name
    });

    return {
        type: headerImageType,
        value: headerImageValue,  // Always include the value (could be preset name or custom URL)
        file: customHeaderImageFile
    };
}

// Set header image selection when editing
function setHeaderImageSelection(appRoot, headerImage, headerImageType) {
    const presetGrid = appRoot.querySelector('#header-preset-grid');
    const headerImageValueEl = appRoot.querySelector('#header-image-value');
    const headerImageTypeEl = appRoot.querySelector('#header-image-type');
    const previewContainer = appRoot.querySelector('#header-image-preview');
    const previewImg = previewContainer?.querySelector('.header-preview-img');

    if (!presetGrid) return;

    // Clear all selections first
    presetGrid.querySelectorAll('.header-preset-item').forEach(i => i.classList.remove('selected'));

    if (headerImageType === 'custom' && headerImage) {
        // Show custom image preview
        if (previewImg) previewImg.src = headerImage;
        if (previewContainer) previewContainer.style.display = 'block';
        if (headerImageTypeEl) headerImageTypeEl.value = 'custom';
        if (headerImageValueEl) headerImageValueEl.value = headerImage;
    } else {
        // Select preset
        const presetValue = headerImage || 'default';
        const presetItem = presetGrid.querySelector(`[data-preset="${presetValue}"]`);
        if (presetItem) {
            presetItem.classList.add('selected');
        } else {
            // Default fallback
            presetGrid.querySelector('[data-preset="default"]')?.classList.add('selected');
        }
        if (headerImageTypeEl) headerImageTypeEl.value = 'preset';
        if (headerImageValueEl) headerImageValueEl.value = presetValue;
        if (previewContainer) previewContainer.style.display = 'none';
    }
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
            updateGravesiteMapFromCemetery();
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

// Cemetery lookup debounce timer
let cemeteryLookupTimer = null;

// Look up cemetery info from other memorials in the same cemetery
async function lookupCemeteryInfo(appRoot) {
    const cemeteryNameInput = appRoot.querySelector('#memorial-cemetery-name');
    const addressInput = appRoot.querySelector('#memorial-cemetery-address');
    const cemeteryName = cemeteryNameInput?.value?.trim();

    // Don't lookup if name is too short or address already filled
    if (!cemeteryName || cemeteryName.length < 3) return;
    if (addressInput?.value?.trim()?.length > 10) return; // Already has address

    try {
        const response = await fetch(`/api/geo/cemetery-lookup?name=${encodeURIComponent(cemeteryName)}`);
        if (!response.ok) return;

        const data = await response.json();

        if (data.found && data.cemetery) {
            const cemetery = data.cemetery;
            const hasAddress = cemetery.address && cemetery.address.length > 0;
            const hasCoords = cemetery.lat && cemetery.lng;

            if (hasAddress || hasCoords) {
                // Show auto-fill suggestion
                const message = hasAddress
                    ? `Found "${cemetery.name}" with ${cemetery.memorialCount} memorial(s). Use address: ${cemetery.address}?`
                    : `Found "${cemetery.name}" with ${cemetery.memorialCount} memorial(s) and GPS coordinates. Apply location?`;

                if (confirm(message)) {
                    // Auto-fill the address if available
                    if (hasAddress && addressInput) {
                        addressInput.value = cemetery.address;
                        originalAddress = cemetery.address;
                    }

                    // Apply coordinates if available
                    if (hasCoords) {
                        cemeteryLocation = { lat: cemetery.lat, lng: cemetery.lng };
                        const statusEl = appRoot.querySelector('#geocode-status');
                        if (statusEl) {
                            statusEl.innerHTML = '<i class="fas fa-check-circle text-success"></i> Location auto-filled from existing memorial';
                        }
                        updateGravesiteMapFromCemetery();
                        showCemeteryMapPreview(appRoot, cemetery.lat, cemetery.lng, cemetery.address || cemetery.name);
                    }

                    showToast('Cemetery info auto-filled from existing memorial', 'success');
                }
            }
        }
    } catch (error) {
        console.error('Cemetery lookup error:', error);
        // Silent fail - this is just a convenience feature
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
    // Handle both File objects (with .name) and Blob objects (without .name)
    const originalName = file.name || `${photoType}.jpg`;
    const filename = `${photoType}_${timestamp}_${originalName.replace(/[^a-zA-Z0-9.]/g, '_')}`;
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

        // Upload main photo if cropped (new cropping system) or selected from file
        if (croppedImageBlob) {
            // Use the cropped image blob
            uploadedPhotos.mainPhoto = await uploadPhotoToStorage(croppedImageBlob, memorialId, 'main');
        } else if (mainPhotoInput && mainPhotoInput.files.length > 0) {
            // Fallback to original file if somehow no crop was done
            const mainPhoto = mainPhotoInput.files[0];
            uploadedPhotos.mainPhoto = await uploadPhotoToStorage(mainPhoto, memorialId, 'main');
        }

        // Upload gallery photos if selected
        if (galleryPhotosInput && galleryPhotosInput.files.length > 0) {
            const galleryFiles = Array.from(galleryPhotosInput.files);
            const galleryUrls = [];

            for (let i = 0; i < galleryFiles.length; i++) {
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

// --- Video Upload Functions ---
async function uploadVideoToStorage(file, memorialId, videoType = 'video') {
    if (!file) return null;

    // Validate file type
    if (!file.type.startsWith('video/')) {
        throw new Error('File must be a video');
    }

    if (file.size > MAX_VIDEO_SIZE) {
        throw new Error(`Video must be smaller than ${MAX_VIDEO_SIZE / 1024 / 1024}MB`);
    }

    const timestamp = Date.now();
    const originalName = file.name || `${videoType}.webm`;
    const filename = `${videoType}_${timestamp}_${originalName.replace(/[^a-zA-Z0-9.]/g, '_')}`;
    const filePath = `${memorialId}/${filename}`;

    const { data, error } = await supabase.storage
        .from('videos')
        .upload(filePath, file, {
            cacheControl: '3600',
            upsert: false
        });

    if (error) {
        console.error('Video upload error:', error);
        throw error;
    }

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
        .from('videos')
        .getPublicUrl(filePath);

    return publicUrl;
}

async function handleVideoUploads(memorialId) {
    if (pendingVideos.length === 0) return [];

    const uploadedVideos = [];

    for (const video of pendingVideos) {
        try {
            const url = await uploadVideoToStorage(video.blob, memorialId, `video_${uploadedVideos.length}`);
            uploadedVideos.push({
                url,
                title: video.title || '',
                duration: video.duration || 0
            });
        } catch (err) {
            console.error('Failed to upload video:', err);
            showToast('Failed to upload one video', 'error');
        }
    }

    return uploadedVideos;
}

// --- Video Recording Functions ---
function initializeVideoRecording(appRoot) {
    const recordBtn = appRoot.querySelector('#record-video-btn');
    const uploadBtn = appRoot.querySelector('#upload-video-btn');
    const videoInput = appRoot.querySelector('#video-file-input');

    if (recordBtn) {
        recordBtn.addEventListener('click', () => openVideoRecordModal());
    }

    if (uploadBtn && videoInput) {
        uploadBtn.addEventListener('click', () => videoInput.click());
        videoInput.addEventListener('change', handleVideoFileSelect);
    }

    // Initialize the recording modal
    const modalEl = document.querySelector('#videoRecordModal');
    if (modalEl) {
        videoRecordModal = new bootstrap.Modal(modalEl);

        // Cleanup when modal is closed
        modalEl.addEventListener('hidden.bs.modal', cleanupVideoRecording);

        // Wire up modal buttons
        document.querySelector('#request-camera-btn')?.addEventListener('click', requestCameraAccess);
        document.querySelector('#start-recording-btn')?.addEventListener('click', startRecording);
        document.querySelector('#stop-recording-btn')?.addEventListener('click', stopRecording);
        document.querySelector('#retake-video-btn')?.addEventListener('click', retakeVideo);
        document.querySelector('#save-video-btn')?.addEventListener('click', saveRecordedVideo);
        document.querySelector('#camera-select')?.addEventListener('change', switchCamera);
    }

    // Render existing videos if editing
    renderVideosPreview(appRoot);
}

function openVideoRecordModal() {
    if (!videoRecordModal) return;

    // Reset modal state
    document.getElementById('video-permission-request').style.display = 'block';
    document.getElementById('video-recording-interface').style.display = 'none';
    document.getElementById('video-review-interface').style.display = 'none';
    document.getElementById('video-error').style.display = 'none';
    document.getElementById('retake-video-btn').style.display = 'none';
    document.getElementById('save-video-btn').style.display = 'none';

    videoRecordModal.show();
}

async function requestCameraAccess() {
    const errorEl = document.getElementById('video-error');
    errorEl.style.display = 'none';

    try {
        // Get available cameras
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(d => d.kind === 'videoinput');

        // Populate camera select
        const cameraSelect = document.getElementById('camera-select');
        cameraSelect.innerHTML = videoDevices.map((device, i) =>
            `<option value="${device.deviceId}">${device.label || `Camera ${i + 1}`}</option>`
        ).join('');

        // Request camera access
        mediaStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
            audio: true
        });

        // Show video preview
        const videoPreview = document.getElementById('video-preview');
        videoPreview.srcObject = mediaStream;

        // Switch UI
        document.getElementById('video-permission-request').style.display = 'none';
        document.getElementById('video-recording-interface').style.display = 'block';

    } catch (err) {
        console.error('Camera access error:', err);
        errorEl.textContent = 'Could not access camera. Please ensure camera permissions are granted.';
        errorEl.style.display = 'block';
    }
}

async function switchCamera(e) {
    const deviceId = e.target.value;
    if (!deviceId) return;

    // Stop current stream
    if (mediaStream) {
        mediaStream.getTracks().forEach(track => track.stop());
    }

    try {
        mediaStream = await navigator.mediaDevices.getUserMedia({
            video: { deviceId: { exact: deviceId }, width: { ideal: 1280 }, height: { ideal: 720 } },
            audio: true
        });

        const videoPreview = document.getElementById('video-preview');
        videoPreview.srcObject = mediaStream;
    } catch (err) {
        console.error('Camera switch error:', err);
        showToast('Failed to switch camera', 'error');
    }
}

function startRecording() {
    if (!mediaStream) return;

    recordedChunks = [];

    // Determine best supported format
    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
        ? 'video/webm;codecs=vp9'
        : MediaRecorder.isTypeSupported('video/webm')
            ? 'video/webm'
            : 'video/mp4';

    try {
        mediaRecorder = new MediaRecorder(mediaStream, { mimeType });
    } catch (err) {
        // Fallback without mime type
        mediaRecorder = new MediaRecorder(mediaStream);
    }

    mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
            recordedChunks.push(e.data);
        }
    };

    mediaRecorder.onstop = () => {
        showVideoReview();
    };

    mediaRecorder.start(1000); // Collect data every second
    recordingStartTime = Date.now();

    // Update UI
    document.getElementById('start-recording-btn').style.display = 'none';
    document.getElementById('stop-recording-btn').style.display = 'inline-flex';
    document.getElementById('recording-indicator').style.display = 'flex';
    document.getElementById('camera-selection').style.display = 'none';

    // Start timer
    recordingTimerInterval = setInterval(updateRecordingTimer, 1000);
}

function updateRecordingTimer() {
    const elapsed = Math.floor((Date.now() - recordingStartTime) / 1000);
    const minutes = Math.floor(elapsed / 60);
    const seconds = elapsed % 60;
    document.getElementById('recording-time').textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;

    // Auto-stop at max duration
    if (elapsed >= MAX_VIDEO_DURATION) {
        stopRecording();
        showToast('Maximum recording time reached (2 minutes)', 'info');
    }
}

function stopRecording() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
    }

    clearInterval(recordingTimerInterval);

    // Update UI
    document.getElementById('stop-recording-btn').style.display = 'none';
    document.getElementById('recording-indicator').style.display = 'none';
}

function showVideoReview() {
    const blob = new Blob(recordedChunks, { type: 'video/webm' });
    const url = URL.createObjectURL(blob);

    // Stop camera preview
    if (mediaStream) {
        mediaStream.getTracks().forEach(track => track.stop());
    }

    // Show playback
    const playbackVideo = document.getElementById('video-playback');
    playbackVideo.src = url;

    document.getElementById('video-recording-interface').style.display = 'none';
    document.getElementById('video-review-interface').style.display = 'block';
    document.getElementById('retake-video-btn').style.display = 'inline-block';
    document.getElementById('save-video-btn').style.display = 'inline-block';
}

function retakeVideo() {
    // Reset state
    recordedChunks = [];
    document.getElementById('video-title-input').value = '';

    // Re-request camera
    document.getElementById('video-review-interface').style.display = 'none';
    document.getElementById('retake-video-btn').style.display = 'none';
    document.getElementById('save-video-btn').style.display = 'none';
    document.getElementById('start-recording-btn').style.display = 'inline-flex';
    document.getElementById('camera-selection').style.display = 'block';

    requestCameraAccess();
}

function saveRecordedVideo() {
    const blob = new Blob(recordedChunks, { type: 'video/webm' });
    const title = document.getElementById('video-title-input').value.trim();
    const duration = Math.floor((Date.now() - recordingStartTime) / 1000);

    // Check size
    if (blob.size > MAX_VIDEO_SIZE) {
        showToast(`Video is too large (${(blob.size / 1024 / 1024).toFixed(1)}MB). Maximum size is 50MB.`, 'error');
        return;
    }

    // Add to pending videos
    pendingVideos.push({ blob, title, duration });

    // Close modal and show preview
    videoRecordModal.hide();
    renderVideosPreview();
    showToast('Video saved! Remember to publish your changes.', 'success');
}

function handleVideoFileSelect(e) {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    for (const file of files) {
        // Validate type
        if (!file.type.startsWith('video/')) {
            showToast(`${file.name} is not a video file`, 'error');
            continue;
        }

        // Validate size
        if (file.size > MAX_VIDEO_SIZE) {
            const sizeMB = (file.size / 1024 / 1024).toFixed(1);
            showToast(`${file.name} is too large (${sizeMB}MB). Maximum size is 50MB.`, 'error');
            continue;
        }

        // Get video duration
        const video = document.createElement('video');
        video.preload = 'metadata';
        video.onloadedmetadata = () => {
            URL.revokeObjectURL(video.src);
            const duration = Math.floor(video.duration);

            // Add to pending
            pendingVideos.push({
                blob: file,
                title: file.name.replace(/\.[^/.]+$/, ''), // Remove extension
                duration
            });

            renderVideosPreview();
            showToast('Video added! Remember to publish your changes.', 'success');
        };
        video.src = URL.createObjectURL(file);
    }

    // Clear input
    e.target.value = '';
}

function renderVideosPreview(appRoot) {
    const container = document.getElementById('videos-preview');
    if (!container) return;

    container.innerHTML = pendingVideos.map((video, index) => {
        const url = video.blob instanceof Blob ? URL.createObjectURL(video.blob) : video.url;
        const duration = formatDuration(video.duration);
        const size = video.blob instanceof Blob ? `${(video.blob.size / 1024 / 1024).toFixed(1)}MB` : '';

        return `
            <div class="video-preview-item" data-index="${index}">
                <video src="${url}" preload="metadata"></video>
                <div class="video-preview-info">
                    <div class="video-title">${video.title || 'Untitled Video'}</div>
                    <div class="video-meta">${duration}${size ? ' • ' + size : ''}</div>
                </div>
                <div class="video-preview-actions">
                    <button type="button" class="btn btn-sm btn-outline-danger remove-video-btn" title="Remove">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        `;
    }).join('');

    // Wire up remove buttons
    container.querySelectorAll('.remove-video-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const item = e.target.closest('.video-preview-item');
            const index = parseInt(item.dataset.index);
            pendingVideos.splice(index, 1);
            renderVideosPreview();
        });
    });
}

function formatDuration(seconds) {
    if (!seconds) return '';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function cleanupVideoRecording() {
    // Stop all tracks
    if (mediaStream) {
        mediaStream.getTracks().forEach(track => track.stop());
        mediaStream = null;
    }

    // Stop recorder
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
    }
    mediaRecorder = null;

    // Clear timer
    clearInterval(recordingTimerInterval);

    // Reset UI elements
    recordedChunks = [];
    recordingStartTime = null;
}

// --- Living Legacy Messages Functions ---
function initializeLegacyMessages(appRoot) {
    const addBtn = appRoot.querySelector('#add-legacy-message-btn');
    const modalEl = document.querySelector('#legacyMessageModal');

    if (modalEl) {
        legacyMessageModal = new bootstrap.Modal(modalEl);

        // Wire up delivery type cards
        modalEl.querySelectorAll('.delivery-type-card').forEach(card => {
            card.addEventListener('click', () => {
                modalEl.querySelectorAll('.delivery-type-card').forEach(c => c.classList.remove('selected'));
                card.classList.add('selected');
                document.getElementById('lm-delivery-type').value = card.dataset.type;
                updateDeliveryOptions(card.dataset.type);
            });
        });

        // Wire up milestone type change
        const milestoneSelect = modalEl.querySelector('#lm-milestone-type');
        if (milestoneSelect) {
            milestoneSelect.addEventListener('change', () => {
                const yearContainer = document.getElementById('milestone-year-container');
                yearContainer.style.display = milestoneSelect.value ? 'block' : 'none';
            });
        }

        // Wire up anniversary type change
        const anniversarySelect = modalEl.querySelector('#lm-anniversary-type');
        if (anniversarySelect) {
            anniversarySelect.addEventListener('change', () => {
                const customDate = document.getElementById('anniversary-custom-date');
                customDate.style.display = anniversarySelect.value === 'custom' ? 'block' : 'none';
            });
        }

        // Wire up save button
        document.querySelector('#save-legacy-message-btn')?.addEventListener('click', () => saveLegacyMessage(appRoot));
    }

    if (addBtn) {
        addBtn.addEventListener('click', () => openLegacyMessageModal());
    }
}

function updateDeliveryOptions(type) {
    document.getElementById('delivery-date-options').style.display = type === 'date' ? 'block' : 'none';
    document.getElementById('delivery-milestone-options').style.display = type === 'milestone' ? 'block' : 'none';
    document.getElementById('delivery-anniversary-options').style.display = type === 'anniversary' ? 'block' : 'none';
}

function openLegacyMessageModal(messageData = null) {
    if (!legacyMessageModal) return;

    // Reset form
    document.getElementById('legacy-message-id').value = messageData?.id || '';
    document.getElementById('lm-recipient-name').value = messageData?.recipient_name || '';
    document.getElementById('lm-recipient-email').value = messageData?.recipient_email || '';
    document.getElementById('lm-recipient-relationship').value = messageData?.recipient_relationship || '';
    document.getElementById('lm-delivery-type').value = messageData?.delivery_type || '';
    document.getElementById('lm-delivery-date').value = messageData?.scheduled_date || '';
    document.getElementById('lm-milestone-type').value = messageData?.milestone_type || '';
    document.getElementById('lm-milestone-year').value = messageData?.milestone_year || '';
    document.getElementById('lm-anniversary-type').value = messageData?.recurring_description || '';
    document.getElementById('lm-subject').value = messageData?.subject || '';
    document.getElementById('lm-content').value = messageData?.message_content || '';
    document.getElementById('lm-error').style.display = 'none';

    // Reset delivery type selection
    document.querySelectorAll('.delivery-type-card').forEach(c => c.classList.remove('selected'));
    if (messageData?.delivery_type) {
        document.querySelector(`.delivery-type-card[data-type="${messageData.delivery_type}"]`)?.classList.add('selected');
        updateDeliveryOptions(messageData.delivery_type);
    } else {
        updateDeliveryOptions('');
    }

    // Update modal title
    document.getElementById('legacyMessageModalLabel').innerHTML = messageData
        ? '<i class="fas fa-edit text-primary me-2"></i>Edit Message'
        : '<i class="fas fa-envelope-open-text text-primary me-2"></i>Schedule a Message';

    legacyMessageModal.show();
}

async function saveLegacyMessage(appRoot) {
    const errorEl = document.getElementById('lm-error');
    errorEl.style.display = 'none';

    // Gather form data
    const recipientName = document.getElementById('lm-recipient-name').value.trim();
    const recipientEmail = document.getElementById('lm-recipient-email').value.trim();
    const deliveryType = document.getElementById('lm-delivery-type').value;
    const subject = document.getElementById('lm-subject').value.trim();
    const content = document.getElementById('lm-content').value.trim();

    // Validation
    if (!recipientName || !recipientEmail || !subject || !content) {
        errorEl.textContent = 'Please fill in all required fields.';
        errorEl.style.display = 'block';
        return;
    }

    if (!deliveryType) {
        errorEl.textContent = 'Please select when the message should be delivered.';
        errorEl.style.display = 'block';
        return;
    }

    // Get auth token
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
        errorEl.textContent = 'Please sign in to save messages.';
        errorEl.style.display = 'block';
        return;
    }

    const saveBtn = document.getElementById('save-legacy-message-btn');
    saveBtn.disabled = true;
    saveBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Saving...';

    try {
        const memorialId = currentEditingMemorialId;
        if (!memorialId) {
            throw new Error('Please save the memorial first before adding legacy messages.');
        }

        // Build request body
        const body = {
            memorialId,
            recipientEmail,
            recipientName,
            recipientRelationship: document.getElementById('lm-recipient-relationship').value,
            messageType: 'post_need',
            deliveryTrigger: deliveryType,
            subject,
            content
        };

        // Add type-specific fields
        if (deliveryType === 'date') {
            body.deliveryDate = document.getElementById('lm-delivery-date').value;
        } else if (deliveryType === 'milestone') {
            body.milestoneType = document.getElementById('lm-milestone-type').value;
        }

        const messageId = document.getElementById('legacy-message-id').value;
        const method = messageId ? 'PUT' : 'POST';
        if (messageId) body.id = messageId;

        const response = await fetch('/api/messages/legacy-messages', {
            method,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.access_token}`
            },
            body: JSON.stringify(body)
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.error || 'Failed to save message');
        }

        // Refresh the list
        await loadLegacyMessages(appRoot);

        legacyMessageModal.hide();
        showToast(messageId ? 'Message updated!' : 'Message scheduled!', 'success');

    } catch (error) {
        console.error('Error saving legacy message:', error);
        errorEl.textContent = error.message;
        errorEl.style.display = 'block';
    } finally {
        saveBtn.disabled = false;
        saveBtn.innerHTML = '<i class="fas fa-paper-plane me-2"></i>Schedule Message';
    }
}

async function loadLegacyMessages(appRoot) {
    const container = appRoot.querySelector('#legacy-messages-list');
    const placeholder = appRoot.querySelector('#no-messages-placeholder');
    if (!container) return;

    const { data: { session } } = await supabase.auth.getSession();
    if (!session || !currentEditingMemorialId) {
        legacyMessages = [];
        renderLegacyMessages(appRoot);
        return;
    }

    try {
        const response = await fetch(`/api/messages/legacy-messages?memorialId=${currentEditingMemorialId}`, {
            headers: {
                'Authorization': `Bearer ${session.access_token}`
            }
        });

        const result = await response.json();
        legacyMessages = result.messages || [];
        renderLegacyMessages(appRoot);

    } catch (error) {
        console.error('Error loading legacy messages:', error);
        legacyMessages = [];
        renderLegacyMessages(appRoot);
    }
}

function renderLegacyMessages(appRoot) {
    const container = appRoot.querySelector('#legacy-messages-list');
    const placeholder = appRoot.querySelector('#no-messages-placeholder');
    if (!container) return;

    if (legacyMessages.length === 0) {
        if (placeholder) placeholder.style.display = 'block';
        container.innerHTML = placeholder ? '' : '<div class="text-center py-4 text-muted"><i class="fas fa-inbox fa-2x mb-2 opacity-50"></i><p>No scheduled messages yet</p></div>';
        return;
    }

    if (placeholder) placeholder.style.display = 'none';

    container.innerHTML = legacyMessages.map(msg => {
        const iconClass = msg.delivery_type === 'milestone' ? 'milestone' : (msg.delivery_type === 'anniversary' ? 'anniversary' : '');
        const iconName = msg.delivery_type === 'milestone' ? 'graduation-cap' : (msg.delivery_type === 'anniversary' ? 'heart' : 'calendar-day');

        let deliveryText = '';
        if (msg.delivery_type === 'date' && msg.scheduled_date) {
            deliveryText = new Date(msg.scheduled_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        } else if (msg.delivery_type === 'milestone') {
            deliveryText = msg.milestone_type?.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) || 'Milestone';
        } else if (msg.delivery_type === 'anniversary') {
            deliveryText = msg.recurring_description || 'Anniversary';
        }

        return `
            <div class="legacy-message-item" data-id="${msg.id}">
                <div class="legacy-message-icon ${iconClass}">
                    <i class="fas fa-${iconName}"></i>
                </div>
                <div class="legacy-message-info">
                    <h6>${msg.subject || 'Untitled Message'}</h6>
                    <div class="legacy-message-meta">
                        <span><i class="fas fa-user"></i> ${msg.recipient_name}</span>
                        <span><i class="fas fa-clock"></i> ${deliveryText}</span>
                        <span class="badge ${msg.status === 'pending' ? 'bg-warning' : 'bg-success'}">${msg.status}</span>
                    </div>
                </div>
                <div class="legacy-message-actions">
                    <button type="button" class="btn btn-outline-primary edit-legacy-msg-btn" title="Edit">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button type="button" class="btn btn-outline-danger delete-legacy-msg-btn" title="Delete">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        `;
    }).join('');

    // Wire up edit buttons
    container.querySelectorAll('.edit-legacy-msg-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const item = e.target.closest('.legacy-message-item');
            const msgId = item.dataset.id;
            const msg = legacyMessages.find(m => m.id === msgId);
            if (msg) openLegacyMessageModal(msg);
        });
    });

    // Wire up delete buttons
    container.querySelectorAll('.delete-legacy-msg-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const item = e.target.closest('.legacy-message-item');
            const msgId = item.dataset.id;
            if (confirm('Are you sure you want to delete this scheduled message?')) {
                await deleteLegacyMessage(msgId, appRoot);
            }
        });
    });
}

async function deleteLegacyMessage(messageId, appRoot) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    try {
        const response = await fetch(`/api/messages/legacy-messages?id=${messageId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${session.access_token}`
            }
        });

        if (!response.ok) {
            const result = await response.json();
            throw new Error(result.error || 'Failed to delete message');
        }

        await loadLegacyMessages(appRoot);
        showToast('Message deleted', 'success');

    } catch (error) {
        console.error('Error deleting legacy message:', error);
        showToast(error.message, 'error');
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
        const photoLimit = getPhotoLimit();

        // Check if over the limit
        if (files.length > photoLimit) {
            showToast(`Free tier allows up to ${photoLimit} photos. Upgrade to Complete Legacy Package for unlimited photos.`, 'info');
        }

        files.slice(0, photoLimit).forEach((file, index) => {
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

    // If not logged in, show auth modal
    if (!user) {
        // Save form data to localStorage first
        saveFormToLocalStorage(appRoot);
        showAuthModal(appRoot, desiredStatus);
        return;
    }

    const saveButton = appRoot.querySelector(desiredStatus === 'draft' ? '#save-draft-button' : '#publish-button');
    saveButton.disabled = true;
    saveButton.innerHTML = `<span class="spinner-border spinner-border-sm"></span> Saving...`;

    try {
        const memorialName = appRoot.querySelector('#memorial-name').value;
        const newMemorialId = memorialId || generateSlugId(memorialName);

        // Determine final status - living legacies always stay as 'living_legacy'
        const finalStatus = isLivingLegacyMode ? 'living_legacy' : desiredStatus;

        const memorialData = {
            id: newMemorialId,
            name: memorialName,
            title: appRoot.querySelector('#memorial-title').value,
            birth_date: buildDateFromFields(appRoot, 'birth'),
            birth_place: appRoot.querySelector('#memorial-birth-place')?.value || null,
            death_date: isLivingLegacyMode ? null : buildDateFromFields(appRoot, 'death'),
            death_place: isLivingLegacyMode ? null : (appRoot.querySelector('#memorial-death-place')?.value || null),
            bio: appRoot.querySelector('#memorial-story').value,
            cemetery_name: appRoot.querySelector('#memorial-cemetery-name').value,
            cemetery_address: appRoot.querySelector('#memorial-cemetery-address').value,
            relatives: getDynamicFieldValues(appRoot, 'relatives'),
            milestones: getDynamicFieldValues(appRoot, 'milestones'),
            residences: getDynamicFieldValues(appRoot, 'residences'),
            world_events: getSelectedWorldEvents(appRoot),
            status: finalStatus,
            tier: appRoot.querySelector('#memorial-tier')?.value || currentTier || 'basic',
            // Privacy settings
            show_recent: appRoot.querySelector('#show-recent')?.checked ?? true,
            show_dates: appRoot.querySelector('#show-dates')?.checked ?? true,
            show_timeline: appRoot.querySelector('#show-timeline')?.checked ?? true,
            show_gallery: appRoot.querySelector('#show-gallery')?.checked ?? true,
            show_family_tree: appRoot.querySelector('#show-family-tree')?.checked ?? true,
            show_guest_book: appRoot.querySelector('#show-guest-book')?.checked ?? true,
        };

        // Cemetery location: from geocoded cemetery address
        if (cemeteryLocation) {
            memorialData.cemetery_lat = cemeteryLocation.lat;
            memorialData.cemetery_lng = cemeteryLocation.lng;
        }

        // Gravesite location: ONLY from explicit gravesite pin (more precise than cemetery)
        if (gravesiteLocation) {
            memorialData.gravesite_lat = gravesiteLocation.lat;
            memorialData.gravesite_lng = gravesiteLocation.lng;
            memorialData.gravesite_accuracy = gravesiteLocation.accuracy || null;
            memorialData.needs_location = false;
        } else {
            // Clear gravesite if no pin is set
            memorialData.gravesite_lat = null;
            memorialData.gravesite_lng = null;
            memorialData.gravesite_accuracy = null;
        }

        // Fallback: If no gravesite AND no cemetery location, geocode death place
        const hasExactLocation = gravesiteLocation || cemeteryLocation;
        const deathPlace = memorialData.death_place;

        if (!hasExactLocation && deathPlace && !isLivingLegacyMode) {
            try {
                saveButton.innerHTML = `<span class="spinner-border spinner-border-sm"></span> Finding location...`;
                const geocodeResponse = await fetch('/api/geo/geocode', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ address: deathPlace })
                });

                if (geocodeResponse.ok) {
                    const geocodeData = await geocodeResponse.json();
                    if (geocodeData.lat && geocodeData.lng) {
                        // Use death place as approximate location
                        memorialData.location_lat = geocodeData.lat;
                        memorialData.location_lng = geocodeData.lng;
                        memorialData.needs_location = true; // Flag that exact cemetery is unknown
                        console.log('[memorial-form] Using death place as approximate location:', deathPlace);
                    }
                }
            } catch (err) {
                console.warn('[memorial-form] Could not geocode death place:', err);
            }
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

        // Handle header background image
        const headerData = getHeaderImageData(appRoot);
        console.log('[Header Save] Header data type:', headerData.type, 'hasFile:', !!headerData.file);
        if (headerData.type === 'custom' && headerData.file) {
            // Upload NEW custom header image
            saveButton.innerHTML = `<span class="spinner-border spinner-border-sm"></span> Uploading header...`;
            const headerPath = `memorials/${newMemorialId}/header-${Date.now()}.jpg`;
            console.log('[Header Save] Uploading to:', headerPath);
            const { error: uploadError } = await supabase.storage
                .from('memorials')
                .upload(headerPath, headerData.file, { upsert: true });
            if (uploadError) {
                console.error('[Header Save] Upload failed:', uploadError);
                showToast('Header image upload failed: ' + uploadError.message, 'error');
            } else {
                const { data: urlData } = supabase.storage
                    .from('memorials')
                    .getPublicUrl(headerPath);
                console.log('[Header Save] Upload success, URL:', urlData.publicUrl);
                memorialData.header_image = urlData.publicUrl;
                memorialData.header_image_type = 'custom';
            }
        } else if (headerData.type === 'custom' && !headerData.file) {
            // Editing existing memorial with custom header - preserve existing URL
            console.log('[Header Save] Keeping existing custom header:', headerData.value);
            if (headerData.value && headerData.value.startsWith('http')) {
                memorialData.header_image = headerData.value;
                memorialData.header_image_type = 'custom';
            } else {
                // Fallback to default if URL is missing
                memorialData.header_image = 'default';
                memorialData.header_image_type = 'preset';
            }
        } else {
            // Use preset
            console.log('[Header Save] Using preset:', headerData.value);
            memorialData.header_image = headerData.value || 'default';
            memorialData.header_image_type = 'preset';
        }
        if (uploadedPhotos.photos) memorialData.photos = uploadedPhotos.photos;

        // Upload videos if any
        if (pendingVideos.length > 0) {
            saveButton.innerHTML = `<span class="spinner-border spinner-border-sm"></span> Uploading videos...`;
            const uploadedVideos = await handleVideoUploads(newMemorialId);
            if (uploadedVideos.length > 0) {
                // Merge with existing videos if editing
                const existingVideos = memorialData.videos || [];
                memorialData.videos = [...existingVideos, ...uploadedVideos];
            }
            // Clear pending videos after upload
            pendingVideos = [];
        }

        // Use INSERT for new memorials, UPDATE for existing ones
        // (upsert doesn't work well with RLS policies that check curator_ids)
        let error;
        console.log('[memorial-form] Saving memorial:', { memorialId, isNew: !memorialId, finalStatus, name: memorialData.name, bio: memorialData.bio?.substring(0, 50) });

        if (!memorialId) {
            // New memorial - INSERT
            console.log('[memorial-form] Inserting new memorial');
            const result = await supabase
                .from('memorials')
                .insert(memorialData);
            error = result.error;
            console.log('[memorial-form] Insert result:', { error: result.error });
        } else {
            // Existing memorial - UPDATE (don't send id in the update data)
            const { id, ...updateData } = memorialData;
            console.log('[memorial-form] Updating memorial:', memorialId);
            const result = await supabase
                .from('memorials')
                .update(updateData)
                .eq('id', memorialId);
            error = result.error;
            console.log('[memorial-form] Update result:', { error: result.error, data: result.data });
        }

        if (error) throw error;

        // Create any pending family connections
        await createPendingConnections(newMemorialId);

        // Create reciprocal relationships on linked memorials
        await createReciprocalRelationships(newMemorialId, memorialData.name, memorialData.relatives);

        // Save family nearby members
        await saveFamilyNearby(newMemorialId);

        // Clear localStorage draft since we saved successfully
        clearFormLocalStorage();

        // Handle navigation based on memorial type
        if (isLivingLegacyMode) {
            showToast('Your Living Legacy has been saved!', 'success');
            // Navigate to My Legacy dashboard
            window.dispatchEvent(new CustomEvent('navigate', { detail: '/my-legacy' }));
        } else if (desiredStatus === 'published') {
            showToast('Memorial published!', 'success');
            showSuccessModal(appRoot, newMemorialId, memorialData.name);
        } else {
            showToast('Memorial saved as draft!', 'success');
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

// Create reciprocal relationships on linked memorials
async function createReciprocalRelationships(sourceMemorialId, sourceMemorialName, relatives) {
    console.log('[memorial-form] createReciprocalRelationships called:', { sourceMemorialId, sourceMemorialName, relativesCount: relatives?.length });
    if (!relatives || !Array.isArray(relatives)) {
        console.log('[memorial-form] No relatives array, skipping reciprocals');
        return;
    }

    try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
            console.log('[memorial-form] No session for reciprocals');
            return;
        }

        // Process each linked relative
        for (const relative of relatives) {
            console.log('[memorial-form] Processing relative:', relative);
            if (!relative.memorialId) {
                console.log('[memorial-form] Skipping - no memorialId');
                continue;
            }

            try {
                console.log('[memorial-form] Creating reciprocal for:', relative.name, 'relationship:', relative.relationship);
                const response = await fetch('/api/family/reciprocal', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${session.access_token}`
                    },
                    body: JSON.stringify({
                        action: 'create_reciprocal',
                        sourceMemorialId,
                        sourceMemorialName,
                        targetMemorialId: relative.memorialId,
                        relationship: relative.relationship
                    })
                });

                console.log('[memorial-form] Reciprocal API response status:', response.status);
                const result = await response.json();
                console.log('[memorial-form] Reciprocal API result:', result);
                if (response.ok && result.success && !result.alreadyExists) {
                    console.log(`[memorial-form] Created reciprocal: ${result.message}`);
                }
            } catch (err) {
                console.error(`[memorial-form] Failed to create reciprocal for ${relative.name}:`, err);
            }
        }
    } catch (error) {
        console.error('[memorial-form] Error creating reciprocal relationships:', error);
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

    // Facebook share
    const facebookBtn = appRoot.querySelector('#share-facebook-btn');
    if (facebookBtn) {
        facebookBtn.href = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(memorialUrl)}`;
    }

    // Twitter/X share
    const twitterBtn = appRoot.querySelector('#share-twitter-btn');
    if (twitterBtn) {
        const tweetText = encodeURIComponent(`I just created a memorial for ${memorialName}. View it here:`);
        twitterBtn.href = `https://twitter.com/intent/tweet?text=${tweetText}&url=${encodeURIComponent(memorialUrl)}`;
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
        // Check if the relationship is a common one or a custom "Other" value
        const isCommonRelationship = commonRelationships.includes(values.relationship);
        const isOther = values.relationship && !isCommonRelationship;

        newFieldHtml = `
            <div class="col-md-5"><input type="text" class="form-control form-control-sm relative-name-input" placeholder="Name" value="${values.name || ''}" required></div>
            <div class="col-md-4">
                <select class="form-select form-select-sm relative-relationship-input">
                    <option value="" disabled ${!values.relationship ? 'selected' : ''}>Relationship</option>
                    ${commonRelationships.map(r => `<option value="${r}" ${values.relationship === r ? 'selected' : ''}>${r}</option>`).join('')}
                    <option value="Other" ${isOther ? 'selected' : ''}>Other</option>
                </select>
                <input type="text" class="form-control form-control-sm mt-1 relative-other-input" style="display: ${isOther ? 'block' : 'none'};" placeholder="e.g. Mentor" value="${isOther ? values.relationship : ''}">
            </div>
            <div class="col-md-2 d-flex gap-1"><button type="button" class="btn btn-sm btn-outline-primary link-btn" title="Link to existing memorial">Link</button></div>
            <div class="col-md-1"><button type="button" class="btn btn-sm btn-outline-danger remove-btn">×</button></div>
            <input type="hidden" class="relative-memorial-id" value="${values.memorialId || ''}">
            <input type="hidden" class="relative-dates" value="${values.dates || ''}">
        `;
    } else if (type === 'milestones') {
        newFieldHtml = `
            <div class="col-7"><input type="text" class="form-control form-control-sm milestone-title-input" placeholder="Event (e.g., Graduated college, Got married)" value="${values.title || ''}"></div>
            <div class="col-4"><input type="date" class="form-control form-control-sm milestone-year-input" value="${values.year || ''}"></div>
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

// Fetch memorials that link TO this memorial (reverse connections)
async function fetchReverseConnections(appRoot, memorialId, existingRelatives) {
    try {
        // Query for memorials where relatives JSONB contains this memorial's ID
        const { data: linkingMemorials, error } = await supabase
            .from('memorials')
            .select('id, name, relatives')
            .filter('relatives', 'cs', JSON.stringify([{ memorialId: memorialId }]))
            .neq('id', memorialId);

        if (error) {
            console.warn('[memorial-form] Error fetching reverse connections:', error);
            return;
        }

        if (!linkingMemorials || linkingMemorials.length === 0) {
            return;
        }

        // Get IDs of memorials already in our relatives list
        const existingLinkedIds = new Set(
            existingRelatives
                .filter(r => r.memorialId)
                .map(r => r.memorialId)
        );

        // Find reverse connections that aren't already in our list
        const reverseConnections = [];
        for (const memorial of linkingMemorials) {
            // Skip if already in our relatives
            if (existingLinkedIds.has(memorial.id)) continue;

            // Find the relationship from their side
            const theirRelative = (memorial.relatives || []).find(r => r.memorialId === memorialId);
            if (theirRelative) {
                reverseConnections.push({
                    fromMemorialId: memorial.id,
                    fromMemorialName: memorial.name,
                    theirRelationship: theirRelative.relationship // How they describe us
                });
            }
        }

        if (reverseConnections.length === 0) return;

        // Display reverse connections
        displayReverseConnections(appRoot, reverseConnections);

    } catch (err) {
        console.error('[memorial-form] fetchReverseConnections error:', err);
    }
}

// Display reverse connections in the relatives section
function displayReverseConnections(appRoot, connections) {
    const container = appRoot.querySelector('#relatives-container');
    if (!container) return;

    // Add a divider if there are existing relatives
    const existingFields = container.querySelectorAll('.dynamic-input-group');
    if (existingFields.length > 0 || connections.length > 0) {
        // Check if we already have a reverse connections section
        if (container.querySelector('.reverse-connections-section')) return;

        const sectionDiv = document.createElement('div');
        sectionDiv.className = 'reverse-connections-section mt-3';
        sectionDiv.innerHTML = `
            <div class="text-muted small mb-2">
                <i class="fas fa-link me-1"></i>
                <strong>Connected from other memorials:</strong>
            </div>
        `;

        connections.forEach(conn => {
            const reciprocal = getReciprocalRelationship(conn.theirRelationship, conn.fromMemorialName);
            const connDiv = document.createElement('div');
            connDiv.className = 'reverse-connection-item d-flex align-items-center gap-2 mb-2 p-2 bg-light rounded';
            connDiv.innerHTML = `
                <div class="flex-grow-1">
                    <strong>${escapeHtml(conn.fromMemorialName)}</strong>
                    <span class="text-muted">listed this person as their <em>${escapeHtml(conn.theirRelationship)}</em></span>
                </div>
                <button type="button" class="btn btn-sm btn-outline-primary add-reciprocal-btn"
                        data-memorial-id="${conn.fromMemorialId}"
                        data-memorial-name="${escapeHtml(conn.fromMemorialName)}"
                        data-relationship="${reciprocal}">
                    <i class="fas fa-plus me-1"></i>Add as ${reciprocal}
                </button>
            `;
            sectionDiv.appendChild(connDiv);
        });

        container.appendChild(sectionDiv);

        // Add click handlers for add reciprocal buttons
        sectionDiv.querySelectorAll('.add-reciprocal-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const memorialId = btn.dataset.memorialId;
                const memorialName = btn.dataset.memorialName;
                const relationship = btn.dataset.relationship;

                // Add as a regular relative field
                addDynamicField(appRoot, 'relatives', {
                    name: memorialName,
                    relationship: relationship,
                    memorialId: memorialId,
                    dates: ''
                });

                // Remove this suggestion
                btn.closest('.reverse-connection-item').remove();

                // Remove section if empty
                const remaining = sectionDiv.querySelectorAll('.reverse-connection-item');
                if (remaining.length === 0) {
                    sectionDiv.remove();
                }

                showToast(`Added ${memorialName} as ${relationship}`, 'success');
            });
        });
    }
}

// Helper to escape HTML
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Apply prefill data from Known Family Members when creating a new memorial
function applyPrefillData(appRoot, prefillData) {
    console.log('[memorial-form] Applying prefill data:', prefillData);

    // Basic info
    if (prefillData.name) {
        const nameInput = appRoot.querySelector('#memorial-name');
        if (nameInput) nameInput.value = prefillData.name;
    }

    if (prefillData.birthDate) {
        const birthInput = appRoot.querySelector('#memorial-birth-date');
        if (birthInput) birthInput.value = prefillData.birthDate;
    }

    if (prefillData.deathDate) {
        const deathInput = appRoot.querySelector('#memorial-death-date');
        if (deathInput) deathInput.value = prefillData.deathDate;
    }

    // Cemetery info
    if (prefillData.cemeteryName) {
        const cemeteryInput = appRoot.querySelector('#memorial-cemetery-name');
        if (cemeteryInput) cemeteryInput.value = prefillData.cemeteryName;
    }

    // Combine city/state into address field if available
    if (prefillData.cemeteryCity || prefillData.cemeteryState) {
        const addressInput = appRoot.querySelector('#memorial-cemetery-address');
        if (addressInput) {
            const addressParts = [prefillData.cemeteryCity, prefillData.cemeteryState].filter(Boolean);
            addressInput.value = addressParts.join(', ');
        }
    }

    // Add the source memorial as a relative (reciprocal relationship)
    if (prefillData.sourceMemorialId && prefillData.sourceRelationship) {
        // Get the reciprocal relationship (e.g., if source was "Mother", this person is "Son/Daughter")
        const reciprocal = getReciprocalRelationship(prefillData.sourceRelationship, prefillData.sourceMemorialName);

        // Add a relative row with the source memorial linked
        setTimeout(() => {
            addFamilyMemberRow(
                prefillData.sourceMemorialName,
                reciprocal,
                '', // dates
                prefillData.sourceMemorialId,
                0
            );
        }, 100);
    }

    // Store the family member ID so we can link it after saving
    if (prefillData.familyMemberId) {
        appRoot.dataset.sourceFamilyMemberId = prefillData.familyMemberId;
    }
}

// Get reciprocal relationship - now gender-aware based on the other person's name
// If source memorial says "X is my Mother", we're creating X's memorial, so source person is X's "Child"
function getReciprocalRelationship(relationship, otherPersonName = '') {
    // Common name lists for gender inference
    const maleNames = ['fred', 'norman', 'robert', 'james', 'john', 'william', 'michael', 'david', 'richard', 'joseph', 'thomas', 'charles', 'daniel', 'matthew', 'anthony', 'mark', 'donald', 'steven', 'paul', 'andrew', 'joshua', 'kenneth', 'kevin', 'brian', 'george', 'timothy', 'ronald', 'edward', 'jason', 'jeffrey', 'ryan', 'jacob', 'gary', 'nicholas', 'eric', 'frank', 'jack', 'henry', 'peter', 'albert', 'joe', 'bobby'];
    const femaleNames = ['dorothy', 'mary', 'patricia', 'jennifer', 'linda', 'barbara', 'elizabeth', 'susan', 'jessica', 'sarah', 'karen', 'lisa', 'nancy', 'betty', 'margaret', 'sandra', 'ashley', 'anna', 'emma', 'helen', 'ruth', 'marie', 'rose', 'jeanette', 'antoinette', 'alice', 'joan', 'martha', 'grace', 'diane'];

    // Infer gender from the other person's name
    const firstName = (otherPersonName || '').toLowerCase().split(' ')[0].replace(/[^a-z]/g, '');
    let gender = null;
    if (maleNames.includes(firstName)) gender = 'male';
    else if (femaleNames.includes(firstName)) gender = 'female';

    // Gender-aware reciprocal mappings
    const reciprocalMap = {
        'Mother': { male: 'Son', female: 'Daughter', default: 'Child' },
        'Father': { male: 'Son', female: 'Daughter', default: 'Child' },
        'Parent': { male: 'Son', female: 'Daughter', default: 'Child' },
        'Son': { male: 'Father', female: 'Mother', default: 'Parent' },
        'Daughter': { male: 'Father', female: 'Mother', default: 'Parent' },
        'Child': { male: 'Father', female: 'Mother', default: 'Parent' },
        'Spouse': { male: 'Spouse', female: 'Spouse', default: 'Spouse' },
        'Brother': { male: 'Brother', female: 'Sister', default: 'Sibling' },
        'Sister': { male: 'Brother', female: 'Sister', default: 'Sibling' },
        'Sibling': { male: 'Brother', female: 'Sister', default: 'Sibling' },
        'Grandmother': { male: 'Grandson', female: 'Granddaughter', default: 'Grandchild' },
        'Grandfather': { male: 'Grandson', female: 'Granddaughter', default: 'Grandchild' },
        'Grandparent': { male: 'Grandson', female: 'Granddaughter', default: 'Grandchild' },
        'Grandchild': { male: 'Grandfather', female: 'Grandmother', default: 'Grandparent' },
        'Grandson': { male: 'Grandfather', female: 'Grandmother', default: 'Grandparent' },
        'Granddaughter': { male: 'Grandfather', female: 'Grandmother', default: 'Grandparent' },
        'Uncle': { male: 'Nephew', female: 'Niece', default: 'Nephew/Niece' },
        'Aunt': { male: 'Nephew', female: 'Niece', default: 'Nephew/Niece' },
        'Nephew': { male: 'Uncle', female: 'Aunt', default: 'Uncle/Aunt' },
        'Niece': { male: 'Uncle', female: 'Aunt', default: 'Uncle/Aunt' }
    };

    const mapping = reciprocalMap[relationship];
    if (mapping) {
        if (gender === 'male') return mapping.male;
        if (gender === 'female') return mapping.female;
        return mapping.default;
    }
    return relationship;
}

// Populate world events based on birth/death years
function populateWorldEvents(appRoot, birthDate, deathDate, selectedEvents = null) {
    const container = appRoot.querySelector('#world-events-container');
    const section = appRoot.querySelector('#world-events-section');
    if (!container || !section) return;

    const birthYear = birthDate ? new Date(birthDate).getFullYear() : null;
    const deathYear = deathDate ? new Date(deathDate).getFullYear() : null;

    // Only show if we have both dates
    if (!birthYear || !deathYear || isNaN(birthYear) || isNaN(deathYear)) {
        section.style.display = 'none';
        return;
    }

    // Filter events within lifetime
    const eventsInLifetime = historicalEvents.filter(e => e.year >= birthYear && e.year <= deathYear);

    if (eventsInLifetime.length === 0) {
        section.style.display = 'none';
        return;
    }

    section.style.display = 'block';

    // If no selection provided, default to all selected
    const selected = selectedEvents || eventsInLifetime.map(e => e.id);

    container.innerHTML = eventsInLifetime.map(event => `
        <label class="world-event-item ${selected.includes(event.id) ? 'selected' : ''}">
            <input type="checkbox" name="world_event" value="${event.id}" ${selected.includes(event.id) ? 'checked' : ''}>
            <span class="event-year">${event.year}</span>
            <span class="event-text">${event.event}</span>
        </label>
    `).join('');

    // Add click handler to toggle selected class
    container.querySelectorAll('.world-event-item').forEach(item => {
        item.addEventListener('click', (e) => {
            if (e.target.tagName !== 'INPUT') {
                const checkbox = item.querySelector('input');
                checkbox.checked = !checkbox.checked;
            }
            item.classList.toggle('selected', item.querySelector('input').checked);
        });
    });
}

// Get selected world events
function getSelectedWorldEvents(appRoot) {
    const checkboxes = appRoot.querySelectorAll('#world-events-container input[name="world_event"]:checked');
    return Array.from(checkboxes).map(cb => cb.value);
}

async function populateForm(data, appRoot) {
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
    if (data.birth_date) populateDateFields(appRoot, 'birth', data.birth_date);
    if (appRoot.querySelector('#memorial-birth-place')) {
        appRoot.querySelector('#memorial-birth-place').value = data.birth_place || '';
    }
    if (data.death_date) populateDateFields(appRoot, 'death', data.death_date);
    if (appRoot.querySelector('#memorial-death-place')) {
        appRoot.querySelector('#memorial-death-place').value = data.death_place || '';
    }
    appRoot.querySelector('#memorial-story').value = data.bio || data.story || '';
    appRoot.querySelector('#memorial-cemetery-name').value = data.cemetery_name || '';
    appRoot.querySelector('#memorial-cemetery-address').value = data.cemetery_address || '';
    originalAddress = data.cemetery_address || '';

    // Load header image selection
    if (data.header_image || data.header_image_type) {
        setHeaderImageSelection(appRoot, data.header_image, data.header_image_type);
    }

    // Load location if it exists (gravesite is the single source of truth)
    if (data.gravesite_lat && data.gravesite_lng) {
        gravesiteLocation = { lat: data.gravesite_lat, lng: data.gravesite_lng };
    } else if (data.cemetery_lat && data.cemetery_lng) {
        // Legacy: migrate cemetery coords to gravesite on next save
        gravesiteLocation = { lat: data.cemetery_lat, lng: data.cemetery_lng };
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

    // Note: Tier is set in initializePage after populateForm completes

    // Load privacy settings
    const showRecentEl = appRoot.querySelector('#show-recent');
    const showDatesEl = appRoot.querySelector('#show-dates');
    const showTimelineEl = appRoot.querySelector('#show-timeline');
    const showGalleryEl = appRoot.querySelector('#show-gallery');
    const showFamilyTreeEl = appRoot.querySelector('#show-family-tree');
    const showGuestBookEl = appRoot.querySelector('#show-guest-book');

    if (showRecentEl) showRecentEl.checked = data.show_recent !== false;
    if (showDatesEl) showDatesEl.checked = data.show_dates !== false;
    if (showTimelineEl) showTimelineEl.checked = data.show_timeline !== false;
    if (showGalleryEl) showGalleryEl.checked = data.show_gallery !== false;
    if (showFamilyTreeEl) showFamilyTreeEl.checked = data.show_family_tree !== false;
    if (showGuestBookEl) showGuestBookEl.checked = data.show_guest_book !== false;

    if (data.relatives && Array.isArray(data.relatives)) {
        data.relatives.forEach(relative => addDynamicField(appRoot, 'relatives', relative));
    }

    // Fetch and display reverse connections (memorials that link TO this one)
    if (data.id) {
        await fetchReverseConnections(appRoot, data.id, data.relatives || []);
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

    // Populate world events based on dates
    populateWorldEvents(appRoot, data.birth_date, data.death_date, data.world_events);

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

    // Load existing main photo if present (using new cropping UI)
    if (data.main_photo) {
        setMainPhotoFromUrl(appRoot, data.main_photo);
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

    // Enhance biography button
    appRoot.querySelector('#enhance-bio-btn')?.addEventListener('click', () => enhanceBiography(appRoot));
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

async function enhanceBiography(appRoot) {
    const enhanceBtn = appRoot.querySelector('#enhance-bio-btn');
    const enhanceInput = appRoot.querySelector('#enhance-bio-input');
    const previewContent = appRoot.querySelector('#bio-preview-content');
    const errorEl = appRoot.querySelector('#bio-helper-error');

    const currentBio = previewContent?.value?.trim();
    const additionalInfo = enhanceInput?.value?.trim();

    if (!currentBio) {
        showToast('No biography to enhance. Generate one first.', 'error');
        return;
    }

    if (!additionalInfo) {
        showToast('Please enter what you\'d like to add to the biography.', 'error');
        enhanceInput?.focus();
        return;
    }

    const name = appRoot.querySelector('#memorial-name')?.value || 'Unknown';

    // Show loading state
    enhanceBtn.disabled = true;
    enhanceBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i>Updating...';
    errorEl.style.display = 'none';

    try {
        const response = await fetch('/api/ai/enhance-biography', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                name,
                currentBio,
                additionalInfo
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to enhance biography');
        }

        const { biography } = await response.json();

        // Update the preview with enhanced bio
        previewContent.value = biography;

        // Clear the enhance input
        enhanceInput.value = '';

        showToast('Biography updated with new information!', 'success');

    } catch (error) {
        console.error('Biography enhancement error:', error);
        errorEl.textContent = error.message || 'Failed to enhance biography. Please try again.';
        errorEl.style.display = 'block';
    } finally {
        enhanceBtn.disabled = false;
        enhanceBtn.innerHTML = '<i class="fas fa-wand-magic-sparkles me-1"></i>Add to Biography';
    }
}

function initializeStoryEnhance(appRoot) {
    const toggleBtn = appRoot.querySelector('#toggle-enhance-story');
    const inputGroup = appRoot.querySelector('#enhance-story-input-group');
    const cancelBtn = appRoot.querySelector('#cancel-enhance-story');
    const enhanceBtn = appRoot.querySelector('#enhance-story-btn');
    const enhanceInput = appRoot.querySelector('#enhance-story-input');
    const storyTextarea = appRoot.querySelector('#memorial-story');

    if (!toggleBtn || !inputGroup) return;

    // Toggle enhance input visibility
    toggleBtn.addEventListener('click', () => {
        const isHidden = inputGroup.style.display === 'none';
        inputGroup.style.display = isHidden ? 'block' : 'none';
        if (isHidden) {
            enhanceInput?.focus();
        }
    });

    // Cancel button
    cancelBtn?.addEventListener('click', () => {
        inputGroup.style.display = 'none';
        if (enhanceInput) enhanceInput.value = '';
    });

    // Enhance story button
    enhanceBtn?.addEventListener('click', async () => {
        const currentStory = storyTextarea?.value?.trim();
        const additionalInfo = enhanceInput?.value?.trim();

        if (!currentStory) {
            showToast('Please write some story content first, or use the AI helper to generate one.', 'error');
            return;
        }

        if (!additionalInfo) {
            showToast('Please enter what you\'d like to add to the story.', 'error');
            enhanceInput?.focus();
            return;
        }

        const name = appRoot.querySelector('#memorial-name')?.value || 'Unknown';

        // Show loading state
        enhanceBtn.disabled = true;
        enhanceBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i>Updating...';

        try {
            const response = await fetch('/api/ai/enhance-biography', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    name,
                    currentBio: currentStory,
                    additionalInfo
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to enhance story');
            }

            const { biography } = await response.json();

            // Update the story textarea
            storyTextarea.value = biography;

            // Clear and hide the enhance input
            enhanceInput.value = '';
            inputGroup.style.display = 'none';

            showToast('Story updated with new information!', 'success');

        } catch (error) {
            console.error('Story enhancement error:', error);
            showToast(error.message || 'Failed to enhance story. Please try again.', 'error');
        } finally {
            enhanceBtn.disabled = false;
            enhanceBtn.innerHTML = '<i class="fas fa-wand-magic-sparkles me-1"></i>Add to Story';
        }
    });
}

// --- Photo Cropping Functions ---
async function loadCropperJS() {
    // Check if Cropper is already loaded
    if (window.Cropper) return window.Cropper;

    // Dynamically load Cropper.js
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/cropperjs/1.6.1/cropper.min.js';
        script.onload = () => resolve(window.Cropper);
        script.onerror = () => reject(new Error('Failed to load Cropper.js'));
        document.head.appendChild(script);
    });
}

function initializePhotoCropping(appRoot) {
    const modalEl = appRoot.querySelector('#photoCropModal');
    if (!modalEl) return;

    photoCropModal = new bootstrap.Modal(modalEl);

    const mainPhotoInput = appRoot.querySelector('#main-photo');
    const previewContainer = appRoot.querySelector('#main-photo-preview-cropped');
    const placeholder = appRoot.querySelector('#main-photo-placeholder');
    const croppedImg = appRoot.querySelector('#main-photo-cropped-img');
    const photoActions = appRoot.querySelector('#main-photo-actions');
    const cropImage = appRoot.querySelector('#crop-image');

    // Click on preview area to select photo
    previewContainer?.addEventListener('click', (e) => {
        // Don't trigger if clicking action buttons
        if (e.target.closest('.main-photo-actions')) return;
        mainPhotoInput?.click();
    });

    // Handle file selection
    mainPhotoInput?.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        // Validate file
        if (!file.type.startsWith('image/')) {
            showToast('Please select an image file', 'error');
            return;
        }

        if (file.size > 10 * 1024 * 1024) {
            showToast('Image must be less than 10MB', 'error');
            return;
        }

        // Read the file
        const reader = new FileReader();
        reader.onload = async (event) => {
            originalImageDataUrl = event.target.result;
            await openCropModal(appRoot);
        };
        reader.readAsDataURL(file);
    });

    // Edit crop button
    appRoot.querySelector('#edit-main-photo-btn')?.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (originalImageDataUrl) {
            await openCropModal(appRoot);
        }
    });

    // Remove photo button
    appRoot.querySelector('#remove-main-photo-btn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        removeMainPhoto(appRoot);
    });

    // Crop controls
    appRoot.querySelector('#crop-zoom-in')?.addEventListener('click', () => cropper?.zoom(0.1));
    appRoot.querySelector('#crop-zoom-out')?.addEventListener('click', () => cropper?.zoom(-0.1));
    appRoot.querySelector('#crop-rotate-left')?.addEventListener('click', () => cropper?.rotate(-90));
    appRoot.querySelector('#crop-rotate-right')?.addEventListener('click', () => cropper?.rotate(90));
    appRoot.querySelector('#crop-reset')?.addEventListener('click', () => cropper?.reset());

    // Apply crop button
    appRoot.querySelector('#apply-crop-btn')?.addEventListener('click', () => {
        applyCrop(appRoot);
    });

    // Clean up cropper when modal closes
    modalEl.addEventListener('hidden.bs.modal', () => {
        if (cropper) {
            cropper.destroy();
            cropper = null;
        }
    });
}

async function openCropModal(appRoot) {
    const cropImage = appRoot.querySelector('#crop-image');
    if (!cropImage || !originalImageDataUrl) return;

    // Load Cropper.js if not loaded
    try {
        await loadCropperJS();
    } catch (error) {
        showToast('Failed to load image cropper', 'error');
        return;
    }

    // Set the image source
    cropImage.src = originalImageDataUrl;

    // Show modal
    photoCropModal.show();

    // Wait for image to load, then initialize cropper
    cropImage.onload = () => {
        // Destroy existing cropper if any
        if (cropper) {
            cropper.destroy();
        }

        // Initialize Cropper with circular crop preview
        cropper = new window.Cropper(cropImage, {
            aspectRatio: 1, // Square for circular display
            viewMode: 1,
            dragMode: 'move',
            autoCropArea: 0.9,
            restore: false,
            guides: false,
            center: true,
            highlight: false,
            cropBoxMovable: true,
            cropBoxResizable: true,
            toggleDragModeOnDblclick: false,
            minContainerWidth: 200,
            minContainerHeight: 200,
        });
    };
}

function applyCrop(appRoot) {
    if (!cropper) return;

    const placeholder = appRoot.querySelector('#main-photo-placeholder');
    const croppedImg = appRoot.querySelector('#main-photo-cropped-img');
    const photoActions = appRoot.querySelector('#main-photo-actions');
    const croppedDataInput = appRoot.querySelector('#main-photo-cropped-data');

    // Get cropped canvas
    const canvas = cropper.getCroppedCanvas({
        width: 400,
        height: 400,
        imageSmoothingEnabled: true,
        imageSmoothingQuality: 'high',
    });

    if (!canvas) {
        showToast('Failed to crop image', 'error');
        return;
    }

    // Convert canvas to blob for upload
    canvas.toBlob((blob) => {
        croppedImageBlob = blob;

        // Update preview
        const croppedUrl = canvas.toDataURL('image/jpeg', 0.9);
        croppedImg.src = croppedUrl;
        croppedImg.style.display = 'block';
        placeholder.style.display = 'none';
        photoActions.style.display = 'flex';

        // Store the cropped data URL for form submission
        if (croppedDataInput) {
            croppedDataInput.value = croppedUrl;
        }

        // Close modal
        photoCropModal.hide();
        showToast('Photo cropped successfully!', 'success');
    }, 'image/jpeg', 0.9);
}

function removeMainPhoto(appRoot) {
    const placeholder = appRoot.querySelector('#main-photo-placeholder');
    const croppedImg = appRoot.querySelector('#main-photo-cropped-img');
    const photoActions = appRoot.querySelector('#main-photo-actions');
    const croppedDataInput = appRoot.querySelector('#main-photo-cropped-data');
    const mainPhotoInput = appRoot.querySelector('#main-photo');

    // Reset state
    originalImageDataUrl = null;
    croppedImageBlob = null;

    // Reset UI
    croppedImg.src = '';
    croppedImg.style.display = 'none';
    placeholder.style.display = 'flex';
    photoActions.style.display = 'none';

    if (croppedDataInput) croppedDataInput.value = '';
    if (mainPhotoInput) mainPhotoInput.value = '';

    showToast('Photo removed', 'info');
}

// Get the cropped image blob for upload
function getCroppedMainPhoto() {
    return croppedImageBlob;
}

// Set main photo from existing URL (for editing existing memorials)
function setMainPhotoFromUrl(appRoot, url) {
    if (!url) return;

    const placeholder = appRoot.querySelector('#main-photo-placeholder');
    const croppedImg = appRoot.querySelector('#main-photo-cropped-img');
    const photoActions = appRoot.querySelector('#main-photo-actions');

    // Load the image and store it for re-cropping
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
        // Create canvas to get data URL
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        originalImageDataUrl = canvas.toDataURL('image/jpeg', 0.9);

        // Update UI
        croppedImg.src = url;
        croppedImg.style.display = 'block';
        placeholder.style.display = 'none';
        photoActions.style.display = 'flex';
    };
    img.onerror = () => {
        // If we can't load the image for re-cropping, just show it
        croppedImg.src = url;
        croppedImg.style.display = 'block';
        placeholder.style.display = 'none';
        photoActions.style.display = 'flex';
    };
    img.src = url;
}

// --- Milestone Wizard Functions ---
function initializeMilestoneWizard(appRoot) {
    const modalEl = appRoot.querySelector('#milestoneWizardModal');
    if (!modalEl) return;

    milestoneWizardModal = new bootstrap.Modal(modalEl);
    milestoneWizardStep = 1;

    // Open wizard button
    appRoot.querySelector('#open-milestone-wizard-btn')?.addEventListener('click', () => {
        const personName = appRoot.querySelector('#memorial-name').value || 'this person';
        const birthYear = appRoot.querySelector('#memorial-birth-year')?.value;

        appRoot.querySelector('#mw-person-name').textContent = personName;

        // Show birth year hints
        if (birthYear) {
            const hsHint = appRoot.querySelector('#mw-highschool-hint');
            const collegeHint = appRoot.querySelector('#mw-college-hint');
            const birthYearHint = appRoot.querySelector('#mw-birth-year-hint');

            if (birthYearHint) birthYearHint.textContent = `(Born ${birthYear})`;
            if (hsHint) hsHint.textContent = `Typically around ${parseInt(birthYear) + 18}`;
            if (collegeHint) collegeHint.textContent = `Typically around ${parseInt(birthYear) + 22}`;
        }

        resetMilestoneWizard(appRoot);
        milestoneWizardModal.show();
    });

    // Navigation buttons
    appRoot.querySelector('#mw-next-btn')?.addEventListener('click', () => navigateMilestoneWizard(appRoot, 'next'));
    appRoot.querySelector('#mw-prev-btn')?.addEventListener('click', () => navigateMilestoneWizard(appRoot, 'prev'));
    appRoot.querySelector('#mw-skip-btn')?.addEventListener('click', () => navigateMilestoneWizard(appRoot, 'next'));
    appRoot.querySelector('#mw-finish-btn')?.addEventListener('click', () => finishMilestoneWizard(appRoot));

    // Step indicators click
    appRoot.querySelectorAll('.mw-step').forEach(step => {
        step.addEventListener('click', () => {
            const stepNum = parseInt(step.dataset.step);
            if (stepNum && stepNum <= MILESTONE_WIZARD_STEPS) {
                goToMilestoneStep(appRoot, stepNum);
            }
        });
    });

    // Military checkbox toggle
    appRoot.querySelector('#mw-served-military')?.addEventListener('change', (e) => {
        const details = appRoot.querySelector('#mw-military-details');
        if (details) {
            details.classList.toggle('d-none', !e.target.checked);
        }
    });

    // Add marriage button
    appRoot.querySelector('#mw-add-marriage')?.addEventListener('click', () => addMilestoneWizardRow(appRoot, 'marriages'));

    // Add child button
    appRoot.querySelector('#mw-add-child')?.addEventListener('click', () => addMilestoneWizardRow(appRoot, 'children'));

    // Add job button
    appRoot.querySelector('#mw-add-job')?.addEventListener('click', () => addMilestoneWizardRow(appRoot, 'jobs'));

    // Add award button
    appRoot.querySelector('#mw-add-award')?.addEventListener('click', () => addMilestoneWizardRow(appRoot, 'awards'));

    // Update child parent dropdowns when spouse names change
    appRoot.querySelector('#mw-marriages-container')?.addEventListener('input', (e) => {
        if (e.target.classList.contains('mw-spouse-name')) {
            updateChildParentOptions(appRoot);
        }
    });
}

function addMilestoneWizardRow(appRoot, type) {
    let container, template;

    if (type === 'marriages') {
        container = appRoot.querySelector('#mw-marriages-container');
        const marriageNum = container.querySelectorAll('.mw-marriage-block').length + 1;
        template = `
            <div class="mw-marriage-block mb-3 p-3 border rounded bg-light" data-marriage="${marriageNum}">
                <div class="d-flex justify-content-between align-items-center mb-2">
                    <strong class="text-muted small">Marriage #${marriageNum}</strong>
                    <button type="button" class="btn btn-outline-danger btn-sm mw-remove-marriage">×</button>
                </div>
                <div class="row g-2 mb-2">
                    <div class="col-md-5">
                        <input type="text" class="form-control mw-spouse-name" placeholder="Spouse's name">
                    </div>
                    <div class="col-md-3">
                        <input type="number" class="form-control mw-wedding-year" placeholder="Wedding year" min="1900" max="2100">
                    </div>
                    <div class="col-md-4">
                        <input type="text" class="form-control mw-wedding-location" placeholder="Location">
                    </div>
                </div>
                <div class="row g-2">
                    <div class="col-md-6">
                        <select class="form-select form-select-sm mw-marriage-status">
                            <option value="">Status (optional)</option>
                            <option value="married">Currently Married</option>
                            <option value="widowed">Widowed</option>
                            <option value="divorced">Divorced</option>
                            <option value="deceased">Spouse Deceased</option>
                        </select>
                    </div>
                    <div class="col-md-6">
                        <input type="number" class="form-control form-control-sm mw-marriage-end-year" placeholder="End year (if applicable)" min="1900" max="2100">
                    </div>
                </div>
            </div>
        `;
        if (container) {
            container.insertAdjacentHTML('beforeend', template);
            const newRow = container.lastElementChild;
            const removeBtn = newRow.querySelector('.mw-remove-marriage');
            removeBtn?.addEventListener('click', () => {
                newRow.remove();
                renumberMarriages(appRoot);
                updateChildParentOptions(appRoot);
            });
            // Show remove button on first marriage if there are now multiple
            updateMarriageRemoveButtons(appRoot);
        }
        return;
    } else if (type === 'children') {
        container = appRoot.querySelector('#mw-children-container');
        const parentOptions = getParentOptionsHTML(appRoot);
        template = `
            <div class="mw-child-row row g-2 mb-2">
                <div class="col-md-5">
                    <input type="text" class="form-control mw-child-name" placeholder="Child's name">
                </div>
                <div class="col-md-3">
                    <input type="number" class="form-control mw-child-year" placeholder="Birth year" min="1900" max="2100">
                </div>
                <div class="col-md-3">
                    <select class="form-select mw-child-parent">
                        ${parentOptions}
                    </select>
                </div>
                <div class="col-md-1">
                    <button type="button" class="btn btn-outline-danger btn-sm w-100 mw-remove-child">×</button>
                </div>
            </div>
        `;
    } else if (type === 'jobs') {
        container = appRoot.querySelector('#mw-jobs-container');
        template = `
            <div class="mw-job-row row g-2 mb-2">
                <div class="col-md-5">
                    <input type="text" class="form-control mw-other-job-title" placeholder="Job title">
                </div>
                <div class="col-md-4">
                    <input type="text" class="form-control mw-other-employer" placeholder="Employer">
                </div>
                <div class="col-md-2">
                    <input type="text" class="form-control mw-other-job-years" placeholder="Years">
                </div>
                <div class="col-md-1">
                    <button type="button" class="btn btn-outline-danger btn-sm w-100 mw-remove-job">×</button>
                </div>
            </div>
        `;
    } else if (type === 'awards') {
        container = appRoot.querySelector('#mw-awards-container');
        template = `
            <div class="mw-award-row row g-2 mb-2">
                <div class="col-md-7">
                    <input type="text" class="form-control mw-award-name" placeholder="Award name">
                </div>
                <div class="col-md-3">
                    <input type="number" class="form-control mw-award-year" placeholder="Year" min="1900" max="2100">
                </div>
                <div class="col-md-2">
                    <button type="button" class="btn btn-outline-danger btn-sm w-100 mw-remove-${type === 'awards' ? 'award' : type}">×</button>
                </div>
            </div>
        `;
    }

    if (container && template) {
        container.insertAdjacentHTML('beforeend', template);
        const newRow = container.lastElementChild;
        const removeBtn = newRow.querySelector('button');
        removeBtn?.addEventListener('click', () => newRow.remove());
    }
}

// Helper function to get parent options HTML for children dropdown
function getParentOptionsHTML(appRoot) {
    let options = '<option value="">With...</option>';
    const marriages = appRoot.querySelectorAll('.mw-marriage-block');
    marriages.forEach((block, index) => {
        const spouseName = block.querySelector('.mw-spouse-name')?.value?.trim();
        if (spouseName) {
            options += `<option value="${index + 1}">${spouseName}</option>`;
        } else {
            options += `<option value="${index + 1}">Spouse #${index + 1}</option>`;
        }
    });
    options += '<option value="other">Other/Unknown</option>';
    return options;
}

// Update all child parent dropdowns when spouses change
function updateChildParentOptions(appRoot) {
    const optionsHTML = getParentOptionsHTML(appRoot);
    appRoot.querySelectorAll('.mw-child-parent').forEach(select => {
        const currentValue = select.value;
        select.innerHTML = optionsHTML;
        // Restore selection if still valid
        if (currentValue) {
            const option = select.querySelector(`option[value="${currentValue}"]`);
            if (option) {
                select.value = currentValue;
            }
        }
    });
}

// Renumber marriages after removal
function renumberMarriages(appRoot) {
    const marriages = appRoot.querySelectorAll('.mw-marriage-block');
    marriages.forEach((block, index) => {
        block.dataset.marriage = index + 1;
        const label = block.querySelector('strong');
        if (label) {
            label.textContent = `Marriage #${index + 1}`;
        }
    });
    updateMarriageRemoveButtons(appRoot);
}

// Show/hide remove buttons based on number of marriages
function updateMarriageRemoveButtons(appRoot) {
    const marriages = appRoot.querySelectorAll('.mw-marriage-block');
    marriages.forEach((block, index) => {
        const removeBtn = block.querySelector('.mw-remove-marriage');
        if (removeBtn) {
            removeBtn.style.display = marriages.length > 1 ? 'inline-block' : 'none';
        }
    });
}

function resetMilestoneWizard(appRoot) {
    milestoneWizardStep = 1;

    // Clear all inputs
    appRoot.querySelectorAll('#milestoneWizardModal input, #milestoneWizardModal textarea, #milestoneWizardModal select').forEach(input => {
        if (input.type === 'checkbox') {
            input.checked = false;
        } else {
            input.value = '';
        }
    });

    // Reset marriages container to single marriage
    const marriagesContainer = appRoot.querySelector('#mw-marriages-container');
    if (marriagesContainer) {
        marriagesContainer.innerHTML = `
            <div class="mw-marriage-block mb-3 p-3 border rounded bg-light" data-marriage="1">
                <div class="d-flex justify-content-between align-items-center mb-2">
                    <strong class="text-muted small">Marriage #1</strong>
                    <button type="button" class="btn btn-outline-danger btn-sm mw-remove-marriage" style="display:none;">×</button>
                </div>
                <div class="row g-2 mb-2">
                    <div class="col-md-5">
                        <input type="text" class="form-control mw-spouse-name" placeholder="Spouse's name">
                    </div>
                    <div class="col-md-3">
                        <input type="number" class="form-control mw-wedding-year" placeholder="Wedding year" min="1900" max="2100">
                    </div>
                    <div class="col-md-4">
                        <input type="text" class="form-control mw-wedding-location" placeholder="Location">
                    </div>
                </div>
                <div class="row g-2">
                    <div class="col-md-6">
                        <select class="form-select form-select-sm mw-marriage-status">
                            <option value="">Status (optional)</option>
                            <option value="married">Currently Married</option>
                            <option value="widowed">Widowed</option>
                            <option value="divorced">Divorced</option>
                            <option value="deceased">Spouse Deceased</option>
                        </select>
                    </div>
                    <div class="col-md-6">
                        <input type="number" class="form-control form-control-sm mw-marriage-end-year" placeholder="End year (if applicable)" min="1900" max="2100">
                    </div>
                </div>
            </div>
        `;
    }

    // Reset children container to single row
    const childrenContainer = appRoot.querySelector('#mw-children-container');
    if (childrenContainer) {
        childrenContainer.innerHTML = `
            <div class="mw-child-row row g-2 mb-2">
                <div class="col-md-5">
                    <input type="text" class="form-control mw-child-name" placeholder="Child's name">
                </div>
                <div class="col-md-3">
                    <input type="number" class="form-control mw-child-year" placeholder="Birth year" min="1900" max="2100">
                </div>
                <div class="col-md-3">
                    <select class="form-select mw-child-parent">
                        <option value="">With...</option>
                    </select>
                </div>
                <div class="col-md-1">
                    <button type="button" class="btn btn-outline-danger btn-sm w-100 mw-remove-child" style="display:none;">×</button>
                </div>
            </div>
        `;
    }

    // Reset jobs container
    const jobsContainer = appRoot.querySelector('#mw-jobs-container');
    if (jobsContainer) {
        jobsContainer.innerHTML = `
            <div class="mw-job-row row g-2 mb-2">
                <div class="col-md-5">
                    <input type="text" class="form-control mw-other-job-title" placeholder="Job title">
                </div>
                <div class="col-md-4">
                    <input type="text" class="form-control mw-other-employer" placeholder="Employer">
                </div>
                <div class="col-md-2">
                    <input type="text" class="form-control mw-other-job-years" placeholder="Years">
                </div>
                <div class="col-md-1">
                    <button type="button" class="btn btn-outline-danger btn-sm w-100 mw-remove-job" style="display:none;">×</button>
                </div>
            </div>
        `;
    }

    // Reset awards container
    const awardsContainer = appRoot.querySelector('#mw-awards-container');
    if (awardsContainer) {
        awardsContainer.innerHTML = `
            <div class="mw-award-row row g-2 mb-2">
                <div class="col-md-7">
                    <input type="text" class="form-control mw-award-name" placeholder="Award name">
                </div>
                <div class="col-md-3">
                    <input type="number" class="form-control mw-award-year" placeholder="Year" min="1900" max="2100">
                </div>
                <div class="col-md-2">
                    <button type="button" class="btn btn-outline-danger btn-sm w-100 mw-remove-award" style="display:none;">×</button>
                </div>
            </div>
        `;
    }

    // Hide military details
    appRoot.querySelector('#mw-military-details')?.classList.add('d-none');

    goToMilestoneStep(appRoot, 1);
}

function goToMilestoneStep(appRoot, step) {
    milestoneWizardStep = step;

    // Update step indicators
    appRoot.querySelectorAll('.mw-step').forEach(s => {
        const sNum = parseInt(s.dataset.step);
        s.classList.remove('active', 'completed');
        if (sNum < step) {
            s.classList.add('completed');
        } else if (sNum === step) {
            s.classList.add('active');
        }
    });

    // Update progress bar
    const progressFill = appRoot.querySelector('#mw-progress-fill');
    if (progressFill) {
        progressFill.style.width = `${((step - 1) / MILESTONE_WIZARD_STEPS) * 100}%`;
    }

    // Show/hide step content
    appRoot.querySelectorAll('.mw-step-content').forEach(content => {
        const contentStep = content.dataset.step;
        content.classList.toggle('d-none', contentStep !== String(step) && contentStep !== 'summary');
    });

    // Handle summary step
    const summaryContent = appRoot.querySelector('.mw-step-content[data-step="summary"]');
    if (step === 'summary') {
        summaryContent?.classList.remove('d-none');
        buildMilestoneSummary(appRoot);
    } else {
        summaryContent?.classList.add('d-none');
    }

    // Update buttons
    const prevBtn = appRoot.querySelector('#mw-prev-btn');
    const nextBtn = appRoot.querySelector('#mw-next-btn');
    const skipBtn = appRoot.querySelector('#mw-skip-btn');
    const finishBtn = appRoot.querySelector('#mw-finish-btn');

    if (step === 1) {
        prevBtn.style.display = 'none';
        skipBtn.style.display = 'inline-flex';
    } else {
        prevBtn.style.display = 'inline-flex';
        skipBtn.style.display = step === 'summary' ? 'none' : 'inline-flex';
    }

    if (step === 'summary') {
        nextBtn.style.display = 'none';
        skipBtn.style.display = 'none';
        finishBtn.style.display = 'inline-flex';
    } else if (step === MILESTONE_WIZARD_STEPS) {
        nextBtn.innerHTML = 'Review<i class="fas fa-check ms-1"></i>';
        nextBtn.style.display = 'inline-flex';
        finishBtn.style.display = 'none';
    } else {
        nextBtn.innerHTML = 'Next<i class="fas fa-chevron-right ms-1"></i>';
        nextBtn.style.display = 'inline-flex';
        finishBtn.style.display = 'none';
    }
}

function navigateMilestoneWizard(appRoot, direction) {
    if (direction === 'next') {
        if (milestoneWizardStep === MILESTONE_WIZARD_STEPS) {
            goToMilestoneStep(appRoot, 'summary');
        } else if (milestoneWizardStep !== 'summary') {
            goToMilestoneStep(appRoot, milestoneWizardStep + 1);
        }
    } else {
        if (milestoneWizardStep === 'summary') {
            goToMilestoneStep(appRoot, MILESTONE_WIZARD_STEPS);
        } else if (milestoneWizardStep > 1) {
            goToMilestoneStep(appRoot, milestoneWizardStep - 1);
        }
    }
}

function buildMilestoneSummary(appRoot) {
    const milestones = collectMilestoneData(appRoot);
    const summaryList = appRoot.querySelector('#mw-summary-list');
    const noMilestones = appRoot.querySelector('#mw-no-milestones');

    if (!summaryList) return;

    summaryList.innerHTML = '';

    if (milestones.length === 0) {
        noMilestones.style.display = 'block';
        return;
    }

    noMilestones.style.display = 'none';

    // Sort by year
    milestones.sort((a, b) => (a.year || 9999) - (b.year || 9999));

    milestones.forEach(m => {
        const item = document.createElement('div');
        item.className = 'mw-summary-item';
        item.innerHTML = `
            <span class="mw-summary-year">${m.year || '—'}</span>
            <span class="mw-summary-text">${m.title}</span>
            <span class="mw-summary-category ${m.category}">${m.category}</span>
        `;
        summaryList.appendChild(item);
    });
}

function collectMilestoneData(appRoot) {
    const milestones = [];

    // Education
    const hsName = appRoot.querySelector('#mw-highschool-name')?.value?.trim();
    const hsYear = appRoot.querySelector('#mw-highschool-year')?.value;
    if (hsName || hsYear) {
        milestones.push({
            title: hsName ? `Graduated from ${hsName}` : 'Graduated high school',
            year: hsYear ? parseInt(hsYear) : null,
            category: 'education'
        });
    }

    const collegeName = appRoot.querySelector('#mw-college-name')?.value?.trim();
    const collegeDegree = appRoot.querySelector('#mw-college-degree')?.value?.trim();
    const collegeYear = appRoot.querySelector('#mw-college-year')?.value;
    if (collegeName || collegeDegree || collegeYear) {
        let title = 'Graduated college';
        if (collegeDegree && collegeName) title = `Earned ${collegeDegree} from ${collegeName}`;
        else if (collegeDegree) title = `Earned ${collegeDegree}`;
        else if (collegeName) title = `Graduated from ${collegeName}`;
        milestones.push({
            title,
            year: collegeYear ? parseInt(collegeYear) : null,
            category: 'education'
        });
    }

    const advancedName = appRoot.querySelector('#mw-advanced-name')?.value?.trim();
    const advancedDegree = appRoot.querySelector('#mw-advanced-degree')?.value?.trim();
    const advancedYear = appRoot.querySelector('#mw-advanced-year')?.value;
    if (advancedName || advancedDegree || advancedYear) {
        let title = 'Earned advanced degree';
        if (advancedDegree && advancedName) title = `Earned ${advancedDegree} from ${advancedName}`;
        else if (advancedDegree) title = `Earned ${advancedDegree}`;
        else if (advancedName) title = `Graduated from ${advancedName}`;
        milestones.push({
            title,
            year: advancedYear ? parseInt(advancedYear) : null,
            category: 'education'
        });
    }

    // Family - Marriages
    const marriages = appRoot.querySelectorAll('.mw-marriage-block');
    const spouseNames = []; // Track spouse names for children reference
    marriages.forEach((block, index) => {
        const spouseName = block.querySelector('.mw-spouse-name')?.value?.trim();
        const weddingYear = block.querySelector('.mw-wedding-year')?.value;
        const weddingLocation = block.querySelector('.mw-wedding-location')?.value?.trim();
        const status = block.querySelector('.mw-marriage-status')?.value;
        const endYear = block.querySelector('.mw-marriage-end-year')?.value;

        spouseNames.push(spouseName || `Spouse #${index + 1}`);

        if (spouseName || weddingYear) {
            let title = 'Got married';
            if (spouseName) title = `Married ${spouseName}`;
            if (weddingLocation) title += ` in ${weddingLocation}`;
            milestones.push({
                title,
                year: weddingYear ? parseInt(weddingYear) : null,
                category: 'family'
            });

            // Add divorce or widowed milestone if applicable
            if (status === 'divorced' && endYear) {
                milestones.push({
                    title: `Divorced from ${spouseName || 'spouse'}`,
                    year: parseInt(endYear),
                    category: 'family'
                });
            } else if ((status === 'widowed' || status === 'deceased') && endYear) {
                milestones.push({
                    title: `${spouseName || 'Spouse'} passed away`,
                    year: parseInt(endYear),
                    category: 'family'
                });
            }
        }
    });

    // Children
    appRoot.querySelectorAll('.mw-child-row').forEach(row => {
        const name = row.querySelector('.mw-child-name')?.value?.trim();
        const year = row.querySelector('.mw-child-year')?.value;
        const parentIndex = row.querySelector('.mw-child-parent')?.value;
        if (name || year) {
            let title = name ? `${name} was born` : 'Child born';
            // Add parent reference if selected
            if (parentIndex && parentIndex !== 'other' && spouseNames[parseInt(parentIndex) - 1]) {
                title += ` (with ${spouseNames[parseInt(parentIndex) - 1]})`;
            }
            milestones.push({
                title,
                year: year ? parseInt(year) : null,
                category: 'family'
            });
        }
    });

    const grandchildren = appRoot.querySelector('#mw-grandchildren-count')?.value;
    if (grandchildren && parseInt(grandchildren) > 0) {
        milestones.push({
            title: `Became grandparent to ${grandchildren} grandchildren`,
            year: null,
            category: 'family'
        });
    }

    // Career
    const jobTitle = appRoot.querySelector('#mw-job-title')?.value?.trim();
    const employer = appRoot.querySelector('#mw-employer')?.value?.trim();
    const jobYears = appRoot.querySelector('#mw-job-years')?.value?.trim();
    if (jobTitle || employer) {
        let title = jobTitle || 'Started career';
        if (employer) title += ` at ${employer}`;
        let year = null;
        if (jobYears) {
            const match = jobYears.match(/(\d{4})/);
            if (match) year = parseInt(match[1]);
        }
        milestones.push({
            title,
            year,
            category: 'career'
        });
    }

    const retirementYear = appRoot.querySelector('#mw-retirement-year')?.value;
    if (retirementYear) {
        milestones.push({
            title: 'Retired',
            year: parseInt(retirementYear),
            category: 'career'
        });
    }

    // Other jobs
    appRoot.querySelectorAll('.mw-job-row').forEach(row => {
        const title = row.querySelector('.mw-other-job-title')?.value?.trim();
        const emp = row.querySelector('.mw-other-employer')?.value?.trim();
        const years = row.querySelector('.mw-other-job-years')?.value?.trim();
        if (title || emp) {
            let milestoneTtitle = title || 'New job';
            if (emp) milestoneTtitle += ` at ${emp}`;
            let year = null;
            if (years) {
                const match = years.match(/(\d{4})/);
                if (match) year = parseInt(match[1]);
            }
            milestones.push({
                title: milestoneTtitle,
                year,
                category: 'career'
            });
        }
    });

    // Military
    const servedMilitary = appRoot.querySelector('#mw-served-military')?.checked;
    if (servedMilitary) {
        const branch = appRoot.querySelector('#mw-military-branch')?.value;
        const rank = appRoot.querySelector('#mw-military-rank')?.value?.trim();
        const dates = appRoot.querySelector('#mw-military-dates')?.value?.trim();
        const conflict = appRoot.querySelector('#mw-military-conflict')?.value;
        const medals = appRoot.querySelector('#mw-military-medals')?.value?.trim();

        let title = 'Served in military';
        if (branch) title = `Served in ${branch}`;
        if (rank) title += ` as ${rank}`;

        let year = null;
        if (dates) {
            const match = dates.match(/(\d{4})/);
            if (match) year = parseInt(match[1]);
        }

        milestones.push({
            title,
            year,
            category: 'military'
        });

        if (conflict && conflict !== 'Peacetime') {
            milestones.push({
                title: `Served during ${conflict}`,
                year: null,
                category: 'military'
            });
        }

        if (medals) {
            milestones.push({
                title: `Received ${medals}`,
                year: null,
                category: 'military'
            });
        }
    }

    // Faith
    const church = appRoot.querySelector('#mw-baptism-church')?.value?.trim();
    const denomination = appRoot.querySelector('#mw-denomination')?.value?.trim();
    const baptismYear = appRoot.querySelector('#mw-baptism-year')?.value;
    const confirmationYear = appRoot.querySelector('#mw-confirmation-year')?.value;
    const religiousRole = appRoot.querySelector('#mw-religious-role')?.value?.trim();

    if (baptismYear) {
        let title = 'Baptized';
        if (church) title += ` at ${church}`;
        milestones.push({
            title,
            year: parseInt(baptismYear),
            category: 'faith'
        });
    }

    if (confirmationYear) {
        milestones.push({
            title: 'Confirmed in faith',
            year: parseInt(confirmationYear),
            category: 'faith'
        });
    }

    if (religiousRole) {
        let title = `Became ${religiousRole}`;
        if (church) title += ` at ${church}`;
        milestones.push({
            title,
            year: null,
            category: 'faith'
        });
    }

    const organizations = appRoot.querySelector('#mw-organizations')?.value?.trim();
    if (organizations) {
        milestones.push({
            title: `Active member of ${organizations}`,
            year: null,
            category: 'faith'
        });
    }

    // Awards
    appRoot.querySelectorAll('.mw-award-row').forEach(row => {
        const name = row.querySelector('.mw-award-name')?.value?.trim();
        const year = row.querySelector('.mw-award-year')?.value;
        if (name) {
            milestones.push({
                title: `Received ${name}`,
                year: year ? parseInt(year) : null,
                category: 'awards'
            });
        }
    });

    const otherAchievements = appRoot.querySelector('#mw-other-achievements')?.value?.trim();
    if (otherAchievements) {
        milestones.push({
            title: otherAchievements,
            year: null,
            category: 'awards'
        });
    }

    return milestones;
}

function finishMilestoneWizard(appRoot) {
    const milestones = collectMilestoneData(appRoot);

    if (milestones.length === 0) {
        milestoneWizardModal.hide();
        return;
    }

    // Add each milestone to the form
    milestones.forEach(m => {
        // Format the date for the milestone input
        let dateValue = '';
        if (m.year) {
            dateValue = `${m.year}-01-01`; // Use year-only format
        }

        addDynamicField(appRoot, 'milestones', {
            title: m.title,
            year: dateValue
        });
    });

    showToast(`Added ${milestones.length} milestone${milestones.length > 1 ? 's' : ''} to the timeline!`, 'success');
    milestoneWizardModal.hide();
}

// --- Memorial Search/Linking Functions ---
function initializeMemorialSearch(appRoot, currentMemorialId) {
    const modalEl = appRoot.querySelector('#memorialSearchModal');
    if (!modalEl) return;

    memorialSearchModal = new bootstrap.Modal(modalEl);
    const searchInput = appRoot.querySelector('#memorial-search-input');
    const resultsContainer = appRoot.querySelector('#memorial-search-results');
    const confirmBtn = appRoot.querySelector('#confirm-memorial-link-btn');
    const searchStep = appRoot.querySelector('#family-search-step');
    const relationshipStep = appRoot.querySelector('#family-relationship-step');
    const createNewOption = appRoot.querySelector('#create-new-option');
    const createNewBtn = appRoot.querySelector('#create-new-memorial-btn');
    const searchNameEcho = appRoot.querySelector('#search-name-echo');
    const changeSelectionBtn = appRoot.querySelector('#change-selection-btn');
    const relationshipSelect = appRoot.querySelector('#family-relationship-select');
    const relationshipOther = appRoot.querySelector('#family-relationship-other');
    const currentMemorialNameRef = appRoot.querySelector('#current-memorial-name-ref');

    // Get current memorial name for display
    const memorialNameInput = appRoot.querySelector('#memorial-full-name');
    if (currentMemorialNameRef && memorialNameInput) {
        currentMemorialNameRef.textContent = memorialNameInput.value || 'this person';
    }

    // Debounced search
    searchInput?.addEventListener('input', (e) => {
        clearTimeout(searchDebounceTimer);
        const query = e.target.value.trim();

        // Update "Create New" button text
        if (searchNameEcho) searchNameEcho.textContent = query;

        if (query.length < 2) {
            resultsContainer.innerHTML = `
                <div class="search-empty-state text-center py-4 text-muted">
                    <i class="fas fa-users fa-2x mb-2 opacity-50"></i>
                    <p class="mb-0">Start typing to find existing memorials</p>
                </div>
            `;
            createNewOption?.classList.add('d-none');
            return;
        }

        resultsContainer.innerHTML = `
            <div class="search-loading">
                <i class="fas fa-spinner fa-spin me-2"></i>Searching...
            </div>
        `;

        searchDebounceTimer = setTimeout(() => searchMemorials(query, currentMemorialId, resultsContainer, appRoot), 300);
    });

    // "Create New Memorial" button - for when no match found
    createNewBtn?.addEventListener('click', () => {
        const searchQuery = searchInput.value.trim();
        if (!searchQuery) return;

        // Set as "new memorial" mode
        appRoot.querySelector('#selected-memorial-id').value = '';
        appRoot.querySelector('#selected-is-new-memorial').value = 'true';
        appRoot.querySelector('#selected-memorial-name').textContent = searchQuery;
        appRoot.querySelector('#selected-memorial-dates').textContent = 'New memorial will be created';

        const photoEl = appRoot.querySelector('#selected-memorial-photo');
        photoEl.src = '';
        photoEl.style.display = 'none';

        // Show step 2
        searchStep.classList.add('d-none');
        relationshipStep.classList.remove('d-none');
        confirmBtn.disabled = true; // Enable after relationship selected
    });

    // "Change" button - go back to search
    changeSelectionBtn?.addEventListener('click', () => {
        searchStep.classList.remove('d-none');
        relationshipStep.classList.add('d-none');
        relationshipSelect.value = '';
        relationshipOther.classList.add('d-none');
        confirmBtn.disabled = true;
    });

    // Relationship select - show "Other" input if needed
    relationshipSelect?.addEventListener('change', () => {
        if (relationshipSelect.value === 'Other') {
            relationshipOther.classList.remove('d-none');
            relationshipOther.focus();
        } else {
            relationshipOther.classList.add('d-none');
        }
        // Enable confirm if relationship selected
        confirmBtn.disabled = !relationshipSelect.value;
    });

    // Confirm - add to family
    confirmBtn?.addEventListener('click', () => {
        confirmMemorialLink(appRoot);
    });

    // Reset on modal close
    modalEl.addEventListener('hidden.bs.modal', () => {
        searchInput.value = '';
        resultsContainer.innerHTML = `
            <div class="search-empty-state text-center py-4 text-muted">
                <i class="fas fa-users fa-2x mb-2 opacity-50"></i>
                <p class="mb-0">Start typing to find existing memorials</p>
            </div>
        `;
        createNewOption?.classList.add('d-none');
        searchStep.classList.remove('d-none');
        relationshipStep.classList.add('d-none');
        relationshipSelect.value = '';
        relationshipOther.classList.add('d-none');
        relationshipOther.value = '';
        confirmBtn.disabled = true;
        appRoot.querySelector('#selected-memorial-id').value = '';
        appRoot.querySelector('#selected-is-new-memorial').value = 'false';
        currentLinkingRelativeGroup = null;
    });
}

async function searchMemorials(query, excludeId, resultsContainer, appRoot) {
    const createNewOption = appRoot.querySelector('#create-new-option');

    try {
        const excludeParam = excludeId ? `&exclude=${encodeURIComponent(excludeId)}` : '';
        const response = await fetch(`/api/memorials/search?q=${encodeURIComponent(query)}${excludeParam}`);

        if (!response.ok) throw new Error('Search failed');

        const { results } = await response.json();

        if (!results || results.length === 0) {
            resultsContainer.innerHTML = `
                <div class="search-no-results text-center py-3">
                    <i class="fas fa-search fa-2x mb-2 opacity-50"></i>
                    <p class="mb-0">No existing memorials found for "<strong>${query}</strong>"</p>
                </div>
            `;
            // Show "Create New" option
            createNewOption?.classList.remove('d-none');
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

        // Also show "Create New" option (in case user doesn't see their person)
        createNewOption?.classList.remove('d-none');

    } catch (error) {
        console.error('Memorial search error:', error);
        resultsContainer.innerHTML = `
            <div class="search-no-results text-danger">
                <i class="fas fa-exclamation-circle fa-2x mb-2"></i>
                <p class="mb-0">Search failed. Please try again.</p>
            </div>
        `;
        createNewOption?.classList.add('d-none');
    }
}

function selectMemorial(element, appRoot) {
    const id = element.dataset.memorialId;
    const name = element.dataset.memorialName;
    const dates = element.dataset.memorialDates;
    const photo = element.dataset.memorialPhoto;

    // Store selection
    appRoot.querySelector('#selected-memorial-id').value = id;
    appRoot.querySelector('#selected-is-new-memorial').value = 'false';
    appRoot.querySelector('#selected-memorial-name').textContent = name;
    appRoot.querySelector('#selected-memorial-dates').textContent = dates || '';

    const photoEl = appRoot.querySelector('#selected-memorial-photo');
    if (photo) {
        photoEl.src = photo;
        photoEl.style.display = 'block';
    } else {
        photoEl.src = '';
        photoEl.style.display = 'none';
    }

    // Transition to step 2 (relationship selection)
    const searchStep = appRoot.querySelector('#family-search-step');
    const relationshipStep = appRoot.querySelector('#family-relationship-step');
    const confirmBtn = appRoot.querySelector('#confirm-memorial-link-btn');

    searchStep.classList.add('d-none');
    relationshipStep.classList.remove('d-none');
    confirmBtn.disabled = true; // Enable after relationship selected
}

function confirmMemorialLink(appRoot) {
    const selectedId = appRoot.querySelector('#selected-memorial-id').value;
    const selectedName = appRoot.querySelector('#selected-memorial-name').textContent;
    const isNewMemorial = appRoot.querySelector('#selected-is-new-memorial').value === 'true';
    const relationshipSelect = appRoot.querySelector('#family-relationship-select');
    const relationshipOther = appRoot.querySelector('#family-relationship-other');

    // Get relationship from modal
    let relationship = relationshipSelect?.value || '';
    if (relationship === 'Other' && relationshipOther?.value) {
        relationship = relationshipOther.value.trim();
    }

    if (!selectedName || !relationship) {
        showToast('Please select a relationship', 'error');
        return;
    }

    // Check if we're linking an existing row (legacy Link button click)
    if (currentLinkingRelativeGroup) {
        // Update existing row with link
        const memorialIdInput = currentLinkingRelativeGroup.querySelector('.relative-memorial-id');
        if (memorialIdInput) memorialIdInput.value = selectedId;

        const nameInput = currentLinkingRelativeGroup.querySelector('.relative-name-input');
        if (nameInput) nameInput.value = selectedName;

        // Update relationship dropdown if different
        const relSelect = currentLinkingRelativeGroup.querySelector('.relative-relationship-input');
        if (relSelect) relSelect.value = relationship;

        // Update Link button to show linked state
        const linkBtn = currentLinkingRelativeGroup.querySelector('.link-btn');
        if (linkBtn) {
            linkBtn.classList.add('linked');
            linkBtn.innerHTML = '<i class="fas fa-check"></i>';
            linkBtn.title = `Linked to ${selectedName}`;
        }

        // Add badge
        if (!currentLinkingRelativeGroup.querySelector('.relative-linked-badge') && nameInput) {
            const badge = document.createElement('span');
            badge.className = 'relative-linked-badge';
            badge.innerHTML = `<i class="fas fa-link"></i> Linked`;
            nameInput.parentElement.appendChild(badge);
        }

        showToast(`Linked to ${selectedName}`, 'success');
    } else {
        // New row from Add Family Member button
        const container = appRoot.querySelector('#relatives-container');
        if (!container) return;

        const values = {
            name: selectedName,
            relationship: relationship,
            memorialId: isNewMemorial ? '' : selectedId,
            dates: appRoot.querySelector('#selected-memorial-dates')?.textContent || ''
        };

        addDynamicField(appRoot, 'relatives', values);

        if (isNewMemorial) {
            showToast(`${selectedName} added as ${relationship} (not yet linked)`, 'info');
        } else {
            showToast(`${selectedName} added as ${relationship}`, 'success');
        }
    }

    // Add to pending connections if linked
    if (selectedId && !isNewMemorial) {
        const existingIndex = pendingConnections.findIndex(c => c.connectedMemorialId === selectedId);
        if (existingIndex >= 0) {
            pendingConnections[existingIndex].relationship = relationship;
        } else {
            pendingConnections.push({
                connectedMemorialId: selectedId,
                relationship: relationship
            });
        }

        // Discover and suggest related family members based on the relationship type
        discoverAndSuggestFamily(selectedId, selectedName, relationship, appRoot);
    }

    memorialSearchModal.hide();
}

// Discover family from linked relative and suggest additions (comprehensive version)
async function discoverAndSuggestFamily(linkedMemorialId, linkedName, relationship, appRoot) {
    console.log('[memorial-form] discoverAndSuggestFamily called:', { linkedMemorialId, linkedName, relationship });

    try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
            console.log('[memorial-form] No session, skipping family discovery');
            return;
        }

        // Get the current memorial's ID and family
        const currentMemorialName = appRoot.querySelector('#memorial-full-name')?.value || 'this person';

        // Discover family of the LINKED memorial
        const linkedResponse = await fetch('/api/family/reciprocal', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.access_token}`
            },
            body: JSON.stringify({
                action: 'discover_family',
                memorialId: linkedMemorialId
            })
        });

        let linkedFamily = null;
        if (linkedResponse.ok) {
            const linkedResult = await linkedResponse.json();
            if (linkedResult.success) {
                linkedFamily = linkedResult.discovered;
            }
        }

        // Also discover family of the CURRENT memorial (if editing existing)
        let currentFamily = null;
        if (currentEditingMemorialId) {
            const currentResponse = await fetch('/api/family/reciprocal', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.access_token}`
                },
                body: JSON.stringify({
                    action: 'discover_family',
                    memorialId: currentEditingMemorialId
                })
            });

            if (currentResponse.ok) {
                const currentResult = await currentResponse.json();
                if (currentResult.success) {
                    currentFamily = currentResult.discovered;
                }
            }
        }

        // Generate comprehensive suggestions
        const suggestions = generateComprehensiveSuggestions(
            relationship,
            linkedMemorialId,
            linkedName,
            linkedFamily,
            currentEditingMemorialId,
            currentMemorialName,
            currentFamily,
            appRoot
        );

        if (suggestions.length > 0) {
            showFamilySuggestionsModal(suggestions, linkedName, currentMemorialName, appRoot);
        } else {
            console.log('[memorial-form] No suggestions found');
        }
    } catch (error) {
        console.error('[memorial-form] Error discovering family:', error);
    }
}

// Generate comprehensive family connection suggestions
function generateComprehensiveSuggestions(
    relationship,
    linkedMemorialId,
    linkedName,
    linkedFamily,
    currentMemorialId,
    currentMemorialName,
    currentFamily,
    appRoot
) {
    const suggestions = [];
    const existingRelatives = getExistingRelativeIds(appRoot);
    const relLower = relationship.toLowerCase();

    // Helper to infer gender-appropriate relationship from name
    const maleNames = ['fred', 'norman', 'robert', 'james', 'john', 'william', 'michael', 'david', 'richard', 'joseph', 'thomas', 'charles', 'daniel', 'donald', 'steven', 'paul', 'andrew', 'george', 'henry', 'peter', 'albert', 'jack', 'frank'];
    const femaleNames = ['dorothy', 'mary', 'patricia', 'jennifer', 'linda', 'barbara', 'elizabeth', 'susan', 'jessica', 'sarah', 'karen', 'nancy', 'betty', 'margaret', 'helen', 'ruth', 'marie', 'rose', 'jeanette', 'antoinette', 'alice', 'joan', 'martha', 'grace'];

    function inferGender(name) {
        const firstName = (name || '').toLowerCase().split(' ')[0].replace(/[^a-z]/g, '');
        if (maleNames.includes(firstName)) return 'male';
        if (femaleNames.includes(firstName)) return 'female';
        return null;
    }

    function getGenderedRelationship(baseRel, name) {
        const gender = inferGender(name);
        const mappings = {
            'parent': { male: 'Father', female: 'Mother', default: 'Parent' },
            'child': { male: 'Son', female: 'Daughter', default: 'Child' },
            'sibling': { male: 'Brother', female: 'Sister', default: 'Sibling' },
            'grandparent': { male: 'Grandfather', female: 'Grandmother', default: 'Grandparent' },
            'grandchild': { male: 'Grandson', female: 'Granddaughter', default: 'Grandchild' },
            'uncle_aunt': { male: 'Uncle', female: 'Aunt', default: 'Uncle/Aunt' },
            'nephew_niece': { male: 'Nephew', female: 'Niece', default: 'Nephew/Niece' },
            'spouse': { male: 'Spouse', female: 'Spouse', default: 'Spouse' }
        };
        const mapping = mappings[baseRel];
        if (!mapping) return baseRel;
        if (gender === 'male') return mapping.male;
        if (gender === 'female') return mapping.female;
        return mapping.default;
    }

    // Skip if either memorial ID is missing
    if (!linkedMemorialId) return suggestions;

    // ============================================
    // PART 1: Suggestions for the CURRENT memorial (add to current form)
    // ============================================

    if (['mother', 'father', 'parent'].includes(relLower) && linkedFamily) {
        // Added PARENT → suggest their spouse as other parent, children as siblings, parents as grandparents
        if (linkedFamily.spouse?.memorialId && !existingRelatives.has(linkedFamily.spouse.memorialId)) {
            const otherParentRel = relLower === 'mother' ? 'Father' : relLower === 'father' ? 'Mother' : getGenderedRelationship('parent', linkedFamily.spouse.name);
            suggestions.push({
                type: 'add_to_current',
                group: `Add to ${currentMemorialName}`,
                sourceMemorialId: currentMemorialId,
                targetMemorialId: linkedFamily.spouse.memorialId,
                targetName: linkedFamily.spouse.name,
                relationshipToTarget: otherParentRel,
                relationshipToSource: getGenderedRelationship('child', currentMemorialName),
                reason: `${linkedName}'s spouse`
            });
        }
        for (const child of linkedFamily.children || []) {
            if (child.memorialId && !existingRelatives.has(child.memorialId) && child.memorialId !== currentMemorialId) {
                suggestions.push({
                    type: 'add_to_current',
                    group: `Add to ${currentMemorialName}`,
                    sourceMemorialId: currentMemorialId,
                    targetMemorialId: child.memorialId,
                    targetName: child.name,
                    relationshipToTarget: getGenderedRelationship('sibling', child.name),
                    relationshipToSource: getGenderedRelationship('sibling', currentMemorialName),
                    reason: `${linkedName}'s ${child.relationship?.toLowerCase() || 'child'}`
                });
            }
        }
        for (const gp of linkedFamily.parents || []) {
            if (gp.memorialId && !existingRelatives.has(gp.memorialId)) {
                suggestions.push({
                    type: 'add_to_current',
                    group: `Add to ${currentMemorialName}`,
                    sourceMemorialId: currentMemorialId,
                    targetMemorialId: gp.memorialId,
                    targetName: gp.name,
                    relationshipToTarget: getGenderedRelationship('grandparent', gp.name),
                    relationshipToSource: getGenderedRelationship('grandchild', currentMemorialName),
                    reason: `${linkedName}'s ${gp.relationship?.toLowerCase() || 'parent'}`
                });
            }
        }
        for (const sib of linkedFamily.siblings || []) {
            if (sib.memorialId && !existingRelatives.has(sib.memorialId)) {
                suggestions.push({
                    type: 'add_to_current',
                    group: `Add to ${currentMemorialName}`,
                    sourceMemorialId: currentMemorialId,
                    targetMemorialId: sib.memorialId,
                    targetName: sib.name,
                    relationshipToTarget: getGenderedRelationship('uncle_aunt', sib.name),
                    relationshipToSource: getGenderedRelationship('nephew_niece', currentMemorialName),
                    reason: `${linkedName}'s ${sib.relationship?.toLowerCase() || 'sibling'}`
                });
            }
        }
    }

    if (['son', 'daughter', 'child'].includes(relLower) && linkedFamily) {
        // Added CHILD → suggest their other parents as spouse, siblings as other children
        for (const parent of linkedFamily.parents || []) {
            if (parent.memorialId && !existingRelatives.has(parent.memorialId) && parent.memorialId !== currentMemorialId) {
                suggestions.push({
                    type: 'add_to_current',
                    group: `Add to ${currentMemorialName}`,
                    sourceMemorialId: currentMemorialId,
                    targetMemorialId: parent.memorialId,
                    targetName: parent.name,
                    relationshipToTarget: 'Spouse',
                    relationshipToSource: 'Spouse',
                    reason: `${linkedName}'s ${parent.relationship?.toLowerCase() || 'parent'}`
                });
            }
        }
        for (const sib of linkedFamily.siblings || []) {
            if (sib.memorialId && !existingRelatives.has(sib.memorialId)) {
                suggestions.push({
                    type: 'add_to_current',
                    group: `Add to ${currentMemorialName}`,
                    sourceMemorialId: currentMemorialId,
                    targetMemorialId: sib.memorialId,
                    targetName: sib.name,
                    relationshipToTarget: getGenderedRelationship('child', sib.name),
                    relationshipToSource: getGenderedRelationship('parent', currentMemorialName),
                    reason: `${linkedName}'s ${sib.relationship?.toLowerCase() || 'sibling'}`
                });
            }
        }
    }

    if (['brother', 'sister', 'sibling'].includes(relLower) && linkedFamily) {
        // Added SIBLING → suggest their parents as your parents, siblings as your siblings, children as nephews/nieces
        for (const parent of linkedFamily.parents || []) {
            if (parent.memorialId && !existingRelatives.has(parent.memorialId)) {
                suggestions.push({
                    type: 'add_to_current',
                    group: `Add to ${currentMemorialName}`,
                    sourceMemorialId: currentMemorialId,
                    targetMemorialId: parent.memorialId,
                    targetName: parent.name,
                    relationshipToTarget: parent.relationship || getGenderedRelationship('parent', parent.name),
                    relationshipToSource: getGenderedRelationship('child', currentMemorialName),
                    reason: `${linkedName}'s ${parent.relationship?.toLowerCase() || 'parent'}`
                });
            }
        }
        for (const sib of linkedFamily.siblings || []) {
            if (sib.memorialId && !existingRelatives.has(sib.memorialId) && sib.memorialId !== currentMemorialId) {
                suggestions.push({
                    type: 'add_to_current',
                    group: `Add to ${currentMemorialName}`,
                    sourceMemorialId: currentMemorialId,
                    targetMemorialId: sib.memorialId,
                    targetName: sib.name,
                    relationshipToTarget: getGenderedRelationship('sibling', sib.name),
                    relationshipToSource: getGenderedRelationship('sibling', currentMemorialName),
                    reason: `${linkedName}'s ${sib.relationship?.toLowerCase() || 'sibling'}`
                });
            }
        }
        for (const child of linkedFamily.children || []) {
            if (child.memorialId && !existingRelatives.has(child.memorialId)) {
                suggestions.push({
                    type: 'add_to_current',
                    group: `Add to ${currentMemorialName}`,
                    sourceMemorialId: currentMemorialId,
                    targetMemorialId: child.memorialId,
                    targetName: child.name,
                    relationshipToTarget: getGenderedRelationship('nephew_niece', child.name),
                    relationshipToSource: getGenderedRelationship('uncle_aunt', currentMemorialName),
                    reason: `${linkedName}'s ${child.relationship?.toLowerCase() || 'child'}`
                });
            }
        }
    }

    if (['spouse', 'husband', 'wife'].includes(relLower) && linkedFamily) {
        // Added SPOUSE → suggest their children, parents as in-laws, siblings as siblings-in-law
        for (const child of linkedFamily.children || []) {
            if (child.memorialId && !existingRelatives.has(child.memorialId)) {
                suggestions.push({
                    type: 'add_to_current',
                    group: `Add to ${currentMemorialName}`,
                    sourceMemorialId: currentMemorialId,
                    targetMemorialId: child.memorialId,
                    targetName: child.name,
                    relationshipToTarget: child.relationship || getGenderedRelationship('child', child.name),
                    relationshipToSource: getGenderedRelationship('parent', currentMemorialName),
                    reason: `${linkedName}'s ${child.relationship?.toLowerCase() || 'child'}`
                });
            }
        }
        for (const parent of linkedFamily.parents || []) {
            if (parent.memorialId && !existingRelatives.has(parent.memorialId)) {
                const inLawRel = parent.relationship === 'Mother' ? 'Mother-in-law' : parent.relationship === 'Father' ? 'Father-in-law' : 'Parent-in-law';
                suggestions.push({
                    type: 'add_to_current',
                    group: `Add to ${currentMemorialName}`,
                    sourceMemorialId: currentMemorialId,
                    targetMemorialId: parent.memorialId,
                    targetName: parent.name,
                    relationshipToTarget: inLawRel,
                    relationshipToSource: inferGender(currentMemorialName) === 'female' ? 'Daughter-in-law' : 'Son-in-law',
                    reason: `${linkedName}'s ${parent.relationship?.toLowerCase() || 'parent'}`
                });
            }
        }
        for (const sib of linkedFamily.siblings || []) {
            if (sib.memorialId && !existingRelatives.has(sib.memorialId)) {
                const sibInLawRel = sib.relationship === 'Sister' ? 'Sister-in-law' : sib.relationship === 'Brother' ? 'Brother-in-law' : 'Sibling-in-law';
                suggestions.push({
                    type: 'add_to_current',
                    group: `Add to ${currentMemorialName}`,
                    sourceMemorialId: currentMemorialId,
                    targetMemorialId: sib.memorialId,
                    targetName: sib.name,
                    relationshipToTarget: sibInLawRel,
                    relationshipToSource: sibInLawRel,
                    reason: `${linkedName}'s ${sib.relationship?.toLowerCase() || 'sibling'}`
                });
            }
        }
    }

    if (['grandfather', 'grandmother', 'grandparent'].includes(relLower) && linkedFamily) {
        // Added GRANDPARENT → suggest their spouse as other grandparent, children as parents/uncles/aunts
        if (linkedFamily.spouse?.memorialId && !existingRelatives.has(linkedFamily.spouse.memorialId)) {
            suggestions.push({
                type: 'add_to_current',
                group: `Add to ${currentMemorialName}`,
                sourceMemorialId: currentMemorialId,
                targetMemorialId: linkedFamily.spouse.memorialId,
                targetName: linkedFamily.spouse.name,
                relationshipToTarget: getGenderedRelationship('grandparent', linkedFamily.spouse.name),
                relationshipToSource: getGenderedRelationship('grandchild', currentMemorialName),
                reason: `${linkedName}'s spouse`
            });
        }
        // Their children could be parents or uncles/aunts
        for (const child of linkedFamily.children || []) {
            if (child.memorialId && !existingRelatives.has(child.memorialId)) {
                // Could be parent OR uncle/aunt - suggest as uncle/aunt by default (user can change)
                suggestions.push({
                    type: 'add_to_current',
                    group: `Add to ${currentMemorialName}`,
                    sourceMemorialId: currentMemorialId,
                    targetMemorialId: child.memorialId,
                    targetName: child.name,
                    relationshipToTarget: getGenderedRelationship('uncle_aunt', child.name),
                    relationshipToSource: getGenderedRelationship('nephew_niece', currentMemorialName),
                    reason: `${linkedName}'s ${child.relationship?.toLowerCase() || 'child'}`
                });
            }
        }
    }

    if (['uncle', 'aunt'].includes(relLower) && linkedFamily) {
        // Added UNCLE/AUNT → suggest their spouse, children as cousins, parents as grandparents, siblings as parents/uncles
        if (linkedFamily.spouse?.memorialId && !existingRelatives.has(linkedFamily.spouse.memorialId)) {
            suggestions.push({
                type: 'add_to_current',
                group: `Add to ${currentMemorialName}`,
                sourceMemorialId: currentMemorialId,
                targetMemorialId: linkedFamily.spouse.memorialId,
                targetName: linkedFamily.spouse.name,
                relationshipToTarget: getGenderedRelationship('uncle_aunt', linkedFamily.spouse.name),
                relationshipToSource: getGenderedRelationship('nephew_niece', currentMemorialName),
                reason: `${linkedName}'s spouse`
            });
        }
        for (const child of linkedFamily.children || []) {
            if (child.memorialId && !existingRelatives.has(child.memorialId)) {
                suggestions.push({
                    type: 'add_to_current',
                    group: `Add to ${currentMemorialName}`,
                    sourceMemorialId: currentMemorialId,
                    targetMemorialId: child.memorialId,
                    targetName: child.name,
                    relationshipToTarget: 'Cousin',
                    relationshipToSource: 'Cousin',
                    reason: `${linkedName}'s ${child.relationship?.toLowerCase() || 'child'}`
                });
            }
        }
        for (const parent of linkedFamily.parents || []) {
            if (parent.memorialId && !existingRelatives.has(parent.memorialId)) {
                suggestions.push({
                    type: 'add_to_current',
                    group: `Add to ${currentMemorialName}`,
                    sourceMemorialId: currentMemorialId,
                    targetMemorialId: parent.memorialId,
                    targetName: parent.name,
                    relationshipToTarget: getGenderedRelationship('grandparent', parent.name),
                    relationshipToSource: getGenderedRelationship('grandchild', currentMemorialName),
                    reason: `${linkedName}'s ${parent.relationship?.toLowerCase() || 'parent'}`
                });
            }
        }
    }

    if (['nephew', 'niece'].includes(relLower) && linkedFamily) {
        // Added NEPHEW/NIECE → suggest their siblings as other nephews/nieces, parents as siblings
        for (const sib of linkedFamily.siblings || []) {
            if (sib.memorialId && !existingRelatives.has(sib.memorialId)) {
                suggestions.push({
                    type: 'add_to_current',
                    group: `Add to ${currentMemorialName}`,
                    sourceMemorialId: currentMemorialId,
                    targetMemorialId: sib.memorialId,
                    targetName: sib.name,
                    relationshipToTarget: getGenderedRelationship('nephew_niece', sib.name),
                    relationshipToSource: getGenderedRelationship('uncle_aunt', currentMemorialName),
                    reason: `${linkedName}'s ${sib.relationship?.toLowerCase() || 'sibling'}`
                });
            }
        }
        for (const parent of linkedFamily.parents || []) {
            if (parent.memorialId && !existingRelatives.has(parent.memorialId)) {
                suggestions.push({
                    type: 'add_to_current',
                    group: `Add to ${currentMemorialName}`,
                    sourceMemorialId: currentMemorialId,
                    targetMemorialId: parent.memorialId,
                    targetName: parent.name,
                    relationshipToTarget: getGenderedRelationship('sibling', parent.name),
                    relationshipToSource: getGenderedRelationship('sibling', currentMemorialName),
                    reason: `${linkedName}'s ${parent.relationship?.toLowerCase() || 'parent'}`
                });
            }
        }
    }

    // ============================================
    // PART 2: Suggestions for the LINKED memorial (cross-connections with current's family)
    // ============================================

    if (['son', 'daughter', 'child'].includes(relLower) && currentFamily && currentMemorialId) {
        // Added CHILD → current's parents should be grandparents to the child
        for (const parent of currentFamily.parents || []) {
            if (parent.memorialId) {
                suggestions.push({
                    type: 'add_to_linked',
                    group: `Grandparents for ${linkedName}`,
                    sourceMemorialId: linkedMemorialId,
                    targetMemorialId: parent.memorialId,
                    targetName: parent.name,
                    relationshipToTarget: getGenderedRelationship('grandparent', parent.name),
                    relationshipToSource: getGenderedRelationship('grandchild', linkedName),
                    reason: `${currentMemorialName}'s ${parent.relationship?.toLowerCase() || 'parent'}`
                });
            }
        }
        // Current's spouse should also be a parent to the child
        if (currentFamily.spouse?.memorialId && currentFamily.spouse.memorialId !== linkedMemorialId) {
            suggestions.push({
                type: 'add_to_linked',
                group: `Other parent for ${linkedName}`,
                sourceMemorialId: linkedMemorialId,
                targetMemorialId: currentFamily.spouse.memorialId,
                targetName: currentFamily.spouse.name,
                relationshipToTarget: getGenderedRelationship('parent', currentFamily.spouse.name),
                relationshipToSource: getGenderedRelationship('child', linkedName),
                reason: `${currentMemorialName}'s spouse`
            });
        }
        // Current's other children are siblings to this child
        for (const child of currentFamily.children || []) {
            if (child.memorialId && child.memorialId !== linkedMemorialId) {
                suggestions.push({
                    type: 'add_to_linked',
                    group: `Siblings for ${linkedName}`,
                    sourceMemorialId: linkedMemorialId,
                    targetMemorialId: child.memorialId,
                    targetName: child.name,
                    relationshipToTarget: getGenderedRelationship('sibling', child.name),
                    relationshipToSource: getGenderedRelationship('sibling', linkedName),
                    reason: `${currentMemorialName}'s ${child.relationship?.toLowerCase() || 'child'}`
                });
            }
        }
    }

    if (['grandson', 'granddaughter', 'grandchild'].includes(relLower) && currentFamily && currentMemorialId) {
        // Added GRANDCHILD → current's children could be their parents
        for (const child of currentFamily.children || []) {
            if (child.memorialId) {
                suggestions.push({
                    type: 'add_to_linked',
                    group: `Parents for ${linkedName}`,
                    sourceMemorialId: linkedMemorialId,
                    targetMemorialId: child.memorialId,
                    targetName: child.name,
                    relationshipToTarget: getGenderedRelationship('parent', child.name),
                    relationshipToSource: getGenderedRelationship('child', linkedName),
                    reason: `${currentMemorialName}'s ${child.relationship?.toLowerCase() || 'child'}`
                });
            }
        }
        // Current's spouse is also grandparent
        if (currentFamily.spouse?.memorialId) {
            suggestions.push({
                type: 'add_to_linked',
                group: `Other grandparent for ${linkedName}`,
                sourceMemorialId: linkedMemorialId,
                targetMemorialId: currentFamily.spouse.memorialId,
                targetName: currentFamily.spouse.name,
                relationshipToTarget: getGenderedRelationship('grandparent', currentFamily.spouse.name),
                relationshipToSource: getGenderedRelationship('grandchild', linkedName),
                reason: `${currentMemorialName}'s spouse`
            });
        }
    }

    if (['nephew', 'niece'].includes(relLower) && currentFamily && currentMemorialId) {
        // Added NEPHEW/NIECE → current's parents are their grandparents
        for (const parent of currentFamily.parents || []) {
            if (parent.memorialId) {
                suggestions.push({
                    type: 'add_to_linked',
                    group: `Grandparents for ${linkedName}`,
                    sourceMemorialId: linkedMemorialId,
                    targetMemorialId: parent.memorialId,
                    targetName: parent.name,
                    relationshipToTarget: getGenderedRelationship('grandparent', parent.name),
                    relationshipToSource: getGenderedRelationship('grandchild', linkedName),
                    reason: `${currentMemorialName}'s ${parent.relationship?.toLowerCase() || 'parent'}`
                });
            }
        }
    }

    // Remove duplicates (same source-target pair)
    const seen = new Set();
    return suggestions.filter(s => {
        const key = `${s.sourceMemorialId}-${s.targetMemorialId}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

// Get IDs of already-added relatives to avoid suggesting duplicates
function getExistingRelativeIds(appRoot) {
    const ids = new Set();
    const relativeGroups = appRoot.querySelectorAll('.dynamic-field-group[data-field-type="relatives"]');
    relativeGroups.forEach(group => {
        const memorialId = group.querySelector('input[name$="-memorialId"]')?.value;
        if (memorialId) ids.add(memorialId);
    });
    // Also check pending connections
    pendingConnections.forEach(c => ids.add(c.connectedMemorialId));
    return ids;
}

// Get gender-specific options for a relationship type
function getRelationshipOptions(relationship) {
    const rel = (relationship || '').toLowerCase();

    // Map base relationships to their gendered variants
    const optionsMap = {
        'sibling': ['Brother', 'Sister'],
        'brother': ['Brother', 'Sister'],
        'sister': ['Brother', 'Sister'],
        'parent': ['Father', 'Mother'],
        'father': ['Father', 'Mother'],
        'mother': ['Father', 'Mother'],
        'child': ['Son', 'Daughter'],
        'son': ['Son', 'Daughter'],
        'daughter': ['Son', 'Daughter'],
        'grandparent': ['Grandfather', 'Grandmother'],
        'grandfather': ['Grandfather', 'Grandmother'],
        'grandmother': ['Grandfather', 'Grandmother'],
        'grandchild': ['Grandson', 'Granddaughter'],
        'grandson': ['Grandson', 'Granddaughter'],
        'granddaughter': ['Grandson', 'Granddaughter'],
        'uncle': ['Uncle', 'Aunt'],
        'aunt': ['Uncle', 'Aunt'],
        'nephew': ['Nephew', 'Niece'],
        'niece': ['Nephew', 'Niece'],
        'uncle/aunt': ['Uncle', 'Aunt'],
        'nephew/niece': ['Nephew', 'Niece'],
        'brother-in-law': ['Brother-in-law', 'Sister-in-law'],
        'sister-in-law': ['Brother-in-law', 'Sister-in-law'],
        'sibling-in-law': ['Brother-in-law', 'Sister-in-law'],
        'father-in-law': ['Father-in-law', 'Mother-in-law'],
        'mother-in-law': ['Father-in-law', 'Mother-in-law'],
        'parent-in-law': ['Father-in-law', 'Mother-in-law'],
        'son-in-law': ['Son-in-law', 'Daughter-in-law'],
        'daughter-in-law': ['Son-in-law', 'Daughter-in-law'],
        'child-in-law': ['Son-in-law', 'Daughter-in-law'],
        'cousin': ['Cousin'],
        'spouse': ['Spouse']
    };

    return optionsMap[rel] || [relationship];
}

// Show family suggestions modal with checkboxes for confirmation
function showFamilySuggestionsModal(suggestions, linkedName, currentMemorialName, appRoot) {
    // Initialize modal if needed
    const modalEl = appRoot.querySelector('#familySuggestionsModal');
    if (!modalEl) {
        console.log('[memorial-form] Family suggestions modal not found');
        return;
    }

    if (!familySuggestionsModal) {
        familySuggestionsModal = new bootstrap.Modal(modalEl);
    }

    // Store suggestions for the confirm handler
    pendingSuggestedConnections = suggestions;

    // Group suggestions by their group property
    const groups = {};
    suggestions.forEach((s, index) => {
        if (!groups[s.group]) {
            groups[s.group] = [];
        }
        groups[s.group].push({ ...s, index });
    });

    // Build the modal content
    const listEl = modalEl.querySelector('#family-suggestions-list');
    const noSuggestionsEl = modalEl.querySelector('#no-suggestions-message');
    const introEl = modalEl.querySelector('#family-suggestions-intro');

    if (suggestions.length === 0) {
        listEl.classList.add('d-none');
        noSuggestionsEl.classList.remove('d-none');
        return;
    }

    listEl.classList.remove('d-none');
    noSuggestionsEl.classList.add('d-none');
    introEl.innerHTML = `Based on adding <strong>${escapeHtml(linkedName)}</strong>, these family connections can be created:`;

    let html = '';
    for (const [groupName, items] of Object.entries(groups)) {
        html += `<div class="suggestion-group mb-3">`;
        html += `<h6 class="text-muted mb-2"><i class="fas fa-users me-2"></i>${escapeHtml(groupName)}</h6>`;

        for (const item of items) {
            const checkId = `suggestion-check-${item.index}`;
            const selectId = `suggestion-rel-${item.index}`;
            const options = getRelationshipOptions(item.relationshipToTarget);

            // Build dropdown options HTML
            let optionsHtml = '';
            if (options.length > 1) {
                optionsHtml = `<select class="form-select form-select-sm d-inline-block w-auto ms-2" id="${selectId}" data-index="${item.index}">`;
                for (const opt of options) {
                    const selected = opt === item.relationshipToTarget ? 'selected' : '';
                    optionsHtml += `<option value="${escapeHtml(opt)}" ${selected}>${escapeHtml(opt)}</option>`;
                }
                optionsHtml += `</select>`;
            } else {
                optionsHtml = `<span class="badge bg-primary ms-2">${escapeHtml(item.relationshipToTarget)}</span>`;
            }

            html += `
                <div class="form-check suggestion-item p-2 bg-light rounded mb-2 d-flex align-items-center">
                    <input class="form-check-input me-2" type="checkbox" id="${checkId}" data-index="${item.index}" checked>
                    <label class="form-check-label flex-grow-1" for="${checkId}">
                        <strong>${escapeHtml(item.targetName)}</strong>
                        ${optionsHtml}
                        <br><small class="text-muted">${escapeHtml(item.reason)}</small>
                    </label>
                </div>
            `;
        }
        html += `</div>`;
    }

    listEl.innerHTML = html;

    // Set up confirm button handler (remove old handler first)
    const confirmBtn = modalEl.querySelector('#confirm-family-suggestions-btn');
    const newConfirmBtn = confirmBtn.cloneNode(true);
    confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);

    newConfirmBtn.addEventListener('click', async () => {
        // Get selected suggestions with user-chosen relationships
        const selectedSuggestions = [];
        listEl.querySelectorAll('input[type="checkbox"]:checked').forEach(cb => {
            const index = parseInt(cb.dataset.index, 10);
            const suggestion = { ...pendingSuggestedConnections[index] };

            // Check if user changed the relationship via dropdown
            const selectEl = listEl.querySelector(`#suggestion-rel-${index}`);
            if (selectEl) {
                suggestion.relationshipToTarget = selectEl.value;
            }

            selectedSuggestions.push(suggestion);
        });

        if (selectedSuggestions.length === 0) {
            familySuggestionsModal.hide();
            return;
        }

        // Show loading state
        newConfirmBtn.disabled = true;
        newConfirmBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>Creating connections...';

        try {
            await createBatchConnections(selectedSuggestions, appRoot);
            showToast(`Created ${selectedSuggestions.length} family connection${selectedSuggestions.length > 1 ? 's' : ''}!`, 'success');
        } catch (error) {
            console.error('Error creating batch connections:', error);
            showToast('Some connections could not be created', 'error');
        }

        // Reset and hide
        newConfirmBtn.disabled = false;
        newConfirmBtn.innerHTML = '<i class="fas fa-check me-2"></i>Add Selected Connections';
        familySuggestionsModal.hide();
    });

    // Show the modal
    familySuggestionsModal.show();
}

// Create batch connections via API
async function createBatchConnections(suggestions, appRoot) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
        throw new Error('No session');
    }

    // Separate into connections to create via API and connections to add to current form
    const apiConnections = [];
    const formConnections = [];

    for (const s of suggestions) {
        if (s.type === 'add_to_current' && s.targetMemorialId) {
            // Add to the current form's relatives
            formConnections.push(s);
        }

        // All connections should be created via batch API for proper reciprocals
        if (s.sourceMemorialId && s.targetMemorialId) {
            apiConnections.push({
                sourceMemorialId: s.sourceMemorialId,
                targetMemorialId: s.targetMemorialId,
                relationshipToTarget: s.relationshipToTarget,
                relationshipToSource: s.relationshipToSource
            });
        }
    }

    // Add form connections to the relatives container
    for (const conn of formConnections) {
        addDynamicField(appRoot, 'relatives', {
            name: conn.targetName,
            relationship: conn.relationshipToTarget,
            memorialId: conn.targetMemorialId,
            dates: ''
        });

        // Also add to pending connections for save
        const existingIndex = pendingConnections.findIndex(c => c.connectedMemorialId === conn.targetMemorialId);
        if (existingIndex < 0) {
            pendingConnections.push({
                connectedMemorialId: conn.targetMemorialId,
                relationship: conn.relationshipToTarget
            });
        }
    }

    // Create API connections (for cross-memorial connections like grandparent→grandchild)
    if (apiConnections.length > 0) {
        const response = await fetch('/api/family/reciprocal', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.access_token}`
            },
            body: JSON.stringify({
                action: 'batch_create_connections',
                connections: apiConnections
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to create connections');
        }

        const result = await response.json();
        console.log('[memorial-form] Batch connections result:', result);
    }
}

function openMemorialSearchModal(relativeGroup, appRoot) {
    currentLinkingRelativeGroup = relativeGroup;

    // Pre-fill search with relative's name if available
    const nameInput = relativeGroup.querySelector('.relative-name-input');
    const searchInput = appRoot.querySelector('#memorial-search-input');

    // Pre-select relationship from existing row
    const existingRelationship = relativeGroup.querySelector('.relative-relationship-input')?.value;
    const relationshipSelect = appRoot.querySelector('#family-relationship-select');
    if (relationshipSelect && existingRelationship) {
        relationshipSelect.value = existingRelationship;
        // Show "other" input if needed
        const relationshipOther = appRoot.querySelector('#family-relationship-other');
        if (existingRelationship === 'Other') {
            relationshipOther?.classList.remove('d-none');
        }
    }

    // Update current memorial name in modal
    const memorialNameInput = appRoot.querySelector('#memorial-full-name');
    const nameRef = appRoot.querySelector('#current-memorial-name-ref');
    if (nameRef && memorialNameInput) {
        nameRef.textContent = memorialNameInput.value || 'this person';
    }

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

    // Set tier from URL param (for new memorials) - default to 'basic'
    if (tierFromURL && !memorialId) {
        setTier(tierFromURL, appRoot);
    } else {
        setTier('basic', appRoot); // Default to basic tier
    }

    // Reset all state for fresh page loads
    isLivingLegacyMode = false;
    gravesiteLocation = null;
    cemeteryLocation = null;
    geocodedResidenceLocations = {};
    pendingConnections = [];
    pendingVideos = [];
    currentEditingMemorialId = memorialId || null;

    // Check for living legacy mode from URL param
    const modeFromURL = urlParams.get('mode');
    if (modeFromURL === 'legacy') {
        applyLivingLegacyMode(appRoot);
    }

    if (memorialId) {
        console.log('[memorial-form] Loading memorial:', memorialId);
        const { data, error } = await supabase
            .from('memorials')
            .select('*')
            .eq('id', memorialId)
            .single();

        if (error) {
            console.error('[memorial-form] Error loading memorial:', error);
            showToast('Memorial not found.', 'error');
            return;
        }

        if (data) {
            console.log('[memorial-form] Loaded data:', { name: data.name, bio: data.bio?.substring(0, 50), status: data.status, tier: data.tier });
            await populateForm(data, appRoot);
            // Initialize collaborators for existing memorials
            initializeCollaborators(appRoot, memorialId);

            // Set tier from loaded memorial (map old tier values to new system)
            // Old: 'memorial', 'storyteller', 'historian' -> New: 'basic' or 'premium'
            const loadedTier = (data.tier === 'premium' || data.tier === 'historian') ? 'premium' : 'basic';
            setTier(loadedTier, appRoot);

            // If editing an existing living legacy, apply the mode
            if (data.status === 'living_legacy') {
                applyLivingLegacyMode(appRoot);
            }
        }
    }

    // Initialize family nearby (works for both new and existing memorials)
    await initializeFamilyNearby(appRoot, memorialId);

    // Initialize auth modal for anonymous users
    initializeAuthModal(appRoot);

    // Setup auto-save to localStorage (only for new memorials)
    if (!memorialId) {
        setupAutoSave(appRoot);

        // Check for prefill data from Known Family Members
        const prefillDataStr = sessionStorage.getItem('prefillMemorialData');
        if (prefillDataStr) {
            try {
                const prefillData = JSON.parse(prefillDataStr);
                applyPrefillData(appRoot, prefillData);
                sessionStorage.removeItem('prefillMemorialData'); // Clear after use
                showToast(`Creating memorial for ${prefillData.name}`, 'info');
            } catch (e) {
                console.error('Error parsing prefill data:', e);
                sessionStorage.removeItem('prefillMemorialData');
            }
        } else {
            // Try to restore from localStorage if there's a saved draft
            const restored = loadFormFromLocalStorage(appRoot);
            if (restored) {
                showToast('Your previous draft has been restored.', 'info');
            }
        }
    }

    // Store appRoot for use in auth callbacks
    currentAppRoot = appRoot;

    navigateToStep(1);

    appRoot.querySelector('#add-milestone-button')?.addEventListener('click', () => addDynamicField(appRoot, 'milestones'));
    // "Add Family Member" now opens search-first modal
    appRoot.querySelector('#add-relative-button')?.addEventListener('click', () => {
        if (memorialSearchModal) {
            // Update current memorial name in modal
            const memorialNameInput = appRoot.querySelector('#memorial-full-name');
            const nameRef = appRoot.querySelector('#current-memorial-name-ref');
            if (nameRef && memorialNameInput) {
                nameRef.textContent = memorialNameInput.value || 'this person';
            }
            memorialSearchModal.show();
        }
    });
    appRoot.querySelector('#add-residence-button')?.addEventListener('click', () => {
        addDynamicField(appRoot, 'residences');
        // Debounce map update
        clearTimeout(window.lifePathMapTimeout);
        window.lifePathMapTimeout = setTimeout(() => updateLifePathMap(appRoot), 1000);
    });

    // Date expand button handlers
    appRoot.querySelectorAll('.date-expand-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const target = btn.dataset.target; // 'birth' or 'death'
            const fullDateDiv = appRoot.querySelector(`#${target}-full-date`);
            if (fullDateDiv) {
                fullDateDiv.classList.toggle('d-none');
                btn.classList.toggle('active');
            }
        });
    });

    // Update world events when dates change
    const updateWorldEventsFromDates = () => {
        const birthDate = buildDateFromFields(appRoot, 'birth');
        const deathDate = buildDateFromFields(appRoot, 'death');
        populateWorldEvents(appRoot, birthDate, deathDate);
    };
    // Listen to year inputs for world events update
    appRoot.querySelector('#memorial-birth-year')?.addEventListener('change', updateWorldEventsFromDates);
    appRoot.querySelector('#memorial-death-year')?.addEventListener('change', updateWorldEventsFromDates);

    // World events select all / deselect all
    appRoot.querySelector('#select-all-events')?.addEventListener('click', () => {
        appRoot.querySelectorAll('#world-events-container .world-event-item').forEach(item => {
            item.querySelector('input').checked = true;
            item.classList.add('selected');
        });
    });
    appRoot.querySelector('#deselect-all-events')?.addEventListener('click', () => {
        appRoot.querySelectorAll('#world-events-container .world-event-item').forEach(item => {
            item.querySelector('input').checked = false;
            item.classList.remove('selected');
        });
    });

    // Setup headstone photo upload
    setupHeadstonePhoto(appRoot);

    // Setup Biography Helper
    initializeBioHelper(appRoot);

    // Setup Story Enhance Feature
    initializeStoryEnhance(appRoot);

    // Setup Milestone Wizard
    initializeMilestoneWizard(appRoot);

    // Setup Photo Cropping
    initializePhotoCropping(appRoot);

    // Setup Memorial Search/Linking
    initializeMemorialSearch(appRoot, memorialId);

    // Wire up cemetery location buttons
    appRoot.querySelector('#use-my-location-btn')?.addEventListener('click', () => useMyLocation(appRoot));
    appRoot.querySelector('#geocode-cemetery-btn')?.addEventListener('click', () => geocodeCemeteryAddress(appRoot));

    // Initialize gravesite editor
    initializeGravesiteEditor();

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

    // Auto-lookup cemetery info when user enters cemetery name
    // This can auto-fill address from other memorials in the same cemetery
    const cemeteryNameInput = appRoot.querySelector('#memorial-cemetery-name');
    if (cemeteryNameInput) {
        cemeteryNameInput.addEventListener('blur', () => {
            // Clear any pending lookup
            if (cemeteryLookupTimer) {
                clearTimeout(cemeteryLookupTimer);
            }
            // Debounce to avoid multiple lookups
            cemeteryLookupTimer = setTimeout(() => lookupCemeteryInfo(appRoot), 500);
        });
    }

    // Setup photo previews
    // Main photo now uses cropping system via initializePhotoCropping
    showPhotoPreview(appRoot, 'memorial-photos', 'photos-preview');

    // Initialize video recording and upload
    initializeVideoRecording(appRoot);

    // Initialize Living Legacy messages (premium feature)
    initializeLegacyMessages(appRoot);
    if (memorialId && currentTier === 'premium') {
        loadLegacyMessages(appRoot);
    }

    // Setup header background image selector
    await setupHeaderImageSelector(appRoot);

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
    customHeaderImageFile = null;
    collaboratorsLoadingPromise = null;
    currentMemorialIdForCollaborators = null;
    currentUserRole = null;
    pendingConnections = [];
    currentLinkingRelativeGroup = null;
    geocodedResidenceLocations = {};
    isLivingLegacyMode = false;
    if (cemeteryLookupTimer) {
        clearTimeout(cemeteryLookupTimer);
        cemeteryLookupTimer = null;
    }
    currentTier = 'basic'; // Reset tier
    legacyMessages = []; // Reset legacy messages
    if (legacyMessageModal) {
        legacyMessageModal.hide();
        legacyMessageModal = null;
    }
    if (bioHelperModal) {
        bioHelperModal.hide();
        bioHelperModal = null;
    }
    if (memorialSearchModal) {
        memorialSearchModal.hide();
        memorialSearchModal = null;
    }
    if (milestoneWizardModal) {
        milestoneWizardModal.hide();
        milestoneWizardModal = null;
    }
    if (photoCropModal) {
        photoCropModal.hide();
        photoCropModal = null;
    }
    if (cropper) {
        cropper.destroy();
        cropper = null;
    }
    originalImageDataUrl = null;
    croppedImageBlob = null;
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
