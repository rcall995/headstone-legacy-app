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
    // Get most recent published memorials that allow being shown
    const { data: memorials, error } = await supabase
      .from('memorials')
      .select('id, name, main_photo, birth_date, death_date')
      .in('status', ['published', 'approved'])
      .neq('show_recent', false)
      .order('created_at', { ascending: false })
      .limit(6);

    if (error) throw error;

    if (!memorials || memorials.length === 0) {
      container.innerHTML = '<p class="text-muted text-center w-100">No memorials to display yet.</p>';
      return;
    }

    const cards = memorials.map(m => {
      const hasPhoto = m.main_photo && m.main_photo.trim() !== '';
      const safeName = escapeHtml(m.name);
      const safeId = encodeURIComponent(m.id);
      const dates = [];
      if (m.birth_date) dates.push(m.birth_date.split('-')[0]); // Just year
      if (m.death_date) dates.push(m.death_date.split('-')[0]); // Just year
      const dateRange = dates.length === 2 ? `${dates[0]} - ${dates[1]}` : dates.join('');

      const photoHtml = hasPhoto
        ? `<img src="${escapeHtml(m.main_photo)}" alt="${safeName}">`
        : `<div class="memorial-placeholder-logo"><img src="/logo1.png" alt="Headstone Legacy"></div>`;

      return (
        `<a href="/memorial?id=${safeId}" class="recent-memorial-card" data-route>` +
          `<div class="recent-memorial-photo ${!hasPhoto ? 'no-photo' : ''}">${photoHtml}</div>` +
          '<div class="recent-memorial-info">' +
            `<h4 class="recent-memorial-name">${safeName}</h4>` +
            (dateRange ? `<p class="recent-memorial-dates">${dateRange}</p>` : '') +
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
      // Force resize to fill container
      map.resize();

      // Fetch published/approved memorials with location data
      const { data: memorials, error } = await supabase
        .from('memorials')
        .select('id, name, location_lat, location_lng, cemetery_lat, cemetery_lng, gravesite_lat, gravesite_lng, cemetery_name')
        .in('status', ['approved', 'published']);

      if (error) {
        console.error('[home] Query failed:', error);
        return;
      }

      const features = [];
      let total = 0;
      let withLoc = 0;

      // Group memorials by exact coordinates to detect cemetery clusters
      const locationGroups = {};

      memorials.forEach(function(m) {
        total++;
        // Priority: gravesite > cemetery > location (death place fallback)
        const lat = m.gravesite_lat || m.cemetery_lat || m.location_lat;
        const lng = m.gravesite_lng || m.cemetery_lng || m.location_lng;

        if (lat !== null && lng !== null) {
          withLoc++;
          // Create a key from coordinates (rounded to 6 decimal places for exact matching)
          const coordKey = `${lat.toFixed(6)},${lng.toFixed(6)}`;

          if (!locationGroups[coordKey]) {
            locationGroups[coordKey] = {
              lat: lat,
              lng: lng,
              memorials: [],
              cemeteryName: null
            };
          }

          locationGroups[coordKey].memorials.push({
            id: m.id,
            name: m.name || 'Unknown'
          });

          // Track cemetery name if available
          if (m.cemetery_name && !locationGroups[coordKey].cemeteryName) {
            locationGroups[coordKey].cemeteryName = m.cemetery_name;
          }
        }
      });

      // Create features - all as individual blue dots with spiral offset to prevent overlap
      Object.values(locationGroups).forEach(function(group) {
        const coords = [group.lng, group.lat];

        group.memorials.forEach(function(m, index) {
          // Spiral offset pattern to spread pins out
          const offsetAmount = 0.0001; // ~11 meters
          const angle = (index * 137.5) * (Math.PI / 180); // Golden angle for nice distribution
          const radius = Math.sqrt(index) * offsetAmount;
          const offsetLng = index === 0 ? 0 : radius * Math.cos(angle);
          const offsetLat = index === 0 ? 0 : radius * Math.sin(angle);

          // Extract initials from name (e.g., "John Smith" -> "JS")
          // Skip suffixes like Sr, Jr, II, III, IV
          const suffixes = ['sr', 'sr.', 'jr', 'jr.', 'ii', 'iii', 'iv', 'v'];
          const nameParts = (m.name || '').split(' ').filter(p => p.length > 0 && !suffixes.includes(p.toLowerCase()));
          let initials = '';
          if (nameParts.length >= 2) {
            // First initial + last initial
            initials = nameParts[0][0] + nameParts[nameParts.length - 1][0];
          } else if (nameParts.length === 1) {
            initials = nameParts[0].substring(0, 2);
          }
          initials = initials.toUpperCase();

          features.push({
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [coords[0] + offsetLng, coords[1] + offsetLat] },
            properties: {
              title: m.name,
              url: '/memorial?id=' + m.id,
              initials: initials
            }
          });
        });
      });

      console.debug('[home] Approved/published:', total, 'with geocoded location:', withLoc, 'cemetery clusters:', Object.values(locationGroups).filter(g => g.memorials.length >= 12).length);

      featureCollection = { type: 'FeatureCollection', features: features };

      // Update memorial count display
      const countEl = document.getElementById('memorial-map-count');
      if (countEl) {
        countEl.textContent = `Currently ${total} memorials`;
      }

      if (map.getSource('memorials')) {
        map.getSource('memorials').setData(featureCollection);
      } else {
        // Add source WITHOUT Mapbox clustering - we handle grouping ourselves
        map.addSource('memorials', {
          type: 'geojson',
          data: featureCollection,
          cluster: false
        });

        // All memorial points as blue dots
        map.addLayer({
          id: 'memorial-points',
          type: 'circle',
          source: 'memorials',
          paint: {
            'circle-radius': [
              'interpolate', ['linear'], ['zoom'],
              10, 6,
              14, 8,
              18, 12
            ],
            'circle-color': '#0d6efd',
            'circle-stroke-width': 2,
            'circle-stroke-color': '#ffffff'
          }
        });

        // Initials labels - appear at zoom 15+
        map.addLayer({
          id: 'memorial-labels',
          type: 'symbol',
          source: 'memorials',
          minzoom: 15,
          layout: {
            'text-field': ['get', 'initials'],
            'text-font': ['DIN Offc Pro Bold', 'Arial Unicode MS Bold'],
            'text-size': [
              'interpolate', ['linear'], ['zoom'],
              15, 9,
              18, 12
            ],
            'text-offset': [0, 0],
            'text-anchor': 'center',
            'text-allow-overlap': true
          },
          paint: {
            'text-color': '#ffffff',
            'text-halo-color': '#0d6efd',
            'text-halo-width': 0.5
          }
        });
      }

      // Click on individual memorial
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

/* ------------------- Memorial Search ------------------- */
let searchDebounceTimer = null;

function initializeSearch() {
  const searchInput = document.getElementById('memorial-search-input');
  const searchResults = document.getElementById('search-results-container');
  const clearBtn = document.getElementById('search-clear-btn');

  if (!searchInput || !searchResults) return;

  // Handle input with debounce
  searchInput.addEventListener('input', function() {
    const query = searchInput.value.trim();

    // Show/hide clear button
    if (clearBtn) {
      clearBtn.style.display = query.length > 0 ? 'flex' : 'none';
    }

    // Clear previous timer
    if (searchDebounceTimer) {
      clearTimeout(searchDebounceTimer);
    }

    // Hide results if query too short
    if (query.length < 2) {
      searchResults.style.display = 'none';
      return;
    }

    // Show loading state
    searchResults.style.display = 'block';
    searchResults.innerHTML = '<div class="search-loading"><i class="fas fa-spinner fa-spin me-2"></i>Searching...</div>';

    // Debounce the search
    searchDebounceTimer = setTimeout(async function() {
      try {
        const response = await fetch(`/api/memorials/search?q=${encodeURIComponent(query)}`);
        if (!response.ok) throw new Error('Search failed');

        const { results } = await response.json();

        if (!results || results.length === 0) {
          searchResults.innerHTML = '<div class="search-no-results"><i class="fas fa-search me-2"></i>No memorials found</div>';
          return;
        }

        searchResults.innerHTML = results.map(function(m) {
          const photoHtml = m.photo
            ? `<img src="${escapeHtml(m.photo)}" alt="${escapeHtml(m.name)}" class="search-result-photo">`
            : '<div class="search-result-photo-placeholder"><i class="fas fa-user"></i></div>';

          return `
            <a href="/memorial?id=${encodeURIComponent(m.id)}" class="search-result-item" data-route>
              ${photoHtml}
              <div class="search-result-info">
                <p class="search-result-name">${escapeHtml(m.name)}</p>
                ${m.dateRange ? `<p class="search-result-dates">${escapeHtml(m.dateRange)}</p>` : ''}
              </div>
              <i class="fas fa-chevron-right text-muted"></i>
            </a>
          `;
        }).join('');

      } catch (error) {
        console.error('Search error:', error);
        searchResults.innerHTML = '<div class="search-no-results text-danger">Search failed. Please try again.</div>';
      }
    }, 300);
  });

  // Clear button handler
  if (clearBtn) {
    clearBtn.addEventListener('click', function() {
      searchInput.value = '';
      searchResults.style.display = 'none';
      clearBtn.style.display = 'none';
      searchInput.focus();
    });
  }

  // Close results when clicking outside
  document.addEventListener('click', function(e) {
    if (!e.target.closest('.search-wrapper')) {
      searchResults.style.display = 'none';
    }
  });

  // Show results when focusing on input with existing query
  searchInput.addEventListener('focus', function() {
    if (searchInput.value.trim().length >= 2 && searchResults.innerHTML.trim() !== '') {
      searchResults.style.display = 'block';
    }
  });
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
  // Clear search debounce timer
  if (searchDebounceTimer) {
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = null;
  }
}

export async function loadHomePage(appRoot) {
  cleanupHomePage();

  try {
    const response = await fetch('/pages/home.html');
    if (!response.ok) throw new Error('Could not load home.html');
    appRoot.innerHTML = await response.text();

    // Initialize search
    initializeSearch();

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
