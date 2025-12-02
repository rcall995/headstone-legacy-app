require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkDetails() {
  const ids = ['e6fdb2e4-74cf-485d-af21-57ce7206edb9', 'jeffrey-joseph-mamon-ynfvuj', 'fred-r-call-sr-vkr9s3'];

  const { data, error } = await supabase
    .from('memorials')
    .select('id, name, created_at, updated_at, curator_ids, source, imported_by, gravesite_lat, gravesite_lng')
    .in('id', ids);

  if (error) {
    console.error('Error:', error);
    return;
  }

  data.forEach(m => {
    console.log('\n---');
    console.log('ID:', m.id);
    console.log('Name:', m.name);
    console.log('Created:', m.created_at);
    console.log('Updated:', m.updated_at);
    console.log('Curator IDs:', m.curator_ids);
    console.log('Source:', m.source);
    console.log('Imported by:', m.imported_by);
    console.log('Gravesite coords:', m.gravesite_lat, m.gravesite_lng);
  });
}

checkDetails();
