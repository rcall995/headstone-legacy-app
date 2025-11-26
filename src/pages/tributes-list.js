// /js/pages/tributes-list.js - Manage pending tributes and voice recordings
import { supabase } from '/js/supabase-client.js';
import { showToast } from '/js/utils/toasts.js';
import { updateMenuBadges } from '/js/utils/badge-updater.js';

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatDate(dateString) {
  if (!dateString) return '';
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function getStatusBadgeClass(status) {
  switch (status) {
    case 'pending': return 'bg-warning text-dark';
    case 'approved': return 'bg-success';
    case 'rejected': return 'bg-danger';
    default: return 'bg-secondary';
  }
}

async function loadPendingTributes(container, template, userId) {
  try {
    // First get user's memorials
    const { data: memorials, error: memError } = await supabase
      .from('memorials')
      .select('id, name')
      .contains('curator_ids', [userId]);

    if (memError) throw memError;

    if (!memorials || memorials.length === 0) {
      const emptyTemplate = template.ownerDocument.getElementById('empty-state-template').content.cloneNode(true);
      container.innerHTML = '';
      container.appendChild(emptyTemplate);
      return 0;
    }

    const memorialIds = memorials.map(m => m.id);
    const memorialMap = Object.fromEntries(memorials.map(m => [m.id, m.name]));

    // Get pending tributes for these memorials
    const { data: tributes, error: tribError } = await supabase
      .from('tributes')
      .select('*')
      .in('memorial_id', memorialIds)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (tribError) throw tribError;

    container.innerHTML = '';

    if (!tributes || tributes.length === 0) {
      const emptyTemplate = template.ownerDocument.getElementById('empty-state-template').content.cloneNode(true);
      container.appendChild(emptyTemplate);
      return 0;
    }

    tributes.forEach(tribute => {
      const item = template.content.cloneNode(true);
      const memorialName = memorialMap[tribute.memorial_id] || 'Unknown Memorial';

      item.querySelector('.tribute-memorial-name .memorial-link').textContent = memorialName;
      item.querySelector('.tribute-memorial-name .memorial-link').href = `/memorial?id=${encodeURIComponent(tribute.memorial_id)}`;
      item.querySelector('.tribute-author').textContent = `From: ${escapeHtml(tribute.author_name)}${tribute.author_email ? ` (${escapeHtml(tribute.author_email)})` : ''}`;
      item.querySelector('.tribute-message').textContent = tribute.message;
      item.querySelector('.tribute-date').textContent = formatDate(tribute.created_at);

      const badge = item.querySelector('.tribute-status-badge');
      badge.textContent = tribute.status.charAt(0).toUpperCase() + tribute.status.slice(1);
      badge.className = `badge ${getStatusBadgeClass(tribute.status)}`;

      // Show photo if exists
      if (tribute.photo_url) {
        const photoContainer = item.querySelector('.tribute-photo-container');
        photoContainer.classList.remove('d-none');
        photoContainer.querySelector('.tribute-photo').src = tribute.photo_url;
      }

      // Approve button
      item.querySelector('.approve-btn').addEventListener('click', async (e) => {
        const btn = e.target.closest('.approve-btn');
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span>';

        const { error } = await supabase
          .from('tributes')
          .update({ status: 'approved' })
          .eq('id', tribute.id);

        if (error) {
          showToast('Failed to approve tribute.', 'error');
          btn.disabled = false;
          btn.innerHTML = '<i class="fas fa-check me-1"></i>Approve';
        } else {
          showToast('Tribute approved!', 'success');
          btn.closest('.tribute-item').remove();
          updateBadgeCount('tribute-count-badge', -1);
          // Update nav badges
          const { data: { user } } = await supabase.auth.getUser();
          if (user) updateMenuBadges(user);
        }
      });

      // Reject button
      item.querySelector('.reject-btn').addEventListener('click', async (e) => {
        const btn = e.target.closest('.reject-btn');
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span>';

        const { error } = await supabase
          .from('tributes')
          .update({ status: 'rejected' })
          .eq('id', tribute.id);

        if (error) {
          showToast('Failed to reject tribute.', 'error');
          btn.disabled = false;
          btn.innerHTML = '<i class="fas fa-times me-1"></i>Reject';
        } else {
          showToast('Tribute rejected.', 'info');
          btn.closest('.tribute-item').remove();
          updateBadgeCount('tribute-count-badge', -1);
          const { data: { user } } = await supabase.auth.getUser();
          if (user) updateMenuBadges(user);
        }
      });

      container.appendChild(item);
    });

    return tributes.length;
  } catch (error) {
    console.error('Error loading tributes:', error);
    container.innerHTML = '<div class="alert alert-danger">Error loading tributes. Please try again.</div>';
    return 0;
  }
}

async function loadPendingRecordings(container, template, userId) {
  try {
    // First get user's memorials
    const { data: memorials, error: memError } = await supabase
      .from('memorials')
      .select('id, name')
      .contains('curator_ids', [userId]);

    if (memError) throw memError;

    if (!memorials || memorials.length === 0) {
      const emptyTemplate = template.ownerDocument.getElementById('empty-state-template').content.cloneNode(true);
      container.innerHTML = '';
      container.appendChild(emptyTemplate);
      return 0;
    }

    const memorialIds = memorials.map(m => m.id);
    const memorialMap = Object.fromEntries(memorials.map(m => [m.id, m.name]));

    // Get pending recordings for these memorials
    const { data: recordings, error: recError } = await supabase
      .from('voice_recordings')
      .select('*')
      .in('memorial_id', memorialIds)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (recError) throw recError;

    container.innerHTML = '';

    if (!recordings || recordings.length === 0) {
      const emptyTemplate = template.ownerDocument.getElementById('empty-state-template').content.cloneNode(true);
      container.appendChild(emptyTemplate);
      return 0;
    }

    recordings.forEach(recording => {
      const item = template.content.cloneNode(true);
      const memorialName = memorialMap[recording.memorial_id] || 'Unknown Memorial';

      item.querySelector('.recording-memorial-name .memorial-link').textContent = memorialName;
      item.querySelector('.recording-memorial-name .memorial-link').href = `/memorial?id=${encodeURIComponent(recording.memorial_id)}`;
      item.querySelector('.recording-author').textContent = `From: ${escapeHtml(recording.recorded_by_name)}${recording.recorded_by_email ? ` (${escapeHtml(recording.recorded_by_email)})` : ''}`;
      item.querySelector('.recording-title').textContent = recording.title || 'Untitled Recording';
      item.querySelector('.recording-description').textContent = recording.description || '';
      item.querySelector('.recording-date').textContent = formatDate(recording.created_at);
      item.querySelector('.recording-audio').src = recording.audio_url;

      const badge = item.querySelector('.recording-status-badge');
      badge.textContent = recording.status.charAt(0).toUpperCase() + recording.status.slice(1);
      badge.className = `badge ${getStatusBadgeClass(recording.status)}`;

      // Approve button
      item.querySelector('.approve-btn').addEventListener('click', async (e) => {
        const btn = e.target.closest('.approve-btn');
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span>';

        const { error } = await supabase
          .from('voice_recordings')
          .update({ status: 'approved' })
          .eq('id', recording.id);

        if (error) {
          showToast('Failed to approve recording.', 'error');
          btn.disabled = false;
          btn.innerHTML = '<i class="fas fa-check me-1"></i>Approve';
        } else {
          showToast('Recording approved!', 'success');
          btn.closest('.recording-item').remove();
          updateBadgeCount('recording-count-badge', -1);
          const { data: { user } } = await supabase.auth.getUser();
          if (user) updateMenuBadges(user);
        }
      });

      // Reject button
      item.querySelector('.reject-btn').addEventListener('click', async (e) => {
        const btn = e.target.closest('.reject-btn');
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span>';

        const { error } = await supabase
          .from('voice_recordings')
          .update({ status: 'rejected' })
          .eq('id', recording.id);

        if (error) {
          showToast('Failed to reject recording.', 'error');
          btn.disabled = false;
          btn.innerHTML = '<i class="fas fa-times me-1"></i>Reject';
        } else {
          showToast('Recording rejected.', 'info');
          btn.closest('.recording-item').remove();
          updateBadgeCount('recording-count-badge', -1);
          const { data: { user } } = await supabase.auth.getUser();
          if (user) updateMenuBadges(user);
        }
      });

      container.appendChild(item);
    });

    return recordings.length;
  } catch (error) {
    console.error('Error loading recordings:', error);
    container.innerHTML = '<div class="alert alert-danger">Error loading voice recordings. Please try again.</div>';
    return 0;
  }
}

function updateBadgeCount(badgeId, delta) {
  const badge = document.getElementById(badgeId);
  if (badge) {
    const current = parseInt(badge.textContent, 10) || 0;
    const newCount = Math.max(0, current + delta);
    badge.textContent = newCount;
    badge.classList.toggle('d-none', newCount === 0);
  }
}

export async function loadTributesListPage(appRoot) {
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    showToast('You must be signed in to manage tributes.', 'error');
    window.dispatchEvent(new CustomEvent('navigate', { detail: '/login' }));
    return;
  }

  try {
    const response = await fetch('/pages/tributes-list.html');
    if (!response.ok) throw new Error('Could not load tributes-list.html');
    appRoot.innerHTML = await response.text();

    const tributesContainer = appRoot.querySelector('#tributes-container');
    const recordingsContainer = appRoot.querySelector('#recordings-container');
    const tributeTemplate = appRoot.querySelector('#tribute-item-template');
    const recordingTemplate = appRoot.querySelector('#recording-item-template');
    const tributeBadge = appRoot.querySelector('#tribute-count-badge');
    const recordingBadge = appRoot.querySelector('#recording-count-badge');

    // Load both in parallel
    const [tributeCount, recordingCount] = await Promise.all([
      loadPendingTributes(tributesContainer, tributeTemplate, user.id),
      loadPendingRecordings(recordingsContainer, recordingTemplate, user.id)
    ]);

    // Update tab badges
    if (tributeBadge) {
      tributeBadge.textContent = tributeCount;
      tributeBadge.classList.toggle('d-none', tributeCount === 0);
    }
    if (recordingBadge) {
      recordingBadge.textContent = recordingCount;
      recordingBadge.classList.toggle('d-none', recordingCount === 0);
    }

  } catch (error) {
    console.error('Error loading tributes list page:', error);
    appRoot.innerHTML = `<div class="container mt-5"><div class="alert alert-danger">Error loading page. Please try again.</div></div>`;
    showToast('Could not load tributes page.', 'error');
  }
}
