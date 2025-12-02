require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function fixJeffrey() {
  // Columbia, SC coordinates (city center - death place)
  const columbiaLat = 34.0007;
  const columbiaLng = -81.0348;

  const { data, error } = await supabase
    .from('memorials')
    .update({
      gravesite_lat: columbiaLat,
      gravesite_lng: columbiaLng,
      gravesite_accuracy: null, // Clear accuracy since it's city-level
      needs_location: true // Flag that exact location needs to be added
    })
    .eq('id', 'jeffrey-joseph-mamon-ynfvuj')
    .select('id, name, gravesite_lat, gravesite_lng, needs_location');

  if (error) {
    console.error('Error updating:', error);
    return;
  }

  console.log('Updated Jeffrey Joseph Mamon to Columbia, SC (city-level):');
  console.log(data);
}

fixJeffrey();
