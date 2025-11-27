// api/family/manage.js - Curator management of family members
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // Auth required
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const token = authHeader.split(' ')[1];
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
        return res.status(401).json({ error: 'Invalid token' });
    }

    try {
        if (req.method === 'POST') {
            // Add new family member
            const {
                memorialId,
                name,
                relationship,
                birthDate,
                deathDate,
                burialStatus,
                cemeteryName,
                cemeteryCity,
                cemeteryState,
                linkedMemorialId
            } = req.body;

            if (!memorialId || !name || !relationship) {
                return res.status(400).json({ error: 'Memorial ID, name, and relationship required' });
            }

            // Verify user is curator of memorial
            const { data: memorial } = await supabase
                .from('memorials')
                .select('curator_ids')
                .eq('id', memorialId)
                .single();

            if (!memorial || !memorial.curator_ids.includes(user.id)) {
                return res.status(403).json({ error: 'Not authorized to edit this memorial' });
            }

            // Create family member
            const { data: newMember, error } = await supabase
                .from('family_members')
                .insert({
                    memorial_id: memorialId,
                    name,
                    relationship,
                    birth_date: birthDate || null,
                    death_date: deathDate || null,
                    burial_status: burialStatus || 'unknown',
                    cemetery_name: cemeteryName || null,
                    cemetery_city: cemeteryCity || null,
                    cemetery_state: cemeteryState || null,
                    linked_memorial_id: linkedMemorialId || null,
                    needs_pin: burialStatus === 'same_cemetery' || burialStatus === 'nearby_cemetery',
                    created_by: user.id
                })
                .select()
                .single();

            if (error) {
                console.error('Error creating family member:', error);
                return res.status(500).json({ error: 'Failed to create family member' });
            }

            return res.status(201).json({
                success: true,
                familyMember: newMember
            });

        } else if (req.method === 'PUT') {
            // Update family member
            const {
                id,
                name,
                relationship,
                birthDate,
                deathDate,
                burialStatus,
                cemeteryName,
                cemeteryCity,
                cemeteryState,
                linkedMemorialId
            } = req.body;

            if (!id) {
                return res.status(400).json({ error: 'Family member ID required' });
            }

            // Get family member and verify curator access
            const { data: existing } = await supabase
                .from('family_members')
                .select('memorial_id')
                .eq('id', id)
                .single();

            if (!existing) {
                return res.status(404).json({ error: 'Family member not found' });
            }

            const { data: memorial } = await supabase
                .from('memorials')
                .select('curator_ids')
                .eq('id', existing.memorial_id)
                .single();

            if (!memorial || !memorial.curator_ids.includes(user.id)) {
                return res.status(403).json({ error: 'Not authorized' });
            }

            // Update
            const updateData = {
                updated_at: new Date().toISOString()
            };

            if (name !== undefined) updateData.name = name;
            if (relationship !== undefined) updateData.relationship = relationship;
            if (birthDate !== undefined) updateData.birth_date = birthDate || null;
            if (deathDate !== undefined) updateData.death_date = deathDate || null;
            if (burialStatus !== undefined) {
                updateData.burial_status = burialStatus;
                updateData.needs_pin = burialStatus === 'same_cemetery' || burialStatus === 'nearby_cemetery';
            }
            if (cemeteryName !== undefined) updateData.cemetery_name = cemeteryName || null;
            if (cemeteryCity !== undefined) updateData.cemetery_city = cemeteryCity || null;
            if (cemeteryState !== undefined) updateData.cemetery_state = cemeteryState || null;
            if (linkedMemorialId !== undefined) updateData.linked_memorial_id = linkedMemorialId || null;

            const { data: updated, error } = await supabase
                .from('family_members')
                .update(updateData)
                .eq('id', id)
                .select()
                .single();

            if (error) {
                console.error('Error updating family member:', error);
                return res.status(500).json({ error: 'Failed to update family member' });
            }

            return res.status(200).json({
                success: true,
                familyMember: updated
            });

        } else if (req.method === 'DELETE') {
            const { id } = req.body;

            if (!id) {
                return res.status(400).json({ error: 'Family member ID required' });
            }

            // Verify curator access
            const { data: existing } = await supabase
                .from('family_members')
                .select('memorial_id')
                .eq('id', id)
                .single();

            if (!existing) {
                return res.status(404).json({ error: 'Family member not found' });
            }

            const { data: memorial } = await supabase
                .from('memorials')
                .select('curator_ids')
                .eq('id', existing.memorial_id)
                .single();

            if (!memorial || !memorial.curator_ids.includes(user.id)) {
                return res.status(403).json({ error: 'Not authorized' });
            }

            const { error } = await supabase
                .from('family_members')
                .delete()
                .eq('id', id);

            if (error) {
                console.error('Error deleting family member:', error);
                return res.status(500).json({ error: 'Failed to delete family member' });
            }

            return res.status(200).json({
                success: true,
                message: 'Family member removed'
            });

        } else {
            return res.status(405).json({ error: 'Method not allowed' });
        }

    } catch (error) {
        console.error('Family manage error:', error);
        return res.status(500).json({ error: 'Server error' });
    }
}
