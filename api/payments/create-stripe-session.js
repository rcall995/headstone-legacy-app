import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Product tiers with pricing
const PRODUCTS = {
  basic: {
    name: 'QR Memorial Tag - Basic',
    description: 'Aluminum tag with adhesive backing',
    price: 2900, // $29.00 in cents
  },
  premium: {
    name: 'Stainless Steel QR Tag',
    description: 'Laser-engraved stainless steel with lifetime guarantee',
    price: 3900, // $39.00 in cents
  },
  deluxe: {
    name: 'QR Memorial Tag - Deluxe',
    description: 'Bronze tag with decorative border & premium packaging',
    price: 7900, // $79.00 in cents
  }
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Verify auth token
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const token = authHeader.substring(7);
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);

  if (authError || !user) {
    return res.status(401).json({ error: 'Invalid token' });
  }

  const {
    memorialId,
    memorialName,
    tier = 'premium',
    quantity = 1,
    referralCode,
    partnerId
  } = req.body;

  if (!memorialId) {
    return res.status(400).json({ error: 'Missing memorialId' });
  }

  const product = PRODUCTS[tier];
  if (!product) {
    return res.status(400).json({ error: 'Invalid product tier' });
  }

  try {
    const origin = req.headers.origin || process.env.SITE_URL || 'https://headstonelegacy.com';

    // Create order record in Supabase first
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert({
        user_id: user.id,
        memorial_id: memorialId,
        product_type: 'qr_tag',
        product_tier: tier,
        quantity: quantity,
        amount_cents: product.price * quantity,
        currency: 'USD',
        status: 'pending',
        partner_id: partnerId || null,
        commission_amount: partnerId ? 15.00 * quantity : null, // $15 commission per tag
        customer_email: user.email
      })
      .select()
      .single();

    if (orderError) {
      console.error('Error creating order:', orderError);
      throw new Error('Failed to create order');
    }

    // Build metadata for webhook
    const metadata = {
      orderId: order.id,
      memorialId,
      memorialName: memorialName || 'Memorial',
      userId: user.id,
      tier,
      quantity: quantity.toString()
    };

    if (referralCode) metadata.referralCode = referralCode;
    if (partnerId) metadata.partnerId = partnerId;

    // Create Stripe Checkout Session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      customer_email: user.email,
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: {
            name: product.name,
            description: `For memorial: ${memorialName || 'Memorial'}`,
            images: [`${origin}/images/qr-tag-${tier}.jpg`], // Add product images later
          },
          unit_amount: product.price,
        },
        quantity: quantity,
      }],
      shipping_address_collection: {
        allowed_countries: ['US', 'CA'], // Add more as needed
      },
      metadata,
      success_url: `${origin}/order-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/order-tag/${memorialId}?canceled=true`,
    });

    // Update order with Stripe session ID
    await supabase
      .from('orders')
      .update({ stripe_session_id: session.id })
      .eq('id', order.id);

    return res.status(200).json({
      sessionId: session.id,
      url: session.url,
      orderId: order.id
    });

  } catch (error) {
    console.error('Stripe session creation error:', error);
    return res.status(500).json({ error: 'Failed to create checkout session' });
  }
}
