import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { memorialId } = req.query;

    if (!memorialId) {
      return res.status(400).json({ error: 'Memorial ID is required' });
    }

    // Get the memorial itself first
    const { data: memorial, error: memorialError } = await supabase
      .from('memorials')
      .select('id, name, main_photo, birth_date, death_date')
      .eq('id', memorialId)
      .single();

    if (memorialError || !memorial) {
      return res.status(404).json({ error: 'Memorial not found' });
    }

    // Get all connections using the database function
    const { data: connections, error: connectionsError } = await supabase
      .rpc('get_memorial_family_tree', { p_memorial_id: memorialId });

    if (connectionsError) {
      console.error('Get family tree error:', connectionsError);
      throw connectionsError;
    }

    // Group connections by relationship type for easier UI rendering
    const grouped = {
      parents: [],
      spouse: [],
      siblings: [],
      children: [],
      grandparents: [],
      grandchildren: [],
      other: []
    };

    connections?.forEach(conn => {
      const member = {
        connectionId: conn.connection_id,
        memorialId: conn.memorial_id,
        name: conn.memorial_name,
        photo: conn.memorial_photo,
        birthDate: conn.birth_date,
        deathDate: conn.death_date,
        relationshipType: conn.relationship_type,
        relationshipLabel: conn.relationship_label || conn.relationship_type
      };

      switch (conn.relationship_type) {
        case 'parent':
          grouped.parents.push(member);
          break;
        case 'spouse':
          grouped.spouse.push(member);
          break;
        case 'sibling':
          grouped.siblings.push(member);
          break;
        case 'child':
          grouped.children.push(member);
          break;
        case 'grandparent':
          grouped.grandparents.push(member);
          break;
        case 'grandchild':
          grouped.grandchildren.push(member);
          break;
        default:
          grouped.other.push(member);
      }
    });

    return res.status(200).json({
      memorial: {
        id: memorial.id,
        name: memorial.name,
        photo: memorial.main_photo,
        birthDate: memorial.birth_date,
        deathDate: memorial.death_date
      },
      connections: grouped,
      totalConnections: connections?.length || 0
    });

  } catch (error) {
    console.error('Get family tree error:', error);
    return res.status(500).json({ error: 'Failed to get family tree' });
  }
}
