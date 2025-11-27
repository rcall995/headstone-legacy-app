/**
 * Memorial Book Content Preview
 * Returns JSON showing what would be included in the book
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { memorialId } = req.query;

  if (!memorialId) {
    return res.status(400).json({ error: 'Missing memorialId' });
  }

  try {
    // Fetch memorial data
    const { data: memorial, error: memorialError } = await supabase
      .from('memorials')
      .select('*')
      .eq('id', memorialId)
      .single();

    if (memorialError || !memorial) {
      return res.status(404).json({ error: 'Memorial not found' });
    }

    // Fetch approved tributes
    const { data: tributes } = await supabase
      .from('tributes')
      .select('*')
      .eq('memorial_id', memorialId)
      .eq('status', 'approved')
      .order('created_at', { ascending: false })
      .limit(20);

    // Calculate page breakdown
    let pages = {
      coverAndTitle: 4,
      biography: 0,
      photos: 0,
      timeline: 0,
      family: 2,
      residences: 0,
      tributes: 0,
      backCover: 2
    };

    // Biography pages
    if (memorial.bio) {
      pages.biography = Math.ceil(memorial.bio.length / 2000) * 2;
    }

    // Photo pages
    if (memorial.photos && memorial.photos.length > 0) {
      pages.photos = Math.ceil(memorial.photos.length / 4) * 2;
    }

    // Timeline pages
    if (memorial.milestones && memorial.milestones.length > 0) {
      pages.timeline = Math.ceil(memorial.milestones.length / 8) * 2;
    }

    // Residence pages
    if (memorial.residences && memorial.residences.length > 0) {
      pages.residences = 2;
    }

    // Tribute pages
    if (tributes && tributes.length > 0) {
      pages.tributes = Math.ceil(tributes.length / 4) * 2;
    }

    const totalPages = Object.values(pages).reduce((a, b) => a + b, 0);
    const finalPageCount = Math.max(24, Math.ceil(totalPages / 4) * 4);

    // Build content preview
    const preview = {
      memorial: {
        name: memorial.name,
        birthDate: memorial.birth_date,
        deathDate: memorial.death_date,
        mainPhoto: memorial.main_photo
      },
      content: {
        biography: {
          included: !!memorial.bio,
          characterCount: memorial.bio?.length || 0,
          preview: memorial.bio ? memorial.bio.substring(0, 300) + '...' : null
        },
        photos: {
          included: (memorial.photos?.length || 0) > 0,
          count: memorial.photos?.length || 0
        },
        timeline: {
          included: (memorial.milestones?.length || 0) > 0,
          count: memorial.milestones?.length || 0,
          events: memorial.milestones?.slice(0, 5) || []
        },
        residences: {
          included: (memorial.residences?.length || 0) > 0,
          count: memorial.residences?.length || 0,
          places: memorial.residences?.slice(0, 5) || []
        },
        tributes: {
          included: (tributes?.length || 0) > 0,
          count: tributes?.length || 0,
          samples: tributes?.slice(0, 3).map(t => ({
            message: t.message?.substring(0, 100) + '...',
            author: t.author_name
          })) || []
        }
      },
      pageBreakdown: pages,
      estimatedPages: finalPageCount,
      bookSpecs: {
        size: '8.5" x 11"',
        binding: 'Hardcover',
        paper: '80lb Premium Paper',
        printing: 'Full Color',
        cover: 'Matte Laminated'
      }
    };

    return res.status(200).json(preview);

  } catch (error) {
    console.error('Preview error:', error);
    return res.status(500).json({
      error: 'Failed to generate preview',
      details: error.message
    });
  }
}
