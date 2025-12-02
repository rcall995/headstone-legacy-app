// Add Donald L. Call as grandson to Fred Pop and Dorothy
require('dotenv').config({ path: '.env.local' });

const url = (process.env.SUPABASE_URL || '').replace(/\\n/g, '').trim();
const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').replace(/\\n/g, '').trim();

const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(url, key);

async function fix() {
    const fredPopId = 'scout-1764608473058-hllhc9';
    const donaldId = 'scout-1764608475778-ogc0gz';
    const dorothyId = 'scout-1764608468412-q8b675';

    // Get Fred Pop's current relatives
    const { data: fredPop } = await supabase
        .from('memorials')
        .select('relatives')
        .eq('id', fredPopId)
        .single();

    let relatives = fredPop?.relatives || [];

    // Check if Donald is already there
    const hasDonald = relatives.some(r => r.memorialId === donaldId);

    if (!hasDonald) {
        // Add Donald as grandson
        relatives.push({
            name: 'Donald L. Call',
            relationship: 'Grandson',
            memorialId: donaldId,
            dates: '1943 - 1957'
        });

        await supabase
            .from('memorials')
            .update({ relatives })
            .eq('id', fredPopId);

        console.log('Added Donald as Grandson to Fred Pop');
    } else {
        console.log('Donald already in Fred Pop relatives');
    }

    // Get Donald's current relatives
    const { data: donald } = await supabase
        .from('memorials')
        .select('relatives')
        .eq('id', donaldId)
        .single();

    let donaldRels = donald?.relatives || [];

    // Add Fred Pop as Grandfather to Donald
    const hasFredPop = donaldRels.some(r => r.memorialId === fredPopId);

    if (!hasFredPop) {
        donaldRels.push({
            name: 'Fred (Pop) R Call Sr.',
            relationship: 'Grandfather',
            memorialId: fredPopId,
            dates: '1900 - 1967'
        });

        console.log('Added Fred Pop as Grandfather to Donald');
    }

    // Add Dorothy as Grandmother to Donald
    const hasDorothy = donaldRels.some(r => r.memorialId === dorothyId);

    if (!hasDorothy) {
        donaldRels.push({
            name: 'Dorothy (Ma) R. Call',
            relationship: 'Grandmother',
            memorialId: dorothyId,
            dates: '1901 - 1984'
        });

        console.log('Added Dorothy as Grandmother to Donald');
    }

    // Update Donald's relatives
    if (!hasFredPop || !hasDorothy) {
        await supabase
            .from('memorials')
            .update({ relatives: donaldRels })
            .eq('id', donaldId);
    }

    // Add Donald as Grandson to Dorothy
    const { data: dorothy } = await supabase
        .from('memorials')
        .select('relatives')
        .eq('id', dorothyId)
        .single();

    let dorothyRels = dorothy?.relatives || [];
    const dorothyHasDonald = dorothyRels.some(r => r.memorialId === donaldId);

    if (!dorothyHasDonald) {
        dorothyRels.push({
            name: 'Donald L. Call',
            relationship: 'Grandson',
            memorialId: donaldId,
            dates: '1943 - 1957'
        });

        await supabase
            .from('memorials')
            .update({ relatives: dorothyRels })
            .eq('id', dorothyId);

        console.log('Added Donald as Grandson to Dorothy');
    } else {
        console.log('Donald already in Dorothy relatives');
    }

    console.log('\nDone! Donald is now connected to his grandparents.');
}

fix().catch(console.error);
