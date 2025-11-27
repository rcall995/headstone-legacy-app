// api/messages/legacy-messages.js - Scheduled Legacy Messages
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Milestone types for messages
const MILESTONE_TYPES = [
    { id: 'graduation', label: 'Graduation' },
    { id: 'wedding', label: 'Wedding Day' },
    { id: 'first_child', label: 'Birth of First Child' },
    { id: 'retirement', label: 'Retirement' },
    { id: 'birthday_18', label: '18th Birthday' },
    { id: 'birthday_21', label: '21st Birthday' },
    { id: 'birthday_30', label: '30th Birthday' },
    { id: 'birthday_50', label: '50th Birthday' },
    { id: 'custom', label: 'Custom Milestone' }
];

// Conditional types for messages
const CONDITIONAL_TYPES = [
    { id: 'after_passing', label: 'After My Passing' },
    { id: 'need_comfort', label: 'When They Need Comfort' },
    { id: 'holiday', label: 'On a Specific Holiday' },
    { id: 'custom', label: 'Custom Condition' }
];

export default async function handler(req, res) {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // Auth required
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const token = authHeader.split(' ')[1];
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
        return res.status(401).json({ error: 'Invalid token' });
    }

    try {
        // GET - List messages for a memorial
        if (req.method === 'GET') {
            const { memorialId, status } = req.query;

            let query = supabase
                .from('legacy_messages')
                .select('*')
                .eq('created_by', user.id)
                .order('created_at', { ascending: false });

            if (memorialId) {
                query = query.eq('memorial_id', memorialId);
            }

            if (status) {
                query = query.eq('status', status);
            }

            const { data, error } = await query;

            if (error) throw error;

            return res.status(200).json({
                messages: data || [],
                milestoneTypes: MILESTONE_TYPES,
                conditionalTypes: CONDITIONAL_TYPES
            });
        }

        // POST - Create a new legacy message
        if (req.method === 'POST') {
            const {
                memorialId,
                recipientEmail,
                recipientName,
                messageType, // 'pre_need' or 'post_need'
                deliveryTrigger, // 'date', 'milestone', 'conditional', 'anniversary'
                deliveryDate,
                milestoneType,
                conditionalType,
                subject,
                content,
                attachments
            } = req.body;

            if (!memorialId || !recipientEmail || !recipientName || !subject || !content) {
                return res.status(400).json({ error: 'Missing required fields' });
            }

            if (!messageType || !['pre_need', 'post_need'].includes(messageType)) {
                return res.status(400).json({ error: 'Invalid message type' });
            }

            if (!deliveryTrigger || !['date', 'milestone', 'conditional', 'anniversary'].includes(deliveryTrigger)) {
                return res.status(400).json({ error: 'Invalid delivery trigger' });
            }

            // Verify user has access to this memorial
            const { data: memorial, error: memorialError } = await supabase
                .from('memorials')
                .select('id, curator_ids')
                .eq('id', memorialId)
                .single();

            if (memorialError || !memorial) {
                return res.status(404).json({ error: 'Memorial not found' });
            }

            if (!memorial.curator_ids?.includes(user.id)) {
                return res.status(403).json({ error: 'You do not have access to this memorial' });
            }

            // Create the message
            const { data: newMessage, error: createError } = await supabase
                .from('legacy_messages')
                .insert({
                    memorial_id: memorialId,
                    created_by: user.id,
                    recipient_email: recipientEmail,
                    recipient_name: recipientName,
                    message_type: messageType,
                    delivery_trigger: deliveryTrigger,
                    delivery_date: deliveryDate || null,
                    milestone_type: milestoneType || null,
                    conditional_type: conditionalType || null,
                    subject,
                    content,
                    attachments: attachments || [],
                    status: 'pending'
                })
                .select()
                .single();

            if (createError) throw createError;

            return res.status(201).json({
                success: true,
                message: newMessage
            });
        }

        // PUT - Update a legacy message
        if (req.method === 'PUT') {
            const { id, ...updates } = req.body;

            if (!id) {
                return res.status(400).json({ error: 'Message ID required' });
            }

            // Verify ownership
            const { data: existing, error: findError } = await supabase
                .from('legacy_messages')
                .select('created_by, status')
                .eq('id', id)
                .single();

            if (findError || !existing) {
                return res.status(404).json({ error: 'Message not found' });
            }

            if (existing.created_by !== user.id) {
                return res.status(403).json({ error: 'You do not own this message' });
            }

            if (existing.status === 'delivered') {
                return res.status(400).json({ error: 'Cannot edit a delivered message' });
            }

            // Filter allowed update fields
            const allowedFields = [
                'recipient_email', 'recipient_name', 'delivery_trigger',
                'delivery_date', 'milestone_type', 'conditional_type',
                'subject', 'content', 'attachments'
            ];

            const safeUpdates = {};
            for (const [key, value] of Object.entries(updates)) {
                // Convert camelCase to snake_case
                const snakeKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
                if (allowedFields.includes(snakeKey)) {
                    safeUpdates[snakeKey] = value;
                }
            }

            if (Object.keys(safeUpdates).length === 0) {
                return res.status(400).json({ error: 'No valid fields to update' });
            }

            safeUpdates.updated_at = new Date().toISOString();

            const { data: updated, error: updateError } = await supabase
                .from('legacy_messages')
                .update(safeUpdates)
                .eq('id', id)
                .select()
                .single();

            if (updateError) throw updateError;

            return res.status(200).json({
                success: true,
                message: updated
            });
        }

        // DELETE - Delete a legacy message
        if (req.method === 'DELETE') {
            const { id } = req.query;

            if (!id) {
                return res.status(400).json({ error: 'Message ID required' });
            }

            // Verify ownership
            const { data: existing } = await supabase
                .from('legacy_messages')
                .select('created_by, status')
                .eq('id', id)
                .single();

            if (!existing) {
                return res.status(404).json({ error: 'Message not found' });
            }

            if (existing.created_by !== user.id) {
                return res.status(403).json({ error: 'You do not own this message' });
            }

            if (existing.status === 'delivered') {
                return res.status(400).json({ error: 'Cannot delete a delivered message' });
            }

            const { error: deleteError } = await supabase
                .from('legacy_messages')
                .delete()
                .eq('id', id);

            if (deleteError) throw deleteError;

            return res.status(200).json({
                success: true,
                message: 'Message deleted'
            });
        }

        return res.status(405).json({ error: 'Method not allowed' });

    } catch (error) {
        console.error('Legacy messages error:', error);
        return res.status(500).json({ error: 'Failed to process request' });
    }
}
