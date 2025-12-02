// Fix all remaining generic relationships in the database
require('dotenv').config({ path: '.env.local' });

const url = (process.env.SUPABASE_URL || '').replace(/\\n/g, '').trim();
const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').replace(/\\n/g, '').trim();

const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(url, key);

const maleNames = ['fred', 'norman', 'robert', 'james', 'john', 'william', 'michael', 'david', 'richard', 'joseph', 'thomas', 'charles', 'daniel', 'matthew', 'anthony', 'mark', 'donald', 'steven', 'paul', 'andrew', 'joshua', 'kenneth', 'kevin', 'brian', 'george', 'timothy', 'ronald', 'edward', 'jason', 'jeffrey', 'ryan', 'jacob', 'gary', 'nicholas', 'eric', 'jonathan', 'stephen', 'larry', 'justin', 'scott', 'brandon', 'benjamin', 'samuel', 'raymond', 'gregory', 'frank', 'alexander', 'patrick', 'jack', 'dennis', 'jerry', 'tyler', 'aaron', 'jose', 'adam', 'nathan', 'henry', 'douglas', 'zachary', 'peter', 'kyle', 'noah', 'ethan', 'jeremy', 'walter', 'christian', 'keith', 'roger', 'terry', 'austin', 'sean', 'gerald', 'carl', 'harold', 'dylan', 'arthur', 'lawrence', 'jordan', 'jesse', 'bryan', 'billy', 'bruce', 'gabriel', 'joe', 'logan', 'albert', 'willie', 'alan', 'eugene', 'russell', 'vincent', 'philip', 'bobby', 'johnny', 'bradley'];
const femaleNames = ['dorothy', 'mary', 'patricia', 'jennifer', 'linda', 'barbara', 'elizabeth', 'susan', 'jessica', 'sarah', 'karen', 'lisa', 'nancy', 'betty', 'margaret', 'sandra', 'ashley', 'kimberly', 'emily', 'donna', 'michelle', 'carol', 'amanda', 'melissa', 'deborah', 'stephanie', 'rebecca', 'sharon', 'laura', 'cynthia', 'kathleen', 'amy', 'angela', 'shirley', 'anna', 'brenda', 'pamela', 'emma', 'nicole', 'helen', 'samantha', 'katherine', 'christine', 'debra', 'rachel', 'carolyn', 'janet', 'catherine', 'maria', 'heather', 'diane', 'ruth', 'julie', 'olivia', 'joyce', 'virginia', 'victoria', 'kelly', 'lauren', 'christina', 'joan', 'evelyn', 'judith', 'megan', 'andrea', 'cheryl', 'hannah', 'jacqueline', 'martha', 'gloria', 'teresa', 'ann', 'sara', 'madison', 'frances', 'kathryn', 'janice', 'jean', 'abigail', 'alice', 'judy', 'sophia', 'grace', 'denise', 'amber', 'doris', 'marilyn', 'danielle', 'beverly', 'isabella', 'theresa', 'diana', 'natalie', 'brittany', 'charlotte', 'marie', 'kayla', 'alexis', 'lori', 'jeanette', 'antoinette', 'rose'];

function inferGender(name) {
    const firstName = (name || '').toLowerCase().split(' ')[0].replace(/[^a-z]/g, '');
    if (maleNames.includes(firstName)) return 'male';
    if (femaleNames.includes(firstName)) return 'female';
    return null;
}

// Generic to specific mappings based on gender
function getSpecificRelationship(generic, gender) {
    const lower = (generic || '').toLowerCase();

    const mappings = {
        'parent': { male: 'Father', female: 'Mother', default: 'Parent' },
        'child': { male: 'Son', female: 'Daughter', default: 'Child' },
        'sibling': { male: 'Brother', female: 'Sister', default: 'Sibling' },
        'grandparent': { male: 'Grandfather', female: 'Grandmother', default: 'Grandparent' },
        'grandchild': { male: 'Grandson', female: 'Granddaughter', default: 'Grandchild' },
        'niece/nephew': { male: 'Nephew', female: 'Niece', default: 'Nephew/Niece' },
        'nephew/niece': { male: 'Nephew', female: 'Niece', default: 'Nephew/Niece' },
        'uncle/aunt': { male: 'Uncle', female: 'Aunt', default: 'Uncle/Aunt' },
        'aunt/uncle': { male: 'Uncle', female: 'Aunt', default: 'Uncle/Aunt' }
    };

    if (mappings[lower]) {
        if (gender === 'male') return mappings[lower].male;
        if (gender === 'female') return mappings[lower].female;
        return mappings[lower].default;
    }

    return generic;
}

async function fixAllGenericRelationships() {
    console.log('Finding and fixing all generic relationships...\n');

    // Get all memorials
    const { data: memorials, error } = await supabase
        .from('memorials')
        .select('id, name, relatives')
        .not('relatives', 'is', null);

    if (error) {
        console.error('Error fetching memorials:', error.message);
        return;
    }

    // Build a cache of memorial names for gender inference
    const { data: allMemorials } = await supabase
        .from('memorials')
        .select('id, name');

    const nameCache = {};
    allMemorials.forEach(m => {
        nameCache[m.id] = m.name;
    });

    const genericTerms = ['parent', 'child', 'sibling', 'grandparent', 'grandchild', 'niece/nephew', 'nephew/niece', 'uncle/aunt', 'aunt/uncle'];

    let totalFixed = 0;

    for (const m of memorials) {
        if (!m.relatives || !Array.isArray(m.relatives)) continue;

        let updated = false;
        const newRelatives = m.relatives.map(rel => {
            const relLower = (rel.relationship || '').toLowerCase();

            if (genericTerms.includes(relLower)) {
                // Get the linked person's name for gender inference
                let linkedName = rel.name;
                if (rel.memorialId && nameCache[rel.memorialId]) {
                    linkedName = nameCache[rel.memorialId];
                }

                const gender = inferGender(linkedName);
                const specific = getSpecificRelationship(rel.relationship, gender);

                if (specific !== rel.relationship) {
                    console.log(`${m.name}: "${rel.name}" ${rel.relationship} -> ${specific}`);
                    updated = true;
                    totalFixed++;
                    return { ...rel, relationship: specific };
                }
            }

            return rel;
        });

        if (updated) {
            const { error: updateError } = await supabase
                .from('memorials')
                .update({ relatives: newRelatives })
                .eq('id', m.id);

            if (updateError) {
                console.error(`Error updating ${m.name}:`, updateError.message);
            }
        }
    }

    console.log(`\nDone! Fixed ${totalFixed} generic relationships.`);
}

fixAllGenericRelationships().catch(console.error);
