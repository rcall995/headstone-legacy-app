// api/gedcom/parse.js - Parse GEDCOM file and return preview data
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

// GEDCOM Parser (inline for serverless)
function parseGedcom(gedcomText) {
    const lines = gedcomText.split(/\r?\n/);
    const individuals = new Map();
    const families = new Map();

    let currentRecord = null;
    let currentType = null;
    let currentSubRecord = null;

    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        const match = trimmed.match(/^(\d+)\s+(@\w+@|\w+)\s*(.*)$/);
        if (!match) continue;

        const [, levelStr, tagOrId, rest] = match;
        const level = parseInt(levelStr, 10);

        if (level === 0) {
            if (currentRecord && currentType) {
                if (currentType === 'INDI') individuals.set(currentRecord.id, currentRecord);
                else if (currentType === 'FAM') families.set(currentRecord.id, currentRecord);
            }

            if (tagOrId.startsWith('@') && rest) {
                currentRecord = { id: tagOrId };
                currentType = rest;
                currentSubRecord = null;
            } else {
                currentRecord = null;
                currentType = null;
            }
            continue;
        }

        if (!currentRecord) continue;

        const tag = tagOrId.startsWith('@') ? rest.split(' ')[0] : tagOrId;
        const value = tagOrId.startsWith('@') ? tagOrId : rest;

        if (level === 1) {
            currentSubRecord = tag;
            switch (tag) {
                case 'NAME':
                    const nameParts = value.match(/^([^/]*)\/?([^/]*)\/?(.*)$/);
                    if (nameParts) {
                        currentRecord.givenName = nameParts[1]?.trim() || '';
                        currentRecord.surname = nameParts[2]?.trim() || '';
                        currentRecord.fullName = `${currentRecord.givenName} ${currentRecord.surname}`.trim();
                    } else {
                        currentRecord.fullName = value;
                    }
                    break;
                case 'SEX': currentRecord.sex = value; break;
                case 'BIRT': currentRecord.birth = {}; break;
                case 'DEAT': currentRecord.death = {}; break;
                case 'BURI': currentRecord.burial = {}; break;
                case 'FAMC': currentRecord.childOfFamily = value; break;
                case 'FAMS':
                    if (!currentRecord.spouseFamilies) currentRecord.spouseFamilies = [];
                    currentRecord.spouseFamilies.push(value);
                    break;
                case 'HUSB': currentRecord.husband = value; break;
                case 'WIFE': currentRecord.wife = value; break;
                case 'CHIL':
                    if (!currentRecord.children) currentRecord.children = [];
                    currentRecord.children.push(value);
                    break;
            }
        } else if (level === 2) {
            if (currentSubRecord === 'BIRT' && currentRecord.birth) {
                if (tag === 'DATE') currentRecord.birth.date = value;
                if (tag === 'PLAC') currentRecord.birth.place = value;
            } else if (currentSubRecord === 'DEAT' && currentRecord.death) {
                if (tag === 'DATE') currentRecord.death.date = value;
                if (tag === 'PLAC') currentRecord.death.place = value;
            } else if (currentSubRecord === 'BURI' && currentRecord.burial) {
                if (tag === 'DATE') currentRecord.burial.date = value;
                if (tag === 'PLAC') currentRecord.burial.place = value;
            }
        }
    }

    if (currentRecord && currentType) {
        if (currentType === 'INDI') individuals.set(currentRecord.id, currentRecord);
        else if (currentType === 'FAM') families.set(currentRecord.id, currentRecord);
    }

    return {
        individuals: Array.from(individuals.values()),
        families: Array.from(families.values())
    };
}

function parseGedcomDate(dateStr) {
    if (!dateStr) return null;
    const cleaned = dateStr.replace(/^(ABT|BEF|AFT|CAL|EST|FROM|TO|BET|AND)\s+/i, '').trim();
    const months = { JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06', JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12' };

    const fullMatch = cleaned.match(/^(\d{1,2})\s+(\w{3})\s+(\d{4})$/);
    if (fullMatch) {
        const month = months[fullMatch[2].toUpperCase()];
        if (month) return `${fullMatch[3]}-${month}-${fullMatch[1].padStart(2, '0')}`;
    }

    const monthYearMatch = cleaned.match(/^(\w{3})\s+(\d{4})$/);
    if (monthYearMatch) {
        const month = months[monthYearMatch[1].toUpperCase()];
        if (month) return `${monthYearMatch[2]}-${month}-01`;
    }

    const yearMatch = cleaned.match(/^(\d{4})$/);
    if (yearMatch) return `${yearMatch[1]}-01-01`;

    return null;
}

// Check for potential duplicate matches in existing database
async function findPotentialMatches(memorials, supabase) {
    // Get all existing memorials for comparison
    const { data: existingMemorials, error } = await supabase
        .from('memorials')
        .select('id, name, birth_date, death_date, cemetery_name');

    if (error || !existingMemorials) {
        console.error('Error fetching existing memorials:', error);
        return memorials.map(m => ({ ...m, potentialMatches: [] }));
    }

    // Normalize name for comparison
    const normalizeName = (name) => {
        if (!name) return '';
        return name.toLowerCase()
            .replace(/[^a-z\s]/g, '')
            .replace(/\s+/g, ' ')
            .trim();
    };

    // Calculate simple similarity score
    const similarity = (s1, s2) => {
        if (!s1 || !s2) return 0;
        const n1 = normalizeName(s1);
        const n2 = normalizeName(s2);
        if (n1 === n2) return 1;

        // Check if one contains the other
        if (n1.includes(n2) || n2.includes(n1)) return 0.8;

        // Check word overlap
        const words1 = n1.split(' ').filter(w => w.length > 1);
        const words2 = n2.split(' ').filter(w => w.length > 1);
        const overlap = words1.filter(w => words2.includes(w)).length;
        const maxWords = Math.max(words1.length, words2.length);
        if (maxWords === 0) return 0;
        return overlap / maxWords;
    };

    // Extract year from date string
    const getYear = (dateStr) => {
        if (!dateStr) return null;
        const match = dateStr.match(/\d{4}/);
        return match ? parseInt(match[0], 10) : null;
    };

    // Check each memorial for matches
    return memorials.map(memorial => {
        const matches = [];
        const memorialBirthYear = getYear(memorial.birthDate);
        const memorialDeathYear = getYear(memorial.deathDate);

        for (const existing of existingMemorials) {
            const nameSim = similarity(memorial.name, existing.name);

            // Skip if name similarity is too low
            if (nameSim < 0.6) continue;

            const existingBirthYear = getYear(existing.birth_date);
            const existingDeathYear = getYear(existing.death_date);

            // Check date matches
            let dateScore = 0;
            let dateMatches = [];

            if (memorialBirthYear && existingBirthYear) {
                if (memorialBirthYear === existingBirthYear) {
                    dateScore += 0.5;
                    dateMatches.push('birth year');
                }
            }

            if (memorialDeathYear && existingDeathYear) {
                if (memorialDeathYear === existingDeathYear) {
                    dateScore += 0.5;
                    dateMatches.push('death year');
                }
            }

            // Calculate overall match score
            const overallScore = (nameSim * 0.6) + (dateScore * 0.4);

            // Only include if score is high enough
            if (overallScore >= 0.5 || (nameSim >= 0.8 && dateScore > 0)) {
                matches.push({
                    id: existing.id,
                    name: existing.name,
                    birthDate: existing.birth_date,
                    deathDate: existing.death_date,
                    cemetery: existing.cemetery_name,
                    score: Math.round(overallScore * 100),
                    matchReasons: [
                        nameSim >= 0.9 ? 'Exact name match' : nameSim >= 0.7 ? 'Similar name' : 'Partial name match',
                        ...dateMatches.map(d => `Same ${d}`)
                    ].filter(Boolean)
                });
            }
        }

        // Sort by score descending
        matches.sort((a, b) => b.score - a.score);

        return {
            ...memorial,
            potentialMatches: matches.slice(0, 3) // Top 3 matches
        };
    });
}

function transformToMemorials(parsedData) {
    const { individuals, families } = parsedData;
    const familyMap = new Map(families.map(f => [f.id, f]));
    const individualMap = new Map(individuals.map(i => [i.id, i]));

    const memorials = individuals.map(individual => {
        const memorial = {
            gedcomId: individual.id,
            name: individual.fullName || 'Unknown',
            sex: individual.sex,
            birthDate: parseGedcomDate(individual.birth?.date),
            birthPlace: individual.birth?.place,
            deathDate: parseGedcomDate(individual.death?.date),
            deathPlace: individual.death?.place,
            burialPlace: individual.burial?.place,
            relationships: []
        };

        // Find relationships
        if (individual.spouseFamilies) {
            for (const famId of individual.spouseFamilies) {
                const family = familyMap.get(famId);
                if (family) {
                    const spouseId = individual.sex === 'M' ? family.wife : family.husband;
                    if (spouseId) {
                        const spouse = individualMap.get(spouseId);
                        if (spouse) memorial.relationships.push({ type: 'spouse', gedcomId: spouseId, name: spouse.fullName });
                    }
                    if (family.children) {
                        for (const childId of family.children) {
                            const child = individualMap.get(childId);
                            if (child) memorial.relationships.push({ type: 'child', gedcomId: childId, name: child.fullName });
                        }
                    }
                }
            }
        }

        if (individual.childOfFamily) {
            const family = familyMap.get(individual.childOfFamily);
            if (family) {
                if (family.husband) {
                    const father = individualMap.get(family.husband);
                    if (father) memorial.relationships.push({ type: 'parent', label: 'Father', gedcomId: family.husband, name: father.fullName });
                }
                if (family.wife) {
                    const mother = individualMap.get(family.wife);
                    if (mother) memorial.relationships.push({ type: 'parent', label: 'Mother', gedcomId: family.wife, name: mother.fullName });
                }
            }
        }

        return memorial;
    });

    // Filter to only deceased
    const deceased = memorials.filter(m => m.deathDate || m.burialPlace || m.deathPlace);

    return {
        total: memorials.length,
        deceased: deceased.length,
        living: memorials.length - deceased.length,
        families: families.length,
        memorials: deceased
    };
}

export default async function handler(req, res) {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        // Get auth token
        const authHeader = req.headers.authorization;
        if (!authHeader?.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const token = authHeader.split(' ')[1];
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);

        if (authError || !user) {
            return res.status(401).json({ error: 'Invalid token' });
        }

        const { gedcomText, fileName } = req.body;

        if (!gedcomText) {
            return res.status(400).json({ error: 'No GEDCOM data provided' });
        }

        // Parse GEDCOM
        const parsed = parseGedcom(gedcomText);
        const transformed = transformToMemorials(parsed);

        // Check for potential duplicate matches
        const memorialsWithMatches = await findPotentialMatches(transformed.memorials, supabase);

        // Count how many have potential matches
        const withMatches = memorialsWithMatches.filter(m => m.potentialMatches.length > 0);

        // Return preview data (don't save yet)
        return res.status(200).json({
            success: true,
            fileName,
            stats: {
                totalIndividuals: transformed.total,
                deceasedIndividuals: transformed.deceased,
                livingIndividuals: transformed.living,
                families: transformed.families,
                potentialDuplicates: withMatches.length
            },
            preview: memorialsWithMatches.slice(0, 50), // Preview first 50
            allMemorials: memorialsWithMatches
        });

    } catch (error) {
        console.error('GEDCOM parse error:', error);
        return res.status(500).json({ error: 'Failed to parse GEDCOM file', details: error.message });
    }
}
