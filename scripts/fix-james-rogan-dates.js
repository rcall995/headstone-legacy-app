// Quick script to fix James Rogan's dates to year-only
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function fixDates() {
    // First find Rogan memorials
    const { data: memorials, error: findError } = await supabase
        .from('memorials')
        .select('id, name, birth_date, death_date')
        .ilike('name', '%Rogan%');

    if (findError) {
        console.error('Error finding memorial:', findError);
        return;
    }

    console.log('Found memorials:', memorials);

    if (memorials.length === 0) {
        console.log('No memorial found for James Rogan');
        return;
    }

    // Update each one to year-only (set to null if they want, or keep as year-only)
    for (const memorial of memorials) {
        console.log(`\nMemorial: ${memorial.name} (${memorial.id})`);
        console.log(`  Birth: ${memorial.birth_date}`);
        console.log(`  Death: ${memorial.death_date}`);

        // Extract year only
        const birthYear = memorial.birth_date ? memorial.birth_date.split('-')[0] : null;
        const deathYear = memorial.death_date ? memorial.death_date.split('-')[0] : null;

        // Update to year-only format (YYYY-01-01 is treated as year-only by the system)
        const { error: updateError } = await supabase
            .from('memorials')
            .update({
                birth_date: birthYear ? `${birthYear}-01-01` : null,
                death_date: deathYear ? `${deathYear}-01-01` : null
            })
            .eq('id', memorial.id);

        if (updateError) {
            console.error('Error updating:', updateError);
        } else {
            console.log(`  Updated to: Birth ${birthYear}-01-01, Death ${deathYear}-01-01`);
        }
    }
}

fixDates();
