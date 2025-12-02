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

        // First, get active grave searches (families actively looking)
        const { data: activeSearches, error: searchError } = await supabase
            .from('grave_searches')
            .select(`
                memorial_id,
                search_hints,
                known_cemetery,
                known_region,
                urgency,
                reward_points
            `)
            .eq('status', 'active');

        const searchMemorialIds = (activeSearches || []).map(s => s.memorial_id);
        const searchHintsMap = {};
        (activeSearches || []).forEach(s => {
            searchHintsMap[s.memorial_id] = {
                hints: s.search_hints,
                cemetery: s.known_cemetery,
                region: s.known_region,
                urgency: s.urgency,
                reward: s.reward_points
            };
        });

        // Build query for memorials needing location OR with active searches
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
                gravesite_lat,
                gravesite_lng,
                needs_location,
                needs_cemetery,
                search_hints,
                source,
                imported_by,
                created_at
            `)
            .order('created_at', { ascending: false });

        // Exclude Living Legacies - they're for living people who don't have gravesites yet
        query = query.neq('status', 'living_legacy');

        // Apply filters - include active searches + flagged memorials
        if (filter === 'needs_cemetery') {
            if (searchMemorialIds.length > 0) {
                query = query.or(`needs_cemetery.eq.true,id.in.(${searchMemorialIds.join(',')})`);
            } else {
                query = query.eq('needs_cemetery', true);
            }
        } else if (filter === 'needs_pin') {
            // Needs exact gravesite pin (has cemetery but no pin)
            if (searchMemorialIds.length > 0) {
                query = query.or(`needs_location.eq.true,id.in.(${searchMemorialIds.join(',')})`)
                    .not('cemetery_name', 'is', null)
                    .is('gravesite_lat', null);
            } else {
                query = query.eq('needs_location', true)
                    .not('cemetery_name', 'is', null)
                    .is('gravesite_lat', null);
            }
        } else {
            // All wanted - flagged OR active searches OR genuinely missing location
            // Only show memorials that are ACTUALLY missing critical location data:
            // - No cemetery name AND no gravesite pin (we don't know where they're buried)
            // - OR explicitly flagged as needing location
            if (searchMemorialIds.length > 0) {
                query = query.or(`needs_location.eq.true,needs_cemetery.eq.true,id.in.(${searchMemorialIds.join(',')})`);
            } else {
                // Show memorials that are genuinely missing location:
                // - No cemetery name (we don't know the cemetery) AND no gravesite pin
                // - Memorials WITH a cemetery name are considered "found" even without exact pin
                query = query.is('gravesite_lat', null).is('cemetery_name', null);
            }
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
                    // Calculate distance - prefer gravesite, fall back to cemetery coords
                    let distance = null;
                    const memLat = m.gravesite_lat || m.cemetery_lat;
                    const memLng = m.gravesite_lng || m.cemetery_lng;
                    if (memLat && memLng) {
                        distance = haversineDistance(userLat, userLng, memLat, memLng);
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
            hasLocation: !!(m.gravesite_lat || m.cemetery_lat),
            // needsCemetery: true if no cemetery name is set (regardless of database flag)
            // If cemetery_name exists, we know the cemetery
            needsCemetery: !m.cemetery_name,
            // needsPin: true if no exact gravesite GPS coordinates
            needsPin: !m.gravesite_lat,
            searchHints: m.search_hints,
            source: m.source,
            distance: m.distance ? Math.round(m.distance * 10) / 10 : null,
            isClaimedByUser: claimedByUser.has(m.id),
            createdAt: m.created_at
        }));

        // Get total count - memorials missing GPS coordinates (excluding Living Legacies)
        let totalCount = 0;

        if (searchMemorialIds.length > 0) {
            // Count flagged + active searches
            const { count: flaggedCount } = await supabase
                .from('memorials')
                .select('id', { count: 'exact', head: true })
                .neq('status', 'living_legacy')
                .or('needs_location.eq.true,needs_cemetery.eq.true');

            totalCount = flaggedCount || 0;

            // Add active searches count (exclude duplicates)
            const { count: searchOnlyCount } = await supabase
                .from('memorials')
                .select('id', { count: 'exact', head: true })
                .neq('status', 'living_legacy')
                .in('id', searchMemorialIds)
                .eq('needs_location', false)
                .eq('needs_cemetery', false);

            totalCount += searchOnlyCount || 0;
        } else {
            // Count memorials genuinely missing location (no cemetery AND no gravesite pin)
            const { count: missingGpsCount } = await supabase
                .from('memorials')
                .select('id', { count: 'exact', head: true })
                .neq('status', 'living_legacy')
                .is('gravesite_lat', null)
                .is('cemetery_name', null);

            totalCount = missingGpsCount || 0;
        }

        // Calculate nearby count if location provided
        let nearbyCount = 0;
        if (lat && lng) {
            nearbyCount = results.filter(m => m.distance !== null && m.distance <= parseFloat(radius)).length;
        }

        return res.status(200).json({
            success: true,
            total: totalCount,
            nearby: nearbyCount,
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
