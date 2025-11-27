/**
 * Legacy Message Trigger API
 * Allows family members to trigger conditional messages
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Verify user token and get user
async function verifyUser(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.split(' ')[1];
  const { data: { user }, error } = await supabase.auth.getUser(token);

  if (error || !user) return null;
  return user;
}

// Check if user can trigger messages for a memorial
async function canTriggerForMemorial(userId, memorialId) {
  const { data: memorial } = await supabase
    .from('memorials')
    .select('created_by, curator_ids')
    .eq('id', memorialId)
    .single();

  if (!memorial) return false;
  return memorial.created_by === userId || (memorial.curator_ids || []).includes(userId);
}

// Send the message via email (placeholder - integrate with actual email service)
async function sendLegacyMessage(message, memorial) {
  // TODO: Integrate with SendGrid, Resend, or other email service
  // For now, log and mark as sent

  console.log('Sending legacy message:', {
    to: message.recipient_email,
    subject: message.subject,
    from: memorial.name
  });

  // In production, this would send an actual email
  // Example with SendGrid:
  // await sgMail.send({
  //   to: message.recipient_email,
  //   from: 'messages@headstonelegacy.com',
  //   subject: message.subject,
  //   html: formatLegacyEmail(message, memorial)
  // });

  return { success: true, method: 'email' };
}

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

  const user = await verifyUser(req);
  if (!user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const { messageId, keyword } = req.body;

    if (!messageId) {
      return res.status(400).json({ error: 'messageId is required' });
    }

    // Get the message
    const { data: message, error: msgError } = await supabase
      .from('legacy_messages')
      .select('*')
      .eq('id', messageId)
      .single();

    if (msgError || !message) {
      return res.status(404).json({ error: 'Message not found' });
    }

    // Verify access to the memorial
    const hasAccess = await canTriggerForMemorial(user.id, message.memorial_id);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Check if message is conditional and can be triggered
    if (message.delivery_type !== 'conditional') {
      return res.status(400).json({ error: 'This message is not a conditional message' });
    }

    if (message.status === 'sent' && message.delivery_type !== 'recurring') {
      return res.status(400).json({ error: 'This message has already been sent' });
    }

    if (!message.is_active) {
      return res.status(400).json({ error: 'This message is not active' });
    }

    // If keyword is required, verify it
    if (message.trigger_keywords && message.trigger_keywords.length > 0) {
      if (!keyword) {
        return res.status(400).json({
          error: 'Trigger keyword required',
          hint: 'This message requires a specific keyword to trigger delivery'
        });
      }

      const keywordMatch = message.trigger_keywords.some(
        k => k.toLowerCase() === keyword.toLowerCase()
      );

      if (!keywordMatch) {
        return res.status(400).json({ error: 'Invalid trigger keyword' });
      }
    }

    // Get memorial info for the email
    const { data: memorial } = await supabase
      .from('memorials')
      .select('name, main_photo, birth_date, death_date')
      .eq('id', message.memorial_id)
      .single();

    // Send the message
    const sendResult = await sendLegacyMessage(message, memorial);

    // Log the delivery
    const { data: delivery, error: deliveryError } = await supabase
      .from('legacy_message_deliveries')
      .insert({
        message_id: message.id,
        delivery_method: sendResult.method,
        delivery_status: sendResult.success ? 'sent' : 'failed',
        recipient_email: message.recipient_email,
        recipient_phone: message.recipient_phone,
        error_message: sendResult.error || null
      })
      .select()
      .single();

    // Update message status
    await supabase
      .from('legacy_messages')
      .update({
        status: sendResult.success ? 'sent' : 'failed',
        last_sent_at: new Date().toISOString(),
        send_count: message.send_count + 1
      })
      .eq('id', message.id);

    return res.status(200).json({
      success: true,
      message: 'Message triggered successfully',
      delivery: {
        id: delivery?.id,
        sentAt: delivery?.delivered_at,
        recipient: message.recipient_name
      }
    });

  } catch (error) {
    console.error('Trigger API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
