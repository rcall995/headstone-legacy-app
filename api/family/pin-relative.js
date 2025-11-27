// api/family/pin-relative.js - Allow visitors to pin family member graves
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

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
        const {
            familyMemberId,
            memorialId,
            gravesiteLat,
            gravesiteLng,
            gravesiteAccuracy,
            photoUrl,
            visitorName,
            visitorEmail,
            deviceId
        } = req.body;

        // Validate required fields
        if (!familyMemberId || !memorialId) {
            return res.status(400).json({ error: 'Family member ID and memorial ID required' });
        }

        if (!gravesiteLat || !gravesiteLng) {
            return res.status(400).json({ error: 'Location coordinates required' });
        }

        // Check if user is logged in (optional)
        let userId = null;
        const authHeader = req.headers.authorization;
        if (authHeader?.startsWith('Bearer ')) {
            const token = authHeader.split(' ')[1];
            const { data: { user } } = await supabase.auth.getUser(token);
            userId = user?.id || null;
        }

        // Verify family member exists and needs pin
        const { data: familyMember, error: fmError } = await supabase
            .from('family_members')
            .select('*, memorials!inner(name, cemetery_name)')
            .eq('id', familyMemberId)
            .eq('memorial_id', memorialId)
            .single();

        if (fmError || !familyMember) {
            return res.status(404).json({ error: 'Family member not found' });
        }

        if (!familyMember.needs_pin) {
            return res.status(400).json({ error: 'This grave has already been pinned' });
        }

        // Check for duplicate submissions from same device/user
        const duplicateQuery = supabase
            .from('visitor_pins')
            .select('id')
            .eq('family_member_id', familyMemberId)
            .in('status', ['pending', 'approved']);

        if (userId) {
            duplicateQuery.eq('user_id', userId);
        } else if (deviceId) {
            duplicateQuery.eq('device_id', deviceId);
        }

        const { data: existingPin } = await duplicateQuery.single();

        if (existingPin) {
            return res.status(400).json({
                error: 'You have already submitted a pin for this grave',
                existingPinId: existingPin.id
            });
        }

        // Create visitor pin record
        const { data: newPin, error: pinError } = await supabase
            .from('visitor_pins')
            .insert({
                family_member_id: familyMemberId,
                memorial_id: memorialId,
                gravesite_lat: parseFloat(gravesiteLat),
                gravesite_lng: parseFloat(gravesiteLng),
                gravesite_accuracy: gravesiteAccuracy ? parseFloat(gravesiteAccuracy) : null,
                headstone_photo_url: photoUrl || null,
                user_id: userId,
                device_id: deviceId || null,
                visitor_name: visitorName || null,
                visitor_email: visitorEmail || null,
                status: 'pending'
            })
            .select()
            .single();

        if (pinError) {
            console.error('Error creating pin:', pinError);
            return res.status(500).json({ error: 'Failed to submit pin' });
        }

        // For logged-in users, award points immediately (pending approval adds more)
        let pointsAwarded = 0;
        if (userId) {
            // Award base points for submission
            pointsAwarded = 15; // Base points for helping family
            if (photoUrl) {
                pointsAwarded += 10; // Bonus for photo
            }

            // Update scout stats
            const { data: existingStats } = await supabase
                .from('scout_stats')
                .select('*')
                .eq('user_id', userId)
                .single();

            if (existingStats) {
                await supabase
                    .from('scout_stats')
                    .update({
                        total_points: existingStats.total_points + pointsAwarded,
                        pins_count: existingStats.pins_count + 1,
                        photos_count: existingStats.photos_count + (photoUrl ? 1 : 0),
                        updated_at: new Date().toISOString()
                    })
                    .eq('user_id', userId);
            } else {
                await supabase
                    .from('scout_stats')
                    .insert({
                        user_id: userId,
                        total_points: pointsAwarded,
                        pins_count: 1,
                        photos_count: photoUrl ? 1 : 0
                    });
            }

            // Update the pin with points awarded
            await supabase
                .from('visitor_pins')
                .update({ points_awarded: pointsAwarded })
                .eq('id', newPin.id);
        }

        // Return success
        return res.status(200).json({
            success: true,
            pin: {
                id: newPin.id,
                status: 'pending',
                message: 'Thank you! Your pin has been submitted for review.'
            },
            familyMember: {
                name: familyMember.name,
                relationship: familyMember.relationship
            },
            memorial: {
                name: familyMember.memorials.name
            },
            points: pointsAwarded > 0 ? {
                earned: pointsAwarded,
                message: `You earned ${pointsAwarded} points for helping this family!`
            } : null
        });

    } catch (error) {
        console.error('Pin relative error:', error);
        return res.status(500).json({ error: 'Failed to submit pin' });
    }
}
