/**
 * Lulu Webhook Handler
 * Handles print job status updates from Lulu Direct
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Lulu sends webhook data in the body
  const event = req.body;

  console.log('Lulu webhook received:', JSON.stringify(event, null, 2));

  try {
    // Lulu webhook payload structure varies by event type
    // Common fields: print_job_id, status, external_id
    const printJobId = event.print_job_id || event.id;
    const externalId = event.external_id; // Our order ID
    const status = event.status?.name || event.status;

    if (!printJobId && !externalId) {
      console.warn('No print job ID or external ID in webhook');
      return res.status(200).json({ received: true });
    }

    // Map Lulu status to our status
    const statusMap = {
      'CREATED': 'submitted',
      'UNPAID': 'submitted', // Shouldn't happen with our flow
      'PAYMENT_IN_PROGRESS': 'submitted',
      'PRODUCTION_READY': 'printing',
      'PRODUCTION_DELAYED': 'printing',
      'IN_PRODUCTION': 'printing',
      'SHIPPED': 'shipped',
      'DELIVERED': 'delivered',
      'CANCELED': 'cancelled',
      'ERROR': 'error'
    };

    const ourStatus = statusMap[status] || 'submitted';

    // Build update object
    const updateData = {
      status: ourStatus,
      updated_at: new Date().toISOString()
    };

    // Extract tracking info if available
    if (event.shipping_info || event.line_items?.[0]?.shipping_info) {
      const shippingInfo = event.shipping_info || event.line_items[0].shipping_info;
      if (shippingInfo.tracking_number) {
        updateData.tracking_number = shippingInfo.tracking_number;
        updateData.shipping_carrier = shippingInfo.carrier || 'Unknown';
      }
    }

    // Extract shipped date
    if (status === 'SHIPPED' && (event.shipped_date || event.date_shipped)) {
      updateData.shipped_at = event.shipped_date || event.date_shipped;
    }

    // Find order by Lulu print job ID or external ID (our order ID)
    let orderId = externalId;

    if (!orderId && printJobId) {
      const { data: orders } = await supabase
        .from('orders')
        .select('id')
        .eq('lulu_order_id', printJobId)
        .limit(1);

      if (orders && orders.length > 0) {
        orderId = orders[0].id;
      }
    }

    if (!orderId) {
      console.warn('Could not find order for Lulu webhook');
      return res.status(200).json({ received: true });
    }

    // Update order
    const { error: updateError } = await supabase
      .from('orders')
      .update(updateData)
      .eq('id', orderId);

    if (updateError) {
      console.error('Failed to update order:', updateError);
    } else {
      console.log(`Order ${orderId} updated to status: ${ourStatus}`);
    }

    // If shipped, send notification email to customer
    if (ourStatus === 'shipped' && updateData.tracking_number) {
      await sendShippingNotification(orderId, updateData.tracking_number, updateData.shipping_carrier);
    }

    return res.status(200).json({ received: true });

  } catch (error) {
    console.error('Lulu webhook error:', error);
    // Return 200 to prevent retries for processing errors
    return res.status(200).json({ received: true, error: error.message });
  }
}

/**
 * Send shipping notification email (placeholder - implement with your email service)
 */
async function sendShippingNotification(orderId, trackingNumber, carrier) {
  try {
    // Fetch order details
    const { data: order } = await supabase
      .from('orders')
      .select('*, memorials(name)')
      .eq('id', orderId)
      .single();

    if (!order || !order.notification_email) {
      return;
    }

    // TODO: Integrate with email service (Resend, SendGrid, etc.)
    console.log(`Would send shipping notification to ${order.notification_email}:
      Order: ${orderId}
      Memorial: ${order.memorials?.name}
      Tracking: ${trackingNumber}
      Carrier: ${carrier}
    `);

    // Example with Resend:
    // await resend.emails.send({
    //   from: 'orders@headstonelegacy.com',
    //   to: order.notification_email,
    //   subject: `Your Memorial Book has shipped!`,
    //   html: `
    //     <h1>Your order is on its way!</h1>
    //     <p>Your memorial book for ${order.memorials?.name} has shipped.</p>
    //     <p>Tracking Number: ${trackingNumber}</p>
    //     <p>Carrier: ${carrier}</p>
    //   `
    // });

  } catch (error) {
    console.error('Failed to send shipping notification:', error);
  }
}
