// Import memorials from extracted headstone data
require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const { randomUUID } = require('crypto');
const fs = require('fs');
const path = require('path');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function importMemorials() {
  console.log('Starting memorial import...\n');

  // Load the extracted data
  const dataPath = path.join(__dirname, 'memorial-data.json');
  const memorials = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  console.log(`Loaded ${memorials.length} memorials to import\n`);

  // Get GPS coordinates from first draft (St Stephen's Cemetery)
  const { data: drafts, error: draftError } = await supabase
    .from('memorials')
    .select('gravesite_lat, gravesite_lng, cemetery_name')
    .eq('status', 'draft')
    .not('gravesite_lat', 'is', null)
    .limit(1)
    .single();

  if (draftError) {
    console.error('Error getting draft coordinates:', draftError);
    return;
  }

  const gps = {
    gravesite_lat: drafts.gravesite_lat,
    gravesite_lng: drafts.gravesite_lng,
    cemetery_name: drafts.cemetery_name || "St Stephen's Cemetery"
  };

  console.log(`Using GPS coordinates: ${gps.gravesite_lat}, ${gps.gravesite_lng}`);
  console.log(`Cemetery: ${gps.cemetery_name}\n`);

  let successCount = 0;
  let errorCount = 0;
  const errors = [];

  // Import each memorial
  for (const memorial of memorials) {
    const record = {
      id: randomUUID(),  // Generate unique ID
      name: memorial.name,
      birth_date: memorial.birth_date,
      death_date: memorial.death_date,
      status: 'published',
      show_recent: false,  // Don't show on Recent Memorials
      gravesite_lat: gps.gravesite_lat,
      gravesite_lng: gps.gravesite_lng,
      cemetery_name: gps.cemetery_name,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const { data, error } = await supabase
      .from('memorials')
      .insert(record)
      .select('id, name')
      .single();

    if (error) {
      errorCount++;
      errors.push({ name: memorial.name, error: error.message });
      console.log(`✗ Failed: ${memorial.name} - ${error.message}`);
    } else {
      successCount++;
      console.log(`✓ Created: ${data.name} (${data.id})`);
    }
  }

  console.log('\n' + '='.repeat(50));
  console.log(`Import complete!`);
  console.log(`  Success: ${successCount}`);
  console.log(`  Errors: ${errorCount}`);

  if (errors.length > 0) {
    console.log('\nErrors:');
    errors.forEach(e => console.log(`  - ${e.name}: ${e.error}`));
  }

  return { successCount, errorCount };
}

async function deleteDrafts() {
  console.log('\nDeleting original draft records...');

  const { data, error } = await supabase
    .from('memorials')
    .delete()
    .eq('status', 'draft')
    .select('id');

  if (error) {
    console.error('Error deleting drafts:', error);
    return;
  }

  console.log(`Deleted ${data.length} draft records`);
}

async function main() {
  const result = await importMemorials();

  if (result && result.successCount > 0) {
    // Ask about deleting drafts
    console.log('\nDraft records can be deleted after successful import.');
    console.log('Run with --delete-drafts flag to remove them.');

    if (process.argv.includes('--delete-drafts')) {
      await deleteDrafts();
    }
  }
}

main().catch(console.error);
