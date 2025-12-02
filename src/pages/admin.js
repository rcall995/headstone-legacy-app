// /js/pages/admin.js - Comprehensive Admin Dashboard
import { supabase } from '/js/supabase-client.js';
import { showToast } from '/js/utils/toasts.js';

let currentUser = null;
let wsDetailModal = null;
let currentWsFilter = 'pending';
let currentTribFilter = 'pending';
let currentOrderFilter = 'paid';

// ==================== UTILITY FUNCTIONS ====================
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatDate(dateStr) {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric'
    });
}

function formatDateTime(dateStr) {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
        hour: 'numeric', minute: '2-digit'
    });
}

const categoryColors = {
    general: 'secondary',
    feature: 'primary',
    bug: 'danger',
    idea: 'success'
};

const businessTypeLabels = {
    monument_company: 'Monument Company',
    funeral_home: 'Funeral Home',
    cemetery: 'Cemetery',
    retailer: 'Retailer',
    other: 'Other'
};

// ==================== AUTH CHECK ====================
async function checkAdminAccess() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        showToast('Please sign in to access admin dashboard.', 'error');
        window.dispatchEvent(new CustomEvent('navigate', { detail: '/login' }));
        return false;
    }
    currentUser = user;
    return true;
}

// ==================== STATS LOADING ====================
async function loadStats() {
    try {
        // Memorials
        const { count: totalMemorials } = await supabase
            .from('memorials')
            .select('*', { count: 'exact', head: true });

        // Views & Candles
        const { data: memorialData } = await supabase
            .from('memorials')
            .select('view_count, candle_count');

        const totalViews = memorialData?.reduce((sum, m) => sum + (m.view_count || 0), 0) || 0;
        const totalCandles = memorialData?.reduce((sum, m) => sum + (m.candle_count || 0), 0) || 0;

        // Wholesale pending
        const { count: pendingWholesale } = await supabase
            .from('wholesale_applications')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'pending');

        // Partners
        const { count: totalPartners } = await supabase
            .from('partners')
            .select('*', { count: 'exact', head: true });

        // Pending tributes
        const { count: pendingTributes } = await supabase
            .from('tributes')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'pending');

        // Update UI
        document.getElementById('stat-memorials').textContent = totalMemorials || 0;
        document.getElementById('stat-views').textContent = totalViews.toLocaleString();
        document.getElementById('stat-candles').textContent = totalCandles.toLocaleString();
        document.getElementById('stat-wholesale').textContent = pendingWholesale || 0;
        document.getElementById('stat-partners').textContent = totalPartners || 0;
        document.getElementById('stat-pending').textContent = (pendingWholesale || 0) + (pendingTributes || 0);

        // Update badges
        if (pendingWholesale > 0) {
            document.getElementById('wholesale-badge').textContent = pendingWholesale;
            document.getElementById('wholesale-badge').style.display = '';
            document.getElementById('ws-pending-count').textContent = pendingWholesale;
        }

        if (pendingTributes > 0) {
            document.getElementById('tributes-badge').textContent = pendingTributes;
            document.getElementById('tributes-badge').style.display = '';
        }

    } catch (error) {
        console.error('Error loading stats:', error);
    }
}

// ==================== WHOLESALE APPLICATIONS ====================
async function loadWholesaleApplications(filter = 'pending') {
    currentWsFilter = filter;
    const loading = document.getElementById('wholesale-loading');
    const empty = document.getElementById('wholesale-empty');
    const table = document.getElementById('wholesale-table-container');
    const tbody = document.getElementById('wholesale-tbody');

    // Update filter buttons
    document.querySelectorAll('[data-filter]').forEach(btn => {
        if (btn.id?.startsWith('ws-filter')) {
            btn.classList.remove('active', 'btn-warning', 'btn-success', 'btn-danger', 'btn-secondary');
            btn.classList.add('btn-outline-' + (btn.dataset.filter === 'pending' ? 'warning' :
                btn.dataset.filter === 'approved' ? 'success' :
                btn.dataset.filter === 'rejected' ? 'danger' : 'secondary'));
        }
    });

    const activeBtn = document.getElementById(`ws-filter-${filter}`);
    if (activeBtn) {
        activeBtn.classList.remove('btn-outline-warning', 'btn-outline-success', 'btn-outline-danger', 'btn-outline-secondary');
        activeBtn.classList.add('active', filter === 'pending' ? 'btn-warning' :
            filter === 'approved' ? 'btn-success' :
            filter === 'rejected' ? 'btn-danger' : 'btn-secondary');
    }

    loading.style.display = '';
    empty.style.display = 'none';
    table.style.display = 'none';

    try {
        let query = supabase
            .from('wholesale_applications')
            .select('*')
            .order('created_at', { ascending: false });

        if (filter !== 'all') {
            query = query.eq('status', filter);
        }

        const { data, error } = await query;

        loading.style.display = 'none';

        if (error) throw error;

        if (!data || data.length === 0) {
            empty.style.display = '';
            return;
        }

        table.style.display = '';
        tbody.innerHTML = data.map(app => `
            <tr data-id="${app.id}">
                <td>
                    <strong>${escapeHtml(app.business_name)}</strong>
                    ${app.website ? `<br><a href="${escapeHtml(app.website)}" target="_blank" class="small text-muted">${escapeHtml(app.website)}</a>` : ''}
                </td>
                <td>
                    ${escapeHtml(app.contact_name)}<br>
                    <a href="mailto:${escapeHtml(app.email)}" class="small">${escapeHtml(app.email)}</a><br>
                    <span class="small text-muted">${escapeHtml(app.phone)}</span>
                </td>
                <td><span class="badge bg-secondary">${businessTypeLabels[app.business_type] || app.business_type}</span></td>
                <td>${escapeHtml(app.estimated_volume)}</td>
                <td class="small text-muted">${formatDate(app.created_at)}</td>
                <td>
                    <span class="badge bg-${app.status === 'pending' ? 'warning' : app.status === 'approved' ? 'success' : 'danger'}">
                        ${app.status}
                    </span>
                </td>
                <td class="text-end">
                    <button class="btn btn-sm btn-outline-primary ws-view-btn" data-id="${app.id}">
                        <i class="fas fa-eye"></i>
                    </button>
                    ${app.status === 'pending' ? `
                        <button class="btn btn-sm btn-success ws-approve-btn" data-id="${app.id}">
                            <i class="fas fa-check"></i>
                        </button>
                        <button class="btn btn-sm btn-danger ws-reject-btn" data-id="${app.id}">
                            <i class="fas fa-times"></i>
                        </button>
                    ` : ''}
                </td>
            </tr>
        `).join('');

    } catch (error) {
        console.error('Error loading wholesale applications:', error);
        loading.style.display = 'none';
        empty.innerHTML = `<p class="text-danger">Error loading applications</p>`;
        empty.style.display = '';
    }
}

async function showWholesaleDetail(appId) {
    try {
        const { data: app, error } = await supabase
            .from('wholesale_applications')
            .select('*')
            .eq('id', appId)
            .single();

        if (error) throw error;

        const content = document.getElementById('ws-detail-content');
        const actions = document.getElementById('ws-detail-actions');

        content.innerHTML = `
            <div class="row">
                <div class="col-md-6">
                    <h6 class="text-muted mb-2">Business Information</h6>
                    <table class="table table-sm">
                        <tr><th>Business Name</th><td>${escapeHtml(app.business_name)}</td></tr>
                        <tr><th>Type</th><td>${businessTypeLabels[app.business_type] || app.business_type}</td></tr>
                        <tr><th>Website</th><td>${app.website ? `<a href="${escapeHtml(app.website)}" target="_blank">${escapeHtml(app.website)}</a>` : '-'}</td></tr>
                        <tr><th>Est. Volume</th><td>${escapeHtml(app.estimated_volume)}</td></tr>
                        <tr><th>Timeline</th><td>${escapeHtml(app.timeline) || '-'}</td></tr>
                    </table>
                </div>
                <div class="col-md-6">
                    <h6 class="text-muted mb-2">Contact Information</h6>
                    <table class="table table-sm">
                        <tr><th>Name</th><td>${escapeHtml(app.contact_name)}</td></tr>
                        <tr><th>Title</th><td>${escapeHtml(app.title) || '-'}</td></tr>
                        <tr><th>Email</th><td><a href="mailto:${escapeHtml(app.email)}">${escapeHtml(app.email)}</a></td></tr>
                        <tr><th>Phone</th><td><a href="tel:${escapeHtml(app.phone)}">${escapeHtml(app.phone)}</a></td></tr>
                    </table>
                </div>
            </div>
            ${app.message ? `
                <div class="mt-3">
                    <h6 class="text-muted mb-2">Additional Message</h6>
                    <div class="bg-light p-3 rounded">${escapeHtml(app.message)}</div>
                </div>
            ` : ''}
            <div class="mt-3">
                <small class="text-muted">Submitted: ${formatDateTime(app.created_at)}</small>
                ${app.reviewed_at ? `<br><small class="text-muted">Reviewed: ${formatDateTime(app.reviewed_at)}</small>` : ''}
            </div>
        `;

        if (app.status === 'pending') {
            actions.innerHTML = `
                <button class="btn btn-outline-secondary" data-bs-dismiss="modal">Close</button>
                <button class="btn btn-danger" id="modal-reject-btn" data-id="${app.id}">
                    <i class="fas fa-times me-2"></i>Reject
                </button>
                <button class="btn btn-success" id="modal-approve-btn" data-id="${app.id}">
                    <i class="fas fa-check me-2"></i>Approve & Create Account
                </button>
            `;

            document.getElementById('modal-approve-btn')?.addEventListener('click', () => approveWholesale(app.id));
            document.getElementById('modal-reject-btn')?.addEventListener('click', () => rejectWholesale(app.id));
        } else {
            actions.innerHTML = `<button class="btn btn-secondary" data-bs-dismiss="modal">Close</button>`;
        }

        wsDetailModal.show();

    } catch (error) {
        console.error('Error loading wholesale detail:', error);
        showToast('Error loading application details', 'error');
    }
}

async function approveWholesale(appId) {
    try {
        // Get the application
        const { data: app, error: fetchError } = await supabase
            .from('wholesale_applications')
            .select('*')
            .eq('id', appId)
            .single();

        if (fetchError) throw fetchError;

        // Update application status
        const { error: updateError } = await supabase
            .from('wholesale_applications')
            .update({
                status: 'approved',
                reviewed_by: currentUser.id,
                reviewed_at: new Date().toISOString()
            })
            .eq('id', appId);

        if (updateError) throw updateError;

        // Determine pricing tier based on volume
        let pricingTier = 'starter';
        let pricePerTag = 25.00;

        if (app.estimated_volume?.includes('50') || app.estimated_volume?.includes('100')) {
            pricingTier = 'enterprise';
            pricePerTag = 15.00;
        } else if (app.estimated_volume?.includes('25')) {
            pricingTier = 'professional';
            pricePerTag = 20.00;
        }

        // Create wholesale account
        const { error: accountError } = await supabase
            .from('wholesale_accounts')
            .insert({
                application_id: appId,
                business_name: app.business_name,
                business_type: app.business_type,
                contact_name: app.contact_name,
                email: app.email,
                phone: app.phone,
                website: app.website,
                pricing_tier: pricingTier,
                price_per_tag: pricePerTag,
                status: 'active'
            });

        if (accountError) throw accountError;

        wsDetailModal.hide();
        showToast(`${app.business_name} approved! Account created with ${pricingTier} pricing.`, 'success');
        loadWholesaleApplications(currentWsFilter);
        loadStats();

    } catch (error) {
        console.error('Error approving wholesale:', error);
        showToast('Error approving application: ' + error.message, 'error');
    }
}

async function rejectWholesale(appId) {
    if (!confirm('Are you sure you want to reject this application?')) return;

    try {
        const { error } = await supabase
            .from('wholesale_applications')
            .update({
                status: 'rejected',
                reviewed_by: currentUser.id,
                reviewed_at: new Date().toISOString()
            })
            .eq('id', appId);

        if (error) throw error;

        wsDetailModal.hide();
        showToast('Application rejected', 'success');
        loadWholesaleApplications(currentWsFilter);
        loadStats();

    } catch (error) {
        console.error('Error rejecting wholesale:', error);
        showToast('Error rejecting application', 'error');
    }
}

// ==================== PARTNERS ====================
async function loadPartners() {
    const loading = document.getElementById('partners-loading');
    const empty = document.getElementById('partners-empty');
    const table = document.getElementById('partners-table-container');
    const tbody = document.getElementById('partners-tbody');

    try {
        const { data, error } = await supabase
            .from('partners')
            .select('*')
            .order('created_at', { ascending: false });

        loading.style.display = 'none';

        if (error) throw error;

        // Update stats
        const totalClicks = data?.reduce((sum, p) => sum + (p.total_clicks || 0), 0) || 0;
        const totalConversions = data?.reduce((sum, p) => sum + (p.total_conversions || 0), 0) || 0;

        document.getElementById('partners-total').textContent = data?.length || 0;
        document.getElementById('partners-clicks').textContent = totalClicks.toLocaleString();
        document.getElementById('partners-conversions').textContent = totalConversions;

        if (!data || data.length === 0) {
            empty.style.display = '';
            return;
        }

        table.style.display = '';
        tbody.innerHTML = data.map(p => `
            <tr>
                <td>
                    <strong>${escapeHtml(p.business_name || p.contact_name || 'Partner')}</strong>
                    <br><small class="text-muted">${escapeHtml(p.email)}</small>
                </td>
                <td><code>${escapeHtml(p.referral_code)}</code></td>
                <td>${(p.total_clicks || 0).toLocaleString()}</td>
                <td>${p.total_conversions || 0}</td>
                <td>${p.commission_rate || 10}%</td>
                <td class="small text-muted">${formatDate(p.created_at)}</td>
                <td>
                    <span class="badge bg-${p.status === 'active' ? 'success' : 'secondary'}">
                        ${p.status || 'active'}
                    </span>
                </td>
            </tr>
        `).join('');

    } catch (error) {
        console.error('Error loading partners:', error);
        loading.style.display = 'none';
    }
}

// ==================== MEMORIALS ====================
async function loadMemorials(filter = 'all', search = '') {
    const tbody = document.getElementById('memorials-tbody');

    try {
        let query = supabase
            .from('memorials')
            .select('id, name, status, view_count, candle_count, created_at')
            .order('created_at', { ascending: false })
            .limit(50);

        if (filter !== 'all') {
            query = query.eq('status', filter);
        }

        if (search) {
            query = query.ilike('name', `%${search}%`);
        }

        const { data, error } = await query;

        if (error) throw error;

        // Get tribute counts
        const { data: tributeCounts } = await supabase
            .from('tributes')
            .select('memorial_id');

        const tributeMap = {};
        tributeCounts?.forEach(t => {
            tributeMap[t.memorial_id] = (tributeMap[t.memorial_id] || 0) + 1;
        });

        // Update stats
        const { count: total } = await supabase.from('memorials').select('*', { count: 'exact', head: true });
        const { count: published } = await supabase.from('memorials').select('*', { count: 'exact', head: true }).eq('status', 'published');
        const { count: drafts } = await supabase.from('memorials').select('*', { count: 'exact', head: true }).eq('status', 'draft');

        const totalViews = data?.reduce((sum, m) => sum + (m.view_count || 0), 0) || 0;

        document.getElementById('mem-total').textContent = total || 0;
        document.getElementById('mem-published').textContent = published || 0;
        document.getElementById('mem-drafts').textContent = drafts || 0;
        document.getElementById('mem-views-total').textContent = totalViews.toLocaleString();

        if (!data || data.length === 0) {
            tbody.innerHTML = `<tr><td colspan="7" class="text-center py-4 text-muted">No memorials found</td></tr>`;
            return;
        }

        tbody.innerHTML = data.map(m => `
            <tr>
                <td>
                    <a href="/memorial?id=${m.id}" class="text-decoration-none fw-bold" data-route>
                        ${escapeHtml(m.name || 'Unnamed')}
                    </a>
                </td>
                <td>
                    <span class="badge bg-${m.status === 'published' ? 'success' : 'warning'}">
                        ${m.status || 'draft'}
                    </span>
                </td>
                <td><i class="fas fa-eye text-muted me-1"></i>${(m.view_count || 0).toLocaleString()}</td>
                <td><i class="fas fa-fire text-warning me-1"></i>${m.candle_count || 0}</td>
                <td><i class="fas fa-heart text-danger me-1"></i>${tributeMap[m.id] || 0}</td>
                <td class="small text-muted">${formatDate(m.created_at)}</td>
                <td class="text-end">
                    <a href="/memorial-form?id=${m.id}" class="btn btn-sm btn-outline-primary" data-route>
                        <i class="fas fa-edit"></i>
                    </a>
                </td>
            </tr>
        `).join('');

    } catch (error) {
        console.error('Error loading memorials:', error);
        tbody.innerHTML = `<tr><td colspan="7" class="text-center py-4 text-danger">Error loading memorials</td></tr>`;
    }
}

// ==================== TRIBUTES ====================
async function loadTributes(filter = 'pending') {
    currentTribFilter = filter;
    const loading = document.getElementById('tributes-loading');
    const empty = document.getElementById('tributes-empty');
    const list = document.getElementById('tributes-list');

    // Update filter buttons
    document.querySelectorAll('[id^="trib-filter"]').forEach(btn => {
        btn.classList.remove('active', 'btn-warning', 'btn-success', 'btn-secondary');
        btn.classList.add('btn-outline-' + (btn.dataset.filter === 'pending' ? 'warning' :
            btn.dataset.filter === 'approved' ? 'success' : 'secondary'));
    });

    const activeBtn = document.getElementById(`trib-filter-${filter}`);
    if (activeBtn) {
        activeBtn.classList.remove('btn-outline-warning', 'btn-outline-success', 'btn-outline-secondary');
        activeBtn.classList.add('active', filter === 'pending' ? 'btn-warning' :
            filter === 'approved' ? 'btn-success' : 'btn-secondary');
    }

    loading.style.display = '';
    empty.style.display = 'none';
    list.style.display = 'none';

    try {
        let query = supabase
            .from('tributes')
            .select('*, memorials(name)')
            .order('created_at', { ascending: false });

        if (filter !== 'all') {
            query = query.eq('status', filter);
        }

        const { data, error } = await query;

        loading.style.display = 'none';

        if (error) throw error;

        if (!data || data.length === 0) {
            empty.style.display = '';
            return;
        }

        list.style.display = '';
        list.innerHTML = data.map(t => `
            <div class="tribute-card ${t.status}">
                <div class="d-flex justify-content-between">
                    <div>
                        <strong>${escapeHtml(t.author_name || 'Anonymous')}</strong>
                        <span class="badge bg-${t.status === 'pending' ? 'warning' : 'success'} ms-2">${t.status}</span>
                        <br>
                        <small class="text-muted">On: ${escapeHtml(t.memorials?.name || 'Unknown memorial')}</small>
                    </div>
                    <div>
                        ${t.status === 'pending' ? `
                            <button class="btn btn-sm btn-success trib-approve-btn" data-id="${t.id}">
                                <i class="fas fa-check"></i> Approve
                            </button>
                            <button class="btn btn-sm btn-danger trib-reject-btn" data-id="${t.id}">
                                <i class="fas fa-times"></i>
                            </button>
                        ` : ''}
                    </div>
                </div>
                <p class="mt-2 mb-1">${escapeHtml(t.message)}</p>
                <small class="text-muted">${formatDateTime(t.created_at)}</small>
            </div>
        `).join('');

    } catch (error) {
        console.error('Error loading tributes:', error);
        loading.style.display = 'none';
    }
}

async function approveTribute(tributeId) {
    try {
        const { error } = await supabase
            .from('tributes')
            .update({ status: 'approved' })
            .eq('id', tributeId);

        if (error) throw error;

        showToast('Tribute approved', 'success');
        loadTributes(currentTribFilter);
        loadStats();
    } catch (error) {
        console.error('Error approving tribute:', error);
        showToast('Error approving tribute', 'error');
    }
}

async function rejectTribute(tributeId) {
    if (!confirm('Delete this tribute?')) return;

    try {
        const { error } = await supabase
            .from('tributes')
            .delete()
            .eq('id', tributeId);

        if (error) throw error;

        showToast('Tribute removed', 'success');
        loadTributes(currentTribFilter);
        loadStats();
    } catch (error) {
        console.error('Error rejecting tribute:', error);
        showToast('Error removing tribute', 'error');
    }
}

// ==================== ORDERS ====================
async function loadOrders(filter = 'paid') {
    currentOrderFilter = filter;
    const loading = document.getElementById('orders-loading');
    const empty = document.getElementById('orders-empty');
    const table = document.getElementById('orders-table-container');
    const tbody = document.getElementById('orders-tbody');

    // Update filter buttons
    document.querySelectorAll('[id^="order-filter-"]').forEach(btn => {
        btn.classList.remove('active', 'btn-info', 'btn-warning', 'btn-success', 'btn-secondary');
        btn.classList.add('btn-outline-' + (btn.dataset.filter === 'paid' ? 'info' :
            btn.dataset.filter === 'pending' ? 'warning' :
            btn.dataset.filter === 'shipped' ? 'success' : 'secondary'));
    });

    const activeBtn = document.getElementById(`order-filter-${filter}`);
    if (activeBtn) {
        activeBtn.classList.remove('btn-outline-info', 'btn-outline-warning', 'btn-outline-success', 'btn-outline-secondary');
        activeBtn.classList.add('active', filter === 'paid' ? 'btn-info' :
            filter === 'pending' ? 'btn-warning' :
            filter === 'shipped' ? 'btn-success' : 'btn-secondary');
    }

    loading.style.display = '';
    empty.style.display = 'none';
    table.style.display = 'none';

    try {
        let query = supabase
            .from('orders')
            .select('*, memorials(id, name)')
            .order('created_at', { ascending: false });

        if (filter !== 'all') {
            query = query.eq('status', filter);
        }

        const { data, error } = await query;

        loading.style.display = 'none';

        if (error) throw error;

        // Update stats
        const allOrders = await supabase.from('orders').select('status, amount_cents');
        const pending = allOrders.data?.filter(o => o.status === 'pending').length || 0;
        const paid = allOrders.data?.filter(o => o.status === 'paid').length || 0;
        const shipped = allOrders.data?.filter(o => o.status === 'shipped' || o.status === 'delivered').length || 0;
        const revenue = allOrders.data?.filter(o => o.status !== 'pending' && o.status !== 'cancelled')
            .reduce((sum, o) => sum + (o.amount_cents || 0), 0) || 0;

        document.getElementById('orders-pending').textContent = pending;
        document.getElementById('orders-paid').textContent = paid;
        document.getElementById('orders-shipped').textContent = shipped;
        document.getElementById('orders-revenue').textContent = '$' + (revenue / 100).toFixed(2);

        // Update badge
        if (paid > 0) {
            document.getElementById('orders-badge').textContent = paid;
            document.getElementById('orders-badge').style.display = '';
        } else {
            document.getElementById('orders-badge').style.display = 'none';
        }

        if (!data || data.length === 0) {
            empty.style.display = '';
            return;
        }

        table.style.display = '';
        tbody.innerHTML = data.map(order => {
            const addr = order.shipping_address;
            const addressHtml = addr ? `
                <small>
                    ${escapeHtml(addr.name || order.customer_name || '')}<br>
                    ${escapeHtml(addr.line1 || '')}${addr.line2 ? '<br>' + escapeHtml(addr.line2) : ''}<br>
                    ${escapeHtml(addr.city || '')}, ${escapeHtml(addr.state || '')} ${escapeHtml(addr.postal_code || '')}
                </small>
            ` : '<span class="text-muted">-</span>';

            const statusColors = {
                pending: 'warning',
                paid: 'info',
                shipped: 'primary',
                delivered: 'success',
                cancelled: 'danger'
            };

            return `
                <tr data-id="${order.id}">
                    <td>
                        <code>${order.id.substring(0, 8).toUpperCase()}</code>
                    </td>
                    <td>
                        <a href="/memorial?id=${order.memorial_id}" class="text-decoration-none" data-route>
                            ${escapeHtml(order.memorials?.name || 'Unknown')}
                        </a>
                    </td>
                    <td>
                        ${escapeHtml(order.customer_name || '-')}<br>
                        <small class="text-muted">${escapeHtml(order.customer_email || '')}</small>
                    </td>
                    <td>${addressHtml}</td>
                    <td><strong>$${((order.amount_cents || 0) / 100).toFixed(2)}</strong></td>
                    <td>
                        <span class="badge bg-${statusColors[order.status] || 'secondary'}">
                            ${order.status}
                        </span>
                    </td>
                    <td class="small text-muted">${formatDate(order.created_at)}</td>
                    <td class="text-end">
                        ${order.qr_code_url ? `
                            <a href="${order.qr_code_url}" target="_blank" class="btn btn-sm btn-success" download="qr-${order.id.substring(0,8)}.png">
                                <i class="fas fa-qrcode me-1"></i>Download
                            </a>
                        ` : `
                            <button class="btn btn-sm btn-outline-secondary generate-qr-btn" data-id="${order.id}" data-memorial="${order.memorial_id}">
                                <i class="fas fa-sync me-1"></i>Generate
                            </button>
                        `}
                        ${order.status === 'paid' ? `
                            <button class="btn btn-sm btn-primary mark-shipped-btn ms-1" data-id="${order.id}">
                                <i class="fas fa-truck"></i>
                            </button>
                        ` : ''}
                    </td>
                </tr>
            `;
        }).join('');

    } catch (error) {
        console.error('Error loading orders:', error);
        loading.style.display = 'none';
        empty.innerHTML = `<p class="text-danger">Error loading orders</p>`;
        empty.style.display = '';
    }
}

async function markOrderShipped(orderId) {
    const trackingNumber = prompt('Enter tracking number (optional):');

    try {
        const { error } = await supabase
            .from('orders')
            .update({
                status: 'shipped',
                shipped_at: new Date().toISOString(),
                tracking_number: trackingNumber || null,
                updated_at: new Date().toISOString()
            })
            .eq('id', orderId);

        if (error) throw error;

        showToast('Order marked as shipped!', 'success');
        loadOrders(currentOrderFilter);
    } catch (error) {
        console.error('Error updating order:', error);
        showToast('Error updating order', 'error');
    }
}

async function generateQRCode(orderId, memorialId) {
    const btn = document.querySelector(`[data-id="${orderId}"].generate-qr-btn`);
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    }

    try {
        const { data: { session } } = await supabase.auth.getSession();

        const response = await fetch('/api/orders/generate-qr', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.access_token}`
            },
            body: JSON.stringify({ orderId })
        });

        if (!response.ok) {
            throw new Error('Failed to generate QR code');
        }

        showToast('QR code generated!', 'success');
        loadOrders(currentOrderFilter);
    } catch (error) {
        console.error('Error generating QR:', error);
        showToast('Error generating QR code', 'error');
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-sync me-1"></i>Generate';
        }
    }
}

// ==================== QR GENERATOR ====================
async function loadQRGeneratorMemorials() {
    const select = document.getElementById('qr-memorial-select');
    if (!select) return;

    try {
        const { data, error } = await supabase
            .from('memorials')
            .select('id, name')
            .order('name', { ascending: true });

        if (error) throw error;

        // Keep the placeholder option
        select.innerHTML = '<option value="">-- Select a memorial --</option>';

        if (data && data.length > 0) {
            data.forEach(m => {
                const option = document.createElement('option');
                option.value = m.id;
                option.textContent = m.name || 'Unnamed Memorial';
                select.appendChild(option);
            });
        }
    } catch (error) {
        console.error('Error loading memorials for QR generator:', error);
    }
}

function updateQRGenerateButton() {
    const select = document.getElementById('qr-memorial-select');
    const manualInput = document.getElementById('qr-manual-id');
    const generateBtn = document.getElementById('generate-branded-qr-btn');
    const infoDiv = document.getElementById('qr-memorial-info');
    const urlPreview = document.getElementById('qr-url-preview');

    const memorialId = select?.value || manualInput?.value?.trim();

    if (generateBtn) {
        generateBtn.disabled = !memorialId;
    }

    if (memorialId) {
        if (infoDiv) infoDiv.style.display = '';
        if (urlPreview) urlPreview.textContent = `https://www.headstonelegacy.com/memorial?id=${memorialId}`;
    } else {
        if (infoDiv) infoDiv.style.display = 'none';
    }
}

async function generateBrandedQR() {
    const select = document.getElementById('qr-memorial-select');
    const manualInput = document.getElementById('qr-manual-id');
    const memorialId = select?.value || manualInput?.value?.trim();

    if (!memorialId) {
        showToast('Please select a memorial or enter an ID', 'error');
        return;
    }

    const placeholder = document.getElementById('qr-preview-placeholder');
    const loading = document.getElementById('qr-preview-loading');
    const result = document.getElementById('qr-preview-result');
    const previewImg = document.getElementById('qr-preview-image');
    const downloadLink = document.getElementById('qr-download-link');
    const generateBtn = document.getElementById('generate-branded-qr-btn');

    // Show loading state
    if (placeholder) placeholder.style.display = 'none';
    if (result) result.style.display = 'none';
    if (loading) loading.style.display = '';
    if (generateBtn) {
        generateBtn.disabled = true;
        generateBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>Generating...';
    }

    try {
        // Call the branded QR API
        const response = await fetch(`/api/tools/generate-branded-qr?id=${encodeURIComponent(memorialId)}`);

        if (!response.ok) {
            throw new Error('Failed to generate QR code');
        }

        // Get the blob from response
        const blob = await response.blob();
        const imageUrl = URL.createObjectURL(blob);

        // Update preview
        if (previewImg) previewImg.src = imageUrl;
        if (downloadLink) {
            downloadLink.href = imageUrl;
            downloadLink.download = `headstone-legacy-qr-${memorialId}.png`;
        }

        // Show result
        if (loading) loading.style.display = 'none';
        if (result) result.style.display = '';

        showToast('QR code generated successfully!', 'success');

    } catch (error) {
        console.error('Error generating branded QR:', error);
        showToast('Error generating QR code: ' + error.message, 'error');

        // Reset to placeholder
        if (loading) loading.style.display = 'none';
        if (placeholder) placeholder.style.display = '';
    } finally {
        if (generateBtn) {
            generateBtn.disabled = false;
            generateBtn.innerHTML = '<i class="fas fa-qrcode me-2"></i>Generate QR Code';
        }
        updateQRGenerateButton();
    }
}

// ==================== NOTES ====================
async function loadNotes(filter = 'all') {
    const notesList = document.getElementById('notes-list');

    try {
        let query = supabase
            .from('project_notes')
            .select('*')
            .order('is_pinned', { ascending: false })
            .order('created_at', { ascending: false });

        if (filter !== 'all') {
            query = query.eq('category', filter);
        }

        const { data: notes, error } = await query;

        if (error) throw error;

        if (!notes || notes.length === 0) {
            notesList.innerHTML = `<div class="text-center py-4 text-muted">No notes yet</div>`;
            return;
        }

        notesList.innerHTML = notes.map(note => `
            <div class="list-group-item ${note.is_pinned ? 'note-pinned' : ''}" data-note-id="${note.id}">
                <div class="d-flex justify-content-between">
                    <div>
                        ${note.is_pinned ? '<i class="fas fa-thumbtack text-warning me-2"></i>' : ''}
                        <strong>${escapeHtml(note.title)}</strong>
                        <span class="badge bg-${categoryColors[note.category] || 'secondary'} badge-category ms-2">${note.category}</span>
                        <p class="mb-1 text-muted small mt-1">${escapeHtml(note.content)}</p>
                        <small class="text-muted">${formatDate(note.created_at)}</small>
                    </div>
                    <button class="btn btn-sm btn-outline-danger delete-note-btn" data-id="${note.id}">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        `).join('');

    } catch (error) {
        console.error('Error loading notes:', error);
        notesList.innerHTML = `<div class="text-center py-4 text-danger">Error loading notes</div>`;
    }
}

async function addNote(noteData) {
    try {
        const { error } = await supabase.from('project_notes').insert([noteData]);
        if (error) throw error;

        showToast('Note saved!', 'success');
        document.getElementById('add-note-form').reset();
        loadNotes(document.getElementById('notes-filter').value);
    } catch (error) {
        console.error('Error adding note:', error);
        showToast('Failed to save note', 'error');
    }
}

async function deleteNote(noteId) {
    if (!confirm('Delete this note?')) return;

    try {
        const { error } = await supabase.from('project_notes').delete().eq('id', noteId);
        if (error) throw error;

        showToast('Note deleted', 'success');
        loadNotes(document.getElementById('notes-filter').value);
    } catch (error) {
        console.error('Error deleting note:', error);
        showToast('Failed to delete note', 'error');
    }
}

// ==================== EVENT HANDLERS ====================
function setupEventHandlers() {
    // Initialize modal
    const modalEl = document.getElementById('wsDetailModal');
    if (modalEl) {
        wsDetailModal = new bootstrap.Modal(modalEl);
    }

    // Refresh button
    document.getElementById('refresh-all-btn')?.addEventListener('click', () => {
        loadStats();
        loadWholesaleApplications(currentWsFilter);
        showToast('Data refreshed', 'success');
    });

    // Wholesale filter buttons
    document.querySelectorAll('[id^="ws-filter-"]').forEach(btn => {
        btn.addEventListener('click', () => {
            loadWholesaleApplications(btn.dataset.filter);
        });
    });

    // Wholesale table actions (delegated)
    document.getElementById('wholesale-tbody')?.addEventListener('click', (e) => {
        const viewBtn = e.target.closest('.ws-view-btn');
        const approveBtn = e.target.closest('.ws-approve-btn');
        const rejectBtn = e.target.closest('.ws-reject-btn');

        if (viewBtn) showWholesaleDetail(viewBtn.dataset.id);
        if (approveBtn) approveWholesale(approveBtn.dataset.id);
        if (rejectBtn) rejectWholesale(rejectBtn.dataset.id);
    });

    // Wholesale search
    document.getElementById('ws-search')?.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase();
        document.querySelectorAll('#wholesale-tbody tr').forEach(row => {
            const text = row.textContent.toLowerCase();
            row.style.display = text.includes(query) ? '' : 'none';
        });
    });

    // Partners tab
    document.getElementById('partners-tab')?.addEventListener('shown.bs.tab', loadPartners);

    // Memorials tab
    document.getElementById('memorials-tab')?.addEventListener('shown.bs.tab', () => loadMemorials());

    // Memorial filters
    document.getElementById('mem-status-filter')?.addEventListener('change', (e) => {
        loadMemorials(e.target.value, document.getElementById('mem-search').value);
    });

    document.getElementById('mem-search')?.addEventListener('input', (e) => {
        loadMemorials(document.getElementById('mem-status-filter').value, e.target.value);
    });

    // Tributes tab & filters
    document.getElementById('tributes-tab')?.addEventListener('shown.bs.tab', () => loadTributes());

    document.querySelectorAll('[id^="trib-filter-"]').forEach(btn => {
        btn.addEventListener('click', () => loadTributes(btn.dataset.filter));
    });

    // Tributes actions (delegated)
    document.getElementById('tributes-list')?.addEventListener('click', (e) => {
        const approveBtn = e.target.closest('.trib-approve-btn');
        const rejectBtn = e.target.closest('.trib-reject-btn');

        if (approveBtn) approveTribute(approveBtn.dataset.id);
        if (rejectBtn) rejectTribute(rejectBtn.dataset.id);
    });

    // Notes tab
    document.getElementById('notes-tab')?.addEventListener('shown.bs.tab', () => loadNotes());

    // Notes form
    document.getElementById('add-note-form')?.addEventListener('submit', (e) => {
        e.preventDefault();
        addNote({
            title: document.getElementById('note-title').value.trim(),
            category: document.getElementById('note-category').value,
            content: document.getElementById('note-content').value.trim(),
            is_pinned: document.getElementById('note-pinned').checked
        });
    });

    // Notes filter
    document.getElementById('notes-filter')?.addEventListener('change', (e) => loadNotes(e.target.value));

    // Notes delete (delegated)
    document.getElementById('notes-list')?.addEventListener('click', (e) => {
        const deleteBtn = e.target.closest('.delete-note-btn');
        if (deleteBtn) deleteNote(deleteBtn.dataset.id);
    });

    // Orders tab
    document.getElementById('orders-tab')?.addEventListener('shown.bs.tab', () => loadOrders());

    // Orders filter buttons
    document.querySelectorAll('[id^="order-filter-"]').forEach(btn => {
        btn.addEventListener('click', () => loadOrders(btn.dataset.filter));
    });

    // Orders actions (delegated)
    document.getElementById('orders-tbody')?.addEventListener('click', (e) => {
        const shippedBtn = e.target.closest('.mark-shipped-btn');
        const generateBtn = e.target.closest('.generate-qr-btn');

        if (shippedBtn) markOrderShipped(shippedBtn.dataset.id);
        if (generateBtn) generateQRCode(generateBtn.dataset.id, generateBtn.dataset.memorial);
    });

    // QR Generator tab
    document.getElementById('qr-generator-tab')?.addEventListener('shown.bs.tab', () => {
        loadQRGeneratorMemorials();
    });

    // QR Generator controls
    document.getElementById('qr-memorial-select')?.addEventListener('change', () => {
        // Clear manual input when dropdown is used
        const manualInput = document.getElementById('qr-manual-id');
        if (manualInput) manualInput.value = '';
        updateQRGenerateButton();
    });

    document.getElementById('qr-manual-id')?.addEventListener('input', () => {
        // Clear dropdown when manual input is used
        const select = document.getElementById('qr-memorial-select');
        if (select) select.value = '';
        updateQRGenerateButton();
    });

    document.getElementById('generate-branded-qr-btn')?.addEventListener('click', generateBrandedQR);

    // Duplicates tab
    document.getElementById('duplicates-tab')?.addEventListener('shown.bs.tab', () => {
        // Don't auto-scan, let user click the button
    });

    // Scan for duplicates button
    document.getElementById('scan-duplicates-btn')?.addEventListener('click', scanForDuplicates);

    // Merge group buttons (delegated)
    document.getElementById('duplicates-list')?.addEventListener('click', (e) => {
        const mergeBtn = e.target.closest('.merge-group-btn');
        if (mergeBtn) {
            const groupIndex = parseInt(mergeBtn.dataset.group, 10);
            openMergeModal(groupIndex);
        }
    });

    // Merge confirm button
    document.getElementById('merge-confirm-btn')?.addEventListener('click', executeMerge);
}

// ==================== DUPLICATES ====================
let duplicateGroups = [];
let mergeModal = null;
let currentMergeGroup = null;
let selectedMergeData = {};

async function scanForDuplicates() {
    const btn = document.getElementById('scan-duplicates-btn');
    const loading = document.getElementById('duplicates-loading');
    const empty = document.getElementById('duplicates-empty');
    const list = document.getElementById('duplicates-list');
    const summary = document.getElementById('duplicates-summary');

    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>Scanning...';
    loading.style.display = '';
    empty.style.display = 'none';
    list.innerHTML = '';
    summary.style.display = 'none';

    try {
        const { data: { session } } = await supabase.auth.getSession();

        const response = await fetch('/api/admin/find-duplicates', {
            headers: {
                'Authorization': `Bearer ${session.access_token}`
            }
        });

        if (!response.ok) throw new Error('Failed to scan for duplicates');

        const data = await response.json();
        duplicateGroups = data.groups || [];

        loading.style.display = 'none';

        if (duplicateGroups.length === 0) {
            empty.style.display = '';
            return;
        }

        document.getElementById('duplicates-count').textContent = duplicateGroups.length;
        summary.style.display = '';

        // Update badge
        const badge = document.getElementById('duplicates-badge');
        if (badge) {
            badge.textContent = duplicateGroups.length;
            badge.style.display = duplicateGroups.length > 0 ? '' : 'none';
        }

        // Render groups
        list.innerHTML = duplicateGroups.map((group, idx) => `
            <div class="duplicate-group">
                <div class="duplicate-group-header">
                    <div>
                        <strong>${escapeHtml(group.memorials[0].name)}</strong>
                        <span class="badge bg-warning text-dark ms-2">${group.memorials.length} duplicates</span>
                    </div>
                    <button class="btn btn-warning btn-sm merge-group-btn" data-group="${idx}">
                        <i class="fas fa-object-group me-2"></i>Review & Merge
                    </button>
                </div>
                <div class="duplicate-items">
                    ${group.memorials.map((m, i) => `
                        <div class="duplicate-item ${i === 0 ? 'primary' : ''}">
                            ${i === 0 ? '<span class="badge bg-success position-absolute top-0 end-0 m-2">Most Complete</span>' : ''}
                            <h6 class="mb-2">${escapeHtml(m.name)}</h6>
                            <div class="small text-muted mb-1">
                                <i class="fas fa-calendar me-1"></i>
                                ${m.birth_date?.substring(0, 4) || '?'} - ${m.death_date?.substring(0, 4) || '?'}
                            </div>
                            ${m.cemetery_name ? `<div class="small text-muted mb-1"><i class="fas fa-church me-1"></i>${escapeHtml(m.cemetery_name)}</div>` : ''}
                            ${m.gravesite_lat ? '<span class="badge bg-success me-1">GPS</span>' : '<span class="badge bg-secondary me-1">No GPS</span>'}
                            ${m.main_photo ? '<span class="badge bg-info me-1">Photo</span>' : ''}
                            ${m.biography ? '<span class="badge bg-primary">Bio</span>' : ''}
                            <div class="completeness-bar mt-2">
                                <div class="completeness-fill" style="width: ${m.completeness}%"></div>
                            </div>
                            <small class="text-muted">${m.completeness}% complete</small>
                            ${m.matchScore ? `<div class="small text-warning mt-1"><i class="fas fa-exclamation-triangle me-1"></i>${m.matchScore}% match</div>` : ''}
                        </div>
                    `).join('')}
                </div>
            </div>
        `).join('');

    } catch (error) {
        console.error('Error scanning duplicates:', error);
        showToast('Error scanning for duplicates', 'error');
        loading.style.display = 'none';
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-search me-2"></i>Scan for Duplicates';
    }
}

function openMergeModal(groupIndex) {
    currentMergeGroup = duplicateGroups[groupIndex];
    if (!currentMergeGroup) return;

    selectedMergeData = {};
    const memorials = currentMergeGroup.memorials;

    // Fields to merge
    const fields = [
        { key: 'name', label: 'Name' },
        { key: 'birth_date', label: 'Birth Date' },
        { key: 'death_date', label: 'Death Date' },
        { key: 'birth_place', label: 'Birth Place' },
        { key: 'death_place', label: 'Death Place' },
        { key: 'cemetery_name', label: 'Cemetery' },
        { key: 'cemetery_address', label: 'Cemetery Address' },
        { key: 'biography', label: 'Biography', truncate: true }
    ];

    const modalContent = document.getElementById('merge-modal-content');
    modalContent.innerHTML = `
        <div class="alert alert-warning">
            <i class="fas fa-exclamation-triangle me-2"></i>
            <strong>Review carefully!</strong> Select which value to keep for each field. The merged memorial will use your selections.
        </div>
        <div class="mb-3">
            <label class="form-label fw-bold">Keep which memorial ID?</label>
            <div class="d-flex flex-wrap gap-2">
                ${memorials.map((m, i) => `
                    <div class="form-check">
                        <input class="form-check-input keep-memorial-radio" type="radio" name="keepMemorial" id="keep-${m.id}" value="${m.id}" ${i === 0 ? 'checked' : ''}>
                        <label class="form-check-label" for="keep-${m.id}">
                            <strong>${escapeHtml(m.name)}</strong>
                            <span class="badge bg-${i === 0 ? 'success' : 'secondary'} ms-1">${m.completeness}%</span>
                        </label>
                    </div>
                `).join('')}
            </div>
        </div>
        <hr>
        <h6 class="mb-3">Select best value for each field:</h6>
        ${fields.map(field => {
            const values = memorials.map(m => m[field.key]).filter(v => v);
            const uniqueValues = [...new Set(values)];

            if (uniqueValues.length <= 1) {
                // All same or only one value
                const val = uniqueValues[0] || '(empty)';
                selectedMergeData[field.key] = uniqueValues[0] || null;
                return `
                    <div class="merge-field-row">
                        <div class="merge-field-label">${field.label}</div>
                        <div class="merge-field-options">
                            <span class="merge-option selected">${field.truncate && val.length > 50 ? escapeHtml(val.substring(0, 50)) + '...' : escapeHtml(val)}</span>
                        </div>
                    </div>
                `;
            }

            // Multiple different values - let user choose
            return `
                <div class="merge-field-row">
                    <div class="merge-field-label">${field.label}</div>
                    <div class="merge-field-options">
                        ${uniqueValues.map((val, i) => `
                            <span class="merge-option ${i === 0 ? 'selected' : ''}" data-field="${field.key}" data-value="${escapeHtml(val)}">
                                ${field.truncate && val.length > 50 ? escapeHtml(val.substring(0, 50)) + '...' : escapeHtml(val)}
                            </span>
                        `).join('')}
                    </div>
                </div>
            `;
        }).join('')}
    `;

    // Pre-select first values
    fields.forEach(field => {
        const values = memorials.map(m => m[field.key]).filter(v => v);
        selectedMergeData[field.key] = values[0] || null;
    });

    // Add click handlers for merge options
    modalContent.querySelectorAll('.merge-option[data-field]').forEach(opt => {
        opt.addEventListener('click', () => {
            const field = opt.dataset.field;
            const value = opt.dataset.value;

            // Update selection
            opt.closest('.merge-field-options').querySelectorAll('.merge-option').forEach(o => o.classList.remove('selected'));
            opt.classList.add('selected');
            selectedMergeData[field] = value;
        });
    });

    // Show modal
    if (!mergeModal) {
        const modalEl = document.getElementById('mergeModal');
        if (modalEl) mergeModal = new bootstrap.Modal(modalEl);
    }
    mergeModal?.show();
}

async function executeMerge() {
    if (!currentMergeGroup) return;

    const keepId = document.querySelector('input[name="keepMemorial"]:checked')?.value;
    if (!keepId) {
        showToast('Please select which memorial to keep', 'error');
        return;
    }

    const mergeIds = currentMergeGroup.memorials
        .filter(m => m.id !== keepId)
        .map(m => m.id);

    const btn = document.getElementById('merge-confirm-btn');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>Merging...';

    try {
        const { data: { session } } = await supabase.auth.getSession();

        const response = await fetch('/api/admin/merge-memorials', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.access_token}`
            },
            body: JSON.stringify({
                keepId,
                mergeIds,
                mergedData: selectedMergeData
            })
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error || 'Merge failed');
        }

        showToast(`Merged ${mergeIds.length + 1} memorials into one!`, 'success');
        mergeModal?.hide();

        // Re-scan
        scanForDuplicates();

    } catch (error) {
        console.error('Merge error:', error);
        showToast(error.message || 'Error merging memorials', 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-object-group me-2"></i>Merge Selected';
    }
}

// ==================== MAIN EXPORT ====================
export async function loadAdminPage(appRoot) {
    try {
        const response = await fetch('/pages/admin.html');
        if (!response.ok) throw new Error('Could not load admin.html');
        appRoot.innerHTML = await response.text();

        const hasAccess = await checkAdminAccess();
        if (!hasAccess) return;

        // Load initial data
        await Promise.all([
            loadStats(),
            loadWholesaleApplications('pending')
        ]);

        // Set up handlers
        setupEventHandlers();

    } catch (error) {
        console.error('Failed to load admin page:', error);
        appRoot.innerHTML = `
            <div class="container py-5">
                <div class="alert alert-danger">
                    <h4>Error Loading Admin Dashboard</h4>
                    <p>${escapeHtml(error.message)}</p>
                </div>
            </div>
        `;
    }
}
