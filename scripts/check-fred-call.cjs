require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkFredCall() {
  // Search for Fred R Call
  const { data, error } = await supabase
    .from('memorials')
    .select('id, name, cemetery_name, cemetery_lat, cemetery_lng, location_lat, location_lng, gravesite_lat, gravesite_lng, status')
    .ilike('name', '%Fred%Call%');

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log('Found memorials matching "Fred Call":');
  data.forEach(m => {
    console.log('\n---');
    console.log('ID:', m.id);
    console.log('Name:', m.name);
    console.log('Status:', m.status);
    console.log('Cemetery:', m.cemetery_name);
    console.log('cemetery_lat/lng:', m.cemetery_lat, m.cemetery_lng);
    console.log('location_lat/lng:', m.location_lat, m.location_lng);
    console.log('gravesite_lat/lng:', m.gravesite_lat, m.gravesite_lng);
  });

  // Also check for any memorials in Arizona area (roughly lat 31-37, lng -115 to -109)
  console.log('\n\n=== Memorials in Arizona area ===');
  const { data: azMemorials, error: azError } = await supabase
    .from('memorials')
    .select('id, name, cemetery_name, cemetery_lat, cemetery_lng, location_lat, location_lng')
    .or('cemetery_lat.gte.31,location_lat.gte.31')
    .or('cemetery_lat.lte.37,location_lat.lte.37')
    .in('status', ['approved', 'published']);

  if (azError) {
    console.error('AZ Error:', azError);
    return;
  }

  // Filter to actual AZ coordinates
  const azFiltered = azMemorials.filter(m => {
    const lat = m.location_lat || m.cemetery_lat;
    const lng = m.location_lng || m.cemetery_lng;
    return lat >= 31 && lat <= 37 && lng >= -115 && lng <= -109;
  });

  azFiltered.forEach(m => {
    console.log('\n---');
    console.log('ID:', m.id);
    console.log('Name:', m.name);
    console.log('Cemetery:', m.cemetery_name);
    console.log('Coords:', m.location_lat || m.cemetery_lat, m.location_lng || m.cemetery_lng);
  });
}

checkFredCall();
