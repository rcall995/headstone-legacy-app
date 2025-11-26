import { createClient } from '@supabase/supabase-js';
import QRCode from 'qrcode';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Generate QR code for a memorial and save to storage
export async function generateQRForOrder(orderId, memorialId) {
  const memorialUrl = `https://www.headstonelegacy.com/memorial?id=${memorialId}`;

  try {
    // Generate high-resolution QR code as PNG buffer
    const qrBuffer = await QRCode.toBuffer(memorialUrl, {
      type: 'png',
      width: 1000,  // High res for laser engraving
      margin: 2,
      errorCorrectionLevel: 'H', // Highest error correction
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      }
    });

    // Upload to Supabase storage
    const fileName = `order-${orderId}-qr.png`;
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('qr-codes')
      .upload(fileName, qrBuffer, {
        contentType: 'image/png',
        upsert: true
      });

    if (uploadError) {
      console.error('Error uploading QR code:', uploadError);
      throw uploadError;
    }

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from('qr-codes')
      .getPublicUrl(fileName);

    // Update order with QR code URL
    await supabase
      .from('orders')
      .update({
        qr_code_url: publicUrl,
        updated_at: new Date().toISOString()
      })
      .eq('id', orderId);

    return { success: true, qrUrl: publicUrl };

  } catch (error) {
    console.error('Error generating QR code:', error);
    return { success: false, error: error.message };
  }
}

// API endpoint to manually generate/regenerate QR code
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Verify auth (admin only)
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const token = authHeader.substring(7);
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);

  if (authError || !user) {
    return res.status(401).json({ error: 'Invalid token' });
  }

  const { orderId } = req.body;

  if (!orderId) {
    return res.status(400).json({ error: 'Missing orderId' });
  }

  // Get order details
  const { data: order, error: orderError } = await supabase
    .from('orders')
    .select('id, memorial_id, status')
    .eq('id', orderId)
    .single();

  if (orderError || !order) {
    return res.status(404).json({ error: 'Order not found' });
  }

  const result = await generateQRForOrder(order.id, order.memorial_id);

  if (result.success) {
    return res.status(200).json({
      message: 'QR code generated',
      qrUrl: result.qrUrl
    });
  } else {
    return res.status(500).json({ error: result.error });
  }
}
