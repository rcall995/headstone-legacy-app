// Script to fix Norman Jr's memorial data:
// 1. Check and fix Robert O's relationship from "Other" to "Uncle"
// 2. Remove duplicate milestones

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

async function fixNormanData() {
  // Find Norman Jr's memorial
  const { data: memorials, error: findError } = await supabase
    .from('memorials')
    .select('id, name, relatives, milestones')
    .ilike('name', '%Norman%Jr%');

  if (findError) {
    console.error('Error finding memorial:', findError);
    return;
  }

  if (!memorials || memorials.length === 0) {
    console.log('No memorial found matching "Norman Jr"');

    // Try alternative search
    const { data: altMemorials } = await supabase
      .from('memorials')
      .select('id, name, relatives, milestones')
      .ilike('name', '%Norm%');

    console.log('Alternative search results:', altMemorials?.map(m => ({ id: m.id, name: m.name })));
    return;
  }

  for (const memorial of memorials) {
    console.log(`\n=== Processing: ${memorial.name} (${memorial.id}) ===`);

    // 1. Check relatives for Robert O
    console.log('\n--- Relatives ---');
    const relatives = memorial.relatives || [];
    console.log('Current relatives:', JSON.stringify(relatives, null, 2));

    // Find Robert O and check/fix relationship
    const fixedRelatives = relatives.map(rel => {
      if (rel.name && rel.name.toLowerCase().includes('robert') && rel.name.toLowerCase().includes('call')) {
        console.log(`Found Robert: "${rel.name}" with relationship: "${rel.relationship}"`);
        if (rel.relationship !== 'Uncle') {
          console.log(`  -> Fixing relationship from "${rel.relationship}" to "Uncle"`);
          return { ...rel, relationship: 'Uncle' };
        }
      }
      return rel;
    });

    // 2. Deduplicate milestones
    console.log('\n--- Milestones ---');
    const milestones = memorial.milestones || [];
    console.log('Current milestone count:', milestones.length);
    console.log('Milestones:', JSON.stringify(milestones, null, 2));

    // Deduplicate by title+year combo
    const seen = new Set();
    const uniqueMilestones = milestones.filter(m => {
      const key = `${m.title}|${m.year}`;
      if (seen.has(key)) {
        console.log(`  Removing duplicate: "${m.title}" (${m.year})`);
        return false;
      }
      seen.add(key);
      return true;
    });

    console.log('Unique milestone count:', uniqueMilestones.length);

    // 3. Update if changes were made
    const relativesChanged = JSON.stringify(relatives) !== JSON.stringify(fixedRelatives);
    const milestonesChanged = milestones.length !== uniqueMilestones.length;

    if (relativesChanged || milestonesChanged) {
      console.log('\n--- Updating memorial ---');

      const updateData = {};
      if (relativesChanged) updateData.relatives = fixedRelatives;
      if (milestonesChanged) updateData.milestones = uniqueMilestones;

      const { error: updateError } = await supabase
        .from('memorials')
        .update(updateData)
        .eq('id', memorial.id);

      if (updateError) {
        console.error('Update error:', updateError);
      } else {
        console.log('Successfully updated!');
        if (relativesChanged) console.log('  - Fixed relatives');
        if (milestonesChanged) console.log(`  - Removed ${milestones.length - uniqueMilestones.length} duplicate milestones`);
      }
    } else {
      console.log('\nNo changes needed.');
    }
  }
}

fixNormanData().then(() => {
  console.log('\nDone!');
  process.exit(0);
}).catch(err => {
  console.error('Script error:', err);
  process.exit(1);
});
