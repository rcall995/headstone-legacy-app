/**
 * Lulu Direct API Client
 * Handles authentication and order creation for print-on-demand books
 */

const LULU_API_BASE = process.env.LULU_API_BASE || 'https://api.lulu.com';
const LULU_AUTH_URL = 'https://api.lulu.com/auth/realms/glasstree/protocol/openid-connect/token';

// Cache access token to avoid repeated auth calls
let cachedToken = null;
let tokenExpiry = null;

/**
 * Get OAuth2 access token from Lulu
 */
export async function getLuluAccessToken() {
  // Return cached token if still valid (with 5 min buffer)
  if (cachedToken && tokenExpiry && Date.now() < tokenExpiry - 300000) {
    return cachedToken;
  }

  const clientKey = process.env.LULU_CLIENT_KEY;
  const clientSecret = process.env.LULU_CLIENT_SECRET;

  if (!clientKey || !clientSecret) {
    throw new Error('Lulu API credentials not configured');
  }

  const credentials = Buffer.from(`${clientKey}:${clientSecret}`).toString('base64');

  const response = await fetch(LULU_AUTH_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${credentials}`
    },
    body: 'grant_type=client_credentials'
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('Lulu auth error:', error);
    throw new Error('Failed to authenticate with Lulu API');
  }

  const data = await response.json();
  cachedToken = data.access_token;
  tokenExpiry = Date.now() + (data.expires_in * 1000);

  return cachedToken;
}

/**
 * Lulu product specifications for memorial books
 * 8.5" x 11" hardcover, standard color
 */
export const BOOK_SPECS = {
  // Hardcover 8.5x11 Color
  pod_package_id: '0850X1100BWSTDPB060UW444GXX',
  // Alternative options:
  // Softcover: '0850X1100BWSTDPB060UW444MXX'
  // Premium hardcover: '0850X1100BWSTDCW060UW444GXX'
};

/**
 * Calculate shipping cost based on destination
 */
export async function getShippingOptions(countryCode, quantity = 1) {
  const token = await getLuluAccessToken();

  const response = await fetch(`${LULU_API_BASE}/shipping-options/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      line_items: [{
        pod_package_id: BOOK_SPECS.pod_package_id,
        quantity: quantity
      }],
      shipping_address: {
        country_code: countryCode
      }
    })
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('Lulu shipping options error:', error);
    throw new Error('Failed to get shipping options');
  }

  return response.json();
}

/**
 * Create a print job with Lulu
 * @param {Object} params - Order parameters
 * @param {string} params.externalId - Your order ID for reference
 * @param {string} params.pdfUrl - URL to the PDF file (must be publicly accessible)
 * @param {number} params.quantity - Number of copies
 * @param {Object} params.shippingAddress - Shipping details
 * @param {string} params.shippingLevel - 'MAIL', 'PRIORITY_MAIL', 'GROUND', 'EXPEDITED', 'EXPRESS'
 */
export async function createPrintJob(params) {
  const token = await getLuluAccessToken();
  const { externalId, pdfUrl, quantity, shippingAddress, shippingLevel = 'MAIL' } = params;

  const orderPayload = {
    external_id: externalId,
    contact_email: shippingAddress.email || 'orders@headstonelegacy.com',
    line_items: [{
      external_id: `${externalId}-book`,
      printable_normalization: {
        cover: {
          source_url: pdfUrl.replace('.pdf', '-cover.pdf') // Cover PDF
        },
        interior: {
          source_url: pdfUrl // Interior PDF
        },
        pod_package_id: BOOK_SPECS.pod_package_id
      },
      quantity: quantity,
      title: shippingAddress.bookTitle || 'Memorial Book'
    }],
    shipping_address: {
      name: shippingAddress.name,
      street1: shippingAddress.line1,
      street2: shippingAddress.line2 || '',
      city: shippingAddress.city,
      state_code: shippingAddress.state,
      postcode: shippingAddress.postal_code,
      country_code: shippingAddress.country || 'US',
      phone_number: shippingAddress.phone || ''
    },
    shipping_level: shippingLevel
  };

  console.log('Creating Lulu print job:', JSON.stringify(orderPayload, null, 2));

  const response = await fetch(`${LULU_API_BASE}/print-jobs/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify(orderPayload)
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('Lulu print job error:', error);
    throw new Error(`Failed to create print job: ${error}`);
  }

  const result = await response.json();
  console.log('Lulu print job created:', result.id);

  return result;
}

/**
 * Get print job status
 */
export async function getPrintJobStatus(printJobId) {
  const token = await getLuluAccessToken();

  const response = await fetch(`${LULU_API_BASE}/print-jobs/${printJobId}/`, {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });

  if (!response.ok) {
    throw new Error('Failed to get print job status');
  }

  return response.json();
}

/**
 * Get print job costs (for verification)
 */
export async function getPrintJobCosts(printJobId) {
  const token = await getLuluAccessToken();

  const response = await fetch(`${LULU_API_BASE}/print-jobs/${printJobId}/costs/`, {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });

  if (!response.ok) {
    throw new Error('Failed to get print job costs');
  }

  return response.json();
}

/**
 * Calculate print job cost estimate (before creating)
 */
export async function calculatePrintCost(pdfUrl, quantity, countryCode = 'US') {
  const token = await getLuluAccessToken();

  const response = await fetch(`${LULU_API_BASE}/print-job-cost-calculations/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      line_items: [{
        page_count: 40, // Estimate - will be calculated from actual PDF
        pod_package_id: BOOK_SPECS.pod_package_id,
        quantity: quantity
      }],
      shipping_address: {
        country_code: countryCode
      },
      shipping_level: 'MAIL'
    })
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('Lulu cost calculation error:', error);
    throw new Error('Failed to calculate print cost');
  }

  return response.json();
}

export default {
  getLuluAccessToken,
  getShippingOptions,
  createPrintJob,
  getPrintJobStatus,
  getPrintJobCosts,
  calculatePrintCost,
  BOOK_SPECS
};
