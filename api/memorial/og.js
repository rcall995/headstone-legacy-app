import { createClient } from '@supabase/supabase-js';

// Detect if request is from a social media crawler
function isCrawler(userAgent) {
    if (!userAgent) return false;
    const crawlers = [
        'facebookexternalhit',
        'Facebot',
        'Twitterbot',
        'LinkedInBot',
        'WhatsApp',
        'Slackbot',
        'TelegramBot',
        'Discordbot',
        'Pinterest',
        'Googlebot'
    ];
    return crawlers.some(crawler => userAgent.toLowerCase().includes(crawler.toLowerCase()));
}

export default async function handler(req, res) {
    const { id } = req.query;
    const userAgent = req.headers['user-agent'] || '';

    if (!id) {
        return res.redirect(301, 'https://www.headstonelegacy.com');
    }

    // If not a crawler, redirect directly to the memorial page
    if (!isCrawler(userAgent)) {
        return res.redirect(301, `https://www.headstonelegacy.com/memorial?id=${id}`);
    }

    // Create Supabase client inside handler to ensure env vars are available
    const supabase = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    try {
        // Fetch memorial data
        const { data: memorial, error } = await supabase
            .from('memorials')
            .select('id, name, bio, story, main_photo, birth_date, death_date')
            .eq('id', id)
            .single();

        if (error) {
            console.error('Supabase error:', error);
            return res.redirect(301, 'https://www.headstonelegacy.com');
        }

        if (!memorial) {
            return res.redirect(301, 'https://www.headstonelegacy.com');
        }

        const baseUrl = 'https://www.headstonelegacy.com';
        const memorialUrl = `${baseUrl}/memorial?id=${memorial.id}`;
        const title = `${memorial.name || 'Memorial'} - Headstone Legacy`;
        const bioText = memorial.bio || memorial.story || '';
        const description = bioText
            ? bioText.substring(0, 160) + (bioText.length > 160 ? '...' : '')
            : `View the memorial page for ${memorial.name || 'a loved one'}. Light a candle, leave a tribute, and explore their life story.`;
        const image = memorial.main_photo || `${baseUrl}/images/og-image.jpg`;

        // Format dates for display
        let dateRange = '';
        if (memorial.birth_date || memorial.death_date) {
            const birthYear = memorial.birth_date ? new Date(memorial.birth_date).getFullYear() : '?';
            const deathYear = memorial.death_date ? new Date(memorial.death_date).getFullYear() : 'Present';
            dateRange = ` (${birthYear} - ${deathYear})`;
        }

        // Return HTML with proper OG tags for crawlers (no redirect)
        const ogUrl = `${baseUrl}/api/memorial/og?id=${memorial.id}`;
        const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(title)}</title>

    <!-- Open Graph / Facebook -->
    <meta property="og:type" content="profile">
    <meta property="og:url" content="${ogUrl}">
    <meta property="og:title" content="${escapeHtml(memorial.name || 'Memorial')}${dateRange}">
    <meta property="og:description" content="${escapeHtml(description)}">
    <meta property="og:image" content="${image}">
    <meta property="og:image:width" content="1200">
    <meta property="og:image:height" content="630">
    <meta property="og:site_name" content="Headstone Legacy">

    <!-- Twitter -->
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:url" content="${ogUrl}">
    <meta name="twitter:title" content="${escapeHtml(memorial.name || 'Memorial')}${dateRange}">
    <meta name="twitter:description" content="${escapeHtml(description)}">
    <meta name="twitter:image" content="${image}">

    <link rel="canonical" href="${memorialUrl}">
</head>
<body>
    <p>Memorial page for <a href="${memorialUrl}">${escapeHtml(memorial.name || 'Memorial')}</a></p>
</body>
</html>`;

        res.setHeader('Content-Type', 'text/html');
        res.setHeader('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour
        return res.status(200).send(html);

    } catch (err) {
        console.error('Error fetching memorial for OG:', err);
        return res.redirect(301, 'https://www.headstonelegacy.com');
    }
}

function escapeHtml(text) {
    if (!text) return '';
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
