import { createClient } from '@supabase/supabase-js';
import mbxGeocoding from '@mapbox/mapbox-sdk/services/geocoding.js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const mapboxClient = mbxGeocoding({ accessToken: process.env.MAPBOX_ACCESS_TOKEN });

  // GET = Reverse geocoding (lat/lng → address)
  if (req.method === 'GET') {
    const { lat, lng } = req.query;

    if (!lat || !lng) {
      return res.status(400).json({ error: 'lat and lng are required' });
    }

    try {
      const response = await mapboxClient.reverseGeocode({
        query: [parseFloat(lng), parseFloat(lat)],
        types: ['address', 'place', 'poi'],
        limit: 1
      }).send();

      if (!response.body.features || response.body.features.length === 0) {
        return res.status(200).json({ address: null, placeName: null });
      }

      const feature = response.body.features[0];
      return res.status(200).json({
        address: feature.place_name,
        placeName: feature.text,
        context: feature.context || []
      });

    } catch (error) {
      console.error('Reverse geocoding error:', error);
      return res.status(500).json({ error: 'Reverse geocoding failed' });
    }
  }

  // POST = Forward geocoding (address → lat/lng)
  if (req.method === 'POST') {
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

  return res.status(405).json({ error: 'Method not allowed' });
}
