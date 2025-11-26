// /js/pages/order-success.js - Order confirmation page
import { supabase } from '/js/supabase-client.js';
import { showToast } from '/js/utils/toasts.js';

// Product tier display names
const TIER_NAMES = {
  basic: 'QR Memorial Tag - Basic',
  premium: 'QR Memorial Tag - Premium',
  deluxe: 'QR Memorial Tag - Deluxe'
};

// Format currency
function formatCurrency(cents) {
  return '$' + (cents / 100).toFixed(2);
}

// Format date
function formatDate(dateString) {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
}

// Load order details from Stripe session
async function loadOrderDetails() {
  const urlParams = new URLSearchParams(window.location.search);
  const sessionId = urlParams.get('session_id');

  if (!sessionId) {
    showToast('No order information found', 'error');
    return;
  }

  try {
    // Get order by Stripe session ID
    const { data: order, error } = await supabase
      .from('orders')
      .select(`
        *,
        memorials (id, name)
      `)
      .eq('stripe_session_id', sessionId)
      .single();

    if (error || !order) {
      console.error('Error loading order:', error);
      showToast('Could not load order details', 'error');
      return;
    }

    // Populate order details
    document.getElementById('order-number').textContent = order.id.substring(0, 8).toUpperCase();
    document.getElementById('order-memorial').textContent = order.memorials?.name || 'Memorial';
    document.getElementById('order-product').textContent = TIER_NAMES[order.product_tier] || 'QR Memorial Tag';
    document.getElementById('order-quantity').textContent = order.quantity || 1;
    document.getElementById('order-total').textContent = formatCurrency(order.amount_cents);
    document.getElementById('order-date').textContent = formatDate(order.created_at);

    // Populate shipping address
    const shippingDiv = document.getElementById('shipping-address');
    if (order.shipping_address) {
      const addr = order.shipping_address;
      shippingDiv.innerHTML = `
        <p class="mb-1"><strong>${addr.name || order.customer_name || ''}</strong></p>
        <p class="mb-1">${addr.line1 || ''}</p>
        ${addr.line2 ? `<p class="mb-1">${addr.line2}</p>` : ''}
        <p class="mb-0">${addr.city || ''}, ${addr.state || ''} ${addr.postal_code || ''}</p>
      `;
    } else {
      shippingDiv.innerHTML = '<p class="text-muted">Shipping address will be confirmed via email.</p>';
    }

    // Update view memorial button
    const viewBtn = document.getElementById('view-memorial-btn');
    if (order.memorial_id) {
      viewBtn.href = `/memorial?id=${order.memorial_id}`;
    }

    // Clear referral from localStorage since conversion is complete
    localStorage.removeItem('hl_referral');

  } catch (error) {
    console.error('Error loading order:', error);
    showToast('Error loading order details', 'error');
  }
}

export async function loadOrderSuccessPage(appRoot) {
  try {
    const response = await fetch('/pages/order-success.html');
    if (!response.ok) throw new Error('Could not load order-success.html');
    appRoot.innerHTML = await response.text();

    await loadOrderDetails();
  } catch (error) {
    console.error('Failed to load order success page:', error);
    appRoot.innerHTML = `
      <div class="container py-5 text-center">
        <div class="success-icon-large mb-4">
          <i class="fas fa-check-circle text-success" style="font-size: 4rem;"></i>
        </div>
        <h2>Thank You For Your Order!</h2>
        <p class="text-muted">Your order has been placed successfully.</p>
        <a href="/memorial-list" class="btn btn-primary-unified" data-route>View My Memorials</a>
      </div>
    `;
  }
}
