// Fix grandchild gender relationships
require('dotenv').config({ path: '.env.local' });

const url = (process.env.SUPABASE_URL || '').replace(/\\n/g, '').trim();
const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').replace(/\\n/g, '').trim();

const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(url, key);

async function fix() {
    const normanJrId = 'norman-frank-call-jr-i06ofe';

    // Find Antoinette's connection to Norman Jr and fix it
    const { data: antoinette } = await supabase
        .from('memorials')
        .select('id')
        .ilike('name', '%Antoinette%')
        .single();

    if (antoinette) {
        const { error } = await supabase
            .from('memorial_connections')
            .update({ relationship_label: 'Grandson' })
            .eq('memorial_id', antoinette.id)
            .eq('connected_memorial_id', normanJrId);

        if (error) {
            console.log('Error fixing Antoinette -> Norman Jr:', error.message);
        } else {
            console.log('Fixed Antoinette -> Norman Jr: Grandson');
        }
    }

    // Also fix Fred (Pop) -> Norman Jr (should be Grandson, not Grandchild)
    const fredPopId = 'scout-1764608473058-hllhc9';
    const { error: err2 } = await supabase
        .from('memorial_connections')
        .update({ relationship_label: 'Grandson' })
        .eq('memorial_id', fredPopId)
        .eq('connected_memorial_id', normanJrId);

    if (err2) {
        console.log('Error fixing Fred (Pop) -> Norman Jr:', err2.message);
    } else {
        console.log('Fixed Fred (Pop) -> Norman Jr: Grandson');
    }

    // Verify
    const { data: check } = await supabase
        .from('memorial_connections')
        .select('relationship_label')
        .eq('connected_memorial_id', normanJrId)
        .in('relationship_label', ['Grandson', 'Granddaughter', 'Grandchild']);

    console.log('Grandparent->Norman Jr relationships:', check);
}

fix().catch(console.error);
