/**
 * Legacy Messages API
 * Handles scheduled posthumous communications
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

// Check if user can manage messages for a memorial
async function canManageMemorial(userId, memorialId) {
  const { data: memorial } = await supabase
    .from('memorials')
    .select('created_by, curator_ids')
    .eq('id', memorialId)
    .single();

  if (!memorial) return false;
  return memorial.created_by === userId || (memorial.curator_ids || []).includes(userId);
}

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const user = await verifyUser(req);
  if (!user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    // GET - List legacy messages for a memorial
    if (req.method === 'GET') {
      const { memorialId } = req.query;

      if (!memorialId) {
        return res.status(400).json({ error: 'memorialId is required' });
      }

      // Verify access
      const hasAccess = await canManageMemorial(user.id, memorialId);
      if (!hasAccess) {
        return res.status(403).json({ error: 'Access denied' });
      }

      const { data: messages, error } = await supabase
        .from('legacy_messages')
        .select(`
          *,
          deliveries:legacy_message_deliveries(
            id,
            delivered_at,
            delivery_status
          )
        `)
        .eq('memorial_id', memorialId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching messages:', error);
        return res.status(500).json({ error: 'Failed to fetch messages' });
      }

      return res.status(200).json({ messages });
    }

    // POST - Create a new legacy message
    if (req.method === 'POST') {
      const {
        memorialId,
        recipientName,
        recipientEmail,
        recipientPhone,
        recipientRelationship,
        messageType = 'milestone',
        subject,
        messageContent,
        attachmentUrls = [],
        deliveryType = 'scheduled',
        scheduledDate,
        recurringMonth,
        recurringDay,
        recurringDescription,
        triggerCondition,
        triggerKeywords = [],
        status = 'pending'
      } = req.body;

      // Validate required fields
      if (!memorialId || !recipientName || !recipientEmail || !subject || !messageContent) {
        return res.status(400).json({
          error: 'Missing required fields',
          required: ['memorialId', 'recipientName', 'recipientEmail', 'subject', 'messageContent']
        });
      }

      // Verify access
      const hasAccess = await canManageMemorial(user.id, memorialId);
      if (!hasAccess) {
        return res.status(403).json({ error: 'Access denied to this memorial' });
      }

      // Create the message
      const { data: message, error } = await supabase
        .from('legacy_messages')
        .insert({
          memorial_id: memorialId,
          created_by: user.id,
          recipient_name: recipientName,
          recipient_email: recipientEmail,
          recipient_phone: recipientPhone || null,
          recipient_relationship: recipientRelationship || null,
          message_type: messageType,
          subject,
          message_content: messageContent,
          attachment_urls: attachmentUrls,
          delivery_type: deliveryType,
          scheduled_date: scheduledDate || null,
          recurring_month: recurringMonth || null,
          recurring_day: recurringDay || null,
          recurring_description: recurringDescription || null,
          trigger_condition: triggerCondition || null,
          trigger_keywords: triggerKeywords,
          status
        })
        .select()
        .single();

      if (error) {
        console.error('Error creating message:', error);
        return res.status(500).json({ error: 'Failed to create message', details: error.message });
      }

      return res.status(201).json({ message, success: true });
    }

    // PUT - Update a legacy message
    if (req.method === 'PUT') {
      const { id } = req.query;
      const updates = req.body;

      if (!id) {
        return res.status(400).json({ error: 'Message ID is required' });
      }

      // Get the message to verify ownership
      const { data: existingMessage } = await supabase
        .from('legacy_messages')
        .select('memorial_id, status')
        .eq('id', id)
        .single();

      if (!existingMessage) {
        return res.status(404).json({ error: 'Message not found' });
      }

      // Verify access
      const hasAccess = await canManageMemorial(user.id, existingMessage.memorial_id);
      if (!hasAccess) {
        return res.status(403).json({ error: 'Access denied' });
      }

      // Don't allow editing sent messages
      if (existingMessage.status === 'sent') {
        return res.status(400).json({ error: 'Cannot edit messages that have already been sent' });
      }

      // Map camelCase to snake_case for the database
      const dbUpdates = {};
      const fieldMap = {
        recipientName: 'recipient_name',
        recipientEmail: 'recipient_email',
        recipientPhone: 'recipient_phone',
        recipientRelationship: 'recipient_relationship',
        messageType: 'message_type',
        messageContent: 'message_content',
        attachmentUrls: 'attachment_urls',
        deliveryType: 'delivery_type',
        scheduledDate: 'scheduled_date',
        recurringMonth: 'recurring_month',
        recurringDay: 'recurring_day',
        recurringDescription: 'recurring_description',
        triggerCondition: 'trigger_condition',
        triggerKeywords: 'trigger_keywords',
        isActive: 'is_active'
      };

      for (const [key, value] of Object.entries(updates)) {
        const dbKey = fieldMap[key] || key;
        dbUpdates[dbKey] = value;
      }

      const { data: message, error } = await supabase
        .from('legacy_messages')
        .update(dbUpdates)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        console.error('Error updating message:', error);
        return res.status(500).json({ error: 'Failed to update message' });
      }

      return res.status(200).json({ message, success: true });
    }

    // DELETE - Delete a legacy message
    if (req.method === 'DELETE') {
      const { id } = req.query;

      if (!id) {
        return res.status(400).json({ error: 'Message ID is required' });
      }

      // Get the message to verify ownership
      const { data: existingMessage } = await supabase
        .from('legacy_messages')
        .select('memorial_id')
        .eq('id', id)
        .single();

      if (!existingMessage) {
        return res.status(404).json({ error: 'Message not found' });
      }

      // Verify access
      const hasAccess = await canManageMemorial(user.id, existingMessage.memorial_id);
      if (!hasAccess) {
        return res.status(403).json({ error: 'Access denied' });
      }

      const { error } = await supabase
        .from('legacy_messages')
        .delete()
        .eq('id', id);

      if (error) {
        console.error('Error deleting message:', error);
        return res.status(500).json({ error: 'Failed to delete message' });
      }

      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });

  } catch (error) {
    console.error('Legacy messages API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
