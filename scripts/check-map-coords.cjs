require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function check() {
  // Check St Stephens coordinates
  const { data: stStephens } = await supabase
    .from('memorials')
    .select('id, name, gravesite_lat, gravesite_lng, cemetery_lat, cemetery_lng, location_lat, location_lng, cemetery_name')
    .or('cemetery_name.ilike.%st stephen%,cemetery_name.ilike.%st. stephen%')
    .in('status', ['approved', 'published'])
    .limit(5);

  console.log('=== ST STEPHENS SAMPLES ===');
  stStephens?.forEach(m => {
    const lat = m.gravesite_lat || m.cemetery_lat || m.location_lat;
    const lng = m.gravesite_lng || m.cemetery_lng || m.location_lng;
    console.log(m.name, ':', lat?.toFixed(6), lng?.toFixed(6));
  });

  // Check James Rogan specifically
  const { data: james } = await supabase
    .from('memorials')
    .select('id, name, gravesite_lat, gravesite_lng, cemetery_lat, cemetery_lng, location_lat, location_lng, cemetery_name, status')
    .ilike('name', '%james%rogan%');

  console.log('\n=== JAMES ROGAN ===');
  james?.forEach(m => {
    console.log('Status:', m.status);
    console.log('gravesite:', m.gravesite_lat, m.gravesite_lng);
    console.log('cemetery:', m.cemetery_lat, m.cemetery_lng);
    console.log('location:', m.location_lat, m.location_lng);
    console.log('cemetery_name:', m.cemetery_name);
  });

  // Check White Chapel / North Tonawanda area
  const { data: whitechapel } = await supabase
    .from('memorials')
    .select('id, name, gravesite_lat, gravesite_lng, cemetery_lat, cemetery_lng, location_lat, location_lng, cemetery_name, status')
    .or('cemetery_name.ilike.%white chapel%,name.ilike.%fred%call%,name.ilike.%robert%call%')
    .in('status', ['approved', 'published']);

  console.log('\n=== WHITE CHAPEL / CALLS ===');
  whitechapel?.forEach(m => {
    const lat = m.gravesite_lat || m.cemetery_lat || m.location_lat;
    const lng = m.gravesite_lng || m.cemetery_lng || m.location_lng;
    console.log(m.name, ':', lat?.toFixed(6), lng?.toFixed(6), '| cemetery:', m.cemetery_name);
    console.log('  gravesite:', m.gravesite_lat, m.gravesite_lng);
    console.log('  cemetery:', m.cemetery_lat, m.cemetery_lng);
    console.log('  location:', m.location_lat, m.location_lng);
  });

  // Check Forest Lawn
  const { data: forestLawn } = await supabase
    .from('memorials')
    .select('id, name, gravesite_lat, gravesite_lng, cemetery_lat, cemetery_lng, location_lat, location_lng')
    .ilike('cemetery_name', '%forest lawn%')
    .in('status', ['approved', 'published']);

  console.log('\n=== FOREST LAWN (' + forestLawn?.length + ' total) ===');
  forestLawn?.forEach(m => {
    const lat = m.gravesite_lat || m.cemetery_lat || m.location_lat;
    const lng = m.gravesite_lng || m.cemetery_lng || m.location_lng;
    console.log(m.name, ':', lat?.toFixed(6), lng?.toFixed(6));
  });
}

check();
