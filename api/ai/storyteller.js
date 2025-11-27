// api/ai/storyteller.js - AI Legacy Storyteller
import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY
});

// Cost management: Max 5 AI interactions per session (~$0.25 limit)
const MAX_INTERACTIONS = 5;

// Preset story prompts for deceased persons
const STORY_PROMPTS = [
    {
        id: 'childhood',
        title: 'Childhood & Early Years',
        question: 'Tell us about their childhood. Where did they grow up? What were they like as a child?'
    },
    {
        id: 'life_work',
        title: 'Life & Work',
        question: 'What did they do for a living? What were they passionate about?'
    },
    {
        id: 'family',
        title: 'Family & Relationships',
        question: 'Tell us about their family. Who were the important people in their life?'
    },
    {
        id: 'personality',
        title: 'Personality & Character',
        question: 'How would you describe their personality? What made them unique?'
    },
    {
        id: 'legacy',
        title: 'Legacy & Memories',
        question: 'What do you want people to remember about them? What lessons did they teach?'
    }
];

export default async function handler(req, res) {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // Auth required
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const token = authHeader.split(' ')[1];
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
        return res.status(401).json({ error: 'Invalid token' });
    }

    try {
        if (req.method === 'GET') {
            // Get prompts and session status
            const { memorialId } = req.query;

            if (!memorialId) {
                return res.status(400).json({ error: 'Memorial ID required' });
            }

            // Check for existing session
            const { data: session } = await supabase
                .from('ai_story_sessions')
                .select('*')
                .eq('memorial_id', memorialId)
                .eq('user_id', user.id)
                .order('created_at', { ascending: false })
                .limit(1)
                .single();

            return res.status(200).json({
                prompts: STORY_PROMPTS,
                session: session || null,
                maxInteractions: MAX_INTERACTIONS
            });
        }

        if (req.method === 'POST') {
            const { action, memorialId, sessionId, promptId, response, allResponses } = req.body;

            if (!memorialId) {
                return res.status(400).json({ error: 'Memorial ID required' });
            }

            // Get the memorial
            const { data: memorial, error: memorialError } = await supabase
                .from('memorials')
                .select('id, name, birth_year, death_year, biography')
                .eq('id', memorialId)
                .single();

            if (memorialError || !memorial) {
                return res.status(404).json({ error: 'Memorial not found' });
            }

            if (action === 'start') {
                // Start a new story session
                const { data: newSession, error: sessionError } = await supabase
                    .from('ai_story_sessions')
                    .insert({
                        memorial_id: memorialId,
                        user_id: user.id,
                        prompt_responses: {},
                        ai_interactions: 0,
                        max_interactions: MAX_INTERACTIONS,
                        status: 'in_progress'
                    })
                    .select()
                    .single();

                if (sessionError) throw sessionError;

                return res.status(200).json({
                    session: newSession,
                    prompts: STORY_PROMPTS,
                    currentPrompt: STORY_PROMPTS[0]
                });
            }

            if (action === 'answer') {
                // Save a prompt response
                if (!sessionId || !promptId || !response) {
                    return res.status(400).json({ error: 'Session ID, prompt ID, and response required' });
                }

                // Get current session
                const { data: session, error: sessionError } = await supabase
                    .from('ai_story_sessions')
                    .select('*')
                    .eq('id', sessionId)
                    .single();

                if (sessionError || !session) {
                    return res.status(404).json({ error: 'Session not found' });
                }

                // Update responses
                const promptResponses = session.prompt_responses || {};
                promptResponses[promptId] = response;

                // Find next prompt
                const currentIndex = STORY_PROMPTS.findIndex(p => p.id === promptId);
                const nextPrompt = STORY_PROMPTS[currentIndex + 1] || null;

                await supabase
                    .from('ai_story_sessions')
                    .update({ prompt_responses: promptResponses })
                    .eq('id', sessionId);

                return res.status(200).json({
                    success: true,
                    nextPrompt,
                    isComplete: !nextPrompt,
                    answeredCount: Object.keys(promptResponses).length,
                    totalPrompts: STORY_PROMPTS.length
                });
            }

            if (action === 'followup') {
                // AI asks a follow-up question
                if (!sessionId) {
                    return res.status(400).json({ error: 'Session ID required' });
                }

                // Get current session
                const { data: session, error: sessionError } = await supabase
                    .from('ai_story_sessions')
                    .select('*')
                    .eq('id', sessionId)
                    .single();

                if (sessionError || !session) {
                    return res.status(404).json({ error: 'Session not found' });
                }

                if (session.ai_interactions >= MAX_INTERACTIONS) {
                    return res.status(400).json({
                        error: 'Max AI interactions reached',
                        canGenerate: true
                    });
                }

                // Generate a follow-up question
                const message = await anthropic.messages.create({
                    model: 'claude-sonnet-4-20250514',
                    max_tokens: 300,
                    system: `You are helping collect stories about ${memorial.name} who lived from ${memorial.birth_year || 'unknown'} to ${memorial.death_year || 'unknown'}.

Based on the responses so far, ask ONE thoughtful follow-up question to gather more details for their memorial. The question should be:
- Warm and compassionate
- Specific to something they mentioned
- Easy to answer with a short response
- Focused on details that would make the story more vivid

Just ask the question, nothing else.`,
                    messages: [{
                        role: 'user',
                        content: `Here are the responses so far:\n\n${JSON.stringify(session.prompt_responses, null, 2)}\n\nAsk a follow-up question.`
                    }]
                });

                const followupQuestion = message.content[0].text;

                // Update interaction count
                await supabase
                    .from('ai_story_sessions')
                    .update({
                        ai_interactions: session.ai_interactions + 1
                    })
                    .eq('id', sessionId);

                return res.status(200).json({
                    followupQuestion,
                    interactionsUsed: session.ai_interactions + 1,
                    interactionsRemaining: MAX_INTERACTIONS - session.ai_interactions - 1
                });
            }

            if (action === 'answer_followup') {
                // Save follow-up answer
                if (!sessionId || !response) {
                    return res.status(400).json({ error: 'Session ID and response required' });
                }

                const { data: session } = await supabase
                    .from('ai_story_sessions')
                    .select('*')
                    .eq('id', sessionId)
                    .single();

                if (!session) {
                    return res.status(404).json({ error: 'Session not found' });
                }

                const promptResponses = session.prompt_responses || {};
                const followupKey = `followup_${Object.keys(promptResponses).filter(k => k.startsWith('followup_')).length + 1}`;
                promptResponses[followupKey] = response;

                await supabase
                    .from('ai_story_sessions')
                    .update({ prompt_responses: promptResponses })
                    .eq('id', sessionId);

                return res.status(200).json({
                    success: true,
                    canRequestMoreFollowups: session.ai_interactions < MAX_INTERACTIONS - 1
                });
            }

            if (action === 'generate') {
                // Generate the final story
                if (!sessionId) {
                    return res.status(400).json({ error: 'Session ID required' });
                }

                const { data: session } = await supabase
                    .from('ai_story_sessions')
                    .select('*')
                    .eq('id', sessionId)
                    .single();

                if (!session) {
                    return res.status(404).json({ error: 'Session not found' });
                }

                // Generate the story
                const message = await anthropic.messages.create({
                    model: 'claude-sonnet-4-20250514',
                    max_tokens: 1500,
                    system: `You are a skilled obituary and memorial writer. Create a beautiful, heartfelt biographical tribute for ${memorial.name} (${memorial.birth_year || '?'} - ${memorial.death_year || '?'}).

Write in a warm, dignified style that:
- Honors their life and legacy
- Includes specific details from the responses
- Flows naturally as a cohesive narrative
- Is appropriate for a memorial page
- Is 2-4 paragraphs long

Do not add any fictional details. Only use information provided.`,
                    messages: [{
                        role: 'user',
                        content: `Write a memorial tribute based on these responses:\n\n${JSON.stringify(session.prompt_responses, null, 2)}`
                    }]
                });

                const generatedStory = message.content[0].text;

                // Update session with generated story
                await supabase
                    .from('ai_story_sessions')
                    .update({
                        generated_story: generatedStory,
                        status: 'completed',
                        ai_interactions: session.ai_interactions + 1
                    })
                    .eq('id', sessionId);

                return res.status(200).json({
                    story: generatedStory,
                    sessionId
                });
            }

            if (action === 'save') {
                // Save the story to the memorial
                if (!sessionId) {
                    return res.status(400).json({ error: 'Session ID required' });
                }

                const { data: session } = await supabase
                    .from('ai_story_sessions')
                    .select('generated_story')
                    .eq('id', sessionId)
                    .single();

                if (!session?.generated_story) {
                    return res.status(400).json({ error: 'No story to save' });
                }

                // Update the memorial biography
                const { error: updateError } = await supabase
                    .from('memorials')
                    .update({
                        biography: session.generated_story,
                        ai_generated_bio: true
                    })
                    .eq('id', memorialId);

                if (updateError) throw updateError;

                return res.status(200).json({
                    success: true,
                    message: 'Story saved to memorial'
                });
            }

            return res.status(400).json({ error: 'Invalid action' });
        }

        return res.status(405).json({ error: 'Method not allowed' });
    } catch (error) {
        console.error('AI Storyteller error:', error);
        return res.status(500).json({ error: 'Failed to process request' });
    }
}
