// /js/pages/wholesale-dashboard.js - Wholesale customer dashboard
import { supabase } from '/js/supabase-client.js';
import { showToast } from '/js/utils/toasts.js';
import { generateQRCodeSVG, generateQRCodePNG, downloadQRCode, getMemorialURL } from '/js/utils/qr-generator.js';

let currentAccount = null;
let memorials = [];
let qrPreviewModal = null;
let currentPreviewMemorial = null;

async function loadWholesaleAccount() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        window.dispatchEvent(new CustomEvent('navigate', { detail: '/login' }));
        return null;
    }

    // Get wholesale account for this user
    const { data: account, error } = await supabase
        .from('wholesale_accounts')
        .select('*')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .single();

    if (error || !account) {
        console.log('No wholesale account found');
        return null;
    }

    return account;
}

async function loadMemorials(userId) {
    const { data, error } = await supabase
        .from('memorials')
        .select('id, name, birth_date, death_date, main_photo, status, view_count, created_at')
        .contains('curator_ids', [userId])
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Error loading memorials:', error);
        return [];
    }

    return data || [];
}

function formatDate(dateString) {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
}

function renderDashboard(account, memorialsList) {
    // Update header
    document.getElementById('ws-business-name-display').textContent = account.business_name;
    document.getElementById('ws-tier-badge').textContent = account.pricing_tier.charAt(0).toUpperCase() + account.pricing_tier.slice(1);
    document.getElementById('ws-price-per-license').textContent = `$${account.price_per_tag}`;

    // Calculate stats (for now, we'll track by memorials created)
    const totalLicenses = memorialsList.length; // In real system, this would come from orders
    document.getElementById('ws-total-licenses').textContent = totalLicenses;
    document.getElementById('ws-available-licenses').textContent = '∞'; // Unlimited for now
    document.getElementById('ws-used-licenses').textContent = totalLicenses;

    // Render memorials table
    const loadingEl = document.getElementById('ws-loading');
    const emptyEl = document.getElementById('ws-empty');
    const listEl = document.getElementById('ws-memorials-list');
    const tbody = document.getElementById('ws-memorials-tbody');

    loadingEl.style.display = 'none';

    if (memorialsList.length === 0) {
        emptyEl.style.display = 'block';
        listEl.style.display = 'none';
    } else {
        emptyEl.style.display = 'none';
        listEl.style.display = 'block';

        tbody.innerHTML = memorialsList.map(memorial => `
            <tr data-memorial-id="${memorial.id}">
                <td>
                    <div class="d-flex align-items-center">
                        ${memorial.main_photo
                            ? `<img src="${memorial.main_photo}" alt="" class="rounded me-3" style="width: 40px; height: 40px; object-fit: cover;">`
                            : `<div class="rounded me-3 bg-secondary d-flex align-items-center justify-content-center" style="width: 40px; height: 40px;"><i class="fas fa-user text-white"></i></div>`
                        }
                        <div>
                            <strong>${escapeHtml(memorial.name || 'Unnamed')}</strong>
                            <div class="small text-muted">${formatDate(memorial.birth_date)} - ${formatDate(memorial.death_date)}</div>
                        </div>
                    </div>
                </td>
                <td>${formatDate(memorial.created_at)}</td>
                <td>
                    <span class="badge ${memorial.status === 'published' ? 'bg-success' : 'bg-warning'}">
                        ${memorial.status || 'draft'}
                    </span>
                </td>
                <td>${(memorial.view_count || 0).toLocaleString()}</td>
                <td class="text-end">
                    <div class="btn-group btn-group-sm">
                        <button class="btn btn-outline-primary qr-preview-btn" data-memorial-id="${memorial.id}" data-memorial-name="${escapeHtml(memorial.name || 'memorial')}">
                            <i class="fas fa-qrcode"></i>
                        </button>
                        <button class="btn btn-outline-secondary qr-download-btn" data-memorial-id="${memorial.id}" data-memorial-name="${escapeHtml(memorial.name || 'memorial')}">
                            <i class="fas fa-download"></i>
                        </button>
                        <a href="/memorial?id=${memorial.id}" class="btn btn-outline-info" data-route>
                            <i class="fas fa-eye"></i>
                        </a>
                        <a href="/memorial-form?id=${memorial.id}" class="btn btn-outline-warning" data-route>
                            <i class="fas fa-edit"></i>
                        </a>
                    </div>
                </td>
            </tr>
        `).join('');
    }
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

async function showQRPreview(memorialId, memorialName) {
    currentPreviewMemorial = { id: memorialId, name: memorialName };

    document.getElementById('qr-preview-title').textContent = `QR Code: ${memorialName}`;
    document.getElementById('qr-preview-url').textContent = getMemorialURL(memorialId);

    const container = document.getElementById('qr-preview-container');
    container.innerHTML = '<div class="spinner-border text-primary" role="status"></div>';

    qrPreviewModal.show();

    try {
        // Generate QR code for preview
        const svg = await generateQRCodeSVG(memorialId, { size: 256 });
        container.innerHTML = svg;
    } catch (err) {
        console.error('Failed to generate QR preview:', err);
        container.innerHTML = '<p class="text-danger">Failed to generate QR code</p>';
    }
}

async function downloadQRFiles(memorialId, memorialName, format = 'both') {
    const safeName = memorialName.replace(/[^a-z0-9]/gi, '-').toLowerCase();

    try {
        showToast('Generating QR code...', 'info');

        if (format === 'svg' || format === 'both') {
            const svg = await generateQRCodeSVG(memorialId, { size: 512 });
            downloadQRCode(svg, `${safeName}-qr-code.svg`, 'svg');
        }

        if (format === 'png' || format === 'both') {
            if (format === 'both') {
                await new Promise(resolve => setTimeout(resolve, 500));
            }
            const png = await generateQRCodePNG(memorialId, { size: 2048 });
            downloadQRCode(png, `${safeName}-qr-code.png`, 'png');
        }

        showToast('QR code downloaded!', 'success');
    } catch (err) {
        console.error('Download failed:', err);
        showToast('Failed to download QR code', 'error');
    }
}

async function downloadAllQRCodes() {
    if (memorials.length === 0) {
        showToast('No memorials to download', 'warning');
        return;
    }

    showToast(`Generating ${memorials.length} QR codes...`, 'info');

    for (const memorial of memorials) {
        try {
            await downloadQRFiles(memorial.id, memorial.name || 'memorial', 'svg');
            await new Promise(resolve => setTimeout(resolve, 300)); // Delay between downloads
        } catch (err) {
            console.error(`Failed to download QR for ${memorial.name}:`, err);
        }
    }

    showToast('All QR codes downloaded!', 'success');
}

function setupEventHandlers() {
    // Initialize modal
    const modalEl = document.getElementById('qrPreviewModal');
    if (modalEl) {
        qrPreviewModal = new bootstrap.Modal(modalEl);
    }

    // QR Preview buttons (delegated)
    document.addEventListener('click', async (e) => {
        const previewBtn = e.target.closest('.qr-preview-btn');
        if (previewBtn) {
            e.preventDefault();
            const memorialId = previewBtn.dataset.memorialId;
            const memorialName = previewBtn.dataset.memorialName;
            await showQRPreview(memorialId, memorialName);
        }

        const downloadBtn = e.target.closest('.qr-download-btn');
        if (downloadBtn) {
            e.preventDefault();
            const memorialId = downloadBtn.dataset.memorialId;
            const memorialName = downloadBtn.dataset.memorialName;
            await downloadQRFiles(memorialId, memorialName);
        }
    });

    // Modal download buttons
    document.getElementById('qr-download-svg-btn')?.addEventListener('click', async () => {
        if (currentPreviewMemorial) {
            await downloadQRFiles(currentPreviewMemorial.id, currentPreviewMemorial.name, 'svg');
        }
    });

    document.getElementById('qr-download-png-btn')?.addEventListener('click', async () => {
        if (currentPreviewMemorial) {
            await downloadQRFiles(currentPreviewMemorial.id, currentPreviewMemorial.name, 'png');
        }
    });

    // Download all button
    document.getElementById('ws-download-all-btn')?.addEventListener('click', downloadAllQRCodes);

    // Create memorial buttons
    document.getElementById('ws-create-memorial-btn')?.addEventListener('click', () => {
        window.dispatchEvent(new CustomEvent('navigate', { detail: '/memorial-form' }));
    });

    document.getElementById('ws-create-first-btn')?.addEventListener('click', () => {
        window.dispatchEvent(new CustomEvent('navigate', { detail: '/memorial-form' }));
    });

    // Buy more licenses (placeholder - will integrate with Stripe)
    document.getElementById('ws-buy-licenses-btn')?.addEventListener('click', () => {
        showToast('Payment integration coming soon!', 'info');
    });

    // Search functionality
    document.getElementById('ws-search-input')?.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase();
        const rows = document.querySelectorAll('#ws-memorials-tbody tr');

        rows.forEach(row => {
            const name = row.querySelector('strong')?.textContent.toLowerCase() || '';
            row.style.display = name.includes(query) ? '' : 'none';
        });
    });
}

export async function loadWholesaleDashboardPage(appRoot) {
    try {
        const response = await fetch('/pages/wholesale-dashboard.html');
        if (!response.ok) throw new Error('Could not load wholesale-dashboard.html');
        appRoot.innerHTML = await response.text();

        // Load account data
        currentAccount = await loadWholesaleAccount();

        if (!currentAccount) {
            // Not a wholesale customer - redirect to wholesale signup
            appRoot.innerHTML = `
                <div class="container py-5 text-center">
                    <i class="fas fa-lock fa-3x text-muted mb-3"></i>
                    <h3>Wholesale Access Required</h3>
                    <p class="text-muted">You don't have an active wholesale account.</p>
                    <a href="/wholesale" class="btn btn-primary" data-route>
                        <i class="fas fa-store me-2"></i>Apply for Wholesale
                    </a>
                </div>
            `;
            return;
        }

        // Load memorials
        const { data: { user } } = await supabase.auth.getUser();
        memorials = await loadMemorials(user.id);

        // Render dashboard
        renderDashboard(currentAccount, memorials);

        // Set up handlers
        setupEventHandlers();

    } catch (error) {
        console.error('Failed to load wholesale dashboard:', error);
        appRoot.innerHTML = '<p class="text-danger text-center">Error loading wholesale dashboard.</p>';
    }
}
