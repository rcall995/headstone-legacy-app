import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Map common relationship names to connection types
const RELATIONSHIP_MAP = {
  'Spouse': { type: 'spouse', label: 'Spouse' },
  'Husband': { type: 'spouse', label: 'Husband' },
  'Wife': { type: 'spouse', label: 'Wife' },
  'Parent': { type: 'parent', label: 'Parent' },
  'Father': { type: 'parent', label: 'Father' },
  'Mother': { type: 'parent', label: 'Mother' },
  'Child': { type: 'child', label: 'Child' },
  'Son': { type: 'child', label: 'Son' },
  'Daughter': { type: 'child', label: 'Daughter' },
  'Sibling': { type: 'sibling', label: 'Sibling' },
  'Brother': { type: 'sibling', label: 'Brother' },
  'Sister': { type: 'sibling', label: 'Sister' },
  'Grandparent': { type: 'grandparent', label: 'Grandparent' },
  'Grandfather': { type: 'grandparent', label: 'Grandfather' },
  'Grandmother': { type: 'grandparent', label: 'Grandmother' },
  'Grandchild': { type: 'grandchild', label: 'Grandchild' },
  'Grandson': { type: 'grandchild', label: 'Grandson' },
  'Granddaughter': { type: 'grandchild', label: 'Granddaughter' }
};

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
    const { memorialId, connectedMemorialId, relationship } = req.body;

    if (!memorialId || !connectedMemorialId) {
      return res.status(400).json({ error: 'Both memorial IDs are required' });
    }

    if (memorialId === connectedMemorialId) {
      return res.status(400).json({ error: 'Cannot connect a memorial to itself' });
    }

    // Verify user has edit access to the memorial
    const { data: memorial } = await supabase
      .from('memorials')
      .select('id, curator_ids')
      .eq('id', memorialId)
      .single();

    if (!memorial) {
      return res.status(404).json({ error: 'Memorial not found' });
    }

    const isCurator = memorial.curator_ids?.includes(user.id);

    // Also check collaborators table
    const { data: collabAccess } = await supabase
      .from('memorial_collaborators')
      .select('role')
      .eq('memorial_id', memorialId)
      .eq('user_id', user.id)
      .eq('status', 'active')
      .in('role', ['owner', 'editor'])
      .single();

    if (!isCurator && !collabAccess) {
      return res.status(403).json({ error: 'You do not have permission to edit this memorial' });
    }

    // Map relationship string to type and label
    const relationshipInfo = RELATIONSHIP_MAP[relationship] || { type: 'other', label: relationship };

    // Create the connection using the database function
    const { data, error } = await supabase.rpc('create_memorial_connection', {
      p_memorial_id: memorialId,
      p_connected_memorial_id: connectedMemorialId,
      p_relationship_type: relationshipInfo.type,
      p_relationship_label: relationshipInfo.label
    });

    if (error) {
      // Check for duplicate
      if (error.code === '23505') {
        return res.status(409).json({ error: 'This connection already exists' });
      }
      console.error('Connection creation error:', error);
      throw error;
    }

    return res.status(201).json({
      success: true,
      connectionId: data,
      message: 'Connection created successfully'
    });

  } catch (error) {
    console.error('Create connection error:', error);
    return res.status(500).json({ error: 'Failed to create connection: ' + error.message });
  }
}
