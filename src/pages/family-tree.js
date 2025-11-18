import { db, auth } from '/js/firebase-config.js';
import { doc, getDocs, query, where, collection, documentId } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { config } from '/js/config.js';
import { showToast } from '/js/utils/toasts.js';

// Fallback data URI for placeholder image (64x64 grey square)
const FALLBACK_IMAGE = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAB9SURBVGhD7dcxCsIwEAVQ+/9fL+wE7UAi7A5t7yZ3sO1AB3gqkbMQP7v+8vPdg4cPH37+/dOnT2/9/f3Ltw8fPvz8+bdv3z59+vTpf5/f3/6/f/7+/fv3z58/f/7s2bdv3759+/Tp0/f+/v7l24cPH37+/Nvn7z8qKioq8q4zAAAAAElFTSuQmCC';

// --- DATA FETCHING & PROCESSING ---
async function getFamilyData(startId, maxDepth = 5) { // Increased search depth
    if (!startId || typeof startId !== 'string') {
        console.error('Invalid startId:', startId);
        showToast('Invalid memorial ID.', 'error');
        return new Map();
    }

    const cacheKey = `familyData_${startId}_${maxDepth}`;
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
        try {
            const { data, timestamp } = JSON.parse(cached);
            if (Date.now() - timestamp < 24 * 60 * 60 * 1000) {
                return new Map(data);
            }
        } catch (e) {
            console.warn('Invalid cache data, fetching fresh:', e);
        }
    }

    const people = new Map();
    const queue = [{ id: startId, depth: 0 }];
    const fetchedIds = new Set([startId]);
    const batchSize = 10; // Firestore `in` query limit

    while (queue.length > 0) {
        const batch = queue.splice(0, batchSize).filter(item => item.id && typeof item.id === 'string');
        const idsToFetch = batch.map(item => item.id);
        if (idsToFetch.length === 0) continue;

        try {
            const q = query(collection(db, 'memorials'), where(documentId(), 'in', idsToFetch));
            const docs = await getDocs(q);

            docs.forEach(doc => {
                const person = { id: doc.id, ...doc.data(), relatives: Array.isArray(doc.data().relatives) ? doc.data().relatives : [] };
                people.set(doc.id, person);
                
                const currentDepth = batch.find(item => item.id === doc.id)?.depth || 0;
                if (currentDepth < maxDepth) {
                    person.relatives.forEach(relative => {
                        if (relative.memorialId && !fetchedIds.has(relative.memorialId)) {
                            fetchedIds.add(relative.memorialId);
                            queue.push({ id: relative.memorialId, depth: currentDepth + 1 });
                        }
                    });
                }
            });
        } catch (error) {
            console.warn(`Failed to fetch batch:`, error);
            showToast('Error fetching family data.', 'error');
        }
    }

    const reciprocalMap = {
        'Son': 'Parent', 'Daughter': 'Parent', 'Father': 'Child',
        'Mother': 'Child', 'Spouse': 'Spouse'
    };

    for (const [personId, personData] of people.entries()) {
        for (const relative of personData.relatives) {
            if (relative.memorialId && people.has(relative.memorialId)) {
                const relatedPerson = people.get(relative.memorialId);
                const reciprocalRel = reciprocalMap[relative.relationship];
                
                if (reciprocalRel && !relatedPerson.relatives.some(r => r.memorialId === personId)) {
                     relatedPerson.relatives.push({
                        memorialId: personId,
                        name: personData.name,
                        relationship: reciprocalRel === 'Parent' ? 'Father' : 'Son' // Simplified
                    });
                }
            }
        }
    }

    localStorage.setItem(cacheKey, JSON.stringify({ data: [...people], timestamp: Date.now() }));
    return people;
}


async function buildHierarchy(people, startId) {
    if (!people.has(startId)) return null;

    let centralPerson = people.get(startId);
    let rootPerson = centralPerson;
    const visited = new Set([startId]);

    // Walk up the tree to find the highest ancestor to use as the root
    while (rootPerson?.relatives) {
        const parent = rootPerson.relatives.find(r => r.memorialId && people.has(r.memorialId) && ['Parent', 'Father', 'Mother'].includes(r.relationship));
        if (parent && !visited.has(parent.memorialId)) {
            rootPerson = people.get(parent.memorialId);
            visited.add(rootPerson.id);
        } else {
            break;
        }
    }

    const processedIds = new Set(); // --- FIX: Create a set to track processed nodes
    const MAX_DEPTH = 10; // Maximum recursion depth to prevent infinite loops

    function buildNode(person, depth = 0) {
        // Safety checks: prevent infinite loops and excessive depth
        if (!person || processedIds.has(person.id) || depth >= MAX_DEPTH) return null;
        processedIds.add(person.id); // --- FIX: Mark this person as processed

        const spouseRelative = person.relatives.find(r => r.memorialId && r.relationship === 'Spouse');
        const spouseData = spouseRelative ? people.get(spouseRelative.memorialId) : null;
        const spouse = spouseData ? {
            id: spouseData.id,
            name: spouseData.name || 'Unknown',
            photo: spouseData.mainPhoto || FALLBACK_IMAGE,
            birthDate: spouseData.birthDate || 'Unknown',
            deathDate: spouseData.deathDate || 'Unknown',
        } : null;

        const childrenRelatives = person.relatives.filter(r => r.memorialId && people.has(r.memorialId) && ['Son', 'Daughter', 'Child'].includes(r.relationship));
        const children = childrenRelatives
            .map(relative => {
                const childNode = buildNode(people.get(relative.memorialId), depth + 1); // Pass incremented depth
                if (childNode) {
                    childNode.relationship = relative.relationship;
                }
                return childNode;
            })
            .filter(Boolean);

        return {
            id: person.id,
            name: person.name || 'Unknown',
            photo: person.mainPhoto || FALLBACK_IMAGE,
            birthDate: person.birthDate || 'Unknown',
            deathDate: person.deathDate || 'Unknown',
            spouse: spouse,
            children: children.length > 0 ? children : null,
            relationship: person.relationship
        };
    }

    const finalTree = buildNode(rootPerson);
    if(finalTree && !finalTree.relationship) {
        finalTree.relationship = 'Family Member';
    }
    return finalTree;
}

/**
 * Parses person data to create a birth-death year string.
 * @param {object} personData The person object from Firestore.
 * @returns {string} A formatted string e.g., "1950 - 2020", or empty string.
 */
function getYearRange(personData) {
    if (!personData) return '';
    const birthDate = new Date(personData.birthDate);
    const deathDate = new Date(personData.deathDate);
    const birthYear = birthDate.getTime() ? birthDate.getFullYear() : '';
    const deathYear = deathDate.getTime() ? deathDate.getFullYear() : '';
    if (!birthYear && !deathYear) return '';
    return `${birthYear} - ${deathYear}`;
}


// --- D3.JS VISUALIZATION LOGIC ---
function drawTree(root, containerSelector) {
    const container = d3.select(containerSelector);
    container.html('');

    onAuthStateChanged(auth, user => {
        if (!user) {
            console.warn('User not authenticated, image access may be restricted');
            showToast('Sign in to access all images.', 'info');
        }
    });

    const svgContainer = container.append('div')
        .attr('class', 'svg-container')
        .style('width', '100%')
        .style('min-height', '80vh');

    const svg = svgContainer.append('svg')
        .attr('width', '100%')
        .attr('height', '80vh')
        .call(d3.zoom().scaleExtent([0.5, 3]).on('zoom', (event) => g.attr('transform', event.transform)));

    const g = svg.append('g');
    const linkGroup = g.append('g').attr('class', 'links');
    const nodeGroup = g.append('g').attr('class', 'nodes');

    function updateLayout() {
        const nodeHeight = 240;
        const siblingGap = 40;
        const spouseGap = 40;

        const tempSvg = d3.select('body').append('svg').attr('class', 'd-none');
        root.eachAfter(d => {
            const personText = tempSvg.append('text').style('font', '12px sans-serif').text(d.data.name || 'Unknown').node();
            const personWidth = personText.getBBox().width + 100;
            let spouseWidth = 0;
            if (d.data.spouse) {
                const spouseText = tempSvg.append('text').style('font', '12px sans-serif').text(d.data.spouse.name || 'Unknown').node();
                spouseWidth = spouseText.getBBox().width + 100;
            }
            const coupleWidth = personWidth + spouseWidth + (d.data.spouse ? spouseGap : 0);
            const childrenWidth = d.children ? d.children.reduce((acc, child) => acc + child._totalWidth + siblingGap, -siblingGap) : 0;
            d._personWidth = personWidth;
            d._spouseWidth = spouseWidth;
            d._coupleWidth = coupleWidth;
            d._totalWidth = Math.max(coupleWidth, childrenWidth);
        });
        tempSvg.remove();

        d3.tree().nodeSize([0, nodeHeight])(root);

        root.eachBefore(node => {
            if (node.children) {
                const childrenTotalWidth = node.children.reduce((acc, child) => acc + child._totalWidth + siblingGap, -siblingGap);
                let startX = node.x - childrenTotalWidth / 2;
                node.children.forEach(child => {
                    child.x = startX + child._totalWidth / 2;
                    startX += child._totalWidth + siblingGap;
                });
            }
        });
        
        let minX = Infinity, maxX = -Infinity, maxY = 0;
        root.each(d => {
            minX = Math.min(minX, d.x - d._totalWidth / 2);
            maxX = Math.max(maxX, d.x + d._totalWidth / 2);
            maxY = Math.max(maxY, d.y);
        });
        
        const padding = 50;
        const finalWidth = maxX - minX;
        const finalHeight = maxY + nodeHeight;
        
        svg.attr('height', finalHeight + padding * 2);
        svg.attr('viewBox', `${minX - padding} 0 ${finalWidth + padding * 2} ${finalHeight + padding}`);
        g.attr('transform', `translate(0, ${padding})`);
    }

    updateLayout();
    
    linkGroup.selectAll('path.link').data(root.links()).join('path')
        .attr('class', 'link')
        .attr('d', d3.linkVertical().x(d => d.x).y(d => d.y))
        .attr('fill', 'none').attr('stroke', '#ccc').attr('stroke-width', 2);

    const node = nodeGroup.selectAll('g.node').data(root.descendants()).join('g')
        .attr('class', 'tree-node')
        .attr('data-id', d => d.data.id)
        .attr('transform', d => `translate(${d.x}, ${d.y})`);

    const coupleGroup = node.append('g')
        .attr('class', 'couple-group')
        .attr('transform', d => `translate(${-d._coupleWidth / 2}, 0)`);

    const personGroup = coupleGroup.append('g')
        .attr('class', 'person-group')
        .attr('role', 'button').attr('tabindex', 0)
        .attr('aria-label', d => `View memorial for ${d.data.name}`)
        .style('cursor', 'pointer')
        .attr('transform', d => `translate(${d._personWidth / 2}, 0)`)
        .on('click', (event, d) => {
             if (event.defaultPrevented) return;
             if (d.children) {
                 d._children = d.children; d.children = null;
             } else {
                 d.children = d._children; d._children = null;
             }
             drawTree(root, containerSelector);
        })
        .on('dblclick', (event, d) => showMemorialModal(d.data))
        .on('keydown', (event, d) => { if (event.key === 'Enter') showMemorialModal(d.data); })
        .on('mouseover', function() { d3.select(this).select('circle').attr('stroke', config.ACCENT_COLOR || '#c0a062').attr('stroke-width', 2); })
        .on('mouseout', function() { d3.select(this).select('circle').attr('stroke', '#666').attr('stroke-width', 1); });

    personGroup.append('circle').attr('r', 32).attr('fill', 'none').attr('stroke', '#666');
    personGroup.append('clipPath').attr('id', d => `clip-${d.data.id}`).append('circle').attr('r', 30);
    personGroup.append('image')
        .attr('xlink:href', d => d.data.photo).attr('x', -30).attr('y', -30)
        .attr('width', 60).attr('height', 60).attr('clip-path', d => `url(#clip-${d.data.id})`)
        .on('error', function() { d3.select(this).attr('xlink:href', FALLBACK_IMAGE); });
    
    personGroup.append('text')
        .attr('text-anchor', 'middle').style('font-family', 'Helvetica, Arial, sans-serif')
        .each(function(d) {
            const textElement = d3.select(this);
            const name = d.data.name || 'Unknown', yearRange = getYearRange(d.data), relationship = d.data.relationship, words = name.split(/\s+/);
            let lines = [];
            if (words.length > 2) { lines.push(words.slice(0, 2).join(' ')); lines.push(words.slice(2).join(' ')); } 
            else { lines.push(name); }
            if (yearRange) { lines.push(yearRange); }
            if (relationship) { lines.push(relationship); }
            lines.forEach((line, i) => {
                const tspan = textElement.append('tspan').attr('x', 0).attr('dy', i === 0 ? '4.5em' : '1.4em').text(line);
                if (line === yearRange) { tspan.style('font-size', '10px').style('fill', '#666'); } 
                else if (line === relationship) { tspan.style('font-size', '10px').style('font-style', 'italic').style('fill', '#555'); } 
                else { tspan.style('font-size', '12px').style('font-weight', 'bold'); }
            });
        });

    const spouseGroup = coupleGroup.filter(d => d.data.spouse).append('g')
        .attr('class', 'spouse-group')
        .attr('role', 'button').attr('tabindex', 0).style('cursor', 'pointer')
        .attr('aria-label', d => `View memorial for spouse ${d.data.spouse.name}`)
        .attr('transform', d => `translate(${d._personWidth + 40 + d._spouseWidth / 2}, 0)`)
        .on('dblclick', (event, d) => showMemorialModal(d.data.spouse))
        .on('keydown', (event, d) => { if (event.key === 'Enter') showMemorialModal(d.data.spouse); })
        .on('mouseover', function() { d3.select(this).select('circle').attr('stroke', config.ACCENT_COLOR || '#c0a062').attr('stroke-width', 2); })
        .on('mouseout', function() { d3.select(this).select('circle').attr('stroke', '#666').attr('stroke-width', 1); });

    spouseGroup.append('circle').attr('r', 32).attr('fill', 'none').attr('stroke', '#666');
    spouseGroup.append('clipPath').attr('id', d => `clip-spouse-${d.data.spouse.id}`).append('circle').attr('r', 30);
    spouseGroup.append('image')
        .attr('xlink:href', d => d.data.spouse.photo).attr('x', -30).attr('y', -30)
        .attr('width', 60).attr('height', 60).attr('clip-path', d => `url(#clip-spouse-${d.data.spouse.id})`)
        .on('error', function() { d3.select(this).attr('xlink:href', FALLBACK_IMAGE); });

    spouseGroup.append('text')
        .attr('text-anchor', 'middle').style('font-family', 'Helvetica, Arial, sans-serif')
        .each(function(d) {
            const textElement = d3.select(this);
            const name = d.data.spouse.name || 'Unknown', yearRange = getYearRange(d.data.spouse), relationship = 'Spouse', words = name.split(/\s+/);
            let lines = [];
            if (words.length > 2) { lines.push(words.slice(0, 2).join(' ')); lines.push(words.slice(2).join(' ')); } 
            else { lines.push(name); }
            if (yearRange) { lines.push(yearRange); }
            lines.push(relationship);
            lines.forEach((line, i) => {
                const tspan = textElement.append('tspan').attr('x', 0).attr('dy', i === 0 ? '4.5em' : '1.4em').text(line);
                if (line === yearRange) { tspan.style('font-size', '10px').style('fill', '#666'); } 
                else if (line === relationship) { tspan.style('font-size', '10px').style('font-style', 'italic').style('fill', '#555'); } 
                else { tspan.style('font-size', '12px').style('font-weight', 'bold'); }
            });
        });
    
    coupleGroup.filter(d => d.data.spouse).insert('path', ':first-child')
        .attr('d', d => `M ${d._personWidth / 2 + 32},0 H ${d._personWidth + 40 + d._spouseWidth / 2 - 32}`)
        .attr('stroke', '#ccc').attr('stroke-width', 2);
}

function showMemorialModal(data) {
    let modal = document.querySelector('#memorialDetailModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.className = 'modal fade';
        modal.id = 'memorialDetailModal';
        modal.innerHTML = `
            <div class="modal-dialog modal-dialog-centered modal-lg">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title"></h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                    </div>
                    <div class="modal-body">
                        <img class="img-fluid mb-3" style="max-height: 200px; display: none;" id="modal-photo">
                        <p class="text-muted small mb-2" id="modal-dates"></p>
                        <p class="text-muted small mb-2" id="modal-cemetery"></p>
                        <p class="small" id="modal-bio"></p>
                    </div>
                    <div class="modal-footer">
                        <a href="#" id="modal-view-memorial" class="btn btn-primary">View Full Memorial</a>
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
                    </div>
                </div>
            </div>`;
        document.body.appendChild(modal);
    }
    const modalInstance = new bootstrap.Modal(modal);
    modal.querySelector('.modal-title').textContent = data.name;
    modal.querySelector('#modal-photo').src = data.photo;
    modal.querySelector('#modal-photo').style.display = data.photo && data.photo !== FALLBACK_IMAGE ? 'block' : 'none';
    modal.querySelector('#modal-dates').textContent = `${data.birthDate} - ${data.deathDate}`;
    modal.querySelector('#modal-cemetery').textContent = data.cemeteryAddress || 'No cemetery address provided';
    modal.querySelector('#modal-bio').textContent = data.bio || 'No biography provided';
    modal.querySelector('#modal-view-memorial').href = `/memorial?id=${data.id}`;
    modalInstance.show();
}

// --- PAGE LOADER ---
export async function loadFamilyTreePage(appRoot, memorialId) {
    if (!memorialId || typeof memorialId !== 'string') {
        appRoot.innerHTML = `<p class="text-center text-danger">Invalid memorial ID.</p>`;
        showToast('Invalid memorial ID.', 'error');
        return;
    }

    try {
        const response = await fetch('/pages/family-tree.html');
        if (!response.ok) throw new Error('HTML content not found');
        
        appRoot.innerHTML = await response.text();

        const backLink = appRoot.querySelector('#back-to-memorial-link');
        backLink.href = `/memorial?id=${memorialId}`;

        const familyData = await getFamilyData(memorialId);
        const hierarchy = await buildHierarchy(familyData, memorialId);

        if (hierarchy) {
            const subjectName = familyData.get(memorialId)?.name || 'Unknown';
            appRoot.querySelector('#tree-subject-name').textContent = subjectName;
            drawTree(d3.hierarchy(hierarchy), '#tree-container');
        } else {
            appRoot.querySelector('#tree-container').innerHTML = `<p class="text-center text-muted">Could not load family tree data.</p>`;
            showToast('No family tree data available.', 'warning');
        }
    } catch (error) {
        console.error("Failed to load family tree page:", error);
        appRoot.innerHTML = `<p class="text-center text-danger">An error occurred while building the tree. Please check the console for details.</p>`;
        showToast(error.message, 'error');
    }
}