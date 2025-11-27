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

  // Auth is optional - allow anonymous geocoding for public memorial viewing
  // This is safe since geocoding doesn't expose any sensitive data
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    const { error: authError } = await supabase.auth.getUser(token);
    if (authError) {
      console.warn('Invalid auth token for geocode, proceeding anyway');
    }
  }

  const { address } = req.body;

  if (!address) {
    return res.status(400).json({ error: 'Address is required' });
  }

  try {
    const mapboxClient = mbxGeocoding({ accessToken: process.env.MAPBOX_ACCESS_TOKEN });

    const response = await mapboxClient.forwardGeocode({
      query: address,
      limit: 1
    }).send();

    if (!response.body.features || response.body.features.length === 0) {
      return res.status(404).json({ error: 'No results found for address' });
    }

    const [lng, lat] = response.body.features[0].center;
    return res.status(200).json({ lat, lng });

  } catch (error) {
    console.error('Geocoding error:', error);
    return res.status(500).json({ error: 'Geocoding failed' });
  }
}
