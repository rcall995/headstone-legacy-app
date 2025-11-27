// api/scouts/submit-location.js - Scout submits found grave location
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Point values for wanted graves (2.5x bonus)
const POINT_VALUES = {
    WANTED_PIN: 25,
    WANTED_PHOTO: 40,
    WANTED_PIN_WITH_PHOTO: 75,
    CEMETERY_IDENTIFICATION: 20
};

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

        const {
            memorialId,
            cemeteryName,
            cemeteryAddress,
            cemeteryLat,
            cemeteryLng,
            gravesiteLat,
            gravesiteLng,
            gravesiteAccuracy,
            photoUrl
        } = req.body;

        if (!memorialId) {
            return res.status(400).json({ error: 'Memorial ID required' });
        }

        // Check for existing claim by this user to prevent duplicates
        const { data: existingClaim } = await supabase
            .from('scout_claims')
            .select('id, status')
            .eq('memorial_id', memorialId)
            .eq('scout_id', user.id)
            .in('status', ['active', 'submitted', 'verified'])
            .single();

        if (existingClaim) {
            return res.status(400).json({
                error: 'You have already submitted a location for this memorial',
                claimStatus: existingClaim.status
            });
        }

        // Get the memorial
        const { data: memorial, error: memorialError } = await supabase
            .from('memorials')
            .select('*')
            .eq('id', memorialId)
            .single();

        if (memorialError || !memorial) {
            return res.status(404).json({ error: 'Memorial not found' });
        }

        // Verify it's a wanted grave
        if (!memorial.needs_location && !memorial.needs_cemetery) {
            return res.status(400).json({ error: 'This grave is not marked as needing location' });
        }

        // Calculate points
        let totalPoints = 0;
        const hasPhoto = !!photoUrl;
        const identifiedCemetery = memorial.needs_cemetery && cemeteryName;
        const addedGravesite = memorial.needs_location && gravesiteLat && gravesiteLng;

        if (addedGravesite && hasPhoto) {
            totalPoints = POINT_VALUES.WANTED_PIN_WITH_PHOTO;
        } else if (addedGravesite) {
            totalPoints = POINT_VALUES.WANTED_PIN;
        }

        if (identifiedCemetery) {
            totalPoints += POINT_VALUES.CEMETERY_IDENTIFICATION;
        }

        // Update the memorial
        const updateData = {
            located_by: user.id,
            located_at: new Date().toISOString()
        };

        if (cemeteryName) {
            updateData.cemetery_name = cemeteryName;
            updateData.needs_cemetery = false;
        }

        if (cemeteryAddress) {
            updateData.cemetery_address = cemeteryAddress;
        }

        if (cemeteryLat && cemeteryLng) {
            updateData.cemetery_lat = parseFloat(cemeteryLat);
            updateData.cemetery_lng = parseFloat(cemeteryLng);
        }

        if (gravesiteLat && gravesiteLng) {
            updateData.gravesite_lat = parseFloat(gravesiteLat);
            updateData.gravesite_lng = parseFloat(gravesiteLng);
            updateData.gravesite_accuracy = gravesiteAccuracy ? parseFloat(gravesiteAccuracy) : null;
            updateData.needs_location = false;
        }

        if (photoUrl) {
            // Add to photos array or set as main photo
            if (!memorial.main_photo) {
                updateData.main_photo = photoUrl;
            } else {
                const photos = memorial.photos || [];
                photos.push(photoUrl);
                updateData.photos = photos;
            }
        }

        // Update memorial
        const { error: updateError } = await supabase
            .from('memorials')
            .update(updateData)
            .eq('id', memorialId);

        if (updateError) {
            console.error('Update error:', updateError);
            return res.status(500).json({ error: 'Failed to update memorial' });
        }

        // Create scout claim record to track the submission and prevent duplicates
        const { error: claimError } = await supabase
            .from('scout_claims')
            .insert({
                memorial_id: memorialId,
                scout_id: user.id,
                status: 'submitted',
                submitted_cemetery: cemeteryName || null,
                submitted_lat: gravesiteLat ? parseFloat(gravesiteLat) : null,
                submitted_lng: gravesiteLng ? parseFloat(gravesiteLng) : null,
                submitted_photo_url: photoUrl || null,
                submitted_at: new Date().toISOString(),
                notes: `Location submitted via Scout Mode`
            });

        if (claimError) {
            // Log but don't fail - the memorial was already updated
            console.warn('Failed to create scout claim record:', claimError);
        }

        // Update scout stats
        const { data: existingStats } = await supabase
            .from('scout_stats')
            .select('*')
            .eq('user_id', user.id)
            .single();

        if (existingStats) {
            await supabase
                .from('scout_stats')
                .update({
                    total_points: existingStats.total_points + totalPoints,
                    pins_count: existingStats.pins_count + (addedGravesite ? 1 : 0),
                    photos_count: existingStats.photos_count + (hasPhoto ? 1 : 0),
                    wanted_finds_count: (existingStats.wanted_finds_count || 0) + 1,
                    cemetery_ids_count: (existingStats.cemetery_ids_count || 0) + (identifiedCemetery ? 1 : 0),
                    updated_at: new Date().toISOString()
                })
                .eq('user_id', user.id);
        } else {
            await supabase
                .from('scout_stats')
                .insert({
                    user_id: user.id,
                    total_points: totalPoints,
                    pins_count: addedGravesite ? 1 : 0,
                    photos_count: hasPhoto ? 1 : 0,
                    wanted_finds_count: 1,
                    cemetery_ids_count: identifiedCemetery ? 1 : 0
                });
        }

        // Check and award badges
        const badges = await checkWantedBadges(user.id);

        // Notify the family who imported the memorial
        if (memorial.imported_by && memorial.imported_by !== user.id) {
            // TODO: Send notification to family
            // This would be an email or in-app notification
            console.log(`Scout ${user.id} found grave for family ${memorial.imported_by}`);
        }

        return res.status(200).json({
            success: true,
            memorial: {
                id: memorialId,
                name: memorial.name
            },
            points: {
                earned: totalPoints,
                breakdown: {
                    gravesite: addedGravesite ? (hasPhoto ? POINT_VALUES.WANTED_PIN_WITH_PHOTO : POINT_VALUES.WANTED_PIN) : 0,
                    cemetery: identifiedCemetery ? POINT_VALUES.CEMETERY_IDENTIFICATION : 0
                }
            },
            newBadges: badges
        });

    } catch (error) {
        console.error('Submit location error:', error);
        return res.status(500).json({ error: 'Failed to submit location' });
    }
}

async function checkWantedBadges(userId) {
    const newBadges = [];

    // Get current stats
    const { data: stats } = await supabase
        .from('scout_stats')
        .select('wanted_finds_count, cemetery_ids_count')
        .eq('user_id', userId)
        .single();

    if (!stats) return newBadges;

    // Check wanted finds badges
    const wantedBadges = [
        { id: 'family_finder_1', threshold: 1 },
        { id: 'family_finder_10', threshold: 10 },
        { id: 'family_finder_50', threshold: 50 }
    ];

    for (const badge of wantedBadges) {
        if (stats.wanted_finds_count >= badge.threshold) {
            // Check if already earned
            const { data: existing } = await supabase
                .from('user_badges')
                .select('id')
                .eq('user_id', userId)
                .eq('badge_id', badge.id)
                .single();

            if (!existing) {
                const { error } = await supabase
                    .from('user_badges')
                    .insert({
                        user_id: userId,
                        badge_id: badge.id
                    });

                if (!error) {
                    const { data: badgeInfo } = await supabase
                        .from('badges')
                        .select('name, description, icon')
                        .eq('id', badge.id)
                        .single();

                    if (badgeInfo) {
                        newBadges.push(badgeInfo);
                    }
                }
            }
        }
    }

    // Check cemetery badges
    const cemeteryBadges = [
        { id: 'cemetery_expert_10', threshold: 10 },
        { id: 'cemetery_expert_50', threshold: 50 }
    ];

    for (const badge of cemeteryBadges) {
        if ((stats.cemetery_ids_count || 0) >= badge.threshold) {
            const { data: existing } = await supabase
                .from('user_badges')
                .select('id')
                .eq('user_id', userId)
                .eq('badge_id', badge.id)
                .single();

            if (!existing) {
                const { error } = await supabase
                    .from('user_badges')
                    .insert({
                        user_id: userId,
                        badge_id: badge.id
                    });

                if (!error) {
                    const { data: badgeInfo } = await supabase
                        .from('badges')
                        .select('name, description, icon')
                        .eq('id', badge.id)
                        .single();

                    if (badgeInfo) {
                        newBadges.push(badgeInfo);
                    }
                }
            }
        }
    }

    return newBadges;
}
