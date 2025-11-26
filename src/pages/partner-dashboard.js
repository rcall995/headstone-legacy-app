// /js/pages/partner-dashboard.js - Partner dashboard
import { supabase } from '/js/supabase-client.js';
import { showToast } from '/js/utils/toasts.js';

/* ------------------- Format currency ------------------- */
function formatCurrency(amount) {
  return '$' + (amount || 0).toFixed(2).replace(/\d(?=(\d{3})+\.)/g, '$&,');
}

/* ------------------- Format date ------------------- */
function formatDate(dateString) {
  if (!dateString) return '-';
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
}

/* ------------------- Load partner data ------------------- */
async function loadPartnerData() {
  const loadingDiv = document.getElementById('partner-loading');
  const notPartnerDiv = document.getElementById('not-partner-message');
  const dashboardDiv = document.getElementById('partner-dashboard-content');
  const businessNameEl = document.getElementById('partner-business-name');

  try {
    // Check if user is logged in
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      // Not logged in - check if they have a partner record by email from localStorage
      loadingDiv.style.display = 'none';
      notPartnerDiv.style.display = 'block';
      businessNameEl.textContent = 'Please log in to view your dashboard';
      return;
    }

    // Get partner record for this user
    const { data: partner, error } = await supabase
      .from('partners')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (error || !partner) {
      // Try by email
      const { data: partnerByEmail } = await supabase
        .from('partners')
        .select('*')
        .eq('email', user.email)
        .single();

      if (!partnerByEmail) {
        loadingDiv.style.display = 'none';
        notPartnerDiv.style.display = 'block';
        businessNameEl.textContent = 'Not enrolled in partner program';
        return;
      }

      // Link partner record to user
      await supabase
        .from('partners')
        .update({ user_id: user.id })
        .eq('id', partnerByEmail.id);

      await displayDashboard(partnerByEmail);
      return;
    }

    await displayDashboard(partner);

  } catch (error) {
    console.error('Error loading partner data:', error);
    loadingDiv.style.display = 'none';
    notPartnerDiv.style.display = 'block';
  }
}

/* ------------------- Display dashboard ------------------- */
async function displayDashboard(partner) {
  const loadingDiv = document.getElementById('partner-loading');
  const dashboardDiv = document.getElementById('partner-dashboard-content');
  const businessNameEl = document.getElementById('partner-business-name');

  // Update header
  businessNameEl.textContent = partner.business_name;

  // Get referral stats
  const { data: referrals, error: refError } = await supabase
    .from('referrals')
    .select('*')
    .eq('partner_id', partner.id)
    .order('created_at', { ascending: false });

  if (refError) {
    console.error('Error loading referrals:', refError);
  }

  const refList = referrals || [];

  // Calculate stats
  const totalClicks = refList.length;
  const conversions = refList.filter(r => r.converted).length;
  const totalEarnings = refList
    .filter(r => r.converted)
    .reduce((sum, r) => sum + (r.commission_amount || partner.commission_rate || 15), 0);
  const pendingPayout = refList
    .filter(r => r.converted && !r.commission_paid)
    .reduce((sum, r) => sum + (r.commission_amount || partner.commission_rate || 15), 0);

  // Update stat cards
  document.getElementById('stat-clicks').textContent = totalClicks;
  document.getElementById('stat-conversions').textContent = conversions;
  document.getElementById('stat-earnings').textContent = formatCurrency(totalEarnings);
  document.getElementById('stat-pending').textContent = formatCurrency(pendingPayout);

  // Set referral link
  const baseUrl = window.location.origin;
  const referralLink = `${baseUrl}/?ref=${partner.referral_code}`;
  document.getElementById('dashboard-referral-link').value = referralLink;

  // Setup copy button
  const copyBtn = document.getElementById('dashboard-copy-btn');
  copyBtn.onclick = function () {
    const input = document.getElementById('dashboard-referral-link');
    input.select();
    document.execCommand('copy');
    showToast('Link copied to clipboard!', 'success');
    copyBtn.innerHTML = '<i class="fas fa-check"></i>';
    setTimeout(() => {
      copyBtn.innerHTML = '<i class="fas fa-copy"></i>';
    }, 2000);
  };

  // Populate referrals table
  const tableBody = document.getElementById('referrals-table-body');
  if (refList.length === 0) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="4" class="text-center text-muted py-4">
          <i class="fas fa-info-circle"></i> No activity yet. Share your link to get started!
        </td>
      </tr>
    `;
  } else {
    tableBody.innerHTML = refList.slice(0, 20).map(ref => `
      <tr>
        <td>${formatDate(ref.created_at)}</td>
        <td>${ref.converted ? 'Sale' : 'Click'}</td>
        <td>
          ${ref.converted
        ? (ref.commission_paid
          ? '<span class="badge badge-success">Paid</span>'
          : '<span class="badge badge-pending">Pending</span>')
        : '<span class="badge" style="background: var(--bg-warm); color: var(--text-secondary);">Visit</span>'
      }
        </td>
        <td>${ref.converted ? formatCurrency(ref.commission_amount || partner.commission_rate || 15) : '-'}</td>
      </tr>
    `).join('');
  }

  // Update payout info
  document.getElementById('payout-method').textContent =
    partner.payment_method ? partner.payment_method.charAt(0).toUpperCase() + partner.payment_method.slice(1) : '-';
  document.getElementById('payout-email').textContent = partner.payment_email || '-';

  // Show dashboard
  loadingDiv.style.display = 'none';
  dashboardDiv.style.display = 'block';
}

export async function loadPartnerDashboardPage(appRoot) {
  try {
    const response = await fetch('/pages/partner-dashboard.html');
    if (!response.ok) throw new Error('Could not load partner-dashboard.html');
    appRoot.innerHTML = await response.text();
    await loadPartnerData();
  } catch (error) {
    console.error('Failed to load partner dashboard:', error);
    appRoot.innerHTML = '<p class="text-danger text-center">Error loading partner dashboard.</p>';
  }
}
