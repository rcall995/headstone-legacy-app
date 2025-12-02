// api/admin/find-duplicates.js - Find potential duplicate memorials
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
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
        // Auth check
        const authHeader = req.headers.authorization;
        if (!authHeader?.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const token = authHeader.split(' ')[1];
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);

        if (authError || !user) {
            return res.status(401).json({ error: 'Invalid token' });
        }

        // Get all memorials
        const { data: memorials, error } = await supabase
            .from('memorials')
            .select(`
                id,
                name,
                birth_date,
                death_date,
                birth_place,
                death_place,
                cemetery_name,
                cemetery_address,
                gravesite_lat,
                gravesite_lng,
                main_photo,
                biography,
                source,
                created_at,
                status
            `)
            .order('name');

        if (error) {
            console.error('Query error:', error);
            return res.status(500).json({ error: 'Failed to fetch memorials' });
        }

        // Find duplicates
        const duplicateGroups = findDuplicates(memorials);

        return res.status(200).json({
            success: true,
            totalMemorials: memorials.length,
            duplicateGroups: duplicateGroups.length,
            groups: duplicateGroups
        });

    } catch (error) {
        console.error('Find duplicates error:', error);
        return res.status(500).json({ error: 'Failed to find duplicates' });
    }
}

function findDuplicates(memorials) {
    const groups = [];
    const processed = new Set();

    // Normalize name for comparison
    const normalizeName = (name) => {
        if (!name) return '';
        return name.toLowerCase()
            .replace(/[^a-z\s]/g, '')
            .replace(/\s+/g, ' ')
            .trim();
    };

    // Calculate similarity score
    const nameSimilarity = (s1, s2) => {
        const n1 = normalizeName(s1);
        const n2 = normalizeName(s2);
        if (!n1 || !n2) return 0;
        if (n1 === n2) return 1;

        // Check if one contains the other
        if (n1.includes(n2) || n2.includes(n1)) return 0.85;

        // Check word overlap
        const words1 = n1.split(' ').filter(w => w.length > 1);
        const words2 = n2.split(' ').filter(w => w.length > 1);
        const overlap = words1.filter(w => words2.includes(w)).length;
        const maxWords = Math.max(words1.length, words2.length);
        if (maxWords === 0) return 0;
        return overlap / maxWords;
    };

    // Extract year from date string
    const getYear = (dateStr) => {
        if (!dateStr) return null;
        const match = dateStr.match(/\d{4}/);
        return match ? parseInt(match[0], 10) : null;
    };

    // Compare two memorials
    const arePotentialDuplicates = (m1, m2) => {
        const nameSim = nameSimilarity(m1.name, m2.name);
        if (nameSim < 0.7) return { isDuplicate: false };

        const birth1 = getYear(m1.birth_date);
        const birth2 = getYear(m2.birth_date);
        const death1 = getYear(m1.death_date);
        const death2 = getYear(m2.death_date);

        let dateScore = 0;
        let reasons = [];

        if (nameSim >= 0.95) {
            reasons.push('Exact name match');
        } else if (nameSim >= 0.85) {
            reasons.push('Very similar name');
        } else {
            reasons.push('Similar name');
        }

        if (birth1 && birth2 && birth1 === birth2) {
            dateScore += 0.5;
            reasons.push('Same birth year');
        }

        if (death1 && death2 && death1 === death2) {
            dateScore += 0.5;
            reasons.push('Same death year');
        }

        // High confidence if exact name OR (similar name + matching dates)
        const score = (nameSim * 0.6) + (dateScore * 0.4);
        const isDuplicate = nameSim >= 0.95 || (nameSim >= 0.7 && dateScore > 0) || score >= 0.7;

        return {
            isDuplicate,
            score: Math.round(score * 100),
            reasons
        };
    };

    // Calculate completeness score for a memorial
    const getCompleteness = (m) => {
        let score = 0;
        if (m.name) score += 10;
        if (m.birth_date) score += 10;
        if (m.death_date) score += 10;
        if (m.birth_place) score += 10;
        if (m.death_place) score += 10;
        if (m.cemetery_name) score += 10;
        if (m.cemetery_address) score += 5;
        if (m.gravesite_lat) score += 15;
        if (m.main_photo) score += 10;
        if (m.biography && m.biography.length > 50) score += 10;
        return score;
    };

    // Find all duplicate groups
    for (let i = 0; i < memorials.length; i++) {
        if (processed.has(memorials[i].id)) continue;

        const group = [memorials[i]];
        processed.add(memorials[i].id);

        for (let j = i + 1; j < memorials.length; j++) {
            if (processed.has(memorials[j].id)) continue;

            const result = arePotentialDuplicates(memorials[i], memorials[j]);
            if (result.isDuplicate) {
                group.push({
                    ...memorials[j],
                    matchScore: result.score,
                    matchReasons: result.reasons
                });
                processed.add(memorials[j].id);
            }
        }

        if (group.length > 1) {
            // Sort by completeness (most complete first)
            group.sort((a, b) => getCompleteness(b) - getCompleteness(a));

            // Add completeness scores
            const groupWithScores = group.map(m => ({
                ...m,
                completeness: getCompleteness(m)
            }));

            groups.push({
                primaryId: groupWithScores[0].id,
                memorials: groupWithScores
            });
        }
    }

    // Sort groups by number of duplicates (most first)
    groups.sort((a, b) => b.memorials.length - a.memorials.length);

    return groups;
}
