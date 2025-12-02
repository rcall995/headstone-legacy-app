require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function fixFredCall() {
  // White Chapel Cemetery, North Tonawanda, NY coordinates
  // Located at approximately: 43.0456, -78.8642
  const correctLat = 43.0456;
  const correctLng = -78.8642;

  const { data, error } = await supabase
    .from('memorials')
    .update({
      gravesite_lat: correctLat,
      gravesite_lng: correctLng
    })
    .eq('id', 'fred-r-call-sr-vkr9s3')
    .select();

  if (error) {
    console.error('Error updating:', error);
    return;
  }

  console.log('Updated Fred R Call Sr coordinates to White Chapel Cemetery, North Tonawanda, NY');
  console.log('New coordinates:', correctLat, correctLng);
  console.log('Result:', data);
}

fixFredCall();
