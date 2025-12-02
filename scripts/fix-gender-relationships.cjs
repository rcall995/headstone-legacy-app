/**
 * Fix gender-specific relationship labels across all memorial connections
 * This script scans for mismatched relationships like "Brother-in-law" for females
 * and corrects them based on the person's likely gender (inferred from first name)
 */

require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.SUPABASE_URL.replace(/\\n/g, ''),
    process.env.SUPABASE_SERVICE_ROLE_KEY.replace(/\\n/g, '')
);

// Common female first names
const FEMALE_NAMES = new Set([
    'mary', 'patricia', 'jennifer', 'linda', 'elizabeth', 'barbara', 'susan', 'jessica',
    'sarah', 'karen', 'nancy', 'betty', 'margaret', 'sandra', 'ashley', 'dorothy',
    'kimberly', 'emily', 'donna', 'michelle', 'carol', 'amanda', 'melissa', 'deborah',
    'stephanie', 'rebecca', 'laura', 'sharon', 'cynthia', 'kathleen', 'amy', 'angela',
    'shirley', 'anna', 'brenda', 'pamela', 'emma', 'nicole', 'helen', 'samantha',
    'katherine', 'christine', 'debra', 'rachel', 'carolyn', 'janet', 'catherine',
    'maria', 'heather', 'diane', 'ruth', 'julie', 'olivia', 'joyce', 'virginia',
    'victoria', 'kelly', 'lauren', 'christina', 'joan', 'evelyn', 'judith', 'megan',
    'andrea', 'cheryl', 'hannah', 'jacqueline', 'martha', 'gloria', 'teresa', 'ann',
    'sara', 'madison', 'frances', 'kathryn', 'janice', 'jean', 'abigail', 'alice',
    'judy', 'sophia', 'grace', 'denise', 'amber', 'doris', 'marilyn', 'danielle',
    'beverly', 'isabella', 'theresa', 'diana', 'natalie', 'brittany', 'charlotte',
    'marie', 'kayla', 'alexis', 'lori', 'jeanette', 'phyllis', 'norma', 'beatrice',
    'claudia', 'annie', 'elsie', 'hazel', 'ethel', 'mae', 'lillian', 'gertrude',
    'edna', 'gladys', 'mildred', 'florence', 'lucille', 'thelma', 'edith', 'maggie',
    'antoinette', 'bernice', 'lorraine', 'eleanor', 'rosemary', 'constance', 'delores'
]);

// Common male first names
const MALE_NAMES = new Set([
    'james', 'john', 'robert', 'michael', 'william', 'david', 'richard', 'joseph',
    'thomas', 'charles', 'christopher', 'daniel', 'matthew', 'anthony', 'mark',
    'donald', 'steven', 'paul', 'andrew', 'joshua', 'kenneth', 'kevin', 'brian',
    'george', 'edward', 'ronald', 'timothy', 'jason', 'jeffrey', 'ryan', 'jacob',
    'gary', 'nicholas', 'eric', 'jonathan', 'stephen', 'larry', 'justin', 'scott',
    'brandon', 'benjamin', 'samuel', 'raymond', 'gregory', 'frank', 'alexander',
    'patrick', 'jack', 'dennis', 'jerry', 'tyler', 'aaron', 'jose', 'adam', 'henry',
    'nathan', 'douglas', 'zachary', 'peter', 'kyle', 'noah', 'ethan', 'jeremy',
    'walter', 'christian', 'keith', 'roger', 'terry', 'carl', 'sean', 'austin',
    'arthur', 'lawrence', 'jesse', 'dylan', 'bryan', 'joe', 'jordan', 'billy',
    'bruce', 'albert', 'willie', 'gabriel', 'logan', 'eugene', 'russell', 'louis',
    'vincent', 'philip', 'bobby', 'johnny', 'bradley', 'fred', 'norman', 'roy',
    'eugene', 'ralph', 'earl', 'howard', 'clarence', 'harold', 'stanley', 'leonard',
    'ernest', 'alfred', 'clifford', 'warren', 'lloyd', 'leroy', 'gordon', 'herbert'
]);

// Gender-specific relationship mappings
const RELATIONSHIP_CORRECTIONS = {
    // If person is female but has male label
    female: {
        'brother': 'Sister',
        'brother-in-law': 'Sister-in-law',
        'father': 'Mother',
        'father-in-law': 'Mother-in-law',
        'son': 'Daughter',
        'son-in-law': 'Daughter-in-law',
        'grandson': 'Granddaughter',
        'uncle': 'Aunt',
        'nephew': 'Niece',
        'husband': 'Wife',
        'grandfather': 'Grandmother',
        'stepfather': 'Stepmother',
        'stepson': 'Stepdaughter',
        'stepbrother': 'Stepsister',
        'half-brother': 'Half-sister'
    },
    // If person is male but has female label
    male: {
        'sister': 'Brother',
        'sister-in-law': 'Brother-in-law',
        'mother': 'Father',
        'mother-in-law': 'Father-in-law',
        'daughter': 'Son',
        'daughter-in-law': 'Son-in-law',
        'granddaughter': 'Grandson',
        'aunt': 'Uncle',
        'niece': 'Nephew',
        'wife': 'Husband',
        'grandmother': 'Grandfather',
        'stepmother': 'Stepfather',
        'stepdaughter': 'Stepson',
        'stepsister': 'Stepbrother',
        'half-sister': 'Half-brother'
    }
};

function inferGender(name) {
    if (!name) return null;
    const firstName = name.split(' ')[0].toLowerCase().replace(/[^a-z]/g, '');

    if (FEMALE_NAMES.has(firstName)) return 'female';
    if (MALE_NAMES.has(firstName)) return 'male';
    return null;
}

function getCorrectLabel(currentLabel, gender) {
    if (!currentLabel || !gender) return null;
    const labelLower = currentLabel.toLowerCase();
    const corrections = RELATIONSHIP_CORRECTIONS[gender];
    return corrections[labelLower] || null;
}

async function fixGenderRelationships() {
    console.log('Scanning memorial_connections for gender mismatches...\n');

    // Get all connections with relationship labels
    const { data: connections, error } = await supabase
        .from('memorial_connections')
        .select(`
            id,
            memorial_id,
            connected_memorial_id,
            relationship_label,
            connected_memorial:connected_memorial_id (
                id,
                name
            )
        `)
        .not('relationship_label', 'is', null);

    if (error) {
        console.error('Error fetching connections:', error);
        return;
    }

    console.log(`Found ${connections.length} connections with relationship labels\n`);

    const fixes = [];
    const skipped = [];

    for (const conn of connections) {
        const connectedName = conn.connected_memorial?.name;
        if (!connectedName) continue;

        const gender = inferGender(connectedName);
        if (!gender) {
            skipped.push({ name: connectedName, label: conn.relationship_label });
            continue;
        }

        const correctLabel = getCorrectLabel(conn.relationship_label, gender);
        if (correctLabel && correctLabel !== conn.relationship_label) {
            fixes.push({
                id: conn.id,
                name: connectedName,
                currentLabel: conn.relationship_label,
                correctLabel: correctLabel,
                gender: gender
            });
        }
    }

    console.log(`Found ${fixes.length} relationships to fix:\n`);

    if (fixes.length === 0) {
        console.log('No gender mismatches found!');
        return;
    }

    // Show what will be fixed
    for (const fix of fixes) {
        console.log(`  ${fix.name}: "${fix.currentLabel}" → "${fix.correctLabel}" (${fix.gender})`);
    }

    console.log('\nApplying fixes...\n');

    let successCount = 0;
    let errorCount = 0;

    for (const fix of fixes) {
        const { error: updateError } = await supabase
            .from('memorial_connections')
            .update({ relationship_label: fix.correctLabel })
            .eq('id', fix.id);

        if (updateError) {
            console.error(`  ✗ Failed to update ${fix.name}: ${updateError.message}`);
            errorCount++;
        } else {
            console.log(`  ✓ Fixed ${fix.name}: ${fix.currentLabel} → ${fix.correctLabel}`);
            successCount++;
        }
    }

    console.log(`\n========================================`);
    console.log(`Fixed: ${successCount}`);
    console.log(`Errors: ${errorCount}`);
    console.log(`Skipped (unknown gender): ${skipped.length}`);

    if (skipped.length > 0 && skipped.length <= 20) {
        console.log('\nSkipped names (could not determine gender):');
        skipped.forEach(s => console.log(`  - ${s.name} (${s.label})`));
    }
}

fixGenderRelationships().catch(console.error);
