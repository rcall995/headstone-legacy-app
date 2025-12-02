require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function fixCoords() {
  // Fix James Rogan to match other St Stephens memorials
  const stStephensLat = 43.0194471669405;
  const stStephensLng = -78.9659915924706;

  const { data: james, error: jErr } = await supabase
    .from('memorials')
    .update({
      gravesite_lat: stStephensLat,
      gravesite_lng: stStephensLng
    })
    .ilike('name', '%james%rogan%')
    .select('id, name, gravesite_lat, gravesite_lng');

  if (jErr) {
    console.error('Error updating James Rogan:', jErr);
  } else {
    console.log('Updated James Rogan:', james);
  }

  // Fix Robert Call to match Fred Call at White Chapel Cemetery
  const whiteChapelLat = 43.0456;
  const whiteChapelLng = -78.8642;

  const { data: robert, error: rErr } = await supabase
    .from('memorials')
    .update({
      gravesite_lat: whiteChapelLat,
      gravesite_lng: whiteChapelLng
    })
    .ilike('name', '%robert%call%')
    .select('id, name, gravesite_lat, gravesite_lng');

  if (rErr) {
    console.error('Error updating Robert Call:', rErr);
  } else {
    console.log('Updated Robert Call:', robert);
  }
}

fixCoords();
