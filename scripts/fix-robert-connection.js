// Script to fix Robert O's connection relationship_type in the connections table

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '..', '.env.local') });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function fixRobertConnection() {
  // Find the connection between Norman Jr and Robert O
  const { data: connections, error: findError } = await supabase
    .from('memorial_connections')
    .select('*')
    .eq('id', '30bdfafe-0548-4e92-adf5-093b164db690'); // from the API response

  if (findError) {
    console.error('Error finding connection:', findError);
    return;
  }

  console.log('Found connection:', JSON.stringify(connections, null, 2));

  if (!connections || connections.length === 0) {
    console.log('No connection found with that ID');

    // Try finding by memorial IDs
    const { data: altConnections } = await supabase
      .from('memorial_connections')
      .select('*')
      .or('memorial_a.eq.robert-o-call-sr-hvf4k8,memorial_b.eq.robert-o-call-sr-hvf4k8');

    console.log('\nConnections involving Robert O:', JSON.stringify(altConnections, null, 2));

    if (altConnections && altConnections.length > 0) {
      for (const conn of altConnections) {
        if (conn.relationship_type === 'other' && conn.relationship_label?.toLowerCase() === 'uncle') {
          console.log(`\nFixing connection ${conn.id}...`);
          // Set relationship_type to NULL so tree.js falls back to using relationship_label
          const { error: updateError } = await supabase
            .from('memorial_connections')
            .update({ relationship_type: null })
            .eq('id', conn.id);

          if (updateError) {
            console.error('Update error:', updateError);
          } else {
            console.log('Successfully updated relationship_type to "uncle"');
          }
        }
      }
    }
    return;
  }

  // Delete the connection - the data is already in memorial.relatives JSONB field
  // This connection row is redundant and has incorrect relationship_type
  for (const conn of connections) {
    if (conn.relationship_type === 'other' && conn.relationship_label) {
      console.log(`\nDeleting redundant connection ${conn.id}...`);
      console.log(`  This data exists in memorial.relatives with relationship: "${conn.relationship_label}"`);
      const { error: deleteError } = await supabase
        .from('memorial_connections')
        .delete()
        .eq('id', conn.id);

      if (deleteError) {
        console.error('Delete error:', deleteError);
      } else {
        console.log('Successfully deleted! The relatives JSONB data will be used instead.');
      }
    }
  }
}

fixRobertConnection().then(() => {
  console.log('\nDone!');
  process.exit(0);
}).catch(err => {
  console.error('Script error:', err);
  process.exit(1);
});
