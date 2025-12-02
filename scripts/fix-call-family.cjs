// Fix Call family relationships
// - Remove duplicates
// - Standardize relationship labels
// - Add missing reciprocals

require('dotenv').config({ path: '.env.local' });

const url = (process.env.SUPABASE_URL || '').replace(/\\n/g, '').trim();
const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').replace(/\\n/g, '').trim();

const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(url, key);

// The Call family structure:
// Fred R Call Sr + Dorothy (Ma) R. Call = Parents
// Children: Norman Frank Call Sr, Robert O. Call Sr, Jeanette (Call) Hill, Fred R. Call Jr

const FAMILY = {
    dorothy: 'scout-1764608468412-q8b675',
    fredSr: 'fred-r-call-sr-vkr9s3',
    normanSr: 'norman-frank-call-sr-sh94p2',
    robert: 'robert-o-call-sr-hvf4k8',
    jeanette: 'scout-1764608461212-y3a22c',
    fredJr: 'scout-1764608480577-emqusa',
    normanJr: 'norman-frank-call-jr-i06ofe'
};

async function fixRelationships() {
    console.log('Starting Call family relationship cleanup...\n');

    // 1. Fix Dorothy - remove duplicates, ensure all children are listed
    console.log('1. Fixing Dorothy...');
    await updateRelatives(FAMILY.dorothy, [
        { name: 'Fred R Call Sr', relationship: 'Spouse', memorialId: FAMILY.fredSr },
        { name: 'Norman Frank Call Sr.', relationship: 'Son', memorialId: FAMILY.normanSr },
        { name: 'Robert O. Call Sr.', relationship: 'Son', memorialId: FAMILY.robert },
        { name: 'Jeanette (Call) Hill', relationship: 'Daughter', memorialId: FAMILY.jeanette },
        { name: 'Fred R. Call Jr', relationship: 'Son', memorialId: FAMILY.fredJr }
    ]);

    // 2. Fix Fred Sr - add all children
    console.log('2. Fixing Fred Sr...');
    await updateRelatives(FAMILY.fredSr, [
        { name: 'Dorothy (Ma) R. Call', relationship: 'Spouse', memorialId: FAMILY.dorothy },
        { name: 'Norman Frank Call Sr.', relationship: 'Son', memorialId: FAMILY.normanSr },
        { name: 'Robert O. Call Sr.', relationship: 'Son', memorialId: FAMILY.robert },
        { name: 'Jeanette (Call) Hill', relationship: 'Daughter', memorialId: FAMILY.jeanette },
        { name: 'Fred R. Call Jr', relationship: 'Son', memorialId: FAMILY.fredJr }
    ]);

    // 3. Fix Norman Sr - correct parent relationships
    console.log('3. Fixing Norman Sr...');
    await updateRelatives(FAMILY.normanSr, [
        { name: 'Anna Rose (Kerschner) Call', relationship: 'Spouse', memorialId: 'anna-rose-kerschner-call-n2wmlz' },
        { name: 'Norman Frank Call Jr.', relationship: 'Son', memorialId: FAMILY.normanJr },
        { name: 'Dorothy (Ma) R. Call', relationship: 'Mother', memorialId: FAMILY.dorothy },
        { name: 'Fred R Call Sr', relationship: 'Father', memorialId: FAMILY.fredSr },
        { name: 'Robert O. Call Sr.', relationship: 'Brother', memorialId: FAMILY.robert },
        { name: 'Jeanette (Call) Hill', relationship: 'Sister', memorialId: FAMILY.jeanette },
        { name: 'Fred R. Call Jr', relationship: 'Brother', memorialId: FAMILY.fredJr }
    ]);

    // 4. Fix Robert - correct parent relationships
    console.log('4. Fixing Robert...');
    await updateRelatives(FAMILY.robert, [
        { name: 'Dorothy (Ma) R. Call', relationship: 'Mother', memorialId: FAMILY.dorothy },
        { name: 'Fred R Call Sr', relationship: 'Father', memorialId: FAMILY.fredSr },
        { name: 'Norman Frank Call Sr.', relationship: 'Brother', memorialId: FAMILY.normanSr },
        { name: 'Jeanette (Call) Hill', relationship: 'Sister', memorialId: FAMILY.jeanette },
        { name: 'Fred R. Call Jr', relationship: 'Brother', memorialId: FAMILY.fredJr },
        { name: 'Norman Frank Call Jr.', relationship: 'Nephew', memorialId: FAMILY.normanJr }
    ]);

    // 5. Fix Jeanette
    console.log('5. Fixing Jeanette...');
    await updateRelatives(FAMILY.jeanette, [
        { name: 'Dorothy (Ma) R. Call', relationship: 'Mother', memorialId: FAMILY.dorothy },
        { name: 'Fred R Call Sr', relationship: 'Father', memorialId: FAMILY.fredSr },
        { name: 'Norman Frank Call Sr.', relationship: 'Brother', memorialId: FAMILY.normanSr },
        { name: 'Robert O. Call Sr.', relationship: 'Brother', memorialId: FAMILY.robert },
        { name: 'Fred R. Call Jr', relationship: 'Brother', memorialId: FAMILY.fredJr }
    ]);

    // 6. Fix Fred Jr
    console.log('6. Fixing Fred Jr...');
    await updateRelatives(FAMILY.fredJr, [
        { name: 'Dorothy (Ma) R. Call', relationship: 'Mother', memorialId: FAMILY.dorothy },
        { name: 'Fred R Call Sr', relationship: 'Father', memorialId: FAMILY.fredSr },
        { name: 'Norman Frank Call Sr.', relationship: 'Brother', memorialId: FAMILY.normanSr },
        { name: 'Robert O. Call Sr.', relationship: 'Brother', memorialId: FAMILY.robert },
        { name: 'Jeanette (Call) Hill', relationship: 'Sister', memorialId: FAMILY.jeanette }
    ]);

    // 7. Fix Norman Jr
    console.log('7. Fixing Norman Jr...');
    await updateRelatives(FAMILY.normanJr, [
        { name: 'Norman Frank Call Sr.', relationship: 'Father', memorialId: FAMILY.normanSr },
        { name: 'Anna Rose (Kerschner) Call', relationship: 'Mother', memorialId: 'anna-rose-kerschner-call-n2wmlz' },
        { name: 'Robert O. Call Sr.', relationship: 'Uncle', memorialId: FAMILY.robert },
        { name: 'Antoinette (Galbo) Kerschner', relationship: 'Grandmother', memorialId: 'antoinette-galbo-kerschner-j8x722' },
        { name: 'Dorothy (Ma) R. Call', relationship: 'Grandmother', memorialId: FAMILY.dorothy },
        { name: 'Fred R Call Sr', relationship: 'Grandfather', memorialId: FAMILY.fredSr }
    ]);

    console.log('\nDone! Call family relationships have been cleaned up.');
}

async function updateRelatives(memorialId, relatives) {
    const { error } = await supabase
        .from('memorials')
        .update({ relatives })
        .eq('id', memorialId);

    if (error) {
        console.error(`  Error updating ${memorialId}:`, error.message);
    } else {
        console.log(`  Updated ${memorialId} with ${relatives.length} relatives`);
    }
}

fixRelationships().catch(console.error);
