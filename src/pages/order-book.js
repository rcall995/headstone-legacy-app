import { supabase } from '/js/supabase-client.js';
import { showToast } from '/js/utils/toasts.js';

let selectedTemplate = 'classic';
let currentMemorial = null;

// Calculate estimated page count based on memorial content
function estimatePageCount(memorial) {
    let pages = 8; // Base pages (cover, title, dedication, TOC, final pages)

    // Biography: ~2 pages per 1000 characters (field is 'bio' not 'biography')
    if (memorial.bio) {
        pages += Math.ceil(memorial.bio.length / 2000) * 2;
    }

    // Photos: ~4 photos per page
    if (memorial.photos && memorial.photos.length > 0) {
        pages += Math.ceil(memorial.photos.length / 4) * 2;
    }

    // Timeline/milestones: ~8 events per page (field is 'milestones' not 'timeline')
    if (memorial.milestones && memorial.milestones.length > 0) {
        pages += Math.ceil(memorial.milestones.length / 8) * 2;
    }

    // Family: 2 pages for family tree
    pages += 2;

    // Residences: 1-2 pages
    if (memorial.residences && memorial.residences.length > 0) {
        pages += 2;
    }

    // Tributes: will be added based on actual count
    // Default estimate of 2 pages
    pages += 2;

    // Round up to nearest 4 (book signatures), minimum 24 pages
    pages = Math.max(24, Math.ceil(pages / 4) * 4);

    return pages;
}

async function showMemorialSelector(appRoot, user) {
    let memorialListHTML = '';

    if (!user) {
        memorialListHTML = `
            <div class="text-center py-4">
                <p class="text-muted mb-3">Sign in to see your memorials and order a memorial book.</p>
                <a href="/login" class="btn btn-hero-primary" data-route>
                    <i class="fas fa-sign-in-alt me-2"></i>Sign In
                </a>
                <p class="text-muted mt-3 mb-0">Don't have an account? <a href="/signup" data-route>Create one free</a></p>
            </div>
        `;
    } else {
        const { data: memorials, error } = await supabase
            .from('memorials')
            .select('id, name, main_photo, biography, photos, timeline')
            .contains('curator_ids', [user.id])
            .order('created_at', { ascending: false });

        if (error || !memorials || memorials.length === 0) {
            memorialListHTML = `
                <div class="text-center py-4">
                    <p class="text-muted mb-3">You don't have any memorials yet.</p>
                    <a href="/memorial-form" class="btn btn-hero-primary" data-route>
                        <i class="fas fa-plus-circle me-2"></i>Create Your First Memorial
                    </a>
                </div>
            `;
        } else {
            memorialListHTML = `
                <div class="memorial-select-grid">
                    ${memorials.map(m => `
                        <a href="/order-book/${m.id}" class="memorial-select-card" data-route>
                            <div class="memorial-select-photo">
                                ${m.main_photo
                                    ? `<img src="${m.main_photo}" alt="${m.name}">`
                                    : `<i class="fas fa-user"></i>`
                                }
                            </div>
                            <div class="memorial-select-info">
                                <h4>${m.name}</h4>
                                <span class="btn btn-sm btn-hero-secondary">Order Book</span>
                            </div>
                        </a>
                    `).join('')}
                </div>
            `;
        }
    }

    appRoot.innerHTML = `
        <div class="page-wrapper">
            <section class="page-hero">
                <div class="container">
                    <h1 class="page-hero-title">Memorial Books</h1>
                    <p class="page-hero-subtitle">Beautiful hardcover books preserving cherished memories forever.</p>
                </div>
            </section>

            <section class="qr-info-section">
                <div class="container">
                    <div class="qr-features-grid">
                        <div class="qr-feature-card">
                            <div class="qr-feature-icon">
                                <i class="fas fa-book"></i>
                            </div>
                            <h3>Premium Hardcover</h3>
                            <p>Professional 8.5"x11" hardcover binding with matte laminated cover. Built to last generations.</p>
                        </div>
                        <div class="qr-feature-card">
                            <div class="qr-feature-icon accent">
                                <i class="fas fa-images"></i>
                            </div>
                            <h3>Full Color Pages</h3>
                            <p>Every photo, every memory printed in vivid full color on premium 80lb paper stock.</p>
                        </div>
                        <div class="qr-feature-card">
                            <div class="qr-feature-icon">
                                <i class="fas fa-heart"></i>
                            </div>
                            <h3>Complete Story</h3>
                            <p>Includes biography, photos, timeline, family tree, tributes, and more.</p>
                        </div>
                    </div>

                    <div class="qr-price-banner">
                        <div class="qr-price-content">
                            <span class="qr-price">$79</span>
                            <span class="qr-price-details">one-time • free shipping • professional printing</span>
                        </div>
                    </div>
                </div>
            </section>

            <section class="memorial-select-section">
                <div class="container">
                    <h2 class="section-title">Select a Memorial</h2>
                    <p class="section-subtitle">Choose which memorial to create a book for</p>
                    ${memorialListHTML}
                </div>
            </section>
        </div>
    `;
}

function setupCoverTemplateSelection() {
    const templates = document.querySelectorAll('.cover-template-option');
    const bookPreview = document.getElementById('book-preview');

    templates.forEach(template => {
        template.addEventListener('click', () => {
            // Remove active from all
            templates.forEach(t => t.classList.remove('active'));
            // Add active to clicked
            template.classList.add('active');
            // Update selected template
            selectedTemplate = template.dataset.template;
            // Update preview
            if (bookPreview) {
                bookPreview.className = `book-3d template-${selectedTemplate}`;
            }
        });
    });
}

function setupDedicationCounter() {
    const dedication = document.getElementById('dedication-text');
    const counter = document.getElementById('dedication-chars');

    if (dedication && counter) {
        dedication.addEventListener('input', () => {
            counter.textContent = dedication.value.length;
        });
    }
}

function updateBookPreview(memorial) {
    // Update cover photo
    const coverPhoto = document.getElementById('cover-photo');
    const coverPlaceholder = document.getElementById('cover-placeholder');
    if (memorial.main_photo) {
        coverPhoto.src = memorial.main_photo;
        coverPhoto.style.display = 'block';
        coverPlaceholder.style.display = 'none';
    } else {
        coverPhoto.style.display = 'none';
        coverPlaceholder.style.display = 'flex';
    }

    // Update name
    const coverName = document.getElementById('cover-name');
    if (coverName) {
        coverName.textContent = memorial.name || 'Memorial Name';
    }

    // Update dates
    const coverDates = document.getElementById('cover-dates');
    if (coverDates && (memorial.birth_date || memorial.death_date)) {
        const birthYear = memorial.birth_date ? new Date(memorial.birth_date).getFullYear() : '?';
        const deathYear = memorial.death_date ? new Date(memorial.death_date).getFullYear() : 'Present';
        coverDates.textContent = `${birthYear} - ${deathYear}`;
    }

    // Update memorial name in order summary
    const orderName = document.getElementById('order-memorial-name');
    if (orderName) {
        orderName.textContent = `For: ${memorial.name}`;
    }

    // Update page estimate
    const pageEstimate = document.getElementById('page-estimate');
    if (pageEstimate) {
        pageEstimate.textContent = `~${estimatePageCount(memorial)}`;
    }

    // Update section counts
    const galleryCount = document.getElementById('gallery-count');
    if (galleryCount && memorial.photos) {
        galleryCount.textContent = `${memorial.photos.length} photos`;
    }

    const timelineCount = document.getElementById('timeline-count');
    if (timelineCount && memorial.milestones) {
        timelineCount.textContent = `${memorial.milestones.length} events`;
    }

    const residencesCount = document.getElementById('residences-count');
    if (residencesCount && memorial.residences) {
        residencesCount.textContent = `${memorial.residences.length} places`;
    }
}

async function fetchTributesCount(memorialId) {
    const { count } = await supabase
        .from('tributes')
        .select('*', { count: 'exact', head: true })
        .eq('memorial_id', memorialId)
        .eq('status', 'approved');

    const tributesCount = document.getElementById('tributes-count');
    if (tributesCount) {
        tributesCount.textContent = `${count || 0} tributes`;
    }
}

async function fetchFamilyCount(memorialId) {
    const familyCount = document.getElementById('family-count');
    // Family connections are stored in the memorial's family_members field
    // Just hide the count for now since we already show family tree toggle
    if (familyCount) {
        familyCount.textContent = '';
    }
}

function getSelectedOptions() {
    return {
        coverTemplate: selectedTemplate,
        includeGallery: document.getElementById('include-gallery')?.checked ?? true,
        includeTimeline: document.getElementById('include-timeline')?.checked ?? true,
        includeFamily: document.getElementById('include-family')?.checked ?? true,
        includeResidences: document.getElementById('include-residences')?.checked ?? true,
        includeTributes: document.getElementById('include-tributes')?.checked ?? true,
        dedicationText: document.getElementById('dedication-text')?.value || null
    };
}

async function handleCheckout(memorialId, memorialName, productType = 'book_hardcover') {
    const checkoutButton = document.getElementById('checkout-button');

    if (!checkoutButton) {
        console.error('Checkout button not found');
        showToast('Error: Button not found', 'error');
        return;
    }

    checkoutButton.disabled = true;
    const originalText = checkoutButton.innerHTML;
    checkoutButton.innerHTML = `<span class="spinner-border spinner-border-sm"></span> Redirecting to Checkout...`;

    try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
            throw new Error('You must be signed in to checkout');
        }

        const options = getSelectedOptions();

        const response = await fetch('/api/payments/create-book-order', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.access_token}`
            },
            body: JSON.stringify({
                memorialId,
                memorialName,
                productType,
                ...options
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Checkout session creation failed');
        }

        const { url } = await response.json();

        if (url) {
            window.location.href = url;
        } else {
            throw new Error("Payment URL was not returned from the server.");
        }

    } catch (error) {
        console.error("Error creating checkout session:", error);
        showToast(`Could not initiate payment: ${error.message}`, 'error');
        checkoutButton.disabled = false;
        checkoutButton.innerHTML = originalText;
    }
}

export async function loadOrderBookPage(appRoot, memorialId) {
    try {
        const { data: { user } } = await supabase.auth.getUser();

        // If no memorial specified, show selector
        if (!memorialId) {
            await showMemorialSelector(appRoot, user);
            return;
        }

        // User must be logged in for checkout
        if (!user) {
            showToast('You must be signed in to order a book.', 'error');
            appRoot.innerHTML = `<div class="container py-5 text-center">
                <h2>Authentication Required</h2>
                <p>Please <a href="/login" data-route>sign in</a> to order a memorial book.</p>
            </div>`;
            return;
        }

        // Load HTML template
        const response = await fetch('/pages/order-book.html');
        if (!response.ok) throw new Error('HTML content not found');
        appRoot.innerHTML = await response.text();

        // Fetch memorial data
        const { data: memorial, error } = await supabase
            .from('memorials')
            .select('*')
            .eq('id', memorialId)
            .single();

        if (error || !memorial) {
            appRoot.innerHTML = `<div class="container py-5 text-center">
                <h2>Memorial Not Found</h2>
                <p>The memorial you're looking for doesn't exist or you don't have access.</p>
                <a href="/order-book" class="btn btn-primary" data-route>View Your Memorials</a>
            </div>`;
            return;
        }

        currentMemorial = memorial;

        // Update preview with memorial data
        updateBookPreview(memorial);

        // Fetch additional counts
        await Promise.all([
            fetchTributesCount(memorialId),
            fetchFamilyCount(memorialId)
        ]);

        // Setup interactive elements
        setupCoverTemplateSelection();
        setupDedicationCounter();

        // Setup checkout button
        const checkoutButton = document.getElementById('checkout-button');
        if (checkoutButton) {
            checkoutButton.addEventListener('click', () => {
                handleCheckout(memorialId, memorial.name, 'book_hardcover');
            });
        }

        // Setup bundle upgrade button
        const upgradeButton = document.getElementById('upgrade-to-bundle');
        if (upgradeButton) {
            upgradeButton.addEventListener('click', () => {
                handleCheckout(memorialId, memorial.name, 'bundle_legacy');
            });
        }

    } catch (error) {
        console.error("Failed to load order book page:", error);
        appRoot.innerHTML = `<div class="container py-5 text-center">
            <h2>Error Loading Page</h2>
            <p class="text-danger">${error.message}</p>
            <a href="/" class="btn btn-primary" data-route>Go Home</a>
        </div>`;
    }
}
