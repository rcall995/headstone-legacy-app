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

  const { memorialId, curatorToRemove } = req.body;

  if (!memorialId || !curatorToRemove || !curatorToRemove.uid) {
    return res.status(400).json({ error: 'Missing memorialId or curatorToRemove' });
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
      return res.status(403).json({ error: 'You do not have permission to remove curators' });
    }

    // Cannot remove the primary curator (first in the list)
    if (memorial.curator_ids[0] === curatorToRemove.uid) {
      return res.status(403).json({ error: 'The primary curator cannot be removed' });
    }

    // Remove the curator
    const updatedCuratorIds = memorial.curator_ids.filter(id => id !== curatorToRemove.uid);
    const updatedCurators = memorial.curators.filter(c => c.uid !== curatorToRemove.uid);

    const { error: updateError } = await supabase
      .from('memorials')
      .update({
        curator_ids: updatedCuratorIds,
        curators: updatedCurators
      })
      .eq('id', memorialId);

    if (updateError) throw updateError;

    return res.status(200).json({ message: 'Curator removed successfully' });

  } catch (error) {
    console.error('Remove curator error:', error);
    return res.status(500).json({ error: 'Failed to remove curator' });
  }
}
