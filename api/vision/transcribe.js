import { createClient } from '@supabase/supabase-js';
import vision from '@google-cloud/vision';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

let visionClient;

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

  const { imageUrl } = req.body;

  if (!imageUrl) {
    return res.status(400).json({ error: 'imageUrl is required' });
  }

  try {
    if (!visionClient) {
      // For Vercel, you need to provide credentials via environment variable
      const credentials = JSON.parse(process.env.GOOGLE_VISION_CREDENTIALS || '{}');
      visionClient = new vision.ImageAnnotatorClient({ credentials });
    }

    const [result] = await visionClient.textDetection(imageUrl);
    const text = result.textAnnotations && result.textAnnotations.length > 0
      ? result.textAnnotations[0].description
      : '';

    return res.status(200).json({ text });

  } catch (error) {
    console.error('Vision API error:', error);
    return res.status(500).json({ error: 'Transcription failed' });
  }
}
