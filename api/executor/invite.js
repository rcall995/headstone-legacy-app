import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import { sendExecutorInviteEmail } from '../utils/email.js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Verify auth
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);

  if (authError || !user) {
    return res.status(401).json({ error: 'Invalid token' });
  }

  try {
    const { memorialId, executorEmail, executorName } = req.body;

    if (!memorialId || !executorEmail) {
      return res.status(400).json({ error: 'Memorial ID and executor email are required' });
    }

    // Verify user owns this living legacy memorial
    const { data: memorial, error: memError } = await supabase
      .from('memorials')
      .select('id, name, status, curator_ids, executor_email, executor_token')
      .eq('id', memorialId)
      .single();

    if (memError || !memorial) {
      return res.status(404).json({ error: 'Memorial not found' });
    }

    // Check if user is the owner
    if (!memorial.curator_ids?.includes(user.id)) {
      return res.status(403).json({ error: 'You do not have permission to designate an executor' });
    }

    // Verify it's a living legacy
    if (memorial.status !== 'living_legacy') {
      return res.status(400).json({ error: 'Executor can only be set for living legacy memorials' });
    }

    // Can't designate yourself
    if (executorEmail.toLowerCase() === user.email?.toLowerCase()) {
      return res.status(400).json({ error: 'You cannot designate yourself as executor' });
    }

    // Generate executor invite token
    const executorToken = crypto.randomBytes(32).toString('hex');

    // Check if executor email belongs to existing user
    const { data: existingUser } = await supabase
      .from('profiles')
      .select('id')
      .eq('email', executorEmail.toLowerCase())
      .single();

    // Update memorial with executor info
    const { error: updateError } = await supabase
      .from('memorials')
      .update({
        executor_email: executorEmail.toLowerCase(),
        executor_id: existingUser?.id || null,
        executor_token: executorToken,
        executor_name: executorName || null,
        executor_invited_at: new Date().toISOString()
      })
      .eq('id', memorialId);

    if (updateError) {
      console.error('Update error:', updateError);
      throw updateError;
    }

    // Generate accept URL
    const acceptUrl = `https://www.headstonelegacy.com/accept-executor?token=${executorToken}`;

    // Send email notification to executor
    const emailResult = await sendExecutorInviteEmail({
      to: executorEmail,
      executorName: executorName || null,
      legacyOwnerName: memorial.name,
      acceptUrl
    });

    return res.status(200).json({
      success: true,
      message: emailResult.success
        ? `An invitation has been sent to ${executorEmail}`
        : `${executorEmail} has been designated. Share this link with them: ${acceptUrl}`,
      acceptUrl,
      isExistingUser: !!existingUser,
      emailSent: emailResult.success
    });

  } catch (error) {
    console.error('Executor invite error:', error);
    return res.status(500).json({ error: 'Failed to invite executor: ' + error.message });
  }
}
