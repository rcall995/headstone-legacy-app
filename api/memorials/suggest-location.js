import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Verify auth token
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const token = authHeader.substring(7);
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);

  if (authError || !user) {
    return res.status(401).json({ error: 'Invalid token' });
  }

  const { memorialId, location } = req.body;

  if (!memorialId || !location || !location.lat || !location.lng) {
    return res.status(400).json({ error: 'Missing memorialId or location data' });
  }

  try {
    // Insert the suggestion
    const { error: insertError } = await supabase
      .from('suggested_locations')
      .insert({
        memorial_id: memorialId,
        suggested_by: user.id,
        lat: location.lat,
        lng: location.lng,
        status: 'pending'
      });

    if (insertError) throw insertError;

    return res.status(200).json({
      success: true,
      message: 'Suggestion submitted successfully'
    });

  } catch (error) {
    console.error('Suggest location error:', error);
    return res.status(500).json({ error: 'Failed to submit suggestion' });
  }
}
