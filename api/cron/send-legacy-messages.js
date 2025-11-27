/**
 * Cron Job: Send Scheduled Legacy Messages
 * Runs daily to check for and send scheduled messages
 *
 * Configure in vercel.json:
 * "crons": [{
 *   "path": "/api/cron/send-legacy-messages",
 *   "schedule": "0 9 * * *"  // Daily at 9 AM UTC
 * }]
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Verify this is a legitimate cron request from Vercel
function verifyCronRequest(req) {
  // In production, verify the Authorization header
  const authHeader = req.headers.authorization;
  if (authHeader === `Bearer ${process.env.CRON_SECRET}`) {
    return true;
  }
  // Allow in development
  if (process.env.NODE_ENV === 'development') {
    return true;
  }
  return false;
}

// Send email (placeholder - integrate with actual email service)
async function sendEmail(message, memorial) {
  // TODO: Integrate with SendGrid, Resend, or Postmark

  const emailHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Georgia, serif; max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { text-align: center; border-bottom: 2px solid #005F60; padding-bottom: 20px; margin-bottom: 30px; }
        .photo { width: 150px; height: 150px; border-radius: 50%; object-fit: cover; border: 3px solid #c9a227; }
        .name { font-size: 24px; color: #005F60; margin: 15px 0 5px; }
        .dates { color: #666; font-size: 14px; }
        .message { line-height: 1.8; color: #333; white-space: pre-wrap; }
        .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #ddd; text-align: center; font-size: 12px; color: #888; }
        .footer a { color: #005F60; }
      </style>
    </head>
    <body>
      <div class="header">
        ${memorial.main_photo ? `<img src="${memorial.main_photo}" alt="${memorial.name}" class="photo">` : ''}
        <h1 class="name">${memorial.name}</h1>
        <p class="dates">${formatDates(memorial.birth_date, memorial.death_date)}</p>
      </div>

      <div class="message">
        <p>Dear ${message.recipient_name},</p>
        <br>
        ${message.message_content}
      </div>

      <div class="footer">
        <p>This message was lovingly prepared by ${memorial.name} through</p>
        <p><a href="https://www.headstonelegacy.com/memorial?id=${memorial.id}">Headstone Legacy</a></p>
        <p>Preserving memories that matter.</p>
      </div>
    </body>
    </html>
  `;

  console.log('Would send email:', {
    to: message.recipient_email,
    subject: message.subject,
    preview: message.message_content.substring(0, 100) + '...'
  });

  // In production:
  // const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
  //   method: 'POST',
  //   headers: {
  //     'Authorization': `Bearer ${process.env.SENDGRID_API_KEY}`,
  //     'Content-Type': 'application/json'
  //   },
  //   body: JSON.stringify({
  //     personalizations: [{ to: [{ email: message.recipient_email, name: message.recipient_name }] }],
  //     from: { email: 'messages@headstonelegacy.com', name: `${memorial.name} via Headstone Legacy` },
  //     subject: message.subject,
  //     content: [{ type: 'text/html', value: emailHtml }]
  //   })
  // });

  return { success: true, method: 'email' };
}

function formatDates(birth, death) {
  const birthYear = birth ? new Date(birth).getFullYear() : '?';
  const deathYear = death ? new Date(death).getFullYear() : 'Present';
  return `${birthYear} - ${deathYear}`;
}

export default async function handler(req, res) {
  // Only allow POST requests (Vercel cron uses POST)
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Verify cron authorization (skip in development for testing)
  // if (!verifyCronRequest(req)) {
  //   return res.status(401).json({ error: 'Unauthorized' });
  // }

  try {
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    const currentMonth = today.getMonth() + 1; // 1-12
    const currentDay = today.getDate(); // 1-31

    let sentCount = 0;
    let errorCount = 0;
    const results = [];

    // 1. Get scheduled one-time messages due today
    const { data: scheduledMessages, error: schedError } = await supabase
      .from('legacy_messages')
      .select(`
        *,
        memorial:memorials(id, name, main_photo, birth_date, death_date)
      `)
      .eq('delivery_type', 'scheduled')
      .eq('status', 'pending')
      .eq('is_active', true)
      .lte('scheduled_date', todayStr);

    if (schedError) {
      console.error('Error fetching scheduled messages:', schedError);
    }

    // 2. Get recurring annual messages due today
    const { data: recurringMessages, error: recurError } = await supabase
      .from('legacy_messages')
      .select(`
        *,
        memorial:memorials(id, name, main_photo, birth_date, death_date)
      `)
      .eq('delivery_type', 'recurring')
      .eq('is_active', true)
      .eq('recurring_month', currentMonth)
      .eq('recurring_day', currentDay)
      .or(`status.eq.pending,last_sent_at.lt.${new Date(today.getFullYear(), 0, 1).toISOString()}`);

    if (recurError) {
      console.error('Error fetching recurring messages:', recurError);
    }

    // Combine all messages to send
    const allMessages = [
      ...(scheduledMessages || []),
      ...(recurringMessages || [])
    ];

    console.log(`Found ${allMessages.length} messages to send`);

    // Send each message
    for (const message of allMessages) {
      try {
        const memorial = message.memorial;
        if (!memorial) {
          console.error(`No memorial found for message ${message.id}`);
          errorCount++;
          continue;
        }

        // Send the email
        const sendResult = await sendEmail(message, memorial);

        // Log the delivery
        await supabase
          .from('legacy_message_deliveries')
          .insert({
            message_id: message.id,
            delivery_method: sendResult.method,
            delivery_status: sendResult.success ? 'sent' : 'failed',
            recipient_email: message.recipient_email,
            recipient_phone: message.recipient_phone
          });

        // Update message status
        const updateData = {
          last_sent_at: new Date().toISOString(),
          send_count: (message.send_count || 0) + 1
        };

        // Only mark one-time messages as sent
        if (message.delivery_type === 'scheduled') {
          updateData.status = 'sent';
        }

        await supabase
          .from('legacy_messages')
          .update(updateData)
          .eq('id', message.id);

        sentCount++;
        results.push({
          messageId: message.id,
          recipient: message.recipient_name,
          type: message.delivery_type,
          status: 'sent'
        });

      } catch (msgError) {
        console.error(`Error sending message ${message.id}:`, msgError);
        errorCount++;
        results.push({
          messageId: message.id,
          recipient: message.recipient_name,
          status: 'error',
          error: msgError.message
        });
      }
    }

    return res.status(200).json({
      success: true,
      summary: {
        date: todayStr,
        totalFound: allMessages.length,
        sent: sentCount,
        errors: errorCount
      },
      results
    });

  } catch (error) {
    console.error('Cron job error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
}
