// Fix mismatched reciprocal relationships in memorial_connections table
require('dotenv').config({ path: '.env.local' });

const url = (process.env.SUPABASE_URL || '').replace(/\\n/g, '').trim();
const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').replace(/\\n/g, '').trim();

const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(url, key);

// Gender inference
const maleNames = ['fred', 'norman', 'robert', 'james', 'john', 'william', 'michael', 'david', 'richard', 'joseph', 'thomas', 'charles', 'daniel', 'donald', 'steven', 'paul', 'andrew', 'joshua', 'kenneth', 'kevin', 'brian', 'george', 'timothy', 'ronald', 'edward', 'jason', 'jeffrey', 'ryan', 'jacob', 'gary', 'nicholas', 'eric', 'frank', 'jack', 'henry', 'peter', 'albert', 'joe', 'bobby'];
const femaleNames = ['dorothy', 'mary', 'patricia', 'jennifer', 'linda', 'barbara', 'elizabeth', 'susan', 'jessica', 'sarah', 'karen', 'lisa', 'nancy', 'betty', 'margaret', 'sandra', 'ashley', 'anna', 'emma', 'helen', 'ruth', 'marie', 'rose', 'jeanette', 'antoinette', 'alice', 'joan', 'martha', 'grace', 'diane'];

function inferGender(name) {
    const firstName = (name || '').toLowerCase().split(' ')[0].replace(/[^a-z]/g, '');
    if (maleNames.includes(firstName)) return 'male';
    if (femaleNames.includes(firstName)) return 'female';
    return null;
}

// What the reciprocal should be based on what they say about us
const reciprocalMap = {
    'uncle': { male: 'Nephew', female: 'Niece', default: 'Nephew/Niece' },
    'aunt': { male: 'Nephew', female: 'Niece', default: 'Nephew/Niece' },
    'nephew': { male: 'Uncle', female: 'Aunt', default: 'Uncle/Aunt' },
    'niece': { male: 'Uncle', female: 'Aunt', default: 'Uncle/Aunt' },
    'grandfather': { male: 'Grandson', female: 'Granddaughter', default: 'Grandchild' },
    'grandmother': { male: 'Grandson', female: 'Granddaughter', default: 'Grandchild' },
    'grandparent': { male: 'Grandson', female: 'Granddaughter', default: 'Grandchild' },
    'grandson': { male: 'Grandfather', female: 'Grandmother', default: 'Grandparent' },
    'granddaughter': { male: 'Grandfather', female: 'Grandmother', default: 'Grandparent' },
    'grandchild': { male: 'Grandfather', female: 'Grandmother', default: 'Grandparent' },
    'father': { male: 'Son', female: 'Daughter', default: 'Child' },
    'mother': { male: 'Son', female: 'Daughter', default: 'Child' },
    'parent': { male: 'Son', female: 'Daughter', default: 'Child' },
    'son': { male: 'Father', female: 'Mother', default: 'Parent' },
    'daughter': { male: 'Father', female: 'Mother', default: 'Parent' },
    'child': { male: 'Father', female: 'Mother', default: 'Parent' },
    'brother': { male: 'Brother', female: 'Sister', default: 'Sibling' },
    'sister': { male: 'Brother', female: 'Sister', default: 'Sibling' },
    'sibling': { male: 'Brother', female: 'Sister', default: 'Sibling' },
    'spouse': { male: 'Spouse', female: 'Spouse', default: 'Spouse' },
    'husband': { male: 'Spouse', female: 'Spouse', default: 'Spouse' },
    'wife': { male: 'Spouse', female: 'Spouse', default: 'Spouse' },
    'cousin': { male: 'Cousin', female: 'Cousin', default: 'Cousin' }
};

function getExpectedReciprocal(theirRelToUs, ourName) {
    const lower = (theirRelToUs || '').toLowerCase();
    const mapping = reciprocalMap[lower];
    if (!mapping) return null;

    const gender = inferGender(ourName);
    if (gender === 'male') return mapping.male;
    if (gender === 'female') return mapping.female;
    return mapping.default;
}

async function fixAll() {
    console.log('Checking and fixing mismatched reciprocal relationships...\n');

    // Get all connections
    const { data: connections, error: connError } = await supabase
        .from('memorial_connections')
        .select('id, memorial_id, connected_memorial_id, relationship_label');

    if (connError) {
        console.error('Error fetching connections:', connError.message);
        return;
    }

    // Get all memorial names
    const { data: memorials } = await supabase
        .from('memorials')
        .select('id, name');

    const nameMap = {};
    memorials?.forEach(m => nameMap[m.id] = m.name);

    let fixed = 0;
    const processed = new Set();

    for (const conn of connections) {
        // Skip if we already processed this pair
        const pairKey = [conn.memorial_id, conn.connected_memorial_id].sort().join('|');
        if (processed.has(pairKey)) continue;
        processed.add(pairKey);

        // Find the reverse connection
        const reverse = connections.find(c =>
            c.memorial_id === conn.connected_memorial_id &&
            c.connected_memorial_id === conn.memorial_id
        );

        if (!reverse) continue;

        const name1 = nameMap[conn.memorial_id] || 'Unknown';
        const name2 = nameMap[conn.connected_memorial_id] || 'Unknown';

        // What name1 says about name2
        const rel1to2 = conn.relationship_label;
        // What name2 says about name1
        const rel2to1 = reverse.relationship_label;

        // What should name2 say about name1 (based on what name1 says)?
        const expected2to1 = getExpectedReciprocal(rel1to2, name2);
        // What should name1 say about name2 (based on what name2 says)?
        const expected1to2 = getExpectedReciprocal(rel2to1, name1);

        // Check if rel2to1 matches expected
        if (expected2to1 && rel2to1.toLowerCase() !== expected2to1.toLowerCase()) {
            console.log(`${name1} says ${name2} is "${rel1to2}"`);
            console.log(`  ${name2} says ${name1} is "${rel2to1}" but should be "${expected2to1}"`);

            // Fix it
            const { error } = await supabase
                .from('memorial_connections')
                .update({ relationship_label: expected2to1 })
                .eq('id', reverse.id);

            if (error) {
                console.log(`  ERROR: ${error.message}`);
            } else {
                console.log(`  FIXED: Updated to "${expected2to1}"`);
                fixed++;
            }
            console.log('');
        }
    }

    console.log(`\nDone! Fixed ${fixed} mismatched reciprocal relationships.`);
}

fixAll().catch(console.error);
