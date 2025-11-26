// /js/pages/home.js - Supabase version
import { supabase } from '/js/supabase-client.js';
import { config } from '/js/config.js';
import { showToast } from '/js/utils/toasts.js';

/* ------------------- Helper: escape HTML to prevent XSS ------------------- */
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/* ------------------- Helper: format date for display ------------------- */
function formatDate(dateString) {
  if (!dateString) return '';
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'long',
      day: '2-digit',
      year: 'numeric'
    });
  } catch (e) {
    return dateString;
  }
}

/* ------------------- Recent Memorials cards ------------------- */
async function loadRecentMemorials() {
  const container = document.getElementById('recent-memorials-container');
  if (!container) return;

  try {
    // Get most recent published memorials
    const { data: memorials, error } = await supabase
      .from('memorials')
      .select('id, name, main_photo, birth_date, death_date')
      .in('status', ['published', 'approved'])
      .order('created_at', { ascending: false })
      .limit(6);

    if (error) throw error;

    if (!memorials || memorials.length === 0) {
      container.innerHTML = '<p class="text-muted text-center w-100">No memorials to display yet.</p>';
      return;
    }

    const cards = memorials.map(m => {
      const photoUrl = m.main_photo || '/images/placeholder.png';
      const safeName = escapeHtml(m.name);
      const safeId = encodeURIComponent(m.id);
      const birthDate = formatDate(m.birth_date);
      const deathDate = formatDate(m.death_date);

      return (
        `<a href="/memorial?id=${safeId}" class="recent-memorial-card" data-route>` +
          '<div class="recent-memorial-photo">' +
            `<img src="${escapeHtml(photoUrl)}" alt="${safeName}">` +
          '</div>' +
          '<div class="recent-memorial-info">' +
            `<h4 class="recent-memorial-name">${safeName}</h4>` +
            (birthDate ? `<p class="recent-memorial-date">${birthDate}</p>` : '') +
            (deathDate ? `<p class="recent-memorial-date">${deathDate}</p>` : '') +
          '</div>' +
        '</a>'
      );
    }).join('');
    container.innerHTML = cards;
  } catch (error) {
    console.error("Error loading recent memorials:", error);
    container.innerHTML = '<p class="text-danger text-center w-100">Could not load recent memorials.</p>';
  }
}

/* ------------------- Map + pins ------------------- */
let map = null;
let featureCollection = { type: 'FeatureCollection', features: [] };

function computeBounds(features) {
  if (!features || features.length === 0) return null;
  const bounds = new mapboxgl.LngLatBounds();
  for (let i = 0; i < features.length; i++) {
    const coords = features[i].geometry.coordinates;
    bounds.extend(coords);
  }
  return bounds;
}

async function fitToPinsOrGeolocate() {
  if (!map) return;

  const feats = featureCollection.features;
  if (feats.length === 0) {
    if (!navigator.geolocation) {
      showToast('No memorial pins yet and geolocation is unavailable.', 'info');
      return;
    }
    try {
      const pos = await new Promise(function(resolve, reject) {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 8000,
          maximumAge: 0
        });
      });
      map.flyTo({ center: [pos.coords.longitude, pos.coords.latitude], zoom: 12, duration: 900 });
    } catch (e) {
      showToast('Location permission denied. Add pins or allow location.', 'info');
    }
    return;
  }

  if (feats.length === 1) {
    const c = feats[0].geometry.coordinates;
    map.flyTo({ center: [c[0], c[1]], zoom: 14, duration: 900 });
    return;
  }

  const b = computeBounds(feats);
  if (b) map.fitBounds(b, { padding: 80, maxZoom: 12, duration: 1000 });
}

class FitToPinsControl {
  onAdd(m) {
    this._map = m;
    const container = document.createElement('div');
    container.className = 'mapboxgl-ctrl mapboxgl-ctrl-group';

    const btn = document.createElement('button');
    btn.className = 'mapboxgl-ctrl-icon';
    btn.type = 'button';
    btn.title = 'Fit to memorials';
    btn.innerHTML = '<i class="fas fa-crosshairs"></i>';
    btn.style.display = 'flex';
    btn.style.alignItems = 'center';
    btn.style.justifyContent = 'center';
    btn.onclick = function() { fitToPinsOrGeolocate(); };

    container.appendChild(btn);
    this._container = container;
    return container;
  }
  onRemove() {
    if (this._container && this._container.parentNode) {
      this._container.parentNode.removeChild(this._container);
    }
    this._map = undefined;
  }
}

async function initializeHomepageMap() {
  let mapContainer = document.getElementById('homepage-map-container');
  if (!mapContainer) {
    mapContainer = document.getElementById('homepage-map');
  }
  if (!mapContainer || typeof mapboxgl === 'undefined') {
    console.warn('[home] Map container not found or mapboxgl missing.');
    return;
  }

  try {
    if (typeof mapboxgl === 'undefined') {
      console.error('Mapbox GL library is not loaded');
      mapContainer.innerHTML = '<div class="alert alert-warning">Map library failed to load. Please refresh the page.</div>';
      return;
    }

    if (!config || !config.MAPBOX_ACCESS_TOKEN) {
      console.warn('[home] MAPBOX token missing in config.js');
    }
    mapboxgl.accessToken = config.MAPBOX_ACCESS_TOKEN;

    map = new mapboxgl.Map({
      container: mapContainer,
      style: 'mapbox://styles/mapbox/streets-v12',
      center: [-98.5, 39.8],
      zoom: 3.5
    });

    map.addControl(new mapboxgl.NavigationControl(), 'top-right');
    map.addControl(new FitToPinsControl(), 'top-left');

    map.on('load', async function() {
      // Fetch published/approved memorials with location data
      const { data: memorials, error } = await supabase
        .from('memorials')
        .select('id, name, location_lat, location_lng, cemetery_lat, cemetery_lng')
        .in('status', ['approved', 'published']);

      if (error) {
        console.error('[home] Query failed:', error);
        return;
      }

      const features = [];
      let total = 0;
      let withLoc = 0;

      memorials.forEach(function(m) {
        total++;
        // Use location_lat/lng or cemetery_lat/lng
        const lat = m.location_lat || m.cemetery_lat;
        const lng = m.location_lng || m.cemetery_lng;

        if (lat !== null && lng !== null) {
          withLoc++;
          const coords = [lng, lat];
          features.push({
            type: 'Feature',
            geometry: { type: 'Point', coordinates: coords },
            properties: { title: m.name || 'Memorial', url: '/memorial?id=' + m.id }
          });
        }
      });

      console.debug('[home] Approved/published:', total, 'with geocoded location:', withLoc);

      featureCollection = { type: 'FeatureCollection', features: features };

      if (map.getSource('memorials')) {
        map.getSource('memorials').setData(featureCollection);
      } else {
        map.addSource('memorials', { type: 'geojson', data: featureCollection });
        map.addLayer({
          id: 'memorial-points',
          type: 'circle',
          source: 'memorials',
          paint: {
            'circle-radius': 6,
            'circle-color': '#0d6efd',
            'circle-stroke-width': 1.25,
            'circle-stroke-color': '#ffffff'
          }
        });
      }

      map.on('click', 'memorial-points', function(e) {
        const f = e && e.features && e.features[0];
        if (!f) return;
        const coords = f.geometry.coordinates;
        const props = f.properties || {};
        const title = escapeHtml(props.title || 'Memorial');
        const url = encodeURI(props.url || '#');
        const html =
          '<div style="min-width:180px">' +
            '<strong>' + title + '</strong><br/>' +
            '<a href="' + url + '">View memorial</a>' +
          '</div>';
        new mapboxgl.Popup({ closeButton: true, offset: 12 })
          .setLngLat([coords[0], coords[1]])
          .setHTML(html)
          .addTo(map);
      });
      map.on('mouseenter', 'memorial-points', function() { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', 'memorial-points', function() { map.getCanvas().style.cursor = ''; });

      fitToPinsOrGeolocate();

      setTimeout(function() { map.resize(); }, 150);
    });
  } catch (error) {
    console.error("[home] Homepage map init error:", error);
  }
}

function cleanupHomePage() {
  if (map) {
    try {
      map.remove();
    } catch (err) {
      console.error('Error removing map:', err);
    }
    map = null;
  }
}

export async function loadHomePage(appRoot) {
  cleanupHomePage();

  try {
    const response = await fetch('/pages/home.html');
    if (!response.ok) throw new Error('Could not load home.html');
    appRoot.innerHTML = await response.text();

    // Load recent memorials and map in parallel
    await Promise.all([
      loadRecentMemorials(),
      initializeHomepageMap()
    ]);
  } catch (error) {
    console.error('Failed to load home page:', error);
    appRoot.innerHTML = '<p class="text-danger text-center">Error loading home page.</p>';
  }
}
