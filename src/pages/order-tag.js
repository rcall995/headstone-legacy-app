import { supabase } from '/js/supabase-client.js';
import { showToast } from '/js/utils/toasts.js';

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

        const response = await fetch('/api/payments/create-square-link', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.access_token}`
            },
            body: JSON.stringify({ memorialId, memorialName })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Payment link creation failed');
        }

        const { url } = await response.json();

        if (url) {
            // Redirect the user to the Square Checkout page.
            window.location.href = url;
        } else {
            throw new Error("Payment URL was not returned from the server.");
        }

    } catch (error) {
        console.error("Error creating Square payment link:", error);
        showToast(`Could not initiate payment: ${error.message}`, 'error');
        checkoutButton.disabled = false;
        checkoutButton.innerHTML = `<i class="fas fa-credit-card me-2"></i> Proceed to Secure Checkout`;
    }
}

export async function loadOrderTagPage(appRoot, memorialId) {
    try {
        const response = await fetch('/pages/order-tag.html');
        if (!response.ok) throw new Error('HTML content not found');
        appRoot.innerHTML = await response.text();

        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
            showToast('You must be signed in to order a tag.', 'error');
            appRoot.innerHTML = `<div class="container py-5 text-center">
                <h2>Authentication Required</h2>
                <p>Please <a href="/login">sign in</a> to order a physical tag for your memorial.</p>
            </div>`;
            return;
        }

        if (!memorialId) {
            appRoot.innerHTML = `<p class="text-danger text-center">No memorial specified for the order.</p>`;
            return;
        }

        const { data: memorial, error } = await supabase
            .from('memorials')
            .select('name')
            .eq('id', memorialId)
            .single();

        if (error || !memorial) {
            appRoot.innerHTML = `<p class="text-danger text-center">Memorial not found.</p>`;
            return;
        }

        const orderMemorialNameEl = document.getElementById('order-memorial-name');
        if(orderMemorialNameEl) {
            orderMemorialNameEl.textContent = `For: ${memorial.name}`;
        }

        const checkoutButton = document.getElementById('checkout-button');
        if(checkoutButton) {
            checkoutButton.addEventListener('click', () => {
                handleCheckout(memorialId, memorial.name);
            });
        }

    } catch (error) {
        console.error("Failed to load order page:", error);
        appRoot.innerHTML = `<p class="text-danger text-center">Error loading page.</p>`;
    }
}
