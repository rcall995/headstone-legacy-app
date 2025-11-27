import { createClient } from '@supabase/supabase-js';

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
    return res.status(401).json({ error: 'Please sign in to accept this invite' });
  }

  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);

  if (authError || !user) {
    return res.status(401).json({ error: 'Invalid token. Please sign in again.' });
  }

  try {
    const { inviteToken } = req.body;

    if (!inviteToken) {
      return res.status(400).json({ error: 'Invite token is required' });
    }

    // Find the invite
    const { data: invite, error: findError } = await supabase
      .from('memorial_collaborators')
      .select('*, memorials(id, name)')
      .eq('invite_token', inviteToken)
      .single();

    if (findError || !invite) {
      return res.status(404).json({ error: 'Invite not found or has expired' });
    }

    if (invite.status === 'active') {
      return res.status(400).json({
        error: 'This invite has already been accepted',
        memorial: invite.memorials
      });
    }

    if (invite.status === 'revoked') {
      return res.status(400).json({ error: 'This invite has been revoked' });
    }

    // Verify email matches (if email was specified)
    if (invite.email && invite.email.toLowerCase() !== user.email.toLowerCase()) {
      return res.status(403).json({
        error: `This invite was sent to ${invite.email}. Please sign in with that email address.`
      });
    }

    // Accept the invite
    const { data: updated, error: updateError } = await supabase
      .from('memorial_collaborators')
      .update({
        user_id: user.id,
        status: 'active',
        accepted_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', invite.id)
      .select('*, memorials(id, name)')
      .single();

    if (updateError) {
      throw updateError;
    }

    // Log activity
    await supabase.from('memorial_activity').insert({
      memorial_id: invite.memorial_id,
      user_id: user.id,
      user_name: user.email,
      activity_type: 'invite_accepted',
      description: `${user.email} joined as ${invite.role}`,
      metadata: { role: invite.role }
    });

    return res.status(200).json({
      success: true,
      message: `You are now a ${invite.role} for "${updated.memorials?.name}"`,
      memorial: updated.memorials,
      role: updated.role
    });

  } catch (error) {
    console.error('Accept invite error:', error);
    return res.status(500).json({ error: 'Failed to accept invite: ' + error.message });
  }
}
