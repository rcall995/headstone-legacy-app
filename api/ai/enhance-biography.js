import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('ANTHROPIC_API_KEY not configured');
    return res.status(500).json({ error: 'AI service not configured' });
  }

  try {
    const { name, currentBio, additionalInfo } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Name is required' });
    }

    if (!currentBio || !currentBio.trim()) {
      return res.status(400).json({ error: 'Current biography is required' });
    }

    if (!additionalInfo || !additionalInfo.trim()) {
      return res.status(400).json({ error: 'Please provide additional information to add' });
    }

    const systemPrompt = `You are a compassionate memorial biography editor. Your task is to enhance an existing biography by seamlessly integrating new information while preserving the original tone and content.

Guidelines:
- Keep the existing biography intact as much as possible
- Seamlessly weave in the new information where it fits naturally
- Maintain third person perspective
- Keep the same warm, dignified tone as the original
- Do not remove any existing content unless it directly contradicts the new information
- The result should feel like a cohesive, complete biography
- Do not add any facts not mentioned in either the original bio or the new information`;

    const userPrompt = `Here is the current biography for ${name}:

---
${currentBio.trim()}
---

Please enhance this biography by adding the following information:

${additionalInfo.trim()}

Return the complete updated biography with the new information seamlessly integrated.`;

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1500,
      messages: [
        {
          role: 'user',
          content: userPrompt
        }
      ],
      system: systemPrompt
    });

    const biography = response.content[0].text;

    return res.status(200).json({
      success: true,
      biography,
      usage: {
        input_tokens: response.usage.input_tokens,
        output_tokens: response.usage.output_tokens
      }
    });

  } catch (error) {
    console.error('Enhance biography error:', error);
    return res.status(500).json({ error: 'Failed to enhance biography: ' + error.message });
  }
}
