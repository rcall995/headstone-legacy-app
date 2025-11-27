import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

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
    const { memorialId, email, role = 'contributor', message } = req.body;

    if (!memorialId || !email) {
      return res.status(400).json({ error: 'Memorial ID and email are required' });
    }

    // Validate role
    const validRoles = ['editor', 'contributor', 'viewer'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ error: 'Invalid role. Must be: editor, contributor, or viewer' });
    }

    // Verify user has permission to invite (must be owner or editor)
    const { data: memorial, error: memError } = await supabase
      .from('memorials')
      .select('id, name, curator_ids')
      .eq('id', memorialId)
      .single();

    if (memError || !memorial) {
      return res.status(404).json({ error: 'Memorial not found' });
    }

    // Check if user is owner
    const isOwner = memorial.curator_ids?.includes(user.id);

    // Also check collaborators table
    const { data: userCollab } = await supabase
      .from('memorial_collaborators')
      .select('role')
      .eq('memorial_id', memorialId)
      .eq('user_id', user.id)
      .eq('status', 'active')
      .single();

    const userRole = userCollab?.role || (isOwner ? 'owner' : null);

    if (!userRole || !['owner', 'editor'].includes(userRole)) {
      return res.status(403).json({ error: 'You do not have permission to invite collaborators' });
    }

    // Check if this email is already invited/active
    const { data: existing } = await supabase
      .from('memorial_collaborators')
      .select('id, status, role')
      .eq('memorial_id', memorialId)
      .eq('email', email.toLowerCase())
      .single();

    if (existing) {
      if (existing.status === 'active') {
        return res.status(400).json({ error: 'This person is already a collaborator' });
      }
      if (existing.status === 'pending') {
        return res.status(400).json({ error: 'An invite has already been sent to this email' });
      }
    }

    // Check if email belongs to existing user
    const { data: existingUser } = await supabase
      .from('profiles')
      .select('id')
      .eq('email', email.toLowerCase())
      .single();

    // Generate invite token
    const inviteToken = crypto.randomBytes(32).toString('hex');

    // Create the invite
    const { data: invite, error: inviteError } = await supabase
      .from('memorial_collaborators')
      .insert({
        memorial_id: memorialId,
        user_id: existingUser?.id || null,
        email: email.toLowerCase(),
        role,
        status: existingUser ? 'active' : 'pending', // Auto-accept if user exists
        invited_by: user.id,
        invite_message: message || null,
        invite_token: inviteToken,
        accepted_at: existingUser ? new Date().toISOString() : null
      })
      .select()
      .single();

    if (inviteError) {
      console.error('Invite error:', inviteError);
      throw inviteError;
    }

    // Log activity
    await supabase.from('memorial_activity').insert({
      memorial_id: memorialId,
      user_id: user.id,
      user_name: user.email,
      activity_type: 'invite_sent',
      description: `Invited ${email} as ${role}`,
      metadata: { invited_email: email, role }
    });

    // Generate invite URL
    const inviteUrl = `https://www.headstonelegacy.com/accept-invite?token=${inviteToken}`;

    return res.status(200).json({
      success: true,
      invite: {
        id: invite.id,
        email: invite.email,
        role: invite.role,
        status: invite.status,
        inviteUrl
      },
      message: existingUser
        ? `${email} has been added as a ${role}`
        : `Invite sent to ${email}. Share this link: ${inviteUrl}`
    });

  } catch (error) {
    console.error('Invite error:', error);
    return res.status(500).json({ error: 'Failed to send invite: ' + error.message });
  }
}
