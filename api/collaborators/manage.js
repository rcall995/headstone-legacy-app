import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST' && req.method !== 'DELETE') {
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
    const { collaboratorId, memorialId, action, newRole } = req.body;

    if (!collaboratorId || !memorialId || !action) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Verify user is owner of the memorial
    const { data: memorial } = await supabase
      .from('memorials')
      .select('id, name, curator_ids')
      .eq('id', memorialId)
      .single();

    if (!memorial) {
      return res.status(404).json({ error: 'Memorial not found' });
    }

    const isLegacyOwner = memorial.curator_ids?.includes(user.id);

    const { data: userCollab } = await supabase
      .from('memorial_collaborators')
      .select('role')
      .eq('memorial_id', memorialId)
      .eq('user_id', user.id)
      .eq('status', 'active')
      .single();

    const userRole = userCollab?.role || (isLegacyOwner ? 'owner' : null);

    if (userRole !== 'owner') {
      return res.status(403).json({ error: 'Only owners can manage collaborators' });
    }

    // Get the target collaborator
    const { data: target, error: targetError } = await supabase
      .from('memorial_collaborators')
      .select('*, profiles:user_id(email)')
      .eq('id', collaboratorId)
      .eq('memorial_id', memorialId)
      .single();

    if (targetError || !target) {
      return res.status(404).json({ error: 'Collaborator not found' });
    }

    // Cannot modify yourself as owner
    if (target.user_id === user.id && target.role === 'owner') {
      return res.status(400).json({ error: 'Cannot modify your own owner role' });
    }

    // Handle different actions
    if (action === 'update_role') {
      const validRoles = ['editor', 'contributor', 'viewer'];
      if (!validRoles.includes(newRole)) {
        return res.status(400).json({ error: 'Invalid role' });
      }

      // Cannot change another owner's role
      if (target.role === 'owner') {
        return res.status(400).json({ error: 'Cannot change an owner\'s role. Transfer ownership instead.' });
      }

      const { error: updateError } = await supabase
        .from('memorial_collaborators')
        .update({
          role: newRole,
          updated_at: new Date().toISOString()
        })
        .eq('id', collaboratorId);

      if (updateError) throw updateError;

      // Log activity
      await supabase.from('memorial_activity').insert({
        memorial_id: memorialId,
        user_id: user.id,
        user_name: user.email,
        activity_type: 'role_changed',
        description: `Changed ${target.email || target.profiles?.email}'s role from ${target.role} to ${newRole}`,
        metadata: { targetEmail: target.email, oldRole: target.role, newRole }
      });

      return res.status(200).json({
        success: true,
        message: `Role updated to ${newRole}`
      });
    }

    if (action === 'remove') {
      // Cannot remove an owner
      if (target.role === 'owner') {
        return res.status(400).json({ error: 'Cannot remove an owner' });
      }

      const { error: deleteError } = await supabase
        .from('memorial_collaborators')
        .update({
          status: 'revoked',
          updated_at: new Date().toISOString()
        })
        .eq('id', collaboratorId);

      if (deleteError) throw deleteError;

      // Log activity
      await supabase.from('memorial_activity').insert({
        memorial_id: memorialId,
        user_id: user.id,
        user_name: user.email,
        activity_type: 'collaborator_removed',
        description: `Removed ${target.email || target.profiles?.email} (was ${target.role})`,
        metadata: { targetEmail: target.email, role: target.role }
      });

      return res.status(200).json({
        success: true,
        message: 'Collaborator removed'
      });
    }

    if (action === 'resend_invite') {
      if (target.status !== 'pending') {
        return res.status(400).json({ error: 'Can only resend pending invites' });
      }

      // Just return the existing invite URL
      const inviteUrl = `https://www.headstonelegacy.com/accept-invite?token=${target.invite_token}`;

      return res.status(200).json({
        success: true,
        inviteUrl,
        message: 'Share this link with the invitee'
      });
    }

    return res.status(400).json({ error: 'Invalid action' });

  } catch (error) {
    console.error('Manage collaborator error:', error);
    return res.status(500).json({ error: 'Failed to manage collaborator: ' + error.message });
  }
}
