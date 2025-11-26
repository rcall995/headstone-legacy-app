// /js/pages/partners.js - Partner signup page
import { supabase } from '/js/supabase-client.js';
import { showToast } from '/js/utils/toasts.js';

/* ------------------- Generate referral code ------------------- */
function generateReferralCode(businessName) {
  // Create base code from business name (alphanumeric, uppercase)
  let base = businessName
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .substring(0, 8);

  // Pad if too short
  if (base.length < 4) {
    base = base + Math.random().toString(36).substring(2, 6).toUpperCase();
  }

  // Add random suffix for uniqueness
  const suffix = Math.random().toString(36).substring(2, 4).toUpperCase();
  return base + suffix;
}

/* ------------------- Handle form submission ------------------- */
async function handlePartnerSignup(e) {
  e.preventDefault();

  const form = e.target;
  const submitBtn = document.getElementById('partner-submit-btn');
  const successDiv = document.getElementById('partner-success');

  // Get form values
  const businessName = document.getElementById('business-name').value.trim();
  const contactName = document.getElementById('contact-name').value.trim();
  const businessType = document.getElementById('business-type').value;
  const email = document.getElementById('email').value.trim();
  const phone = document.getElementById('phone').value.trim();
  const website = document.getElementById('website').value.trim();
  const paymentMethod = document.getElementById('payment-method').value;
  const paymentEmail = document.getElementById('payment-email').value.trim();
  const agreeTerms = document.getElementById('agree-terms').checked;

  // Validation
  if (!businessName || !contactName || !businessType || !email || !paymentMethod) {
    showToast('Please fill in all required fields', 'error');
    return;
  }

  if (!agreeTerms) {
    showToast('Please agree to the terms and conditions', 'error');
    return;
  }

  if ((paymentMethod === 'paypal' || paymentMethod === 'venmo') && !paymentEmail) {
    showToast('Please enter your PayPal/Venmo email for payments', 'error');
    return;
  }

  // Disable button
  submitBtn.disabled = true;
  submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> <span>Processing...</span>';

  try {
    // Generate unique referral code
    let referralCode = generateReferralCode(businessName);

    // Check if code exists, regenerate if needed
    const { data: existing } = await supabase
      .from('partners')
      .select('referral_code')
      .eq('referral_code', referralCode)
      .single();

    if (existing) {
      referralCode = generateReferralCode(businessName + Date.now());
    }

    // Check if email already registered
    const { data: existingEmail } = await supabase
      .from('partners')
      .select('email')
      .eq('email', email)
      .single();

    if (existingEmail) {
      showToast('This email is already registered. Please log in to your partner dashboard.', 'error');
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<i class="fas fa-handshake"></i> <span>Join Partner Program</span>';
      return;
    }

    // Get current user if logged in
    const { data: { user } } = await supabase.auth.getUser();

    // Insert partner record
    const { data: partner, error } = await supabase
      .from('partners')
      .insert({
        user_id: user?.id || null,
        business_name: businessName,
        contact_name: contactName,
        email: email,
        phone: phone || null,
        business_type: businessType,
        website: website || null,
        referral_code: referralCode,
        payment_method: paymentMethod,
        payment_email: paymentEmail || null,
        status: 'approved' // Auto-approve for now
      })
      .select()
      .single();

    if (error) throw error;

    // Show success message
    form.style.display = 'none';
    successDiv.style.display = 'block';

    // Display referral code and link
    const referralCodeDisplay = document.getElementById('referral-code-display');
    const referralLinkInput = document.getElementById('referral-link');
    const baseUrl = window.location.origin;

    referralCodeDisplay.textContent = referralCode;
    referralLinkInput.value = `${baseUrl}/?ref=${referralCode}`;

    // Setup copy button
    const copyBtn = document.getElementById('copy-link-btn');
    copyBtn.onclick = function () {
      referralLinkInput.select();
      document.execCommand('copy');
      showToast('Link copied to clipboard!', 'success');
      copyBtn.innerHTML = '<i class="fas fa-check"></i>';
      setTimeout(() => {
        copyBtn.innerHTML = '<i class="fas fa-copy"></i>';
      }, 2000);
    };

    showToast('Welcome to the partner program!', 'success');

  } catch (error) {
    console.error('Partner signup error:', error);
    showToast(error.message || 'Failed to create partner account', 'error');
    submitBtn.disabled = false;
    submitBtn.innerHTML = '<i class="fas fa-handshake"></i> <span>Join Partner Program</span>';
  }
}

/* ------------------- Initialize page ------------------- */
function initPartnerPage() {
  const form = document.getElementById('partner-signup-form');
  if (form) {
    form.addEventListener('submit', handlePartnerSignup);
  }

  // Show/hide payment email based on method
  const paymentMethod = document.getElementById('payment-method');
  const paymentEmailGroup = document.getElementById('payment-email')?.closest('.col-md-6');

  if (paymentMethod && paymentEmailGroup) {
    paymentMethod.addEventListener('change', function () {
      if (this.value === 'check') {
        paymentEmailGroup.style.display = 'none';
      } else {
        paymentEmailGroup.style.display = 'block';
      }
    });
  }
}

export async function loadPartnersPage(appRoot) {
  try {
    const response = await fetch('/pages/partners.html');
    if (!response.ok) throw new Error('Could not load partners.html');
    appRoot.innerHTML = await response.text();
    initPartnerPage();
  } catch (error) {
    console.error('Failed to load partners page:', error);
    appRoot.innerHTML = '<p class="text-danger text-center">Error loading partners page.</p>';
  }
}
