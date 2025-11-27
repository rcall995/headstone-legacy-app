// gedcom-parser.js - Parse GEDCOM files and extract family tree data

/**
 * Parse a GEDCOM file string and extract individuals and families
 * @param {string} gedcomText - Raw GEDCOM file contents
 * @returns {Object} Parsed data with individuals and families
 */
export function parseGedcom(gedcomText) {
    const lines = gedcomText.split(/\r?\n/);
    const individuals = new Map();
    const families = new Map();

    let currentRecord = null;
    let currentType = null;
    let currentSubRecord = null;

    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        // Parse level, tag, and value
        const match = trimmed.match(/^(\d+)\s+(@\w+@|\w+)\s*(.*)$/);
        if (!match) continue;

        const [, levelStr, tagOrId, rest] = match;
        const level = parseInt(levelStr, 10);

        // Level 0 starts a new record
        if (level === 0) {
            // Save previous record
            if (currentRecord && currentType) {
                if (currentType === 'INDI') {
                    individuals.set(currentRecord.id, currentRecord);
                } else if (currentType === 'FAM') {
                    families.set(currentRecord.id, currentRecord);
                }
            }

            // Check if this is a record definition
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

        // Level 1+ are data fields
        const tag = tagOrId.startsWith('@') ? rest.split(' ')[0] : tagOrId;
        const value = tagOrId.startsWith('@') ? tagOrId : rest;

        if (level === 1) {
            currentSubRecord = tag;

            switch (tag) {
                case 'NAME':
                    // Parse name: "John /Smith/"
                    const nameParts = value.match(/^([^/]*)\/?([^/]*)\/?(.*)$/);
                    if (nameParts) {
                        currentRecord.givenName = nameParts[1]?.trim() || '';
                        currentRecord.surname = nameParts[2]?.trim() || '';
                        currentRecord.fullName = `${currentRecord.givenName} ${currentRecord.surname}`.trim();
                    } else {
                        currentRecord.fullName = value;
                    }
                    break;
                case 'SEX':
                    currentRecord.sex = value;
                    break;
                case 'BIRT':
                    currentRecord.birth = {};
                    break;
                case 'DEAT':
                    currentRecord.death = {};
                    break;
                case 'BURI':
                    currentRecord.burial = {};
                    break;
                case 'FAMC':
                    // Family as child
                    currentRecord.childOfFamily = value;
                    break;
                case 'FAMS':
                    // Family as spouse
                    if (!currentRecord.spouseFamilies) {
                        currentRecord.spouseFamilies = [];
                    }
                    currentRecord.spouseFamilies.push(value);
                    break;
                case 'HUSB':
                    currentRecord.husband = value;
                    break;
                case 'WIFE':
                    currentRecord.wife = value;
                    break;
                case 'CHIL':
                    if (!currentRecord.children) {
                        currentRecord.children = [];
                    }
                    currentRecord.children.push(value);
                    break;
                case 'NOTE':
                    currentRecord.notes = value;
                    break;
            }
        } else if (level === 2) {
            // Sub-fields (e.g., DATE and PLAC under BIRT)
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

    // Save last record
    if (currentRecord && currentType) {
        if (currentType === 'INDI') {
            individuals.set(currentRecord.id, currentRecord);
        } else if (currentType === 'FAM') {
            families.set(currentRecord.id, currentRecord);
        }
    }

    return {
        individuals: Array.from(individuals.values()),
        families: Array.from(families.values())
    };
}

/**
 * Parse GEDCOM date string to ISO format
 * Handles formats like: "15 MAR 1950", "MAR 1950", "1950", "ABT 1950"
 * @param {string} dateStr - GEDCOM date string
 * @returns {string|null} ISO date string or null
 */
export function parseGedcomDate(dateStr) {
    if (!dateStr) return null;

    // Remove qualifiers
    const cleaned = dateStr
        .replace(/^(ABT|BEF|AFT|CAL|EST|FROM|TO|BET|AND)\s+/i, '')
        .trim();

    const months = {
        JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06',
        JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12'
    };

    // Full date: "15 MAR 1950"
    const fullMatch = cleaned.match(/^(\d{1,2})\s+(\w{3})\s+(\d{4})$/);
    if (fullMatch) {
        const day = fullMatch[1].padStart(2, '0');
        const month = months[fullMatch[2].toUpperCase()];
        const year = fullMatch[3];
        if (month) return `${year}-${month}-${day}`;
    }

    // Month and year: "MAR 1950"
    const monthYearMatch = cleaned.match(/^(\w{3})\s+(\d{4})$/);
    if (monthYearMatch) {
        const month = months[monthYearMatch[1].toUpperCase()];
        const year = monthYearMatch[2];
        if (month) return `${year}-${month}-01`;
    }

    // Year only: "1950"
    const yearMatch = cleaned.match(/^(\d{4})$/);
    if (yearMatch) {
        return `${yearMatch[1]}-01-01`;
    }

    return null;
}

/**
 * Transform parsed GEDCOM data into memorial-ready format
 * @param {Object} parsedData - Output from parseGedcom()
 * @returns {Object} Transformed data ready for memorial creation
 */
export function transformToMemorials(parsedData) {
    const { individuals, families } = parsedData;
    const familyMap = new Map(families.map(f => [f.id, f]));
    const individualMap = new Map(individuals.map(i => [i.id, i]));

    const memorials = individuals.map(individual => {
        const memorial = {
            gedcomId: individual.id,
            name: individual.fullName || 'Unknown',
            givenName: individual.givenName,
            surname: individual.surname,
            sex: individual.sex,

            // Dates
            birthDate: parseGedcomDate(individual.birth?.date),
            birthPlace: individual.birth?.place,
            deathDate: parseGedcomDate(individual.death?.date),
            deathPlace: individual.death?.place,
            burialPlace: individual.burial?.place,

            // Cemetery hints (from burial place)
            cemeteryHint: individual.burial?.place || individual.death?.place,

            // Relationships (to be processed)
            relationships: [],

            // Notes
            notes: individual.notes
        };

        // Find spouse relationships
        if (individual.spouseFamilies) {
            for (const famId of individual.spouseFamilies) {
                const family = familyMap.get(famId);
                if (family) {
                    // Determine spouse
                    const spouseId = individual.sex === 'M' ? family.wife : family.husband;
                    if (spouseId) {
                        const spouse = individualMap.get(spouseId);
                        if (spouse) {
                            memorial.relationships.push({
                                type: 'spouse',
                                gedcomId: spouseId,
                                name: spouse.fullName
                            });
                        }
                    }

                    // Children
                    if (family.children) {
                        for (const childId of family.children) {
                            const child = individualMap.get(childId);
                            if (child) {
                                memorial.relationships.push({
                                    type: 'child',
                                    gedcomId: childId,
                                    name: child.fullName
                                });
                            }
                        }
                    }
                }
            }
        }

        // Find parent relationships
        if (individual.childOfFamily) {
            const family = familyMap.get(individual.childOfFamily);
            if (family) {
                if (family.husband) {
                    const father = individualMap.get(family.husband);
                    if (father) {
                        memorial.relationships.push({
                            type: 'parent',
                            label: 'Father',
                            gedcomId: family.husband,
                            name: father.fullName
                        });
                    }
                }
                if (family.wife) {
                    const mother = individualMap.get(family.wife);
                    if (mother) {
                        memorial.relationships.push({
                            type: 'parent',
                            label: 'Mother',
                            gedcomId: family.wife,
                            name: mother.fullName
                        });
                    }
                }

                // Siblings
                if (family.children) {
                    for (const siblingId of family.children) {
                        if (siblingId !== individual.id) {
                            const sibling = individualMap.get(siblingId);
                            if (sibling) {
                                memorial.relationships.push({
                                    type: 'sibling',
                                    gedcomId: siblingId,
                                    name: sibling.fullName
                                });
                            }
                        }
                    }
                }
            }
        }

        return memorial;
    });

    // Filter to only deceased individuals (have death date or burial place)
    const deceasedMemorials = memorials.filter(m =>
        m.deathDate || m.burialPlace || m.deathPlace
    );

    return {
        total: memorials.length,
        deceased: deceasedMemorials.length,
        living: memorials.length - deceasedMemorials.length,
        memorials: deceasedMemorials
    };
}

/**
 * Generate a slug for memorial ID
 * @param {string} name - Person's name
 * @param {string} gedcomId - Original GEDCOM ID
 * @returns {string} URL-safe slug
 */
export function generateMemorialSlug(name, gedcomId) {
    const slug = name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');

    // Add unique suffix from gedcom ID
    const hash = gedcomId
        .replace(/[@]/g, '')
        .toLowerCase()
        .substring(0, 6);

    return `${slug}-${hash}`;
}

export default {
    parseGedcom,
    parseGedcomDate,
    transformToMemorials,
    generateMemorialSlug
};
