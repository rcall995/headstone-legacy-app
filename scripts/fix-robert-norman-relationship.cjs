// Script to fix the relationship between Robert O Call and Norman Frank Call Jr.
// Norman Jr is Robert's NEPHEW, not uncle

require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function fixRelationship() {
    // First, find Robert O Call and Norman Frank Call Jr.
    const { data: memorials, error } = await supabase
        .from('memorials')
        .select('id, name, relatives')
        .or('name.ilike.%Robert%Call%,name.ilike.%Norman%Call%Jr%');

    if (error) {
        console.error('Error fetching memorials:', error);
        return;
    }

    console.log('Found memorials:');
    memorials.forEach(m => {
        console.log(`- ${m.name} (${m.id})`);
        if (m.relatives && m.relatives.length > 0) {
            console.log('  Relatives:');
            m.relatives.forEach(r => {
                console.log(`    - ${r.name}: ${r.relationship} ${r.memorialId ? `(linked: ${r.memorialId})` : ''}`);
            });
        }
    });

    // Find Robert O Call
    const robert = memorials.find(m => m.name.includes('Robert') && m.name.includes('Call'));
    // Find Norman Jr
    const normanJr = memorials.find(m => m.name.includes('Norman') && m.name.includes('Jr'));

    if (!robert || !normanJr) {
        console.log('\nCould not find both memorials');
        return;
    }

    console.log(`\n=== Fixing Relationships ===`);
    console.log(`Robert: ${robert.id}`);
    console.log(`Norman Jr: ${normanJr.id}`);

    // Fix Robert's relatives - Norman Jr should be listed as "Nephew"
    if (robert.relatives) {
        const robertRelatives = [...robert.relatives];
        const normanInRobert = robertRelatives.findIndex(r => r.memorialId === normanJr.id);

        if (normanInRobert >= 0) {
            console.log(`\nRobert currently has Norman Jr as: ${robertRelatives[normanInRobert].relationship}`);
            robertRelatives[normanInRobert].relationship = 'Nephew';
            console.log(`Changing to: Nephew`);

            const { error: updateError } = await supabase
                .from('memorials')
                .update({ relatives: robertRelatives })
                .eq('id', robert.id);

            if (updateError) {
                console.error('Error updating Robert:', updateError);
            } else {
                console.log('✓ Updated Robert\'s relatives');
            }
        } else {
            console.log('\nNorman Jr not found in Robert\'s relatives');
        }
    }

    // Fix Norman Jr's relatives - Robert should be listed as "Uncle"
    if (normanJr.relatives) {
        const normanRelatives = [...normanJr.relatives];
        const robertInNorman = normanRelatives.findIndex(r => r.memorialId === robert.id);

        if (robertInNorman >= 0) {
            console.log(`\nNorman Jr currently has Robert as: ${normanRelatives[robertInNorman].relationship}`);
            normanRelatives[robertInNorman].relationship = 'Uncle';
            console.log(`Changing to: Uncle`);

            const { error: updateError } = await supabase
                .from('memorials')
                .update({ relatives: normanRelatives })
                .eq('id', normanJr.id);

            if (updateError) {
                console.error('Error updating Norman Jr:', updateError);
            } else {
                console.log('✓ Updated Norman Jr\'s relatives');
            }
        } else {
            console.log('\nRobert not found in Norman Jr\'s relatives');
        }
    }

    console.log('\n=== Done ===');
}

fixRelationship();
