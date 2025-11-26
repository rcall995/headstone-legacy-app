import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

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

  const { image } = req.body;

  if (!image) {
    return res.status(400).json({ error: 'Image data is required' });
  }

  try {
    // Check if OpenAI API key is available
    const openaiKey = process.env.OPENAI_API_KEY;

    if (!openaiKey) {
      // Fall back to a demo response when no API key is configured
      console.log('No OPENAI_API_KEY configured, using demo mode');
      return res.status(200).json({
        name: null,
        birthDate: null,
        deathDate: null,
        message: 'AI scanning not configured. Please enter information manually.'
      });
    }

    // Use OpenAI GPT-4 Vision to analyze the headstone
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openaiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: `You are a helpful assistant that extracts information from headstone images.
Extract the following information if visible:
- Full name of the deceased
- Date of birth (in any format you can read)
- Date of death (in any format you can read)

Respond ONLY with a JSON object in this exact format, no other text:
{"name": "Full Name Here", "birthDate": "Month DD, YYYY or similar", "deathDate": "Month DD, YYYY or similar"}

If you cannot read a field, use null for that value.`
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Please extract the name and dates from this headstone image.'
              },
              {
                type: 'image_url',
                image_url: {
                  url: image,
                  detail: 'high'
                }
              }
            ]
          }
        ],
        max_tokens: 300
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('OpenAI API error:', errorText);
      throw new Error('AI analysis failed');
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';

    // Parse the JSON response
    try {
      // Extract JSON from the response (in case there's extra text)
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const result = JSON.parse(jsonMatch[0]);
        return res.status(200).json({
          name: result.name || null,
          birthDate: result.birthDate || null,
          deathDate: result.deathDate || null
        });
      }
    } catch (parseError) {
      console.error('Failed to parse AI response:', content);
    }

    // If parsing fails, return null values
    return res.status(200).json({
      name: null,
      birthDate: null,
      deathDate: null,
      message: 'Could not extract information from the image'
    });

  } catch (error) {
    console.error('Headstone scan error:', error);
    return res.status(500).json({
      error: 'Failed to analyze headstone image',
      message: error.message
    });
  }
}
