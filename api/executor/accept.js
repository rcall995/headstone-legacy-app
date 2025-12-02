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
    return res.status(401).json({ error: 'Unauthorized - please sign in' });
  }

  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);

  if (authError || !user) {
    return res.status(401).json({ error: 'Invalid token' });
  }

  try {
    const { executorToken, action } = req.body;

    if (!executorToken) {
      return res.status(400).json({ error: 'Executor token is required' });
    }

    if (!['accept', 'decline'].includes(action)) {
      return res.status(400).json({ error: 'Action must be accept or decline' });
    }

    // Find memorial with this executor token
    const { data: memorial, error: memError } = await supabase
      .from('memorials')
      .select('id, name, executor_email, executor_token, executor_id, curator_ids')
      .eq('executor_token', executorToken)
      .single();

    if (memError || !memorial) {
      return res.status(404).json({ error: 'Invalid or expired invitation' });
    }

    // Verify the user's email matches the invited executor email
    if (user.email?.toLowerCase() !== memorial.executor_email?.toLowerCase()) {
      return res.status(403).json({
        error: 'This invitation was sent to a different email address',
        invitedEmail: memorial.executor_email
      });
    }

    if (action === 'decline') {
      // Clear executor fields
      await supabase
        .from('memorials')
        .update({
          executor_id: null,
          executor_email: null,
          executor_name: null,
          executor_token: null,
          executor_invited_at: null
        })
        .eq('id', memorial.id);

      return res.status(200).json({
        success: true,
        message: 'You have declined the executor role'
      });
    }

    // Accept - set executor_id to current user
    const { error: updateError } = await supabase
      .from('memorials')
      .update({
        executor_id: user.id,
        executor_token: null, // Clear token after acceptance
        executor_accepted_at: new Date().toISOString()
      })
      .eq('id', memorial.id);

    if (updateError) {
      console.error('Update error:', updateError);
      throw updateError;
    }

    return res.status(200).json({
      success: true,
      message: `You are now the executor for ${memorial.name}'s legacy`,
      memorialId: memorial.id,
      memorialName: memorial.name
    });

  } catch (error) {
    console.error('Executor accept error:', error);
    return res.status(500).json({ error: 'Failed to process: ' + error.message });
  }
}
