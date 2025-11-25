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

  const { memorialId, suggestionId } = req.body;

  if (!memorialId || !suggestionId) {
    return res.status(400).json({ error: 'Missing memorialId or suggestionId' });
  }

  try {
    // Get the memorial to check permissions
    const { data: memorial, error: memorialError } = await supabase
      .from('memorials')
      .select('curator_ids')
      .eq('id', memorialId)
      .single();

    if (memorialError || !memorial) {
      return res.status(404).json({ error: 'Memorial not found' });
    }

    // Check if caller is a curator
    if (!memorial.curator_ids?.includes(user.id)) {
      return res.status(403).json({ error: 'You do not have permission to approve suggestions' });
    }

    // Get the suggestion
    const { data: suggestion, error: suggestionError } = await supabase
      .from('suggested_locations')
      .select('lat, lng')
      .eq('id', suggestionId)
      .eq('memorial_id', memorialId)
      .single();

    if (suggestionError || !suggestion) {
      return res.status(404).json({ error: 'Suggestion not found' });
    }

    // Update the memorial with the new location
    const { error: updateMemorialError } = await supabase
      .from('memorials')
      .update({
        location_lat: suggestion.lat,
        location_lng: suggestion.lng,
        is_location_exact: true
      })
      .eq('id', memorialId);

    if (updateMemorialError) throw updateMemorialError;

    // Mark the suggestion as approved
    const { error: updateSuggestionError } = await supabase
      .from('suggested_locations')
      .update({ status: 'approved' })
      .eq('id', suggestionId);

    if (updateSuggestionError) throw updateSuggestionError;

    return res.status(200).json({
      success: true,
      message: 'Pin location updated successfully'
    });

  } catch (error) {
    console.error('Approve location error:', error);
    return res.status(500).json({ error: 'Failed to approve location' });
  }
}
