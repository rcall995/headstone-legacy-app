import QRCode from 'qrcode';
import { createCanvas, loadImage } from 'canvas';
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client with service role for storage access
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Get memorial ID from query or body
  const memorialId = req.query.id || req.body?.memorialId;

  if (!memorialId) {
    return res.status(400).json({ error: 'Missing memorial ID' });
  }

  const memorialUrl = `https://www.headstonelegacy.com/memorial?id=${memorialId}`;

  try {
    // QR Code settings
    const qrSize = 1000;
    const logoSize = 200; // Logo will be 200x200 in center
    const margin = 80;
    const textHeight = 80; // Space for branding text below QR
    const totalHeight = qrSize + textHeight;

    // Create canvas with extra space for text
    const canvas = createCanvas(qrSize, totalHeight);
    const ctx = canvas.getContext('2d');

    // Fill white background
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, qrSize, totalHeight);

    // Generate QR code as data URL
    const qrDataUrl = await QRCode.toDataURL(memorialUrl, {
      width: qrSize - (margin * 2),
      margin: 0,
      errorCorrectionLevel: 'H', // High error correction allows for logo overlay
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      }
    });

    // Load and draw QR code
    const qrImage = await loadImage(qrDataUrl);
    ctx.drawImage(qrImage, margin, margin, qrSize - (margin * 2), qrSize - (margin * 2));

    // Try to load and draw logo in center
    try {
      const logoUrl = 'https://www.headstonelegacy.com/logo1.png';
      const logo = await loadImage(logoUrl);

      // Calculate center position
      const logoX = (qrSize - logoSize) / 2;
      const logoY = (qrSize - logoSize) / 2;

      // Draw white circle background for logo
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.arc(qrSize / 2, qrSize / 2, logoSize / 2 + 15, 0, Math.PI * 2);
      ctx.fill();

      // Draw logo
      ctx.drawImage(logo, logoX, logoY, logoSize, logoSize);
    } catch (logoError) {
      console.log('Could not load logo, generating QR without it:', logoError.message);
      // Continue without logo - QR code is still valid
    }

    // Draw "HEADSTONELEGACY.COM" text below QR code
    ctx.fillStyle = '#005F60'; // Brand teal color
    ctx.font = 'bold 42px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('HEADSTONELEGACY.COM', qrSize / 2, qrSize + (textHeight / 2));

    // Convert to PNG buffer
    const buffer = canvas.toBuffer('image/png');

    // Upload to Supabase storage for backup/consistency
    const filename = `branded-${memorialId}.png`;
    const storagePath = `branded/${filename}`;

    try {
      const { error: uploadError } = await supabase.storage
        .from('qr-codes')
        .upload(storagePath, buffer, {
          contentType: 'image/png',
          upsert: true // Overwrite if exists
        });

      if (uploadError) {
        console.error('Storage upload error (non-fatal):', uploadError.message);
      } else {
        console.log(`QR code saved to storage: ${storagePath}`);
      }
    } catch (storageErr) {
      console.error('Storage error (non-fatal):', storageErr.message);
      // Continue - we still want to return the QR code even if storage fails
    }

    // Set headers for download
    const downloadFilename = `headstone-legacy-qr-${memorialId}.png`;
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Content-Disposition', `attachment; filename="${downloadFilename}"`);
    res.setHeader('Content-Length', buffer.length);

    return res.status(200).send(buffer);

  } catch (error) {
    console.error('Error generating QR code:', error);
    return res.status(500).json({ error: 'Failed to generate QR code: ' + error.message });
  }
}
