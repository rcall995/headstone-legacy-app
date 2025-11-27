import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'GET') {
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
    const memorialId = req.query.memorialId;

    if (!memorialId) {
      return res.status(400).json({ error: 'Memorial ID is required' });
    }

    // Verify user has access to this memorial
    const { data: memorial } = await supabase
      .from('memorials')
      .select('id, name, curator_ids')
      .eq('id', memorialId)
      .single();

    if (!memorial) {
      return res.status(404).json({ error: 'Memorial not found' });
    }

    const isLegacyCurator = memorial.curator_ids?.includes(user.id);

    // Check collaborators table for access
    const { data: userAccess } = await supabase
      .from('memorial_collaborators')
      .select('role')
      .eq('memorial_id', memorialId)
      .eq('user_id', user.id)
      .eq('status', 'active')
      .single();

    if (!isLegacyCurator && !userAccess) {
      return res.status(403).json({ error: 'You do not have access to this memorial' });
    }

    // Get all collaborators
    const { data: collaborators, error: listError } = await supabase
      .from('memorial_collaborators')
      .select('id, user_id, email, role, status, invited_by, invite_message, created_at, accepted_at')
      .eq('memorial_id', memorialId)
      .neq('status', 'revoked')
      .order('created_at', { ascending: true });

    if (listError) {
      console.error('List collaborators query error:', listError);
      throw listError;
    }

    // Get profile info for users who have user_ids
    const userIds = collaborators.filter(c => c.user_id).map(c => c.user_id);
    let profilesMap = {};

    if (userIds.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, email, display_name, avatar_url')
        .in('id', userIds);

      if (profiles) {
        profiles.forEach(p => {
          profilesMap[p.id] = p;
        });
      }
    }

    // Format response
    const formatted = collaborators.map(c => {
      const profile = c.user_id ? profilesMap[c.user_id] : null;
      return {
        id: c.id,
        userId: c.user_id,
        email: profile?.email || c.email,
        displayName: profile?.display_name || c.email?.split('@')[0] || 'Unknown',
        avatarUrl: profile?.avatar_url,
        role: c.role,
        status: c.status,
        inviteMessage: c.invite_message,
        createdAt: c.created_at,
        acceptedAt: c.accepted_at
      };
    });

    // Determine current user's role
    const currentUserRole = userAccess?.role || (isLegacyCurator ? 'owner' : null);

    return res.status(200).json({
      collaborators: formatted,
      currentUserRole,
      canInvite: ['owner', 'editor'].includes(currentUserRole),
      canManage: currentUserRole === 'owner'
    });

  } catch (error) {
    console.error('List collaborators error:', error);
    return res.status(500).json({ error: 'Failed to list collaborators: ' + error.message });
  }
}
