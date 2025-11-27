/**
 * Submit Book Order to Lulu for Printing
 * Called after PDF is generated and payment is confirmed
 */

import { createClient } from '@supabase/supabase-js';
import { createPrintJob, getPrintJobCosts } from '../lib/lulu-client.js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // This endpoint can be called internally or with service key
  const authHeader = req.headers.authorization;
  const isInternalCall = req.headers['x-internal-key'] === process.env.INTERNAL_API_KEY;

  if (!isInternalCall && (!authHeader || !authHeader.startsWith('Bearer '))) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { orderId } = req.body;

  if (!orderId) {
    return res.status(400).json({ error: 'Missing orderId' });
  }

  try {
    console.log(`Submitting order ${orderId} to Lulu`);

    // Fetch order details
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .single();

    if (orderError || !order) {
      throw new Error('Order not found');
    }

    // Verify order has PDF and is ready
    if (!order.pdf_url) {
      throw new Error('Order PDF not generated yet');
    }

    if (order.status !== 'paid') {
      throw new Error(`Order not ready for submission. Status: ${order.status}`);
    }

    // Verify order has shipping address
    if (!order.shipping_address) {
      throw new Error('No shipping address on order');
    }

    const shippingAddress = typeof order.shipping_address === 'string'
      ? JSON.parse(order.shipping_address)
      : order.shipping_address;

    // Fetch memorial name for book title
    const { data: memorial } = await supabase
      .from('memorials')
      .select('name')
      .eq('id', order.memorial_id)
      .single();

    // Prepare shipping info for Lulu
    const luluShipping = {
      name: shippingAddress.name || `${shippingAddress.firstName} ${shippingAddress.lastName}`,
      line1: shippingAddress.line1 || shippingAddress.address?.line1,
      line2: shippingAddress.line2 || shippingAddress.address?.line2,
      city: shippingAddress.city || shippingAddress.address?.city,
      state: shippingAddress.state || shippingAddress.address?.state,
      postal_code: shippingAddress.postal_code || shippingAddress.address?.postal_code,
      country: shippingAddress.country || shippingAddress.address?.country || 'US',
      phone: shippingAddress.phone || '',
      email: order.notification_email || order.customer_email,
      bookTitle: memorial?.name ? `${memorial.name} - Memorial Book` : 'Memorial Book'
    };

    console.log('Submitting to Lulu with shipping:', luluShipping);

    // Create print job with Lulu
    const printJob = await createPrintJob({
      externalId: orderId,
      pdfUrl: order.pdf_url,
      quantity: 1, // Single book for now
      shippingAddress: luluShipping,
      shippingLevel: 'MAIL' // Standard shipping
    });

    console.log('Lulu print job created:', printJob);

    // Get cost breakdown
    let costs = null;
    try {
      costs = await getPrintJobCosts(printJob.id);
      console.log('Lulu costs:', costs);
    } catch (e) {
      console.warn('Could not fetch costs:', e.message);
    }

    // Update order with Lulu details
    await supabase
      .from('orders')
      .update({
        lulu_order_id: printJob.id,
        lulu_line_item_id: printJob.line_items?.[0]?.id,
        status: 'submitted',
        submitted_to_printer_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', orderId);

    // Send confirmation email to customer
    // TODO: Integrate with email service (Resend, SendGrid, etc.)
    console.log(`Order ${orderId} submitted to Lulu. Print job ID: ${printJob.id}`);

    return res.status(200).json({
      success: true,
      luluOrderId: printJob.id,
      status: printJob.status?.name || 'CREATED',
      estimatedShipDate: calculateEstimatedShipDate()
    });

  } catch (error) {
    console.error('Lulu submission error:', error);

    // Update order with error (but keep it in 'paid' status for retry)
    await supabase
      .from('orders')
      .update({
        updated_at: new Date().toISOString()
        // Note: Don't change status so order can be retried
      })
      .eq('id', orderId);

    return res.status(500).json({
      error: 'Failed to submit to printer',
      details: error.message
    });
  }
}

/**
 * Calculate estimated ship date (production + shipping time)
 */
function calculateEstimatedShipDate() {
  const today = new Date();
  // Production: 3-5 business days, Shipping: 5-7 business days
  // Estimate: 12 business days = ~17 calendar days
  today.setDate(today.getDate() + 17);
  return today.toISOString().split('T')[0];
}
