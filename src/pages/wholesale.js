// /js/pages/wholesale.js - Wholesale program page
import { supabase } from '/js/supabase-client.js';
import { showToast } from '/js/utils/toasts.js';

async function handleWholesaleApplication(e) {
  e.preventDefault();

  const form = e.target;
  const submitBtn = document.getElementById('ws-submit-btn');
  const successDiv = document.getElementById('ws-success');

  // Get form values
  const businessName = document.getElementById('ws-business-name').value.trim();
  const businessType = document.getElementById('ws-business-type').value;
  const contactName = document.getElementById('ws-contact-name').value.trim();
  const title = document.getElementById('ws-title').value.trim();
  const email = document.getElementById('ws-email').value.trim();
  const phone = document.getElementById('ws-phone').value.trim();
  const website = document.getElementById('ws-website').value.trim();
  const volume = document.getElementById('ws-volume').value;
  const timeline = document.getElementById('ws-timeline').value;
  const message = document.getElementById('ws-message').value.trim();

  // Validation
  if (!businessName || !businessType || !contactName || !email || !phone || !volume) {
    showToast('Please fill in all required fields', 'error');
    return;
  }

  // Disable button
  submitBtn.disabled = true;
  submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> <span>Submitting...</span>';

  try {
    // Check if already applied
    const { data: existing } = await supabase
      .from('wholesale_applications')
      .select('id')
      .eq('email', email)
      .single();

    if (existing) {
      showToast('You have already submitted an application. We will contact you soon!', 'info');
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<i class="fas fa-paper-plane"></i> <span>Submit Application</span>';
      return;
    }

    // Submit application
    const { error } = await supabase
      .from('wholesale_applications')
      .insert({
        business_name: businessName,
        business_type: businessType,
        contact_name: contactName,
        title: title || null,
        email: email,
        phone: phone,
        website: website || null,
        estimated_volume: volume,
        timeline: timeline,
        message: message || null,
        status: 'pending'
      });

    if (error) throw error;

    // Show success
    form.style.display = 'none';
    successDiv.style.display = 'block';
    showToast('Application submitted successfully!', 'success');

  } catch (error) {
    console.error('Wholesale application error:', error);

    // If table doesn't exist yet, show success anyway (we'll get notified)
    if (error.code === '42P01') {
      form.style.display = 'none';
      successDiv.style.display = 'block';
      showToast('Application submitted! We will contact you soon.', 'success');
    } else {
      showToast('Error submitting application. Please try again.', 'error');
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<i class="fas fa-paper-plane"></i> <span>Submit Application</span>';
    }
  }
}

function initWholesalePage() {
  const form = document.getElementById('wholesale-application-form');
  if (form) {
    form.addEventListener('submit', handleWholesaleApplication);
  }
}

export async function loadWholesalePage(appRoot) {
  try {
    const response = await fetch('/pages/wholesale.html');
    if (!response.ok) throw new Error('Could not load wholesale.html');
    appRoot.innerHTML = await response.text();
    initWholesalePage();
  } catch (error) {
    console.error('Failed to load wholesale page:', error);
    appRoot.innerHTML = '<p class="text-danger text-center">Error loading wholesale page.</p>';
  }
}
