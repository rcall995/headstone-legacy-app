import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Verify auth
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);

  if (authError || !user) {
    return res.status(401).json({ error: 'Invalid token' });
  }

  try {
    const { memorialId, deathDate, confirmActivation } = req.body;

    if (!memorialId) {
      return res.status(400).json({ error: 'Memorial ID is required' });
    }

    if (!confirmActivation) {
      return res.status(400).json({ error: 'Please confirm activation' });
    }

    // Get memorial
    const { data: memorial, error: memError } = await supabase
      .from('memorials')
      .select('id, name, status, executor_id, is_activated')
      .eq('id', memorialId)
      .single();

    if (memError || !memorial) {
      return res.status(404).json({ error: 'Memorial not found' });
    }

    // Verify user is the executor
    if (memorial.executor_id !== user.id) {
      return res.status(403).json({ error: 'Only the designated executor can activate this legacy' });
    }

    // Verify it's a living legacy
    if (memorial.status !== 'living_legacy') {
      return res.status(400).json({ error: 'This memorial is not a living legacy' });
    }

    // Check if already activated
    if (memorial.is_activated) {
      return res.status(400).json({ error: 'This legacy has already been activated' });
    }

    // Activate the legacy
    const updateData = {
      is_activated: true,
      activated_at: new Date().toISOString(),
      activated_by: user.id,
      status: 'published' // Change from living_legacy to published
    };

    // Add death date if provided
    if (deathDate) {
      updateData.death_date = deathDate;
    }

    const { error: updateError } = await supabase
      .from('memorials')
      .update(updateData)
      .eq('id', memorialId);

    if (updateError) {
      console.error('Activation error:', updateError);
      throw updateError;
    }

    // Update all pre-need legacy messages to trigger delivery check
    await supabase
      .from('legacy_messages')
      .update({
        executor_approved: true
      })
      .eq('memorial_id', memorialId)
      .eq('is_pre_need', true)
      .eq('status', 'scheduled');

    return res.status(200).json({
      success: true,
      message: `${memorial.name}'s legacy has been activated. Their memorial is now public and scheduled messages will begin delivery.`,
      memorialId: memorial.id
    });

  } catch (error) {
    console.error('Activation error:', error);
    return res.status(500).json({ error: 'Failed to activate legacy: ' + error.message });
  }
}
