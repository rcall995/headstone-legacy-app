/**
 * Email Utility Module
 * Uses Resend for transactional emails
 */

import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

const FROM_EMAIL = 'Headstone Legacy <notifications@headstonelegacy.com>';
const SUPPORT_EMAIL = 'support@headstonelegacy.com';

/**
 * Send executor invitation email
 */
export async function sendExecutorInviteEmail({
    to,
    executorName,
    legacyOwnerName,
    acceptUrl
}) {
    if (!process.env.RESEND_API_KEY) {
        console.log('[Email] RESEND_API_KEY not configured, skipping email');
        return { success: false, reason: 'Email not configured' };
    }

    const html = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>You've Been Chosen as an Executor</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, Helvetica, sans-serif; background-color: #f4f7fa;">
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f4f7fa;">
        <tr>
            <td align="center" style="padding: 40px 20px;">
                <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width: 600px;">
                    <!-- Header with Logo -->
                    <tr>
                        <td align="center" style="padding-bottom: 30px;">
                            <a href="https://www.headstonelegacy.com" style="text-decoration: none;">
                                <img src="https://www.headstonelegacy.com/logo1.png" alt="Headstone Legacy" width="200" style="display: block; max-width: 200px; height: auto;">
                            </a>
                        </td>
                    </tr>

                    <!-- Main Card -->
                    <tr>
                        <td>
                            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background: #ffffff; border-radius: 16px; overflow: hidden;">
                                <!-- Green Banner -->
                                <tr>
                                    <td align="center" style="background-color: #059669; padding: 30px 25px;">
                                        <h2 style="margin: 0 0 8px 0; color: #ffffff; font-size: 24px; font-weight: bold; font-family: Arial, Helvetica, sans-serif;">You've Been Chosen</h2>
                                        <p style="margin: 0; color: #d1fae5; font-size: 16px; font-family: Arial, Helvetica, sans-serif;">as a Living Legacy Executor</p>
                                    </td>
                                </tr>

                                <!-- Content -->
                                <tr>
                                    <td style="padding: 30px;">
                                        <p style="font-size: 16px; color: #374151; line-height: 1.6; margin: 0 0 20px; font-family: Arial, Helvetica, sans-serif;">
                                            Dear ${executorName || 'Friend'},
                                        </p>

                                        <p style="font-size: 16px; color: #374151; line-height: 1.6; margin: 0 0 20px; font-family: Arial, Helvetica, sans-serif;">
                                            <strong style="color: #1a365d;">${legacyOwnerName}</strong> has chosen you to be the executor of their Living Legacy on Headstone Legacy.
                                        </p>

                                        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin: 25px 0;">
                                            <tr>
                                                <td style="background-color: #f0fdf4; border-left: 4px solid #059669; padding: 15px 20px;">
                                                    <p style="margin: 0; font-size: 15px; color: #166534; line-height: 1.5; font-family: Arial, Helvetica, sans-serif;">
                                                        As an executor, you'll have the trusted responsibility to activate their legacy when the time comes, ensuring their story and messages reach their loved ones.
                                                    </p>
                                                </td>
                                            </tr>
                                        </table>

                                        <p style="font-size: 16px; color: #374151; line-height: 1.6; margin: 0 0 30px; font-family: Arial, Helvetica, sans-serif;">
                                            This is a meaningful role that ${legacyOwnerName} has entrusted to you. Please click below to review and accept this responsibility.
                                        </p>

                                        <!-- CTA Button -->
                                        <table width="100%" cellpadding="0" cellspacing="0" border="0">
                                            <tr>
                                                <td align="center" style="padding: 10px 0 30px;">
                                                    <table cellpadding="0" cellspacing="0" border="0">
                                                        <tr>
                                                            <td style="background-color: #059669; border-radius: 50px;">
                                                                <a href="${acceptUrl}" style="display: block; color: #ffffff; text-decoration: none; padding: 16px 40px; font-size: 16px; font-weight: bold; font-family: Arial, Helvetica, sans-serif;">View Invitation</a>
                                                            </td>
                                                        </tr>
                                                    </table>
                                                </td>
                                            </tr>
                                        </table>

                                        <p style="font-size: 14px; color: #6b7280; text-align: center; margin: 0; font-family: Arial, Helvetica, sans-serif;">
                                            Or copy this link:<br>
                                            <a href="${acceptUrl}" style="color: #1a365d; word-break: break-all;">${acceptUrl}</a>
                                        </p>
                                    </td>
                                </tr>

                                <!-- Footer inside card -->
                                <tr>
                                    <td style="background-color: #f8fafc; padding: 20px 30px; border-top: 1px solid #e5e7eb;">
                                        <p style="margin: 0; font-size: 13px; color: #6b7280; text-align: center; font-family: Arial, Helvetica, sans-serif;">
                                            If you didn't expect this email or have questions, please contact us at <a href="mailto:${SUPPORT_EMAIL}" style="color: #1a365d;">${SUPPORT_EMAIL}</a>
                                        </p>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>

                    <!-- Footer -->
                    <tr>
                        <td align="center" style="padding-top: 30px;">
                            <p style="margin: 0; font-size: 12px; color: #9ca3af; font-family: Arial, Helvetica, sans-serif;">
                                &copy; ${new Date().getFullYear()} Headstone Legacy. Preserving memories that matter.
                            </p>
                            <p style="margin: 10px 0 0; font-size: 12px; font-family: Arial, Helvetica, sans-serif;">
                                <a href="https://www.headstonelegacy.com" style="color: #6b7280;">www.headstonelegacy.com</a>
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
    `;

    const text = `
You've Been Chosen as an Executor

Dear ${executorName || 'Friend'},

${legacyOwnerName} has chosen you to be the executor of their Living Legacy on Headstone Legacy.

As an executor, you'll have the trusted responsibility to activate their legacy when the time comes, ensuring their story and messages reach their loved ones.

This is a meaningful role that ${legacyOwnerName} has entrusted to you. Please visit the link below to review and accept this responsibility:

${acceptUrl}

If you didn't expect this email or have questions, please contact us at ${SUPPORT_EMAIL}

---
Headstone Legacy
Preserving memories that matter.
www.headstonelegacy.com
    `;

    try {
        const { data, error } = await resend.emails.send({
            from: FROM_EMAIL,
            to: [to],
            subject: `${legacyOwnerName} has chosen you as their Legacy Executor`,
            html,
            text
        });

        if (error) {
            console.error('[Email] Send error:', error);
            return { success: false, error: error.message };
        }

        console.log('[Email] Sent executor invite to:', to, 'ID:', data?.id);
        return { success: true, emailId: data?.id };
    } catch (err) {
        console.error('[Email] Exception:', err);
        return { success: false, error: err.message };
    }
}

/**
 * Send legacy message email (for scheduled messages)
 */
export async function sendLegacyMessageEmail({
    to,
    recipientName,
    senderName,
    subject,
    messageContent,
    memorialId,
    photoUrl
}) {
    if (!process.env.RESEND_API_KEY) {
        console.log('[Email] RESEND_API_KEY not configured, skipping email');
        return { success: false, reason: 'Email not configured' };
    }

    const html = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>A Message from ${senderName}</title>
</head>
<body style="margin: 0; padding: 0; font-family: Georgia, 'Times New Roman', serif; background-color: #f4f7fa;">
    <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
        <!-- Header with photo -->
        <div style="text-align: center; margin-bottom: 30px;">
            ${photoUrl ? `<img src="${photoUrl}" alt="${senderName}" style="width: 120px; height: 120px; border-radius: 50%; object-fit: cover; border: 4px solid #c9a227; margin-bottom: 15px;">` : ''}
            <h1 style="margin: 0; color: #1a365d; font-size: 28px; font-weight: normal;">${senderName}</h1>
        </div>

        <!-- Message Card -->
        <div style="background: #ffffff; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.08); padding: 35px; border-top: 4px solid #c9a227;">
            <p style="font-size: 18px; color: #374151; line-height: 1.8; margin: 0 0 20px;">
                Dear ${recipientName},
            </p>

            <div style="font-size: 17px; color: #374151; line-height: 1.9; white-space: pre-wrap;">
${messageContent}
            </div>
        </div>

        <!-- Footer -->
        <div style="text-align: center; margin-top: 40px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
            <p style="margin: 0 0 10px; font-size: 14px; color: #6b7280;">
                This message was lovingly prepared by ${senderName} through
            </p>
            <p style="margin: 0 0 20px;">
                <a href="https://www.headstonelegacy.com/memorial?id=${memorialId}" style="color: #1a365d; font-weight: 600; text-decoration: none;">Headstone Legacy</a>
            </p>
            <p style="margin: 0; font-size: 12px; color: #9ca3af;">
                Preserving memories that matter.
            </p>
        </div>
    </div>
</body>
</html>
    `;

    try {
        const { data, error } = await resend.emails.send({
            from: `${senderName} via Headstone Legacy <messages@headstonelegacy.com>`,
            to: [to],
            subject: subject || `A message from ${senderName}`,
            html
        });

        if (error) {
            console.error('[Email] Send error:', error);
            return { success: false, error: error.message };
        }

        console.log('[Email] Sent legacy message to:', to, 'ID:', data?.id);
        return { success: true, emailId: data?.id };
    } catch (err) {
        console.error('[Email] Exception:', err);
        return { success: false, error: err.message };
    }
}
