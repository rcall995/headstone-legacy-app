import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Biography prompt questions - structured like traditional obituaries
export const BIOGRAPHY_PROMPTS = [
  {
    id: 'family',
    question: 'Who were the important people in their life?',
    placeholder: 'e.g., Married to Jane for 45 years, father of three children (Mike, Sarah, Tom), grandfather of 7...',
    icon: 'fa-users'
  },
  {
    id: 'career',
    question: 'What did they do for work?',
    placeholder: 'e.g., Worked as a carpenter for 30 years, owned a small bakery, was a dedicated nurse...',
    icon: 'fa-briefcase'
  },
  {
    id: 'earlylife',
    question: 'Where did they grow up and go to school?',
    placeholder: 'e.g., Born in Chicago, grew up on a farm in Iowa, graduated from Lincoln High School...',
    icon: 'fa-graduation-cap'
  },
  {
    id: 'hobbies',
    question: 'What did they love doing?',
    placeholder: 'e.g., Fishing every Sunday, tending the garden, woodworking, cooking for the family...',
    icon: 'fa-heart'
  },
  {
    id: 'personality',
    question: 'How would friends and family describe them?',
    placeholder: 'e.g., Always had a joke ready, generous to a fault, never met a stranger, strong and quiet...',
    icon: 'fa-smile'
  },
  {
    id: 'community',
    question: 'Were they involved in church, military, or community?',
    placeholder: 'e.g., Deacon at First Baptist, Army veteran (Vietnam), volunteer firefighter, Rotary member...',
    icon: 'fa-hands-helping'
  },
  {
    id: 'remember',
    question: 'What will you miss most about them?',
    placeholder: 'e.g., His Sunday morning pancakes, her warm hugs, the way he could fix anything...',
    icon: 'fa-star'
  }
];

export default async function handler(req, res) {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Check for API key
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('ANTHROPIC_API_KEY not configured');
    return res.status(500).json({ error: 'AI service not configured' });
  }

  try {
    const { name, birthDate, deathDate, answers } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Name is required' });
    }

    if (!answers || Object.keys(answers).length === 0) {
      return res.status(400).json({ error: 'Please answer at least one question' });
    }

    // Build the prompt for Claude
    const answeredPrompts = BIOGRAPHY_PROMPTS
      .filter(p => answers[p.id] && answers[p.id].trim())
      .map(p => `**${p.question}**\n${answers[p.id].trim()}`)
      .join('\n\n');

    // Calculate age if dates provided
    let ageInfo = '';
    if (birthDate && deathDate) {
      const birth = new Date(birthDate);
      const death = new Date(deathDate);
      const age = Math.floor((death - birth) / (365.25 * 24 * 60 * 60 * 1000));
      ageInfo = ` who lived to be ${age} years old`;
    }

    const systemPrompt = `You are a compassionate memorial biography writer. Your task is to weave the provided memories and details into a warm, dignified, and heartfelt biography.

Guidelines:
- Write in third person
- Be respectful and celebratory of life
- Create smooth transitions between different aspects of their life
- Keep the tone warm but not overly sentimental
- Include specific details from the answers to make it personal
- Aim for 2-4 paragraphs (150-300 words)
- Do not invent facts not provided in the answers
- If birth/death dates are provided, you may reference their life span naturally
- End on a note of how they will be remembered`;

    const userPrompt = `Please write a memorial biography for ${name}${ageInfo}.

Here's what the family shared about them:

${answeredPrompts}

Write a cohesive, heartfelt biography based on these memories.`;

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: userPrompt
        }
      ],
      system: systemPrompt
    });

    // Extract the text from the response
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
    console.error('Biography generation error:', error);
    console.error('Error details:', JSON.stringify({
      message: error.message,
      status: error.status,
      name: error.name,
      stack: error.stack
    }, null, 2));

    // Handle specific Anthropic errors
    if (error.status === 401) {
      return res.status(500).json({ error: 'AI service authentication failed. Check API key.' });
    }
    if (error.status === 429) {
      return res.status(429).json({ error: 'Too many requests. Please try again in a moment.' });
    }
    if (error.message?.includes('invalid_api_key') || error.message?.includes('Invalid API')) {
      return res.status(500).json({ error: 'Invalid API key configured.' });
    }

    return res.status(500).json({
      error: 'Failed to generate biography: ' + (error.message || 'Unknown error'),
      details: error.message
    });
  }
}
