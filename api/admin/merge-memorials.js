// api/admin/merge-memorials.js - Merge duplicate memorials into one
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
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

        const { keepId, mergeIds, mergedData } = req.body;

        if (!keepId || !mergeIds || !Array.isArray(mergeIds) || mergeIds.length === 0) {
            return res.status(400).json({ error: 'Invalid merge request. Need keepId and mergeIds array.' });
        }

        // Get the memorial we're keeping
        const { data: keepMemorial, error: keepError } = await supabase
            .from('memorials')
            .select('*')
            .eq('id', keepId)
            .single();

        if (keepError || !keepMemorial) {
            return res.status(404).json({ error: 'Primary memorial not found' });
        }

        // Get all memorials being merged
        const { data: mergeMemorials, error: mergeError } = await supabase
            .from('memorials')
            .select('*')
            .in('id', mergeIds);

        if (mergeError) {
            return res.status(500).json({ error: 'Failed to fetch merge memorials' });
        }

        // Build merged data - prefer provided data, then most complete existing data
        const finalData = buildMergedData(keepMemorial, mergeMemorials, mergedData);

        // Update the kept memorial with merged data
        const { error: updateError } = await supabase
            .from('memorials')
            .update({
                ...finalData,
                updated_at: new Date().toISOString()
            })
            .eq('id', keepId);

        if (updateError) {
            console.error('Update error:', updateError);
            return res.status(500).json({ error: 'Failed to update memorial' });
        }

        // Transfer all connections from merged memorials to the kept one
        for (const mergeId of mergeIds) {
            // Update connections where merged memorial is the source
            await supabase
                .from('memorial_connections')
                .update({ memorial_id: keepId })
                .eq('memorial_id', mergeId);

            // Update connections where merged memorial is the target
            await supabase
                .from('memorial_connections')
                .update({ connected_memorial_id: keepId })
                .eq('connected_memorial_id', mergeId);
        }

        // Delete duplicate connections (same source+target)
        // This is handled by unique constraint, but let's clean up any issues
        const { data: allConnections } = await supabase
            .from('memorial_connections')
            .select('id, memorial_id, connected_memorial_id, relationship_type')
            .or(`memorial_id.eq.${keepId},connected_memorial_id.eq.${keepId}`);

        if (allConnections) {
            const seen = new Map();
            const toDelete = [];

            for (const conn of allConnections) {
                const key = `${conn.memorial_id}-${conn.connected_memorial_id}-${conn.relationship_type}`;
                if (seen.has(key)) {
                    toDelete.push(conn.id);
                } else {
                    seen.set(key, conn.id);
                }
            }

            if (toDelete.length > 0) {
                await supabase
                    .from('memorial_connections')
                    .delete()
                    .in('id', toDelete);
            }
        }

        // Transfer timeline events
        for (const mergeId of mergeIds) {
            await supabase
                .from('memorial_timeline')
                .update({ memorial_id: keepId })
                .eq('memorial_id', mergeId);
        }

        // Transfer gallery photos
        for (const mergeId of mergeIds) {
            await supabase
                .from('memorial_photos')
                .update({ memorial_id: keepId })
                .eq('memorial_id', mergeId);
        }

        // Now delete the merged memorials
        const { error: deleteError } = await supabase
            .from('memorials')
            .delete()
            .in('id', mergeIds);

        if (deleteError) {
            console.error('Delete error:', deleteError);
            // Don't fail - the merge was successful, just cleanup failed
        }

        return res.status(200).json({
            success: true,
            keptId: keepId,
            mergedCount: mergeIds.length,
            deletedIds: mergeIds
        });

    } catch (error) {
        console.error('Merge error:', error);
        return res.status(500).json({ error: 'Failed to merge memorials' });
    }
}

function buildMergedData(keepMemorial, mergeMemorials, userOverrides = {}) {
    // Fields that can be merged (prefer non-null, longer, or user-selected)
    const mergeableFields = [
        'name',
        'birth_date',
        'death_date',
        'birth_place',
        'death_place',
        'cemetery_name',
        'cemetery_address',
        'cemetery_lat',
        'cemetery_lng',
        'gravesite_lat',
        'gravesite_lng',
        'gravesite_accuracy',
        'main_photo',
        'biography',
        'search_hints',
        'occupation',
        'maiden_name'
    ];

    const result = {};

    for (const field of mergeableFields) {
        // User override takes priority
        if (userOverrides[field] !== undefined && userOverrides[field] !== null) {
            result[field] = userOverrides[field];
            continue;
        }

        // Collect all non-null values
        const values = [keepMemorial[field], ...mergeMemorials.map(m => m[field])].filter(v => v != null && v !== '');

        if (values.length === 0) {
            continue; // All null, skip
        }

        if (values.length === 1) {
            result[field] = values[0];
            continue;
        }

        // For text fields, prefer longer content
        if (field === 'biography' || field === 'search_hints') {
            result[field] = values.reduce((a, b) => (a?.length || 0) > (b?.length || 0) ? a : b);
        } else {
            // For other fields, prefer the first non-null value (from most complete memorial)
            result[field] = values[0];
        }
    }

    // Merge array fields
    const curatorIds = new Set([
        ...(keepMemorial.curator_ids || []),
        ...mergeMemorials.flatMap(m => m.curator_ids || [])
    ]);
    if (curatorIds.size > 0) {
        result.curator_ids = Array.from(curatorIds);
    }

    // Clear the "needs" flags if we now have the data
    if (result.cemetery_name) {
        result.needs_cemetery = false;
    }
    if (result.gravesite_lat) {
        result.needs_location = false;
    }

    return result;
}
