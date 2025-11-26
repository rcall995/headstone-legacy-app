// Supabase Edge Function: send-notification
// Processes notification queue and sends emails via Resend

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const ADMIN_EMAIL = Deno.env.get("ADMIN_EMAIL") || "admin@headstonelegacy.com";

interface NotificationPayload {
  id: string;
  notification_type: string;
  payload: Record<string, unknown>;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function sendEmail(to: string, subject: string, html: string) {
  if (!RESEND_API_KEY) {
    console.log("RESEND_API_KEY not set, skipping email");
    return { success: false, error: "No API key" };
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: "Headstone Legacy <notifications@headstonelegacy.com>",
      to: [to],
      subject,
      html,
    }),
  });

  if (!res.ok) {
    const error = await res.text();
    console.error("Email send failed:", error);
    return { success: false, error };
  }

  return { success: true };
}

function formatWholesaleEmail(payload: Record<string, unknown>): { subject: string; html: string } {
  const subject = `🏢 New Wholesale Application: ${payload.business_name}`;
  const html = `
    <h2>New Wholesale Application</h2>
    <p>A new business has applied for wholesale pricing:</p>

    <table style="border-collapse: collapse; width: 100%; max-width: 500px;">
      <tr>
        <td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Business Name</td>
        <td style="padding: 8px; border: 1px solid #ddd;">${payload.business_name}</td>
      </tr>
      <tr>
        <td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Type</td>
        <td style="padding: 8px; border: 1px solid #ddd;">${payload.business_type}</td>
      </tr>
      <tr>
        <td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Contact</td>
        <td style="padding: 8px; border: 1px solid #ddd;">${payload.contact_name}</td>
      </tr>
      <tr>
        <td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Email</td>
        <td style="padding: 8px; border: 1px solid #ddd;"><a href="mailto:${payload.email}">${payload.email}</a></td>
      </tr>
      <tr>
        <td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Phone</td>
        <td style="padding: 8px; border: 1px solid #ddd;">${payload.phone}</td>
      </tr>
      <tr>
        <td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Est. Volume</td>
        <td style="padding: 8px; border: 1px solid #ddd;">${payload.estimated_volume}</td>
      </tr>
    </table>

    <p style="margin-top: 20px;">
      <a href="https://www.headstonelegacy.com/admin" style="background: #005F60; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">
        Review in Admin Dashboard
      </a>
    </p>
  `;
  return { subject, html };
}

function formatPartnerEmail(payload: Record<string, unknown>): { subject: string; html: string } {
  const subject = `🤝 New Partner Signup: ${payload.business_name || payload.contact_name}`;
  const html = `
    <h2>New Partner Signup</h2>
    <p>A new partner has joined the affiliate program:</p>

    <table style="border-collapse: collapse; width: 100%; max-width: 500px;">
      <tr>
        <td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Name</td>
        <td style="padding: 8px; border: 1px solid #ddd;">${payload.business_name || payload.contact_name}</td>
      </tr>
      <tr>
        <td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Email</td>
        <td style="padding: 8px; border: 1px solid #ddd;"><a href="mailto:${payload.email}">${payload.email}</a></td>
      </tr>
      <tr>
        <td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Referral Code</td>
        <td style="padding: 8px; border: 1px solid #ddd;"><code>${payload.referral_code}</code></td>
      </tr>
    </table>

    <p style="margin-top: 20px;">
      <a href="https://www.headstonelegacy.com/admin" style="background: #005F60; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">
        View in Admin Dashboard
      </a>
    </p>
  `;
  return { subject, html };
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

    // Get pending notifications
    const { data: notifications, error: fetchError } = await supabase
      .from("notification_queue")
      .select("*")
      .eq("status", "pending")
      .limit(10);

    if (fetchError) {
      throw fetchError;
    }

    if (!notifications || notifications.length === 0) {
      return new Response(JSON.stringify({ message: "No pending notifications" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results = [];

    for (const notification of notifications) {
      let emailContent: { subject: string; html: string };

      switch (notification.notification_type) {
        case "wholesale_application":
          emailContent = formatWholesaleEmail(notification.payload);
          break;
        case "partner_signup":
          emailContent = formatPartnerEmail(notification.payload);
          break;
        default:
          console.log(`Unknown notification type: ${notification.notification_type}`);
          continue;
      }

      const emailResult = await sendEmail(ADMIN_EMAIL, emailContent.subject, emailContent.html);

      // Update notification status
      await supabase
        .from("notification_queue")
        .update({
          status: emailResult.success ? "sent" : "failed",
          sent_at: emailResult.success ? new Date().toISOString() : null,
        })
        .eq("id", notification.id);

      results.push({
        id: notification.id,
        type: notification.notification_type,
        success: emailResult.success,
      });
    }

    return new Response(JSON.stringify({ processed: results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error processing notifications:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
