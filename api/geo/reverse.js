import { createClient } from '@supabase/supabase-js';
import mbxGeocoding from '@mapbox/mapbox-sdk/services/geocoding.js';

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

  const { lat, lng } = req.body;

  if (lat === undefined || lng === undefined) {
    return res.status(400).json({ error: 'Latitude and longitude are required' });
  }

  try {
    const mapboxClient = mbxGeocoding({ accessToken: process.env.MAPBOX_ACCESS_TOKEN });

    const response = await mapboxClient.reverseGeocode({
      query: [lng, lat],
      limit: 1,
      types: ['address', 'poi', 'place']
    }).send();

    if (!response.body.features || response.body.features.length === 0) {
      return res.status(404).json({ error: 'No address found for this location' });
    }

    const feature = response.body.features[0];
    const address = feature.place_name;

    return res.status(200).json({ address });

  } catch (error) {
    console.error('Reverse geocoding error:', error);
    return res.status(500).json({ error: 'Reverse geocoding failed' });
  }
}
