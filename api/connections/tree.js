import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Map relationship names to categories
function getRelationshipCategory(relationship) {
  const lower = (relationship || '').toLowerCase();

  if (['mother', 'father', 'parent'].includes(lower)) return 'parents';
  if (['spouse', 'husband', 'wife'].includes(lower)) return 'spouse';
  if (['brother', 'sister', 'sibling'].includes(lower)) return 'siblings';
  if (['son', 'daughter', 'child'].includes(lower)) return 'children';
  if (['grandmother', 'grandfather', 'grandparent'].includes(lower)) return 'grandparents';
  if (['grandson', 'granddaughter', 'grandchild'].includes(lower)) return 'grandchildren';
  if (['uncle', 'aunt'].includes(lower)) return 'uncles_aunts';
  if (['nephew', 'niece'].includes(lower)) return 'nephews_nieces';
  if (['cousin'].includes(lower)) return 'cousins';

  return 'other';
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { memorialId } = req.query;

    if (!memorialId) {
      return res.status(400).json({ error: 'Memorial ID is required' });
    }

    // Get the memorial with its relatives JSONB
    const { data: memorial, error: memorialError } = await supabase
      .from('memorials')
      .select('id, name, main_photo, birth_date, death_date, relatives')
      .eq('id', memorialId)
      .single();

    if (memorialError || !memorial) {
      return res.status(404).json({ error: 'Memorial not found' });
    }

    // Group connections by relationship type
    const grouped = {
      parents: [],
      grandparents: [],
      spouse: [],
      siblings: [],
      uncles_aunts: [],
      children: [],
      grandchildren: [],
      nephews_nieces: [],
      cousins: [],
      other: []
    };

    const addedIds = new Set(); // Track added memorial IDs to avoid duplicates

    // First, try to get connections from the database function (legacy support)
    try {
      const { data: connections } = await supabase
        .rpc('get_memorial_family_tree', { p_memorial_id: memorialId });

      connections?.forEach(conn => {
        if (addedIds.has(conn.memorial_id)) return;
        addedIds.add(conn.memorial_id);

        // Prefer relationship_label over relationship_type as it's more specific/current
        const category = getRelationshipCategory(conn.relationship_label || conn.relationship_type);
        const member = {
          connectionId: conn.connection_id,
          memorialId: conn.memorial_id,
          name: conn.memorial_name,
          photo: conn.memorial_photo,
          birthDate: conn.birth_date,
          deathDate: conn.death_date,
          relationshipType: category,
          relationshipLabel: conn.relationship_label || conn.relationship_type
        };

        grouped[category].push(member);
      });
    } catch (rpcError) {
      // RPC function might not exist, continue with relatives JSONB
      console.log('RPC not available, using relatives JSONB only');
    }

    // Now add relatives from the JSONB field (linked ones with memorialId)
    const relatives = memorial.relatives || [];

    // Get all linked memorial IDs to fetch their details
    const linkedIds = relatives
      .filter(r => r.memorialId && !addedIds.has(r.memorialId))
      .map(r => r.memorialId);

    if (linkedIds.length > 0) {
      const { data: linkedMemorials } = await supabase
        .from('memorials')
        .select('id, name, main_photo, birth_date, death_date, cemetery_name, cemetery_lat, cemetery_lng, gravesite_lat, gravesite_lng')
        .in('id', linkedIds);

      const memorialMap = {};
      linkedMemorials?.forEach(m => {
        memorialMap[m.id] = m;
      });

      relatives.forEach(rel => {
        if (!rel.memorialId || addedIds.has(rel.memorialId)) return;

        const linkedMemorial = memorialMap[rel.memorialId];
        if (!linkedMemorial) return;

        addedIds.add(rel.memorialId);

        const category = getRelationshipCategory(rel.relationship);
        const member = {
          memorialId: linkedMemorial.id,
          name: linkedMemorial.name,
          photo: linkedMemorial.main_photo,
          birthDate: linkedMemorial.birth_date,
          deathDate: linkedMemorial.death_date,
          relationshipType: category,
          relationshipLabel: rel.relationship,
          cemeteryName: linkedMemorial.cemetery_name,
          cemeteryLat: linkedMemorial.cemetery_lat,
          cemeteryLng: linkedMemorial.cemetery_lng,
          gravesiteLat: linkedMemorial.gravesite_lat,
          gravesiteLng: linkedMemorial.gravesite_lng
        };

        grouped[category].push(member);
      });
    }

    // Fetch location data for all family members (from RPC and relatives)
    const allMemberIds = [];
    Object.values(grouped).forEach(members => {
      members.forEach(m => {
        if (m.memorialId && !m.cemeteryLat && !m.gravesiteLat) {
          allMemberIds.push(m.memorialId);
        }
      });
    });

    if (allMemberIds.length > 0) {
      const { data: locationData } = await supabase
        .from('memorials')
        .select('id, cemetery_name, cemetery_lat, cemetery_lng, gravesite_lat, gravesite_lng')
        .in('id', allMemberIds);

      const locationMap = {};
      locationData?.forEach(loc => {
        locationMap[loc.id] = loc;
      });

      // Add location data to all members
      Object.values(grouped).forEach(members => {
        members.forEach(m => {
          if (m.memorialId && locationMap[m.memorialId]) {
            const loc = locationMap[m.memorialId];
            m.cemeteryName = loc.cemetery_name;
            m.cemeteryLat = loc.cemetery_lat;
            m.cemeteryLng = loc.cemetery_lng;
            m.gravesiteLat = loc.gravesite_lat;
            m.gravesiteLng = loc.gravesite_lng;
          }
        });
      });
    }

    // Count total connections
    const totalConnections = Object.values(grouped).reduce((sum, arr) => sum + arr.length, 0);

    return res.status(200).json({
      memorial: {
        id: memorial.id,
        name: memorial.name,
        photo: memorial.main_photo,
        birthDate: memorial.birth_date,
        deathDate: memorial.death_date
      },
      connections: grouped,
      totalConnections
    });

  } catch (error) {
    console.error('Get family tree error:', error);
    return res.status(500).json({ error: 'Failed to get family tree' });
  }
}
