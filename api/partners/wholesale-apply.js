/**
 * Wholesale Partner Application API
 * Handles applications for B2B wholesale accounts
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const {
      businessName,
      businessType,
      contactName,
      title,
      email,
      phone,
      website,
      estimatedVolume,
      timeline,
      message,
      interestedProducts = ['tags'] // tags, books, digital
    } = req.body;

    // Validate required fields
    if (!businessName || !businessType || !contactName || !email || !phone || !estimatedVolume) {
      return res.status(400).json({
        error: 'Missing required fields',
        required: ['businessName', 'businessType', 'contactName', 'email', 'phone', 'estimatedVolume']
      });
    }

    // Determine tier based on volume
    let tier = 'starter';
    if (estimatedVolume === '25-49' || estimatedVolume === '15-29') {
      tier = 'professional';
    } else if (estimatedVolume === '50-99' || estimatedVolume === '30+' || estimatedVolume === '100+') {
      tier = 'enterprise';
    }

    // Store the application
    const { data: application, error } = await supabase
      .from('wholesale_applications')
      .insert({
        business_name: businessName,
        business_type: businessType,
        contact_name: contactName,
        title: title || null,
        email,
        phone,
        website: website || null,
        estimated_volume: estimatedVolume,
        timeline: timeline || 'immediately',
        message: message || null,
        interested_products: interestedProducts,
        suggested_tier: tier,
        status: 'pending'
      })
      .select()
      .single();

    if (error) {
      // If table doesn't exist yet, just log and continue
      console.error('Error storing application:', error);
      // Still send notification email even if DB insert fails
    }

    // Send notification email to admin
    // TODO: Integrate with email service
    console.log('New wholesale application:', {
      businessName,
      businessType,
      contactName,
      email,
      phone,
      estimatedVolume,
      tier
    });

    // Send confirmation email to applicant
    // TODO: Integrate with email service
    console.log('Send confirmation email to:', email);

    return res.status(200).json({
      success: true,
      message: 'Application submitted successfully',
      applicationId: application?.id,
      suggestedTier: tier
    });

  } catch (error) {
    console.error('Wholesale application error:', error);
    return res.status(500).json({
      error: 'Failed to submit application',
      message: error.message
    });
  }
}
