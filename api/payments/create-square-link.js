import { createClient } from '@supabase/supabase-js';
import { Client, Environment } from 'square';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SQUARE_LOCATION_ID = process.env.SQUARE_LOCATION_ID;

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

  const { memorialId, memorialName, referralCode, partnerId } = req.body;

  if (!memorialId) {
    return res.status(400).json({ error: 'Missing memorialId' });
  }

  try {
    const squareClient = new Client({
      accessToken: process.env.SQUARE_ACCESS_TOKEN,
      environment: process.env.NODE_ENV === 'production' ? Environment.Production : Environment.Sandbox,
    });

    const origin = req.headers.origin || 'https://headstonelegacy.com';

    // Build referenceId with optional referral data
    const referenceData = { memorialId, userId: user.id };
    if (referralCode && partnerId) {
      referenceData.referralCode = referralCode;
      referenceData.partnerId = partnerId;
    }

    const response = await squareClient.checkoutApi.createPaymentLink({
      idempotencyKey: `${memorialId}-${Date.now()}`,
      order: {
        locationId: SQUARE_LOCATION_ID,
        lineItems: [{
          name: 'Headstone Legacy QR Tag',
          quantity: '1',
          basePriceMoney: { amount: BigInt(3900), currency: 'USD' }
        }],
        referenceId: JSON.stringify(referenceData)
      },
      checkoutOptions: {
        allowTipping: false,
        redirectUrl: `${origin}/memorial?id=${memorialId}&order=success`,
        askForShippingAddress: true
      }
    });

    return res.status(200).json({
      url: response.result.paymentLink.url,
      orderId: response.result.paymentLink.orderId
    });

  } catch (error) {
    console.error('Square API error:', error);
    return res.status(500).json({ error: 'Failed to create payment link' });
  }
}
