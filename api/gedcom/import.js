// api/gedcom/import.js - Import parsed GEDCOM data, create memorials
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

function generateSlug(name, gedcomId) {
    const slug = (name || 'unknown')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
    const hash = (gedcomId || Math.random().toString(36))
        .replace(/[@]/g, '')
        .substring(0, 6);
    return `${slug}-${hash}`;
}

export default async function handler(req, res) {
    // CORS
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
        // Auth
        const authHeader = req.headers.authorization;
        if (!authHeader?.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const token = authHeader.split(' ')[1];
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);

        if (authError || !user) {
            return res.status(401).json({ error: 'Invalid token' });
        }

        const { fileName, memorials, selectedIds } = req.body;

        if (!memorials || !Array.isArray(memorials)) {
            return res.status(400).json({ error: 'No memorial data provided' });
        }

        // Filter to selected individuals if provided
        const toImport = selectedIds
            ? memorials.filter(m => selectedIds.includes(m.gedcomId))
            : memorials;

        if (toImport.length === 0) {
            return res.status(400).json({ error: 'No individuals selected for import' });
        }

        // Create import record
        const { data: importRecord, error: importError } = await supabase
            .from('gedcom_imports')
            .insert({
                user_id: user.id,
                file_name: fileName || 'unknown.ged',
                individuals_count: memorials.length,
                families_count: 0,
                status: 'processing'
            })
            .select()
            .single();

        if (importError) {
            console.error('Import record error:', importError);
            return res.status(500).json({ error: 'Failed to create import record' });
        }

        const importId = importRecord.id;

        // Map gedcomId to memorial ID for relationship linking
        const gedcomToMemorialId = new Map();
        const createdMemorials = [];
        const errors = [];

        // First pass: Create all memorials
        for (const memorial of toImport) {
            try {
                const memorialId = generateSlug(memorial.name, memorial.gedcomId);
                gedcomToMemorialId.set(memorial.gedcomId, memorialId);

                // Determine what's needed
                const needsCemetery = !memorial.burialPlace;
                const needsLocation = true; // All imported memorials need GPS

                // Prepare memorial data
                const memorialData = {
                    id: memorialId,
                    name: memorial.name || 'Unknown',
                    birth_date: memorial.birthDate,
                    death_date: memorial.deathDate,
                    cemetery_name: memorial.burialPlace || memorial.deathPlace || null,
                    status: 'draft',
                    source: 'gedcom',
                    gedcom_import_id: importId,
                    gedcom_id: memorial.gedcomId,
                    needs_location: needsLocation,
                    needs_cemetery: needsCemetery,
                    search_hints: memorial.birthPlace ? `Born in ${memorial.birthPlace}` : null,
                    imported_by: user.id,
                    curator_ids: [user.id]
                };

                const { data: created, error: createError } = await supabase
                    .from('memorials')
                    .insert(memorialData)
                    .select()
                    .single();

                if (createError) {
                    // Handle duplicate ID - try with different suffix
                    if (createError.code === '23505') {
                        memorialData.id = generateSlug(memorial.name, memorial.gedcomId + Date.now());
                        gedcomToMemorialId.set(memorial.gedcomId, memorialData.id);

                        const { data: retryCreated, error: retryError } = await supabase
                            .from('memorials')
                            .insert(memorialData)
                            .select()
                            .single();

                        if (retryError) {
                            errors.push({ gedcomId: memorial.gedcomId, name: memorial.name, error: retryError.message });
                            continue;
                        }
                        createdMemorials.push(retryCreated);
                    } else {
                        errors.push({ gedcomId: memorial.gedcomId, name: memorial.name, error: createError.message });
                        continue;
                    }
                } else {
                    createdMemorials.push(created);
                }
            } catch (err) {
                errors.push({ gedcomId: memorial.gedcomId, name: memorial.name, error: err.message });
            }
        }

        // Second pass: Create relationships
        let connectionsCreated = 0;
        for (const memorial of toImport) {
            if (!memorial.relationships || memorial.relationships.length === 0) continue;

            const sourceMemorialId = gedcomToMemorialId.get(memorial.gedcomId);
            if (!sourceMemorialId) continue;

            for (const rel of memorial.relationships) {
                const targetMemorialId = gedcomToMemorialId.get(rel.gedcomId);
                if (!targetMemorialId) continue;

                // Map relationship type
                let relationshipType = rel.type;
                if (rel.type === 'parent') relationshipType = 'parent';
                else if (rel.type === 'child') relationshipType = 'child';
                else if (rel.type === 'spouse') relationshipType = 'spouse';
                else if (rel.type === 'sibling') relationshipType = 'sibling';

                try {
                    const { error: connError } = await supabase
                        .from('memorial_connections')
                        .insert({
                            memorial_id: sourceMemorialId,
                            connected_memorial_id: targetMemorialId,
                            relationship_type: relationshipType,
                            relationship_label: rel.label || null,
                            created_by: user.id
                        });

                    if (!connError) {
                        connectionsCreated++;
                    }
                } catch (connErr) {
                    // Ignore duplicate connections
                }
            }
        }

        // Update import record
        await supabase
            .from('gedcom_imports')
            .update({
                memorials_created: createdMemorials.length,
                connections_created: connectionsCreated,
                status: errors.length === 0 ? 'completed' : 'partial',
                completed_at: new Date().toISOString()
            })
            .eq('id', importId);

        return res.status(200).json({
            success: true,
            importId,
            stats: {
                requested: toImport.length,
                created: createdMemorials.length,
                connections: connectionsCreated,
                errors: errors.length
            },
            errors: errors.length > 0 ? errors : undefined,
            memorials: createdMemorials.map(m => ({
                id: m.id,
                name: m.name,
                needsLocation: m.needs_location,
                needsCemetery: m.needs_cemetery
            }))
        });

    } catch (error) {
        console.error('GEDCOM import error:', error);
        return res.status(500).json({ error: 'Failed to import GEDCOM data', details: error.message });
    }
}
