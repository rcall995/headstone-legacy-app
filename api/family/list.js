// api/family/list.js - Get family members for a memorial
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { memorialId, includeLinked } = req.query;

        if (!memorialId) {
            return res.status(400).json({ error: 'Memorial ID required' });
        }

        // Get family members for this memorial
        const { data: familyMembers, error } = await supabase
            .from('family_members')
            .select(`
                id,
                name,
                relationship,
                birth_date,
                death_date,
                burial_status,
                cemetery_name,
                cemetery_city,
                cemetery_state,
                linked_memorial_id,
                needs_pin,
                gravesite_lat,
                gravesite_lng,
                pinned_at,
                headstone_photo_url
            `)
            .eq('memorial_id', memorialId)
            .order('relationship', { ascending: true });

        if (error) {
            console.error('Error fetching family members:', error);
            return res.status(500).json({ error: 'Failed to fetch family members' });
        }

        // Separate into categories
        const needsPin = familyMembers.filter(fm =>
            fm.needs_pin &&
            (fm.burial_status === 'same_cemetery' || fm.burial_status === 'nearby_cemetery')
        );

        const pinned = familyMembers.filter(fm => !fm.needs_pin && fm.gravesite_lat);

        const unknown = familyMembers.filter(fm =>
            fm.burial_status === 'unknown' || fm.burial_status === 'different_cemetery'
        );

        const hasMemorial = familyMembers.filter(fm => fm.linked_memorial_id);

        // If requested, fetch linked memorial details
        let linkedMemorials = {};
        if (includeLinked === 'true' && hasMemorial.length > 0) {
            const linkedIds = hasMemorial.map(fm => fm.linked_memorial_id);
            const { data: linked } = await supabase
                .from('memorials')
                .select('id, name, main_photo, birth_date, death_date')
                .in('id', linkedIds);

            if (linked) {
                linked.forEach(m => {
                    linkedMemorials[m.id] = m;
                });
            }
        }

        return res.status(200).json({
            success: true,
            total: familyMembers.length,
            familyMembers: {
                all: familyMembers,
                needsPin,        // Buried nearby, not yet pinned
                pinned,          // Already pinned
                unknown,         // Unknown or different cemetery
                hasMemorial      // Has their own memorial
            },
            linkedMemorials,
            summary: {
                total: familyMembers.length,
                needsPin: needsPin.length,
                pinned: pinned.length,
                unknown: unknown.length,
                hasMemorial: hasMemorial.length
            }
        });

    } catch (error) {
        console.error('List family error:', error);
        return res.status(500).json({ error: 'Failed to fetch family members' });
    }
}
