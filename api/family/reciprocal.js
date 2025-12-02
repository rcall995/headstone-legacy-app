// api/family/reciprocal.js - Auto-create reciprocal family relationships
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Common name lists for gender inference
const maleNames = ['fred', 'norman', 'robert', 'james', 'john', 'william', 'michael', 'david', 'richard', 'joseph', 'thomas', 'charles', 'daniel', 'matthew', 'anthony', 'mark', 'donald', 'steven', 'paul', 'andrew', 'joshua', 'kenneth', 'kevin', 'brian', 'george', 'timothy', 'ronald', 'edward', 'jason', 'jeffrey', 'ryan', 'jacob', 'gary', 'nicholas', 'eric', 'frank', 'jack', 'henry', 'peter', 'albert', 'joe', 'bobby'];
const femaleNames = ['dorothy', 'mary', 'patricia', 'jennifer', 'linda', 'barbara', 'elizabeth', 'susan', 'jessica', 'sarah', 'karen', 'lisa', 'nancy', 'betty', 'margaret', 'sandra', 'ashley', 'anna', 'emma', 'helen', 'ruth', 'marie', 'rose', 'jeanette', 'antoinette', 'alice', 'joan', 'martha', 'grace', 'diane'];

function inferGender(name) {
    const firstName = (name || '').toLowerCase().split(' ')[0].replace(/[^a-z]/g, '');
    if (maleNames.includes(firstName)) return 'male';
    if (femaleNames.includes(firstName)) return 'female';
    return null;
}

// Gender-aware reciprocal mappings
const reciprocalMap = {
    'spouse': { male: 'Spouse', female: 'Spouse', default: 'Spouse' },
    'husband': { male: 'Spouse', female: 'Spouse', default: 'Spouse' },
    'wife': { male: 'Spouse', female: 'Spouse', default: 'Spouse' },
    'parent': { male: 'Son', female: 'Daughter', default: 'Child' },
    'father': { male: 'Son', female: 'Daughter', default: 'Child' },
    'mother': { male: 'Son', female: 'Daughter', default: 'Child' },
    'son': { male: 'Father', female: 'Mother', default: 'Parent' },
    'daughter': { male: 'Father', female: 'Mother', default: 'Parent' },
    'child': { male: 'Father', female: 'Mother', default: 'Parent' },
    'sibling': { male: 'Brother', female: 'Sister', default: 'Sibling' },
    'brother': { male: 'Brother', female: 'Sister', default: 'Sibling' },
    'sister': { male: 'Brother', female: 'Sister', default: 'Sibling' },
    'grandparent': { male: 'Grandson', female: 'Granddaughter', default: 'Grandchild' },
    'grandfather': { male: 'Grandson', female: 'Granddaughter', default: 'Grandchild' },
    'grandmother': { male: 'Grandson', female: 'Granddaughter', default: 'Grandchild' },
    'grandchild': { male: 'Grandfather', female: 'Grandmother', default: 'Grandparent' },
    'grandson': { male: 'Grandfather', female: 'Grandmother', default: 'Grandparent' },
    'granddaughter': { male: 'Grandfather', female: 'Grandmother', default: 'Grandparent' },
    'uncle': { male: 'Nephew', female: 'Niece', default: 'Nephew/Niece' },
    'aunt': { male: 'Nephew', female: 'Niece', default: 'Nephew/Niece' },
    'niece': { male: 'Uncle', female: 'Aunt', default: 'Uncle/Aunt' },
    'nephew': { male: 'Uncle', female: 'Aunt', default: 'Uncle/Aunt' },
    'cousin': { male: 'Cousin', female: 'Cousin', default: 'Cousin' },
    // In-law relationships
    'father-in-law': { male: 'Son-in-law', female: 'Daughter-in-law', default: 'Child-in-law' },
    'mother-in-law': { male: 'Son-in-law', female: 'Daughter-in-law', default: 'Child-in-law' },
    'parent-in-law': { male: 'Son-in-law', female: 'Daughter-in-law', default: 'Child-in-law' },
    'son-in-law': { male: 'Father-in-law', female: 'Mother-in-law', default: 'Parent-in-law' },
    'daughter-in-law': { male: 'Father-in-law', female: 'Mother-in-law', default: 'Parent-in-law' },
    'child-in-law': { male: 'Father-in-law', female: 'Mother-in-law', default: 'Parent-in-law' },
    'brother-in-law': { male: 'Brother-in-law', female: 'Sister-in-law', default: 'Sibling-in-law' },
    'sister-in-law': { male: 'Brother-in-law', female: 'Sister-in-law', default: 'Sibling-in-law' },
    'sibling-in-law': { male: 'Brother-in-law', female: 'Sister-in-law', default: 'Sibling-in-law' }
};

function getReciprocal(relationship, sourceName = '') {
    const lower = (relationship || '').toLowerCase();
    const mapping = reciprocalMap[lower];

    if (mapping) {
        const gender = inferGender(sourceName);
        if (gender === 'male') return mapping.male;
        if (gender === 'female') return mapping.female;
        return mapping.default;
    }
    return relationship;
}

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

    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const token = authHeader.split(' ')[1];
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
        return res.status(401).json({ error: 'Invalid token' });
    }

    const { action } = req.body;

    try {
        if (action === 'create_reciprocal') {
            // Create reciprocal relationship on target memorial
            const { sourceMemorialId, sourceMemorialName, targetMemorialId, relationship } = req.body;

            if (!sourceMemorialId || !targetMemorialId || !relationship) {
                return res.status(400).json({ error: 'Missing required fields' });
            }

            // Get target memorial
            const { data: targetMemorial, error: targetError } = await supabase
                .from('memorials')
                .select('id, name, relatives, curator_ids')
                .eq('id', targetMemorialId)
                .single();

            if (targetError || !targetMemorial) {
                return res.status(404).json({ error: 'Target memorial not found' });
            }

            // Get source memorial name if not provided
            let sourceName = sourceMemorialName;
            if (!sourceName) {
                const { data: sourceMemorial } = await supabase
                    .from('memorials')
                    .select('name')
                    .eq('id', sourceMemorialId)
                    .single();
                sourceName = sourceMemorial?.name || 'Unknown';
            }

            // Get the correct reciprocal relationship (gender-aware based on source name)
            const reciprocalRelationship = getReciprocal(relationship, sourceName);
            console.log(`Creating reciprocal: ${relationship} -> ${reciprocalRelationship}`);

            // Check if reciprocal already exists
            const existingRelatives = targetMemorial.relatives || [];
            const existingIndex = existingRelatives.findIndex(r => r.memorialId === sourceMemorialId);

            let updatedRelatives;
            let action_taken;

            if (existingIndex >= 0) {
                // Link exists - check if relationship is correct
                const existingRel = existingRelatives[existingIndex];
                if (existingRel.relationship === reciprocalRelationship) {
                    return res.status(200).json({
                        success: true,
                        message: 'Reciprocal already exists with correct relationship',
                        alreadyExists: true
                    });
                }
                // Wrong relationship - update it
                console.log(`Updating wrong relationship: ${existingRel.relationship} -> ${reciprocalRelationship}`);
                updatedRelatives = [...existingRelatives];
                updatedRelatives[existingIndex] = {
                    ...existingRel,
                    relationship: reciprocalRelationship,
                    name: sourceName // Also update name in case it changed
                };
                action_taken = 'updated';
            } else {
                // Create new reciprocal
                const newRelative = {
                    name: sourceName,
                    relationship: reciprocalRelationship,
                    memorialId: sourceMemorialId,
                    dates: ''
                };
                updatedRelatives = [...existingRelatives, newRelative];
                action_taken = 'created';
            }

            const { error: updateError } = await supabase
                .from('memorials')
                .update({ relatives: updatedRelatives })
                .eq('id', targetMemorialId);

            if (updateError) {
                console.error('Error creating reciprocal:', updateError);
                return res.status(500).json({ error: 'Failed to create reciprocal' });
            }

            const actionVerb = action_taken === 'updated' ? 'Updated' : 'Added';
            return res.status(200).json({
                success: true,
                message: `${actionVerb} ${sourceName} as ${reciprocalRelationship} to ${targetMemorial.name}`,
                reciprocal: { name: sourceName, relationship: reciprocalRelationship, memorialId: sourceMemorialId },
                action: action_taken
            });

        } else if (action === 'discover_family') {
            // Discover family members from a linked memorial (spouse, children, parents)
            const { memorialId, relationship } = req.body;

            if (!memorialId) {
                return res.status(400).json({ error: 'Memorial ID required' });
            }

            // Get the memorial with its relatives
            const { data: memorial, error } = await supabase
                .from('memorials')
                .select('id, name, relatives')
                .eq('id', memorialId)
                .single();

            if (error || !memorial) {
                return res.status(404).json({ error: 'Memorial not found' });
            }

            const relatives = memorial.relatives || [];
            const discovered = {
                spouse: null,
                children: [],
                parents: [],
                siblings: [],
                grandparents: [],
                grandchildren: [],
                unclesAunts: [],
                nephewsNieces: []
            };

            // Find spouse
            const spouseRel = relatives.find(r =>
                r.relationship === 'Spouse' && r.memorialId
            );
            if (spouseRel) {
                const { data: spouseMemorial } = await supabase
                    .from('memorials')
                    .select('id, name, birth_date, death_date')
                    .eq('id', spouseRel.memorialId)
                    .single();
                if (spouseMemorial) {
                    discovered.spouse = {
                        memorialId: spouseMemorial.id,
                        name: spouseMemorial.name,
                        dates: spouseMemorial.birth_date || spouseMemorial.death_date
                            ? `${spouseMemorial.birth_date || '?'} - ${spouseMemorial.death_date || '?'}`
                            : ''
                    };
                }
            }

            // Find children (if we're linking as a parent, these would be siblings)
            const childRels = relatives.filter(r =>
                ['Son', 'Daughter', 'Child'].includes(r.relationship)
            );
            for (const childRel of childRels) {
                if (childRel.memorialId) {
                    const { data: childMemorial } = await supabase
                        .from('memorials')
                        .select('id, name, birth_date, death_date')
                        .eq('id', childRel.memorialId)
                        .single();
                    if (childMemorial) {
                        discovered.children.push({
                            memorialId: childMemorial.id,
                            name: childMemorial.name,
                            relationship: childRel.relationship,
                            dates: childMemorial.birth_date || childMemorial.death_date
                                ? `${childMemorial.birth_date || '?'} - ${childMemorial.death_date || '?'}`
                                : ''
                        });
                    }
                } else if (childRel.name) {
                    // Child without memorial (just name)
                    discovered.children.push({
                        name: childRel.name,
                        relationship: childRel.relationship,
                        dates: childRel.dates || ''
                    });
                }
            }

            // Also check Known Family Members (family_members table) for children
            const { data: familyMembers } = await supabase
                .from('family_members')
                .select('id, name, relationship, birth_date, death_date, linked_memorial_id')
                .eq('memorial_id', memorialId)
                .in('relationship', ['Son', 'Daughter', 'Child']);

            if (familyMembers) {
                for (const fm of familyMembers) {
                    // Don't duplicate if already in children list
                    const alreadyIncluded = discovered.children.some(c =>
                        c.name.toLowerCase() === fm.name.toLowerCase()
                    );
                    if (!alreadyIncluded) {
                        discovered.children.push({
                            familyMemberId: fm.id,
                            memorialId: fm.linked_memorial_id,
                            name: fm.name,
                            relationship: fm.relationship,
                            dates: fm.birth_date || fm.death_date
                                ? `${fm.birth_date || '?'} - ${fm.death_date || '?'}`
                                : ''
                        });
                    }
                }
            }

            // Find parents
            const parentRels = relatives.filter(r =>
                ['Parent', 'Father', 'Mother'].includes(r.relationship)
            );
            for (const parentRel of parentRels) {
                if (parentRel.memorialId) {
                    const { data: parentMemorial } = await supabase
                        .from('memorials')
                        .select('id, name')
                        .eq('id', parentRel.memorialId)
                        .single();
                    if (parentMemorial) {
                        discovered.parents.push({
                            memorialId: parentMemorial.id,
                            name: parentMemorial.name,
                            relationship: parentRel.relationship
                        });
                    }
                }
            }

            // Find siblings
            const siblingRels = relatives.filter(r =>
                ['Sibling', 'Brother', 'Sister'].includes(r.relationship)
            );
            for (const sibRel of siblingRels) {
                if (sibRel.memorialId) {
                    const { data: sibMemorial } = await supabase
                        .from('memorials')
                        .select('id, name')
                        .eq('id', sibRel.memorialId)
                        .single();
                    if (sibMemorial) {
                        discovered.siblings.push({
                            memorialId: sibMemorial.id,
                            name: sibMemorial.name,
                            relationship: sibRel.relationship
                        });
                    }
                }
            }

            // Find grandparents
            const grandparentRels = relatives.filter(r =>
                ['Grandparent', 'Grandfather', 'Grandmother'].includes(r.relationship)
            );
            for (const gpRel of grandparentRels) {
                if (gpRel.memorialId) {
                    const { data: gpMemorial } = await supabase
                        .from('memorials')
                        .select('id, name')
                        .eq('id', gpRel.memorialId)
                        .single();
                    if (gpMemorial) {
                        discovered.grandparents.push({
                            memorialId: gpMemorial.id,
                            name: gpMemorial.name,
                            relationship: gpRel.relationship
                        });
                    }
                }
            }

            // Find grandchildren
            const grandchildRels = relatives.filter(r =>
                ['Grandchild', 'Grandson', 'Granddaughter'].includes(r.relationship)
            );
            for (const gcRel of grandchildRels) {
                if (gcRel.memorialId) {
                    const { data: gcMemorial } = await supabase
                        .from('memorials')
                        .select('id, name')
                        .eq('id', gcRel.memorialId)
                        .single();
                    if (gcMemorial) {
                        discovered.grandchildren.push({
                            memorialId: gcMemorial.id,
                            name: gcMemorial.name,
                            relationship: gcRel.relationship
                        });
                    }
                }
            }

            // Find uncles/aunts
            const uncleAuntRels = relatives.filter(r =>
                ['Uncle', 'Aunt'].includes(r.relationship)
            );
            for (const uaRel of uncleAuntRels) {
                if (uaRel.memorialId) {
                    const { data: uaMemorial } = await supabase
                        .from('memorials')
                        .select('id, name')
                        .eq('id', uaRel.memorialId)
                        .single();
                    if (uaMemorial) {
                        discovered.unclesAunts.push({
                            memorialId: uaMemorial.id,
                            name: uaMemorial.name,
                            relationship: uaRel.relationship
                        });
                    }
                }
            }

            // Find nephews/nieces
            const nephewNieceRels = relatives.filter(r =>
                ['Nephew', 'Niece'].includes(r.relationship)
            );
            for (const nnRel of nephewNieceRels) {
                if (nnRel.memorialId) {
                    const { data: nnMemorial } = await supabase
                        .from('memorials')
                        .select('id, name')
                        .eq('id', nnRel.memorialId)
                        .single();
                    if (nnMemorial) {
                        discovered.nephewsNieces.push({
                            memorialId: nnMemorial.id,
                            name: nnMemorial.name,
                            relationship: nnRel.relationship
                        });
                    }
                }
            }

            return res.status(200).json({
                success: true,
                memorial: { id: memorial.id, name: memorial.name },
                discovered
            });

        } else if (action === 'batch_create_connections') {
            // Create multiple connections at once (for suggested family connections)
            const { connections } = req.body;

            if (!connections || !Array.isArray(connections) || connections.length === 0) {
                return res.status(400).json({ error: 'Connections array required' });
            }

            const results = [];

            for (const conn of connections) {
                const { sourceMemorialId, targetMemorialId, relationshipToTarget, relationshipToSource } = conn;

                if (!sourceMemorialId || !targetMemorialId || !relationshipToTarget) {
                    results.push({ success: false, error: 'Missing required fields', conn });
                    continue;
                }

                try {
                    // Get both memorials
                    const { data: sourceMemorial } = await supabase
                        .from('memorials')
                        .select('id, name, relatives')
                        .eq('id', sourceMemorialId)
                        .single();

                    const { data: targetMemorial } = await supabase
                        .from('memorials')
                        .select('id, name, relatives')
                        .eq('id', targetMemorialId)
                        .single();

                    if (!sourceMemorial || !targetMemorial) {
                        results.push({ success: false, error: 'Memorial not found', conn });
                        continue;
                    }

                    // Add relationship from source to target (if not already exists)
                    let sourceRelatives = sourceMemorial.relatives || [];
                    const existsOnSource = sourceRelatives.some(r => r.memorialId === targetMemorialId);

                    if (!existsOnSource) {
                        sourceRelatives.push({
                            name: targetMemorial.name,
                            relationship: relationshipToTarget,
                            memorialId: targetMemorialId,
                            dates: ''
                        });

                        await supabase
                            .from('memorials')
                            .update({ relatives: sourceRelatives })
                            .eq('id', sourceMemorialId);
                    }

                    // Add reciprocal from target to source
                    // Always compute reciprocal server-side for accuracy
                    const computedReciprocal = getReciprocal(relationshipToTarget, sourceMemorial.name);
                    const finalReciprocalRelationship = computedReciprocal || relationshipToSource || relationshipToTarget;

                    let targetRelatives = targetMemorial.relatives || [];
                    const existsOnTarget = targetRelatives.some(r => r.memorialId === sourceMemorialId);

                    if (!existsOnTarget) {
                        targetRelatives.push({
                            name: sourceMemorial.name,
                            relationship: finalReciprocalRelationship,
                            memorialId: sourceMemorialId,
                            dates: ''
                        });

                        await supabase
                            .from('memorials')
                            .update({ relatives: targetRelatives })
                            .eq('id', targetMemorialId);
                    }

                    // Also update memorial_connections table for Family Tree RPC
                    // Source -> Target connection
                    const { data: existingConn1 } = await supabase
                        .from('memorial_connections')
                        .select('id')
                        .eq('memorial_id', sourceMemorialId)
                        .eq('connected_memorial_id', targetMemorialId)
                        .single();

                    if (existingConn1) {
                        await supabase
                            .from('memorial_connections')
                            .update({ relationship_label: relationshipToTarget, relationship_type: 'other' })
                            .eq('id', existingConn1.id);
                    } else {
                        await supabase
                            .from('memorial_connections')
                            .insert({
                                memorial_id: sourceMemorialId,
                                connected_memorial_id: targetMemorialId,
                                relationship_type: 'other',
                                relationship_label: relationshipToTarget
                            });
                    }

                    // Target -> Source connection (reciprocal)
                    const { data: existingConn2 } = await supabase
                        .from('memorial_connections')
                        .select('id')
                        .eq('memorial_id', targetMemorialId)
                        .eq('connected_memorial_id', sourceMemorialId)
                        .single();

                    if (existingConn2) {
                        await supabase
                            .from('memorial_connections')
                            .update({ relationship_label: finalReciprocalRelationship, relationship_type: 'other' })
                            .eq('id', existingConn2.id);
                    } else {
                        await supabase
                            .from('memorial_connections')
                            .insert({
                                memorial_id: targetMemorialId,
                                connected_memorial_id: sourceMemorialId,
                                relationship_type: 'other',
                                relationship_label: finalReciprocalRelationship
                            });
                    }

                    results.push({
                        success: true,
                        source: sourceMemorial.name,
                        target: targetMemorial.name,
                        relationshipToTarget,
                        relationshipToSource: finalReciprocalRelationship
                    });

                } catch (err) {
                    console.error('Error creating connection:', err);
                    results.push({ success: false, error: err.message, conn });
                }
            }

            const successCount = results.filter(r => r.success).length;
            return res.status(200).json({
                success: true,
                message: `Created ${successCount} of ${connections.length} connections`,
                results
            });

        } else {
            return res.status(400).json({ error: 'Invalid action' });
        }

    } catch (error) {
        console.error('Reciprocal API error:', error);
        return res.status(500).json({ error: 'Server error' });
    }
}
