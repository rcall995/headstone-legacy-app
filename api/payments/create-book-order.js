import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Product catalog with pricing
const PRODUCTS = {
  book_hardcover: {
    name: 'Memorial Book (Hardcover)',
    description: 'Beautiful 8.5"x11" hardcover memorial book with full color printing',
    price: 7900, // $79.00 in cents
  },
  bundle_legacy: {
    name: 'Legacy Bundle',
    description: 'Memorial Book + Stainless Steel QR Tag + 10 Keepsake Cards',
    price: 10900, // $109.00 in cents (normally $137 - save $28)
  },
  bundle_family: {
    name: 'Family Package',
    description: '3 Memorial Books + 3 QR Tags + 30 Keepsake Cards',
    price: 24900, // $249.00 in cents
  },
  cards_10pack: {
    name: 'Keepsake Cards (10 pack)',
    description: 'Wallet-sized memorial cards with QR code',
    price: 1900, // $19.00 in cents
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
    productType = 'book_hardcover',
    coverTemplate = 'classic',
    includeGallery = true,
    includeTimeline = true,
    includeFamily = true,
    includeResidences = true,
    includeTributes = true,
    dedicationText = null
  } = req.body;

  if (!memorialId) {
    return res.status(400).json({ error: 'Missing memorialId' });
  }

  const product = PRODUCTS[productType];
  if (!product) {
    return res.status(400).json({ error: 'Invalid product type' });
  }

  try {
    const origin = req.headers.origin || process.env.SITE_URL || 'https://headstonelegacy.com';

    // Create order record in Supabase
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert({
        user_id: user.id,
        memorial_id: memorialId,
        product_type: productType,
        amount_cents: product.price,
        currency: 'USD',
        status: 'pending',
        // Book-specific options
        cover_template: coverTemplate,
        include_gallery: includeGallery,
        include_timeline: includeTimeline,
        include_family_tree: includeFamily,
        include_residences: includeResidences,
        include_tributes: includeTributes,
        dedication_text: dedicationText,
        notification_email: user.email
      })
      .select()
      .single();

    if (orderError) {
      console.error('Error creating order:', orderError);
      throw new Error('Failed to create order');
    }

    // Build line items based on product type
    const lineItems = [{
      price_data: {
        currency: 'usd',
        product_data: {
          name: product.name,
          description: `For memorial: ${memorialName || 'Memorial'}`,
        },
        unit_amount: product.price,
      },
      quantity: 1,
    }];

    // Metadata for webhook processing
    const metadata = {
      orderId: order.id,
      memorialId,
      memorialName: memorialName || 'Memorial',
      userId: user.id,
      productType,
      coverTemplate,
      includeGallery: includeGallery.toString(),
      includeTimeline: includeTimeline.toString(),
      includeFamily: includeFamily.toString(),
      includeResidences: includeResidences.toString(),
      includeTributes: includeTributes.toString()
    };

    // Create Stripe Checkout Session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      customer_email: user.email,
      line_items: lineItems,
      shipping_address_collection: {
        allowed_countries: ['US', 'CA'],
      },
      metadata,
      success_url: `${origin}/order-success?session_id={CHECKOUT_SESSION_ID}&type=book`,
      cancel_url: `${origin}/order-book/${memorialId}?canceled=true`,
    });

    // Update order with Stripe session ID
    await supabase
      .from('orders')
      .update({
        stripe_session_id: session.id,
        updated_at: new Date().toISOString()
      })
      .eq('id', order.id);

    return res.status(200).json({
      sessionId: session.id,
      url: session.url,
      orderId: order.id
    });

  } catch (error) {
    console.error('Book order creation error:', error);
    return res.status(500).json({ error: 'Failed to create checkout session' });
  }
}
