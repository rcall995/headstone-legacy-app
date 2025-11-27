// api/scouts/wanted-graves.js - Get list of graves needing location
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
        // Auth is optional - shows different data for logged in users
        let userId = null;
        const authHeader = req.headers.authorization;
        if (authHeader?.startsWith('Bearer ')) {
            const token = authHeader.split(' ')[1];
            const { data: { user } } = await supabase.auth.getUser(token);
            userId = user?.id;
        }

        // Query parameters
        const {
            lat,
            lng,
            radius = 100, // km
            limit = 50,
            offset = 0,
            filter = 'all' // all, needs_cemetery, needs_pin
        } = req.query;

        // Build query for memorials needing location
        let query = supabase
            .from('memorials')
            .select(`
                id,
                name,
                birth_date,
                death_date,
                cemetery_name,
                cemetery_lat,
                cemetery_lng,
                needs_location,
                needs_cemetery,
                search_hints,
                source,
                imported_by,
                created_at
            `)
            .or('needs_location.eq.true,needs_cemetery.eq.true')
            .order('created_at', { ascending: false });

        // Apply filters
        if (filter === 'needs_cemetery') {
            query = query.eq('needs_cemetery', true);
        } else if (filter === 'needs_pin') {
            query = query.eq('needs_location', true).not('cemetery_name', 'is', null);
        }

        // Apply pagination
        query = query.range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

        const { data: memorials, error } = await query;

        if (error) {
            console.error('Query error:', error);
            return res.status(500).json({ error: 'Failed to fetch wanted graves' });
        }

        // If lat/lng provided, calculate distances and sort
        let results = memorials;
        if (lat && lng) {
            const userLat = parseFloat(lat);
            const userLng = parseFloat(lng);
            const radiusKm = parseFloat(radius);

            results = memorials
                .map(m => {
                    // Calculate distance if memorial has cemetery coordinates
                    let distance = null;
                    if (m.cemetery_lat && m.cemetery_lng) {
                        distance = haversineDistance(userLat, userLng, m.cemetery_lat, m.cemetery_lng);
                    }
                    return { ...m, distance };
                })
                .filter(m => {
                    // Filter by radius if distance is known
                    if (m.distance !== null) {
                        return m.distance <= radiusKm;
                    }
                    // Include memorials without known location
                    return true;
                })
                .sort((a, b) => {
                    // Sort by distance (null distances at end)
                    if (a.distance === null && b.distance === null) return 0;
                    if (a.distance === null) return 1;
                    if (b.distance === null) return -1;
                    return a.distance - b.distance;
                });
        }

        // Check for active claims by the user
        let userClaims = [];
        if (userId) {
            const { data: claims } = await supabase
                .from('scout_claims')
                .select('memorial_id, status')
                .eq('scout_id', userId)
                .in('status', ['active', 'submitted']);

            userClaims = claims || [];
        }

        const claimedByUser = new Set(userClaims.map(c => c.memorial_id));

        // Format response
        const formatted = results.map(m => ({
            id: m.id,
            name: m.name,
            birthDate: m.birth_date,
            deathDate: m.death_date,
            cemetery: m.cemetery_name,
            hasKnownCemetery: !!m.cemetery_name,
            hasCemeteryCoords: !!(m.cemetery_lat && m.cemetery_lng),
            needsCemetery: m.needs_cemetery,
            needsPin: m.needs_location,
            searchHints: m.search_hints,
            source: m.source,
            distance: m.distance ? Math.round(m.distance * 10) / 10 : null,
            isClaimedByUser: claimedByUser.has(m.id),
            createdAt: m.created_at
        }));

        // Get total count
        const { count } = await supabase
            .from('memorials')
            .select('id', { count: 'exact', head: true })
            .or('needs_location.eq.true,needs_cemetery.eq.true');

        return res.status(200).json({
            success: true,
            total: count || 0,
            returned: formatted.length,
            offset: parseInt(offset),
            graves: formatted
        });

    } catch (error) {
        console.error('Wanted graves error:', error);
        return res.status(500).json({ error: 'Failed to fetch wanted graves' });
    }
}

// Haversine distance calculation
function haversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth's radius in km
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

function toRad(deg) {
    return deg * (Math.PI / 180);
}
