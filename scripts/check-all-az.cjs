require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkAllAZ() {
  // Get all memorials with coordinates
  const { data: memorials, error } = await supabase
    .from('memorials')
    .select('id, name, cemetery_name, cemetery_lat, cemetery_lng, location_lat, location_lng, gravesite_lat, gravesite_lng, status')
    .in('status', ['approved', 'published']);

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log('Total memorials:', memorials.length);

  // Filter to Arizona coordinates (lat 31-37, lng -115 to -109)
  const azMemorials = memorials.filter(m => {
    const lat = m.gravesite_lat || m.location_lat || m.cemetery_lat;
    const lng = m.gravesite_lng || m.location_lng || m.cemetery_lng;
    return lat >= 31 && lat <= 37 && lng >= -115 && lng <= -109;
  });

  console.log('\nMemorials in Arizona area:', azMemorials.length);
  azMemorials.forEach(m => {
    const lat = m.gravesite_lat || m.location_lat || m.cemetery_lat;
    const lng = m.gravesite_lng || m.location_lng || m.cemetery_lng;
    console.log('\n---');
    console.log('ID:', m.id);
    console.log('Name:', m.name);
    console.log('Cemetery:', m.cemetery_name);
    console.log('Coords:', lat, lng);
    console.log('Status:', m.status);
  });
}

checkAllAZ();
