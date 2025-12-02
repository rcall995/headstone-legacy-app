import { supabase } from '/js/supabase-client.js';
import { showToast } from '/js/utils/toasts.js';
import { getStoredReferral } from '/js/utils/referral-tracker.js';

// Current selected package
let selectedTier = 'legacy';
let selectedPrice = 99;

async function showMemorialSelector(appRoot, user) {
    let memorialListHTML = '';

    if (!user) {
        // Not logged in - show sign-in prompt
        memorialListHTML = `
            <div class="text-center py-4">
                <p class="text-muted mb-3">Sign in to see your memorials and order a QR plaque.</p>
                <a href="/login" class="btn btn-hero-primary" data-route>
                    <i class="fas fa-sign-in-alt me-2"></i>Sign In
                </a>
                <p class="text-muted mt-3 mb-0">Don't have an account? <a href="/signup" data-route>Create one free</a></p>
            </div>
        `;
    } else {
        // Fetch user's memorials
        const { data: memorials, error } = await supabase
            .from('memorials')
            .select('id, name, main_photo')
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
                        <a href="/order-tag/${m.id}" class="memorial-select-card" data-route>
                            <div class="memorial-select-photo">
                                ${m.main_photo
                                    ? `<img src="${m.main_photo}" alt="${m.name}">`
                                    : `<i class="fas fa-user"></i>`
                                }
                            </div>
                            <div class="memorial-select-info">
                                <h4>${m.name}</h4>
                                <span class="btn btn-sm btn-hero-secondary">Order Package</span>
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
                    <h1 class="page-hero-title">Complete Legacy Package</h1>
                    <p class="page-hero-subtitle">Everything you need to preserve their memory forever</p>
                </div>
            </section>

            <section class="qr-info-section">
                <div class="container">
                    <div class="qr-features-grid">
                        <div class="qr-feature-card">
                            <div class="qr-feature-icon">
                                <i class="fas fa-shield-alt"></i>
                            </div>
                            <h3>Built to Last</h3>
                            <p>316 stainless steel rated for 50+ years outdoors. Withstands rain, snow, sun, and extreme temperatures.</p>
                        </div>
                        <div class="qr-feature-card">
                            <div class="qr-feature-icon accent">
                                <i class="fas fa-magic"></i>
                            </div>
                            <h3>Instant Access</h3>
                            <p>Visitors simply scan with their phone camera. No app needed - works on any smartphone.</p>
                        </div>
                        <div class="qr-feature-card">
                            <div class="qr-feature-icon">
                                <i class="fas fa-infinity"></i>
                            </div>
                            <h3>Lifetime Guarantee</h3>
                            <p>If your plaque ever fades or becomes unreadable, we'll replace it free. Forever.</p>
                        </div>
                    </div>

                    <div class="qr-price-banner">
                        <div class="qr-price-content">
                            <span class="qr-price">$99</span>
                            <span class="qr-price-details">QR Plaque + Lifetime Memorial + Living Legacy Features</span>
                        </div>
                    </div>
                </div>
            </section>

            <section class="memorial-select-section">
                <div class="container">
                    <h2 class="section-title">Select a Memorial</h2>
                    <p class="section-subtitle">Choose which memorial to order a Complete Legacy Package for</p>
                    ${memorialListHTML}
                </div>
            </section>
        </div>
    `;
}

function setupPackageSelection() {
    const packageCards = document.querySelectorAll('.order-package-card');

    packageCards.forEach(card => {
        card.addEventListener('click', () => {
            // Remove selected from all
            packageCards.forEach(c => {
                c.classList.remove('selected');
                const btn = c.querySelector('.btn-package-select');
                if (btn) btn.innerHTML = 'Select This Package';
            });

            // Add selected to clicked
            card.classList.add('selected');
            const btn = card.querySelector('.btn-package-select');
            if (btn) btn.innerHTML = '<i class="fas fa-check-circle"></i> Selected';

            // Update state
            selectedTier = card.dataset.tier;
            selectedPrice = parseInt(card.dataset.price);

            // Update order summary
            updateOrderSummary();
        });
    });
}

function updateOrderSummary() {
    const packageNameEl = document.getElementById('order-package-name');
    const itemDetailsEl = document.getElementById('order-item-details');
    const subtotalEl = document.getElementById('order-subtotal');
    const totalEl = document.getElementById('order-total');

    if (selectedTier === 'family') {
        if (packageNameEl) packageNameEl.textContent = 'Family Bundle';
        if (itemDetailsEl) itemDetailsEl.textContent = '3 QR Plaques + 3 Lifetime Memorials';
        if (subtotalEl) subtotalEl.textContent = '$259.00';
        if (totalEl) totalEl.textContent = '$259.00';
    } else {
        if (packageNameEl) packageNameEl.textContent = 'Complete Legacy Package';
        if (itemDetailsEl) itemDetailsEl.textContent = '1 QR Plaque + Lifetime Memorial';
        if (subtotalEl) subtotalEl.textContent = '$99.00';
        if (totalEl) totalEl.textContent = '$99.00';
    }
}

async function handleCheckout(memorialId, memorialName) {
    const checkoutButton = document.getElementById('checkout-button');

    if (!checkoutButton) {
        console.error('Checkout button not found');
        showToast('Error: Button not found', 'error');
        return;
    }

    checkoutButton.disabled = true;
    checkoutButton.innerHTML = `<span class="spinner-border spinner-border-sm"></span> Redirecting to Checkout...`;

    try {
        // Get session for API call
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
            throw new Error('You must be signed in to checkout');
        }

        // Get referral data if exists
        const referral = getStoredReferral();
        const requestBody = {
            memorialId,
            memorialName,
            tier: selectedTier,
            quantity: selectedTier === 'family' ? 3 : 1
        };
        if (referral) {
            requestBody.referralCode = referral.code;
            requestBody.partnerId = referral.partnerId;
        }

        const response = await fetch('/api/payments/create-stripe-session', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.access_token}`
            },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Checkout session creation failed');
        }

        const { url } = await response.json();

        if (url) {
            // Redirect the user to Stripe Checkout
            window.location.href = url;
        } else {
            throw new Error("Payment URL was not returned from the server.");
        }

    } catch (error) {
        console.error("Error creating Stripe checkout session:", error);
        showToast(`Could not initiate payment: ${error.message}`, 'error');
        checkoutButton.disabled = false;
        checkoutButton.innerHTML = `<i class="fas fa-lock me-2"></i> Proceed to Secure Checkout`;
    }
}

export async function loadOrderTagPage(appRoot, memorialId) {
    try {
        const { data: { user } } = await supabase.auth.getUser();

        // If no memorial specified, show info page
        if (!memorialId) {
            await showMemorialSelector(appRoot, user);
            return;
        }

        // For actual checkout, user must be logged in
        if (!user) {
            showToast('You must be signed in to order.', 'error');
            appRoot.innerHTML = `<div class="container py-5 text-center">
                <h2>Authentication Required</h2>
                <p>Please <a href="/login">sign in</a> to order a Complete Legacy Package for your memorial.</p>
            </div>`;
            return;
        }

        const response = await fetch('/pages/order-tag.html');
        if (!response.ok) throw new Error('HTML content not found');
        appRoot.innerHTML = await response.text();

        // Memorial ID can be either a UUID or a text slug - both are stored in the 'id' column
        const { data: memorial, error } = await supabase
            .from('memorials')
            .select('id, name')
            .eq('id', memorialId)
            .single();

        if (error || !memorial) {
            appRoot.innerHTML = `<p class="text-danger text-center">Memorial not found.</p>`;
            return;
        }

        const actualMemorialId = memorial.id;

        const orderMemorialNameEl = document.getElementById('order-memorial-name');
        if(orderMemorialNameEl) {
            orderMemorialNameEl.textContent = `For: ${memorial.name}`;
        }

        // Setup package selection
        setupPackageSelection();

        const checkoutButton = document.getElementById('checkout-button');
        if(checkoutButton) {
            checkoutButton.addEventListener('click', () => {
                handleCheckout(actualMemorialId, memorial.name);
            });
        }

    } catch (error) {
        console.error("Failed to load order page:", error);
        appRoot.innerHTML = `<p class="text-danger text-center">Error loading page.</p>`;
    }
}
