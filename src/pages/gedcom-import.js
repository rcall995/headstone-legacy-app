// gedcom-import.js - GEDCOM file import page
import { supabase } from '/js/supabase-client.js';
import { showToast } from '/js/utils/toasts.js';

let gedcomFile = null;
let parsedData = null;
let selectedIds = new Set();

export async function loadGedcomImportPage(appRoot) {
    try {
        const response = await fetch('/pages/gedcom-import.html');
        if (!response.ok) throw new Error('Template not found');
        appRoot.innerHTML = await response.text();

        // Check auth
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            window.dispatchEvent(new CustomEvent('navigate', { detail: '/login' }));
            return;
        }

        initializeUpload();
    } catch (error) {
        console.error('Failed to load GEDCOM import page:', error);
        appRoot.innerHTML = '<p class="text-danger text-center">Error loading page</p>';
    }
}

function initializeUpload() {
    const uploadZone = document.getElementById('upload-zone');
    const fileInput = document.getElementById('gedcom-file-input');
    const browseBtn = document.getElementById('browse-btn');
    const parseBtn = document.getElementById('parse-btn');
    const removeFileBtn = document.getElementById('remove-file-btn');

    // Browse button
    browseBtn?.addEventListener('click', () => fileInput?.click());

    // File input change
    fileInput?.addEventListener('change', (e) => {
        if (e.target.files?.length > 0) {
            handleFileSelect(e.target.files[0]);
        }
    });

    // Drag and drop
    uploadZone?.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadZone.classList.add('dragover');
    });

    uploadZone?.addEventListener('dragleave', () => {
        uploadZone.classList.remove('dragover');
    });

    uploadZone?.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadZone.classList.remove('dragover');
        if (e.dataTransfer.files?.length > 0) {
            handleFileSelect(e.dataTransfer.files[0]);
        }
    });

    // Remove file
    removeFileBtn?.addEventListener('click', () => {
        gedcomFile = null;
        document.getElementById('file-info')?.classList.add('d-none');
        parseBtn.disabled = true;
        fileInput.value = '';
    });

    // Parse button
    parseBtn?.addEventListener('click', parseGedcomFile);

    // Back to upload
    document.getElementById('back-to-upload-btn')?.addEventListener('click', () => {
        showStep(1);
    });

    // Select all/deselect
    document.getElementById('select-all-btn')?.addEventListener('click', () => {
        selectAll(true);
    });

    document.getElementById('deselect-all-btn')?.addEventListener('click', () => {
        selectAll(false);
    });

    document.getElementById('select-all-checkbox')?.addEventListener('change', (e) => {
        selectAll(e.target.checked);
    });

    // Import button
    document.getElementById('import-btn')?.addEventListener('click', importSelected);

    // Import more
    document.getElementById('import-more-btn')?.addEventListener('click', () => {
        gedcomFile = null;
        parsedData = null;
        selectedIds.clear();
        document.getElementById('gedcom-file-input').value = '';
        document.getElementById('file-info')?.classList.add('d-none');
        document.getElementById('parse-btn').disabled = true;
        showStep(1);
    });

    // Retry
    document.getElementById('retry-btn')?.addEventListener('click', () => {
        showStep(2);
    });
}

function handleFileSelect(file) {
    if (!file.name.match(/\.(ged|gedcom)$/i)) {
        showToast('Please select a GEDCOM file (.ged or .gedcom)', 'error');
        return;
    }

    gedcomFile = file;

    // Update UI
    document.getElementById('file-name').textContent = file.name;
    document.getElementById('file-size').textContent = formatFileSize(file.size);
    document.getElementById('file-info')?.classList.remove('d-none');
    document.getElementById('parse-btn').disabled = false;
}

function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' bytes';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

async function parseGedcomFile() {
    if (!gedcomFile) return;

    const parseBtn = document.getElementById('parse-btn');
    parseBtn.disabled = true;
    parseBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Parsing...';

    try {
        // Read file content
        const gedcomText = await gedcomFile.text();

        // Get auth token
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) {
            throw new Error('Not authenticated');
        }

        // Send to API for parsing
        const response = await fetch('/api/gedcom/parse', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.access_token}`
            },
            body: JSON.stringify({
                gedcomText,
                fileName: gedcomFile.name
            })
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.error || 'Failed to parse GEDCOM file');
        }

        parsedData = result;
        selectedIds = new Set(result.allMemorials.map(m => m.gedcomId));

        // Update stats
        document.getElementById('stat-total').textContent = result.stats.totalIndividuals;
        document.getElementById('stat-deceased').textContent = result.stats.deceasedIndividuals;
        document.getElementById('stat-living').textContent = result.stats.livingIndividuals;
        document.getElementById('stat-families').textContent = result.stats.families;

        // Populate table
        populatePeopleTable(result.allMemorials);

        // Update counts
        updateSelectedCount();

        // Show step 2
        showStep(2);
        showToast(`Found ${result.stats.deceasedIndividuals} deceased individuals`, 'success');

    } catch (error) {
        console.error('Parse error:', error);
        showToast(error.message || 'Failed to parse file', 'error');
    } finally {
        parseBtn.disabled = false;
        parseBtn.innerHTML = '<i class="fas fa-cogs me-2"></i>Parse File';
    }
}

function populatePeopleTable(memorials) {
    const tbody = document.getElementById('people-table-body');
    if (!tbody) return;

    tbody.innerHTML = memorials.map(m => {
        const needsCemetery = !m.burialPlace;
        const needsLocation = true; // All need GPS

        return `
            <tr data-gedcom-id="${m.gedcomId}">
                <td>
                    <input type="checkbox" class="form-check-input person-checkbox"
                        data-gedcom-id="${m.gedcomId}" checked>
                </td>
                <td>
                    <strong>${escapeHtml(m.name)}</strong>
                    ${m.relationships?.length > 0 ? `<br><small class="text-muted">${m.relationships.length} relationships</small>` : ''}
                </td>
                <td>
                    ${m.birthDate || '<span class="text-muted">Unknown</span>'}
                    ${m.birthPlace ? `<br><small class="text-muted">${escapeHtml(m.birthPlace)}</small>` : ''}
                </td>
                <td>
                    ${m.deathDate || '<span class="text-muted">Unknown</span>'}
                    ${m.deathPlace ? `<br><small class="text-muted">${escapeHtml(m.deathPlace)}</small>` : ''}
                </td>
                <td>${m.burialPlace ? escapeHtml(m.burialPlace) : '<span class="text-muted">Unknown</span>'}</td>
                <td>
                    ${needsCemetery ? '<span class="badge bg-warning me-1">Cemetery</span>' : ''}
                    ${needsLocation ? '<span class="badge bg-info">GPS Pin</span>' : ''}
                </td>
            </tr>
        `;
    }).join('');

    // Add checkbox listeners
    tbody.querySelectorAll('.person-checkbox').forEach(cb => {
        cb.addEventListener('change', (e) => {
            const gedcomId = e.target.dataset.gedcomId;
            if (e.target.checked) {
                selectedIds.add(gedcomId);
            } else {
                selectedIds.delete(gedcomId);
            }
            updateSelectedCount();
        });
    });
}

function selectAll(select) {
    if (select) {
        parsedData?.allMemorials.forEach(m => selectedIds.add(m.gedcomId));
    } else {
        selectedIds.clear();
    }

    document.querySelectorAll('.person-checkbox').forEach(cb => {
        cb.checked = select;
    });

    document.getElementById('select-all-checkbox').checked = select;
    updateSelectedCount();
}

function updateSelectedCount() {
    const count = selectedIds.size;
    document.getElementById('selected-count').textContent = count;
    document.getElementById('import-count').textContent = count;
    document.getElementById('import-btn').disabled = count === 0;
}

async function importSelected() {
    if (selectedIds.size === 0) {
        showToast('Please select at least one person to import', 'error');
        return;
    }

    showStep(3);

    try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) {
            throw new Error('Not authenticated');
        }

        const response = await fetch('/api/gedcom/import', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.access_token}`
            },
            body: JSON.stringify({
                fileName: gedcomFile?.name,
                memorials: parsedData.allMemorials,
                selectedIds: Array.from(selectedIds)
            })
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.error || 'Import failed');
        }

        // Show success
        document.getElementById('import-loading')?.classList.add('d-none');
        document.getElementById('import-success')?.classList.remove('d-none');

        document.getElementById('result-created').textContent = result.stats.created;
        document.getElementById('result-connections').textContent = result.stats.connections;
        document.getElementById('result-wanted').textContent = result.memorials?.filter(m => m.needsLocation).length || 0;

        showToast(`Successfully imported ${result.stats.created} memorials!`, 'success');

    } catch (error) {
        console.error('Import error:', error);
        document.getElementById('import-loading')?.classList.add('d-none');
        document.getElementById('import-error')?.classList.remove('d-none');
        document.getElementById('error-message').textContent = error.message;
    }
}

function showStep(step) {
    // Update indicators
    for (let i = 1; i <= 3; i++) {
        const indicator = document.getElementById(`step${i}-indicator`);
        const content = document.getElementById(`step${i === 1 ? '1-upload' : i === 2 ? '2-review' : '3-results'}`);

        if (i < step) {
            indicator?.classList.add('completed');
            indicator?.classList.remove('active');
        } else if (i === step) {
            indicator?.classList.add('active');
            indicator?.classList.remove('completed');
        } else {
            indicator?.classList.remove('active', 'completed');
        }

        if (content) {
            if (i === step) {
                content.classList.remove('d-none');
            } else {
                content.classList.add('d-none');
            }
        }
    }

    // Reset step 3 UI when entering
    if (step === 3) {
        document.getElementById('import-loading')?.classList.remove('d-none');
        document.getElementById('import-success')?.classList.add('d-none');
        document.getElementById('import-error')?.classList.add('d-none');
    }
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

export default { loadGedcomImportPage };
