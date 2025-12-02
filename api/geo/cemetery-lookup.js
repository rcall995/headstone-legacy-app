// api/geo/cemetery-lookup.js - Look up cemetery info from existing memorials
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
        const { name, city, state } = req.query;

        if (!name || name.trim().length < 2) {
            return res.status(400).json({ error: 'Cemetery name required (min 2 characters)' });
        }

        const searchName = name.trim().toLowerCase();

        // Search for memorials with matching cemetery name that have address/coordinates
        let query = supabase
            .from('memorials')
            .select(`
                cemetery_name,
                cemetery_address,
                cemetery_lat,
                cemetery_lng
            `)
            .not('cemetery_name', 'is', null)
            .or(`cemetery_address.not.is.null,cemetery_lat.not.is.null`);

        const { data: memorials, error } = await query;

        if (error) {
            console.error('Cemetery lookup query error:', error);
            return res.status(500).json({ error: 'Failed to search cemeteries' });
        }

        // Filter by cemetery name match (case-insensitive)
        // and optionally by city/state if provided
        const matches = memorials.filter(m => {
            if (!m.cemetery_name) return false;

            const cemeteryLower = m.cemetery_name.toLowerCase();

            // Check if names match (fuzzy - contains or similar)
            const nameMatch = cemeteryLower.includes(searchName) ||
                              searchName.includes(cemeteryLower) ||
                              levenshteinSimilarity(cemeteryLower, searchName) > 0.7;

            if (!nameMatch) return false;

            // If city/state provided, check address contains them
            if (city || state) {
                const address = (m.cemetery_address || '').toLowerCase();
                if (city && !address.includes(city.toLowerCase())) return false;
                if (state && !address.includes(state.toLowerCase())) return false;
            }

            return true;
        });

        if (matches.length === 0) {
            return res.status(200).json({
                found: false,
                message: 'No matching cemetery found'
            });
        }

        // Group by cemetery name to get unique cemeteries
        const cemeteryMap = new Map();

        for (const m of matches) {
            const key = m.cemetery_name.toLowerCase();

            if (!cemeteryMap.has(key)) {
                cemeteryMap.set(key, {
                    name: m.cemetery_name,
                    address: m.cemetery_address,
                    lat: m.cemetery_lat,
                    lng: m.cemetery_lng,
                    count: 1
                });
            } else {
                const existing = cemeteryMap.get(key);
                existing.count++;

                // Prefer entries with more complete data
                if (!existing.address && m.cemetery_address) {
                    existing.address = m.cemetery_address;
                }
                if (!existing.lat && m.cemetery_lat) {
                    existing.lat = m.cemetery_lat;
                    existing.lng = m.cemetery_lng;
                }
            }
        }

        // Convert to array and sort by count (most memorials first)
        const cemeteries = Array.from(cemeteryMap.values())
            .sort((a, b) => b.count - a.count);

        // Return best match
        const bestMatch = cemeteries[0];

        return res.status(200).json({
            found: true,
            cemetery: {
                name: bestMatch.name,
                address: bestMatch.address,
                lat: bestMatch.lat,
                lng: bestMatch.lng,
                memorialCount: bestMatch.count
            },
            alternatives: cemeteries.length > 1 ? cemeteries.slice(1, 5) : []
        });

    } catch (error) {
        console.error('Cemetery lookup error:', error);
        return res.status(500).json({ error: 'Failed to lookup cemetery' });
    }
}

// Simple Levenshtein distance similarity (0-1)
function levenshteinSimilarity(s1, s2) {
    const longer = s1.length > s2.length ? s1 : s2;
    const shorter = s1.length > s2.length ? s2 : s1;

    if (longer.length === 0) return 1.0;

    const distance = levenshteinDistance(longer, shorter);
    return (longer.length - distance) / longer.length;
}

function levenshteinDistance(s1, s2) {
    const costs = [];
    for (let i = 0; i <= s1.length; i++) {
        let lastValue = i;
        for (let j = 0; j <= s2.length; j++) {
            if (i === 0) {
                costs[j] = j;
            } else if (j > 0) {
                let newValue = costs[j - 1];
                if (s1.charAt(i - 1) !== s2.charAt(j - 1)) {
                    newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
                }
                costs[j - 1] = lastValue;
                lastValue = newValue;
            }
        }
        if (i > 0) costs[s2.length] = lastValue;
    }
    return costs[s2.length];
}
