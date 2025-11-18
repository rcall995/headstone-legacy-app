import { auth, functions } from '/js/firebase-config.js';
import { httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { db } from '/js/firebase-config.js';
import { showToast } from '/js/utils/toasts.js';

// The cloud function to call for creating a Square payment link.
const createSquarePaymentLink = httpsCallable(functions, 'createSquarePaymentLink');

async function handleCheckout(memorialId, memorialName) {
    const checkoutButton = document.getElementById('checkout-button');

    // Add null check before accessing button properties
    if (!checkoutButton) {
        console.error('Checkout button not found');
        showToast('Error: Button not found', 'error');
        return;
    }

    checkoutButton.disabled = true;
    checkoutButton.innerHTML = `<span class="spinner-border spinner-border-sm"></span> Redirecting to Checkout...`;

    try {
        const result = await createSquarePaymentLink({ memorialId, memorialName });
        const paymentUrl = result.data.url;

        if (paymentUrl) {
            // Redirect the user to the Square Checkout page.
            window.location.href = paymentUrl;
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

        if (!auth.currentUser || auth.currentUser.isAnonymous) {
            showToast('You must be signed in to order a tag.', 'error');
            appRoot.innerHTML = `<div class="container py-5 text-center">
                <h2>Authentication Required</h2>
                <p>Please <a href="/curator-panel">sign in</a> to order a physical tag for your memorial.</p>
            </div>`;
            return;
        }

        if (!memorialId) {
            appRoot.innerHTML = `<p class="text-danger text-center">No memorial specified for the order.</p>`;
            return;
        }

        const memorialRef = doc(db, 'memorials', memorialId);
        const memorialSnap = await getDoc(memorialRef);

        if (!memorialSnap.exists()) {
            appRoot.innerHTML = `<p class="text-danger text-center">Memorial not found.</p>`;
            return;
        }

        const memorialData = memorialSnap.data();
        const orderMemorialNameEl = document.getElementById('order-memorial-name');
        if(orderMemorialNameEl) {
            orderMemorialNameEl.textContent = `For: ${memorialData.name}`;
        }
        
        const checkoutButton = document.getElementById('checkout-button');
        if(checkoutButton) {
            checkoutButton.addEventListener('click', () => {
                handleCheckout(memorialId, memorialData.name);
            });
        }

    } catch (error) {
        console.error("Failed to load order page:", error);
        appRoot.innerHTML = `<p class="text-danger text-center">Error loading page.</p>`;
    }
}