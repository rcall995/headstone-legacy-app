require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkStStephens() {
  // Search for St Stephens Cemetery
  const { data, error } = await supabase
    .from('memorials')
    .select('id, name, cemetery_name, cemetery_address, cemetery_lat, cemetery_lng, location_lat, location_lng, gravesite_lat, gravesite_lng, status')
    .or('cemetery_name.ilike.%st stephen%,cemetery_name.ilike.%st. stephen%')
    .in('status', ['approved', 'published']);

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log('Memorials at St Stephens Cemetery:', data.length);
  data.forEach(m => {
    const lat = m.gravesite_lat || m.cemetery_lat || m.location_lat;
    const lng = m.gravesite_lng || m.cemetery_lng || m.location_lng;
    console.log('\n---');
    console.log('Name:', m.name);
    console.log('Cemetery:', m.cemetery_name);
    console.log('Address:', m.cemetery_address);
    console.log('Display coords:', lat, lng);
    console.log('  gravesite:', m.gravesite_lat, m.gravesite_lng);
    console.log('  cemetery:', m.cemetery_lat, m.cemetery_lng);
    console.log('  location:', m.location_lat, m.location_lng);
  });

  // Also search for James P Rogan specifically
  console.log('\n\n=== James P Rogan ===');
  const { data: james, error: jErr } = await supabase
    .from('memorials')
    .select('*')
    .ilike('name', '%james%rogan%');

  if (james) {
    james.forEach(m => {
      console.log('Name:', m.name);
      console.log('Cemetery:', m.cemetery_name);
      console.log('Cemetery address:', m.cemetery_address);
      console.log('gravesite:', m.gravesite_lat, m.gravesite_lng);
      console.log('cemetery:', m.cemetery_lat, m.cemetery_lng);
      console.log('location:', m.location_lat, m.location_lng);
    });
  }
}

checkStStephens();
