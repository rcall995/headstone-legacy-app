// Global relationship cleanup script
// Standardizes all relationship labels across all memorials
// - Converts generic labels (Parent, Child, Sibling) to specific ones (Father/Mother, Son/Daughter, Brother/Sister)
// - Removes duplicates
// - Reports changes made

require('dotenv').config({ path: '.env.local' });

const url = (process.env.SUPABASE_URL || '').replace(/\\n/g, '').trim();
const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').replace(/\\n/g, '').trim();

const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(url, key);

// Mapping of generic to specific relationships
const RELATIONSHIP_STANDARDS = {
    // Generic to specific (will need context to determine which)
    'parent': ['Father', 'Mother'],
    'child': ['Son', 'Daughter'],
    'sibling': ['Brother', 'Sister'],
    'other-sibling': ['Brother', 'Sister'],
    'grandparent': ['Grandfather', 'Grandmother'],
    'grandchild': ['Grandson', 'Granddaughter'],
    'uncle-aunt': ['Uncle', 'Aunt'],
    'uncle/aunt': ['Uncle', 'Aunt'],
    'nephew-niece': ['Nephew', 'Niece'],
    'nephew/niece': ['Nephew', 'Niece'],

    // Already specific - just normalize casing
    'father': 'Father',
    'mother': 'Mother',
    'son': 'Son',
    'daughter': 'Daughter',
    'brother': 'Brother',
    'sister': 'Sister',
    'spouse': 'Spouse',
    'husband': 'Spouse',
    'wife': 'Spouse',
    'grandfather': 'Grandfather',
    'grandmother': 'Grandmother',
    'grandson': 'Grandson',
    'granddaughter': 'Granddaughter',
    'uncle': 'Uncle',
    'aunt': 'Aunt',
    'nephew': 'Nephew',
    'niece': 'Niece',
    'cousin': 'Cousin',
    'friend': 'Friend',
    'partner': 'Partner',
    'stepfather': 'Stepfather',
    'stepmother': 'Stepmother',
    'stepson': 'Stepson',
    'stepdaughter': 'Stepdaughter',
    'stepbrother': 'Stepbrother',
    'stepsister': 'Stepsister',
    'half-brother': 'Half-Brother',
    'half-sister': 'Half-Sister',
    'father-in-law': 'Father-in-Law',
    'mother-in-law': 'Mother-in-Law',
    'son-in-law': 'Son-in-Law',
    'daughter-in-law': 'Daughter-in-Law',
    'brother-in-law': 'Brother-in-Law',
    'sister-in-law': 'Sister-in-Law',
    'great-grandfather': 'Great-Grandfather',
    'great-grandmother': 'Great-Grandmother',
    'great-grandson': 'Great-Grandson',
    'great-granddaughter': 'Great-Granddaughter'
};

// Cache for memorial genders (to help determine specific relationships)
const genderCache = new Map();

async function getMemorialGender(memorialId) {
    if (!memorialId) return null;

    if (genderCache.has(memorialId)) {
        return genderCache.get(memorialId);
    }

    const { data } = await supabase
        .from('memorials')
        .select('name')
        .eq('id', memorialId)
        .single();

    if (!data) {
        genderCache.set(memorialId, null);
        return null;
    }

    // Try to infer gender from name (first word is usually first name)
    const name = (data.name || '').toLowerCase();
    const gender = inferGenderFromName(name);
    genderCache.set(memorialId, gender);
    return gender;
}

function inferGenderFromName(name) {
    const maleNames = ['fred', 'norman', 'robert', 'james', 'john', 'william', 'michael', 'david', 'richard', 'joseph', 'thomas', 'charles', 'daniel', 'matthew', 'anthony', 'mark', 'donald', 'steven', 'paul', 'andrew', 'joshua', 'kenneth', 'kevin', 'brian', 'george', 'timothy', 'ronald', 'edward', 'jason', 'jeffrey', 'ryan', 'jacob', 'gary', 'nicholas', 'eric', 'jonathan', 'stephen', 'larry', 'justin', 'scott', 'brandon', 'benjamin', 'samuel', 'raymond', 'gregory', 'frank', 'alexander', 'patrick', 'jack', 'dennis', 'jerry', 'tyler', 'aaron', 'jose', 'adam', 'nathan', 'henry', 'douglas', 'zachary', 'peter', 'kyle', 'noah', 'ethan', 'jeremy', 'walter', 'christian', 'keith', 'roger', 'terry', 'austin', 'sean', 'gerald', 'carl', 'harold', 'dylan', 'arthur', 'lawrence', 'jordan', 'jesse', 'bryan', 'billy', 'bruce', 'gabriel', 'joe', 'logan', 'albert', 'willie', 'alan', 'eugene', 'russell', 'vincent', 'philip', 'bobby', 'johnny', 'bradley'];
    const femaleNames = ['dorothy', 'mary', 'patricia', 'jennifer', 'linda', 'barbara', 'elizabeth', 'susan', 'jessica', 'sarah', 'karen', 'lisa', 'nancy', 'betty', 'margaret', 'sandra', 'ashley', 'kimberly', 'emily', 'donna', 'michelle', 'carol', 'amanda', 'dorothy', 'melissa', 'deborah', 'stephanie', 'rebecca', 'sharon', 'laura', 'cynthia', 'kathleen', 'amy', 'angela', 'shirley', 'anna', 'brenda', 'pamela', 'emma', 'nicole', 'helen', 'samantha', 'katherine', 'christine', 'debra', 'rachel', 'carolyn', 'janet', 'catherine', 'maria', 'heather', 'diane', 'ruth', 'julie', 'olivia', 'joyce', 'virginia', 'victoria', 'kelly', 'lauren', 'christina', 'joan', 'evelyn', 'judith', 'megan', 'andrea', 'cheryl', 'hannah', 'jacqueline', 'martha', 'gloria', 'teresa', 'ann', 'sara', 'madison', 'frances', 'kathryn', 'janice', 'jean', 'abigail', 'alice', 'judy', 'sophia', 'grace', 'denise', 'amber', 'doris', 'marilyn', 'danielle', 'beverly', 'isabella', 'theresa', 'diana', 'natalie', 'brittany', 'charlotte', 'marie', 'kayla', 'alexis', 'lori', 'jeanette', 'antoinette', 'rose', 'anna'];

    const firstName = name.split(' ')[0].replace(/[^a-z]/g, '');

    if (maleNames.includes(firstName)) return 'male';
    if (femaleNames.includes(firstName)) return 'female';

    // Check for common suffixes
    if (firstName.endsWith('a') || firstName.endsWith('ie') || firstName.endsWith('ey') || firstName.endsWith('y')) {
        // These could be either, but slightly more likely female
        return null;
    }

    return null;
}

function getSpecificRelationship(generic, gender) {
    const mapping = RELATIONSHIP_STANDARDS[generic.toLowerCase()];

    if (!mapping) {
        // Unknown relationship, return as-is with title case
        return generic.charAt(0).toUpperCase() + generic.slice(1);
    }

    if (typeof mapping === 'string') {
        return mapping;
    }

    if (Array.isArray(mapping)) {
        // Need gender to determine
        if (gender === 'male') return mapping[0];
        if (gender === 'female') return mapping[1];
        // Can't determine, return generic but normalized
        return generic.charAt(0).toUpperCase() + generic.slice(1);
    }

    return generic;
}

async function cleanupAllRelationships() {
    console.log('Starting global relationship cleanup...\n');

    // Get all memorials with relatives
    const { data: memorials, error } = await supabase
        .from('memorials')
        .select('id, name, relatives')
        .not('relatives', 'is', null);

    if (error) {
        console.error('Error fetching memorials:', error.message);
        return;
    }

    console.log(`Found ${memorials.length} memorials with relatives\n`);

    let totalUpdated = 0;
    let totalDuplicatesRemoved = 0;
    let totalRelationshipsStandardized = 0;
    const changes = [];

    for (const memorial of memorials) {
        if (!memorial.relatives || !Array.isArray(memorial.relatives) || memorial.relatives.length === 0) {
            continue;
        }

        const originalRelatives = JSON.stringify(memorial.relatives);
        const cleanedRelatives = [];
        const seenIds = new Set();
        const seenNames = new Set();
        let duplicatesRemoved = 0;
        let standardized = 0;

        for (const rel of memorial.relatives) {
            // Check for duplicates
            const uniqueKey = rel.memorialId || rel.name?.toLowerCase();
            if (seenIds.has(uniqueKey) || (rel.name && seenNames.has(rel.name.toLowerCase()))) {
                duplicatesRemoved++;
                continue;
            }
            if (rel.memorialId) seenIds.add(rel.memorialId);
            if (rel.name) seenNames.add(rel.name.toLowerCase());

            // Standardize relationship
            const originalRel = rel.relationship;
            let gender = null;

            // Try to get gender from linked memorial
            if (rel.memorialId) {
                gender = await getMemorialGender(rel.memorialId);
            }

            // If no gender from memorial, try to infer from name
            if (!gender && rel.name) {
                gender = inferGenderFromName(rel.name.toLowerCase());
            }

            const newRelationship = getSpecificRelationship(originalRel, gender);

            if (newRelationship !== originalRel) {
                standardized++;
            }

            cleanedRelatives.push({
                ...rel,
                relationship: newRelationship
            });
        }

        // Check if anything changed
        const newRelatives = JSON.stringify(cleanedRelatives);
        if (newRelatives !== originalRelatives) {
            // Update the memorial
            const { error: updateError } = await supabase
                .from('memorials')
                .update({ relatives: cleanedRelatives })
                .eq('id', memorial.id);

            if (updateError) {
                console.error(`Error updating ${memorial.name}:`, updateError.message);
            } else {
                totalUpdated++;
                totalDuplicatesRemoved += duplicatesRemoved;
                totalRelationshipsStandardized += standardized;

                changes.push({
                    name: memorial.name,
                    id: memorial.id,
                    duplicatesRemoved,
                    standardized,
                    before: memorial.relatives.map(r => `${r.name}: ${r.relationship}`),
                    after: cleanedRelatives.map(r => `${r.name}: ${r.relationship}`)
                });

                console.log(`Updated: ${memorial.name}`);
                if (duplicatesRemoved > 0) {
                    console.log(`  - Removed ${duplicatesRemoved} duplicate(s)`);
                }
                if (standardized > 0) {
                    console.log(`  - Standardized ${standardized} relationship(s)`);
                }
            }
        }
    }

    console.log('\n========================================');
    console.log('CLEANUP SUMMARY');
    console.log('========================================');
    console.log(`Total memorials processed: ${memorials.length}`);
    console.log(`Memorials updated: ${totalUpdated}`);
    console.log(`Duplicates removed: ${totalDuplicatesRemoved}`);
    console.log(`Relationships standardized: ${totalRelationshipsStandardized}`);

    if (changes.length > 0) {
        console.log('\n========================================');
        console.log('DETAILED CHANGES');
        console.log('========================================');
        for (const change of changes) {
            console.log(`\n${change.name} (${change.id}):`);
            console.log('  Before:');
            change.before.forEach(r => console.log(`    - ${r}`));
            console.log('  After:');
            change.after.forEach(r => console.log(`    - ${r}`));
        }
    }

    console.log('\nCleanup complete!');
}

cleanupAllRelationships().catch(console.error);
