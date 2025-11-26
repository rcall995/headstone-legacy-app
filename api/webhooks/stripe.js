import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';
import { buffer } from 'micro';
import { generateQRForOrder } from '../orders/generate-qr.js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

// Disable body parsing, we need raw body for signature verification
export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let event;

  try {
    const rawBody = await buffer(req);
    const signature = req.headers['stripe-signature'];

    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).json({ error: `Webhook Error: ${err.message}` });
  }

  // Handle the event
  switch (event.type) {
    case 'checkout.session.completed':
      await handleCheckoutComplete(event.data.object);
      break;

    case 'checkout.session.expired':
      await handleCheckoutExpired(event.data.object);
      break;

    case 'payment_intent.succeeded':
      // Already handled by checkout.session.completed
      console.log('Payment intent succeeded:', event.data.object.id);
      break;

    case 'payment_intent.payment_failed':
      await handlePaymentFailed(event.data.object);
      break;

    default:
      console.log(`Unhandled event type: ${event.type}`);
  }

  res.status(200).json({ received: true });
}

async function handleCheckoutComplete(session) {
  console.log('Checkout completed:', session.id);

  const metadata = session.metadata || {};
  const orderId = metadata.orderId;

  if (!orderId) {
    console.error('No orderId in session metadata');
    return;
  }

  try {
    // Update order status
    const { data: order, error: updateError } = await supabase
      .from('orders')
      .update({
        status: 'paid',
        stripe_payment_intent_id: session.payment_intent,
        customer_email: session.customer_details?.email,
        customer_name: session.customer_details?.name,
        shipping_address: session.shipping_details?.address ? {
          name: session.shipping_details.name,
          line1: session.shipping_details.address.line1,
          line2: session.shipping_details.address.line2,
          city: session.shipping_details.address.city,
          state: session.shipping_details.address.state,
          postal_code: session.shipping_details.address.postal_code,
          country: session.shipping_details.address.country,
        } : null,
        updated_at: new Date().toISOString()
      })
      .eq('id', orderId)
      .select()
      .single();

    if (updateError) {
      console.error('Error updating order:', updateError);
      return;
    }

    console.log('Order updated to paid:', orderId);

    // Generate QR code for the order
    const qrResult = await generateQRForOrder(orderId, metadata.memorialId);
    if (qrResult.success) {
      console.log('QR code generated:', qrResult.qrUrl);
    } else {
      console.error('Failed to generate QR code:', qrResult.error);
    }

    // Handle referral conversion if applicable
    if (metadata.partnerId) {
      await handleReferralConversion(order, metadata);
    }

    // TODO: Send confirmation email with QR code
    // await sendOrderConfirmationEmail(order, qrResult.qrUrl);

  } catch (error) {
    console.error('Error handling checkout complete:', error);
  }
}

async function handleReferralConversion(order, metadata) {
  const partnerId = metadata.partnerId;
  const referralCode = metadata.referralCode;
  const quantity = parseInt(metadata.quantity) || 1;
  const commissionPerTag = 15.00;
  const totalCommission = commissionPerTag * quantity;

  try {
    // Find existing referral click or create new conversion record
    const { data: existingReferral } = await supabase
      .from('referrals')
      .select('id')
      .eq('partner_id', partnerId)
      .eq('converted', false)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (existingReferral) {
      // Update existing referral to converted
      await supabase
        .from('referrals')
        .update({
          converted: true,
          order_id: order.id,
          commission_amount: totalCommission,
          converted_at: new Date().toISOString()
        })
        .eq('id', existingReferral.id);

      console.log('Referral converted:', existingReferral.id);
    } else {
      // Create new conversion record (direct order without click tracking)
      await supabase
        .from('referrals')
        .insert({
          partner_id: partnerId,
          referral_code: referralCode,
          converted: true,
          order_id: order.id,
          commission_amount: totalCommission,
          converted_at: new Date().toISOString()
        });

      console.log('New referral conversion created for partner:', partnerId);
    }

    // Update order with commission info
    await supabase
      .from('orders')
      .update({ commission_amount: totalCommission })
      .eq('id', order.id);

  } catch (error) {
    console.error('Error handling referral conversion:', error);
  }
}

async function handleCheckoutExpired(session) {
  console.log('Checkout expired:', session.id);

  const metadata = session.metadata || {};
  const orderId = metadata.orderId;

  if (orderId) {
    await supabase
      .from('orders')
      .update({
        status: 'cancelled',
        notes: 'Checkout session expired',
        updated_at: new Date().toISOString()
      })
      .eq('id', orderId);
  }
}

async function handlePaymentFailed(paymentIntent) {
  console.log('Payment failed:', paymentIntent.id);

  // Find order by payment intent
  const { data: orders } = await supabase
    .from('orders')
    .select('id')
    .eq('stripe_payment_intent_id', paymentIntent.id);

  if (orders && orders.length > 0) {
    await supabase
      .from('orders')
      .update({
        status: 'failed',
        notes: `Payment failed: ${paymentIntent.last_payment_error?.message || 'Unknown error'}`,
        updated_at: new Date().toISOString()
      })
      .eq('id', orders[0].id);
  }
}
