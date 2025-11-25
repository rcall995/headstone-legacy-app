import { createClient } from '@supabase/supabase-js';

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

  const { memorialId, inviteeEmail } = req.body;

  if (!memorialId || !inviteeEmail) {
    return res.status(400).json({ error: 'Missing memorialId or inviteeEmail' });
  }

  try {
    // Get the memorial
    const { data: memorial, error: memorialError } = await supabase
      .from('memorials')
      .select('curator_ids, curators')
      .eq('id', memorialId)
      .single();

    if (memorialError || !memorial) {
      return res.status(404).json({ error: 'Memorial not found' });
    }

    // Check if caller is a curator
    if (!memorial.curator_ids?.includes(user.id)) {
      return res.status(403).json({ error: 'You do not have permission to add curators' });
    }

    // Find the user by email in profiles table
    const { data: inviteeProfile, error: profileError } = await supabase
      .from('profiles')
      .select('id, email')
      .eq('email', inviteeEmail.toLowerCase())
      .single();

    if (profileError || !inviteeProfile) {
      return res.status(404).json({ error: `No user found with email: ${inviteeEmail}` });
    }

    // Check if already a curator
    if (memorial.curator_ids?.includes(inviteeProfile.id)) {
      return res.status(400).json({ error: 'This user is already a curator' });
    }

    // Add the new curator
    const updatedCuratorIds = [...(memorial.curator_ids || []), inviteeProfile.id];
    const updatedCurators = [...(memorial.curators || []), { uid: inviteeProfile.id, email: inviteeProfile.email }];

    const { error: updateError } = await supabase
      .from('memorials')
      .update({
        curator_ids: updatedCuratorIds,
        curators: updatedCurators
      })
      .eq('id', memorialId);

    if (updateError) throw updateError;

    return res.status(200).json({
      message: 'Curator added successfully!',
      newCurator: { uid: inviteeProfile.id, email: inviteeProfile.email }
    });

  } catch (error) {
    console.error('Add curator error:', error);
    return res.status(500).json({ error: 'Failed to add curator' });
  }
}
