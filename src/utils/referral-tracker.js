// /js/utils/referral-tracker.js - Tracks affiliate referrals
import { supabase } from '/js/supabase-client.js';

const REFERRAL_STORAGE_KEY = 'hl_referral';
const REFERRAL_EXPIRY_DAYS = 30;

/* ------------------- Generate visitor ID ------------------- */
function getVisitorId() {
  let visitorId = localStorage.getItem('hl_visitor_id');
  if (!visitorId) {
    visitorId = 'v_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
    localStorage.setItem('hl_visitor_id', visitorId);
  }
  return visitorId;
}

/* ------------------- Check and store referral from URL ------------------- */
export async function checkAndStoreReferral() {
  const urlParams = new URLSearchParams(window.location.search);
  const refCode = urlParams.get('ref');

  if (!refCode) {
    return; // No referral in URL
  }

  // Check if this referral code exists
  const { data: partner, error } = await supabase
    .from('partners')
    .select('id, referral_code, status')
    .eq('referral_code', refCode)
    .single();

  if (error || !partner) {
    console.warn('[referral] Invalid referral code:', refCode);
    return;
  }

  if (partner.status !== 'approved' && partner.status !== 'active') {
    console.warn('[referral] Partner not active:', refCode);
    return;
  }

  // Store referral in localStorage with expiry
  const referralData = {
    code: refCode,
    partnerId: partner.id,
    timestamp: Date.now(),
    expiry: Date.now() + (REFERRAL_EXPIRY_DAYS * 24 * 60 * 60 * 1000)
  };
  localStorage.setItem(REFERRAL_STORAGE_KEY, JSON.stringify(referralData));

  // Track the click in Supabase
  const visitorId = getVisitorId();
  try {
    await supabase
      .from('referrals')
      .insert({
        partner_id: partner.id,
        referral_code: refCode,
        visitor_id: visitorId,
        landing_page: window.location.pathname,
        converted: false
      });
    console.debug('[referral] Click tracked for:', refCode);
  } catch (err) {
    console.error('[referral] Failed to track click:', err);
  }

  // Clean up URL (remove ref param)
  const cleanUrl = new URL(window.location.href);
  cleanUrl.searchParams.delete('ref');
  window.history.replaceState({}, '', cleanUrl.toString());
}

/* ------------------- Get stored referral (if valid) ------------------- */
export function getStoredReferral() {
  const stored = localStorage.getItem(REFERRAL_STORAGE_KEY);
  if (!stored) return null;

  try {
    const data = JSON.parse(stored);

    // Check expiry
    if (Date.now() > data.expiry) {
      localStorage.removeItem(REFERRAL_STORAGE_KEY);
      return null;
    }

    return data;
  } catch (e) {
    localStorage.removeItem(REFERRAL_STORAGE_KEY);
    return null;
  }
}

/* ------------------- Mark referral as converted (call on order success) ------------------- */
export async function markReferralConverted(orderId, commissionAmount = 15.00) {
  const referral = getStoredReferral();
  if (!referral) {
    console.debug('[referral] No referral to convert');
    return null;
  }

  const visitorId = getVisitorId();

  try {
    // Find the referral record and update it
    const { data: existingRef, error: findError } = await supabase
      .from('referrals')
      .select('id')
      .eq('partner_id', referral.partnerId)
      .eq('visitor_id', visitorId)
      .eq('converted', false)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (findError || !existingRef) {
      // Create a new conversion record if no click was tracked
      const { data: newRef, error: insertError } = await supabase
        .from('referrals')
        .insert({
          partner_id: referral.partnerId,
          referral_code: referral.code,
          visitor_id: visitorId,
          landing_page: '/',
          converted: true,
          order_id: orderId,
          commission_amount: commissionAmount,
          converted_at: new Date().toISOString()
        })
        .select()
        .single();

      if (insertError) throw insertError;
      console.debug('[referral] Conversion recorded (new):', newRef.id);
      return newRef;
    }

    // Update existing referral record
    const { data: updated, error: updateError } = await supabase
      .from('referrals')
      .update({
        converted: true,
        order_id: orderId,
        commission_amount: commissionAmount,
        converted_at: new Date().toISOString()
      })
      .eq('id', existingRef.id)
      .select()
      .single();

    if (updateError) throw updateError;

    console.debug('[referral] Conversion recorded:', updated.id);

    // Clear the referral from localStorage after conversion
    localStorage.removeItem(REFERRAL_STORAGE_KEY);

    return updated;
  } catch (err) {
    console.error('[referral] Failed to mark conversion:', err);
    return null;
  }
}

/* ------------------- Initialize on page load ------------------- */
export function initReferralTracking() {
  // Check for referral on every page load
  checkAndStoreReferral();
}
