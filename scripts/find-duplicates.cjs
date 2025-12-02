// scripts/find-duplicates.cjs - Find potential duplicate memorials
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

let supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Clean up URL if it has trailing newline
if (supabaseUrl) supabaseUrl = supabaseUrl.trim();

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  console.error('URL:', supabaseUrl);
  console.error('Key:', supabaseKey ? 'present' : 'missing');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function findDuplicates() {
  const { data, error } = await supabase
    .from('memorials')
    .select('id, name, birth_date, death_date, source, created_at')
    .order('name');

  if (error) { console.error(error); return; }

  // Group by normalized name
  const byName = {};
  data.forEach(m => {
    const key = m.name?.toLowerCase()?.trim();
    if (!key) return;
    if (!byName[key]) byName[key] = [];
    byName[key].push(m);
  });

  // Find duplicates
  const duplicates = Object.entries(byName)
    .filter(([name, items]) => items.length > 1)
    .map(([name, items]) => ({ name, count: items.length, items }));

  console.log('Potential duplicates found:', duplicates.length);
  duplicates.forEach(d => {
    console.log('\n' + d.name + ' (' + d.count + ' entries):');
    d.items.forEach(i => console.log('  - ID:', i.id, '| Birth:', i.birth_date, '| Death:', i.death_date, '| Source:', i.source, '| Created:', i.created_at));
  });

  return duplicates;
}

findDuplicates();
