import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { q, exclude } = req.query;

    if (!q || q.length < 2) {
      return res.status(400).json({ error: 'Search query must be at least 2 characters' });
    }

    // Search for published memorials by name
    let query = supabase
      .from('memorials')
      .select('id, name, main_photo, birth_date, death_date')
      .eq('status', 'published')
      .ilike('name', `%${q}%`)
      .order('name')
      .limit(10);

    // Optionally exclude certain memorial IDs (e.g., the current one being edited)
    if (exclude) {
      const excludeIds = exclude.split(',').filter(id => id.trim());
      if (excludeIds.length > 0) {
        query = query.not('id', 'in', `(${excludeIds.join(',')})`);
      }
    }

    const { data: memorials, error } = await query;

    if (error) {
      console.error('Search error:', error);
      throw error;
    }

    // Format results with date ranges
    const results = memorials.map(m => ({
      id: m.id,
      name: m.name,
      photo: m.main_photo,
      birthYear: m.birth_date ? new Date(m.birth_date).getFullYear() : null,
      deathYear: m.death_date ? new Date(m.death_date).getFullYear() : null,
      dateRange: formatDateRange(m.birth_date, m.death_date)
    }));

    return res.status(200).json({ results });

  } catch (error) {
    console.error('Memorial search error:', error);
    return res.status(500).json({ error: 'Search failed' });
  }
}

function formatDateRange(birthDate, deathDate) {
  const birthYear = birthDate ? new Date(birthDate).getFullYear() : '?';
  const deathYear = deathDate ? new Date(deathDate).getFullYear() : '?';

  if (birthYear === '?' && deathYear === '?') return '';
  return `${birthYear} - ${deathYear}`;
}
