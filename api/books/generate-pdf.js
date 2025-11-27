/**
 * Generate Memorial Book PDF
 * Fetches memorial data, generates PDF, uploads to storage
 */

import { createClient } from '@supabase/supabase-js';
import React from 'react';
import { renderToBuffer } from '@react-pdf/renderer';
import { MemorialBookDocument } from '../lib/book-pdf-template.js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

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
    orderId,
    memorialId,
    coverTemplate = 'classic',
    dedicationText = null,
    includeGallery = true,
    includeTimeline = true,
    includeFamily = true,
    includeResidences = true,
    includeTributes = true
  } = req.body;

  if (!orderId || !memorialId) {
    return res.status(400).json({ error: 'Missing orderId or memorialId' });
  }

  try {
    console.log(`Generating PDF for order ${orderId}, memorial ${memorialId}`);

    // Update order status to generating
    await supabase
      .from('orders')
      .update({ status: 'generating' })
      .eq('id', orderId);

    // Fetch memorial data
    const { data: memorial, error: memorialError } = await supabase
      .from('memorials')
      .select('*')
      .eq('id', memorialId)
      .single();

    if (memorialError || !memorial) {
      throw new Error('Memorial not found');
    }

    // Fetch approved tributes
    let tributes = [];
    if (includeTributes) {
      const { data: tributeData } = await supabase
        .from('tributes')
        .select('*')
        .eq('memorial_id', memorialId)
        .eq('status', 'approved')
        .order('created_at', { ascending: false })
        .limit(20);
      tributes = tributeData || [];
    }

    // Fetch family connections
    let familyConnections = [];
    if (includeFamily) {
      const { data: connectionData } = await supabase
        .from('memorial_connections')
        .select(`
          relationship_type,
          related_memorial_id,
          related_memorials:memorials!memorial_connections_related_memorial_id_fkey(id, name)
        `)
        .eq('memorial_id', memorialId);

      if (connectionData) {
        familyConnections = connectionData.map(conn => ({
          relationship_type: conn.relationship_type,
          related_memorial_name: conn.related_memorials?.name
        }));
      }
    }

    // Generate QR code URL for back cover (using a QR code service)
    const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=https://www.headstonelegacy.com/welcome?id=${memorialId}`;

    // Create the PDF document
    const pdfOptions = {
      coverTemplate,
      dedicationText,
      includeGallery,
      includeTimeline,
      includeFamily,
      includeResidences,
      includeTributes,
      qrCodeUrl
    };

    console.log('Rendering PDF with options:', pdfOptions);

    // Render PDF to buffer
    const pdfBuffer = await renderToBuffer(
      React.createElement(MemorialBookDocument, {
        memorial,
        tributes,
        familyConnections,
        options: pdfOptions
      })
    );

    console.log(`PDF generated, size: ${pdfBuffer.length} bytes`);

    // Upload to Supabase storage
    const fileName = `${orderId}-${memorialId}-${Date.now()}.pdf`;
    const filePath = `book-pdfs/${fileName}`;

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('book-pdfs')
      .upload(filePath, pdfBuffer, {
        contentType: 'application/pdf',
        upsert: true
      });

    if (uploadError) {
      console.error('Upload error:', uploadError);
      throw new Error('Failed to upload PDF');
    }

    // Get public URL (or signed URL if bucket is private)
    const { data: urlData } = supabase.storage
      .from('book-pdfs')
      .getPublicUrl(filePath);

    const pdfUrl = urlData.publicUrl;

    console.log(`PDF uploaded to: ${pdfUrl}`);

    // Calculate page count (approximate)
    const pageCount = calculatePageCount(memorial, tributes, familyConnections, pdfOptions);

    // Update order with PDF URL
    await supabase
      .from('orders')
      .update({
        pdf_url: pdfUrl,
        page_count: pageCount,
        pdf_generated_at: new Date().toISOString(),
        status: 'paid', // Ready for submission to printer
        updated_at: new Date().toISOString()
      })
      .eq('id', orderId);

    return res.status(200).json({
      success: true,
      pdfUrl,
      pageCount,
      fileName
    });

  } catch (error) {
    console.error('PDF generation error:', error);

    // Update order with error
    await supabase
      .from('orders')
      .update({
        status: 'paid', // Keep as paid so we can retry
        updated_at: new Date().toISOString()
      })
      .eq('id', orderId);

    return res.status(500).json({
      error: 'Failed to generate PDF',
      details: error.message
    });
  }
}

/**
 * Calculate approximate page count
 */
function calculatePageCount(memorial, tributes, familyConnections, options) {
  let pages = 4; // Cover, title, back cover, blank

  if (options.dedicationText) pages += 1;

  // Biography: ~500 words per page
  if (memorial.biography) {
    const words = memorial.biography.split(/\s+/).length;
    pages += Math.ceil(words / 500);
  }

  // Timeline
  if (options.includeTimeline && memorial.timeline?.length > 0) {
    pages += Math.ceil(memorial.timeline.length / 15);
  }

  // Photos: 4 per page
  if (options.includeGallery && memorial.photos?.length > 0) {
    pages += 1 + Math.ceil(memorial.photos.length / 4);
  }

  // Family
  if (options.includeFamily && familyConnections.length > 0) {
    pages += 1;
  }

  // Residences
  if (options.includeResidences && memorial.residences?.length > 0) {
    pages += 1;
  }

  // Tributes: ~4 per page
  if (options.includeTributes && tributes.length > 0) {
    pages += 1 + Math.ceil(tributes.length / 4);
  }

  // Round up to nearest 4 (book signatures)
  return Math.ceil(pages / 4) * 4;
}
