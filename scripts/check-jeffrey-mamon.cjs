require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkJeffrey() {
  const { data, error } = await supabase
    .from('memorials')
    .select('*')
    .eq('id', 'jeffrey-joseph-mamon-ynfvuj')
    .single();

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log('Jeffrey Joseph Mamon details:');
  console.log('Name:', data.name);
  console.log('Birth date:', data.birth_date);
  console.log('Death date:', data.death_date);
  console.log('Birth place:', data.birth_place);
  console.log('Death place:', data.death_place);
  console.log('Cemetery name:', data.cemetery_name);
  console.log('Cemetery address:', data.cemetery_address);
  console.log('cemetery_lat/lng:', data.cemetery_lat, data.cemetery_lng);
  console.log('location_lat/lng:', data.location_lat, data.location_lng);
  console.log('gravesite_lat/lng:', data.gravesite_lat, data.gravesite_lng);
}

checkJeffrey();
