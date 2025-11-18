// /js/pages/home.js
import { db } from '/js/firebase-config.js';
import {
  collection, doc, getDoc, getDocs, query, where
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { config } from '/js/config.js';
import { showToast } from '/js/utils/toasts.js';

/* ------------------- Featured cards ------------------- */
async function loadFeaturedMemorials() {
  const container = document.getElementById('recent-memorials-container');
  if (!container) return;

  const featuredIds = [
    "benjamin-franklin-v5b8j5",
    "fq8gALEFexTYPkEEL36C",
    "yf83kyDHPl32fqYpLnun",
    "xXwLqdrRel9dE2LMmi5W"
  ];

  try {
    getAuth(); // ensures auth SDK is loaded (not directly used here)
    const snaps = await Promise.all(featuredIds.map(id => getDoc(doc(db, "memorials", id))));
    const memorials = snaps.map(s => (s.exists() ? { id: s.id, ...s.data() } : null)).filter(Boolean);

    if (memorials.length === 0) {
      container.innerHTML = '<p class="text-muted text-center w-100">No featured memorials found.</p>';
      return;
    }

    const cards = memorials.map(m => {
      const photoUrl = m.mainPhoto || '/images/placeholder.png';
      return (
        '<div class="col-6 col-md-4 col-lg-3">' +
          `<a href="/memorial?id=${m.id}" class="card text-decoration-none text-dark shadow-sm recent-memorial-card">` +
            '<div class="recent-memorial-img-container">' +
              `<img src="${photoUrl}" class="recent-memorial-img" alt="${m.name}">` +
            '</div>' +
            '<div class="card-body p-2">' +
              `<h6 class="card-title text-center mb-0 small">${m.name}</h6>` +
            '</div>' +
          '</a>' +
        '</div>'
      );
    }).join('');
    container.innerHTML = cards;
  } catch (error) {
    console.error("Error loading featured memorials:", error);
    if (error && error.code === 'permission-denied') {
      container.innerHTML = '<p class="text-danger text-center w-100">Insufficient permissions. Please sign in.</p>';
      showToast('Sign in for full access.', 'info');
    } else {
      container.innerHTML = '<p class="text-danger text-center w-100">Could not load featured memorials.</p>';
    }
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
    // No pins → attempt browser geolocation
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

/* Custom crosshair on TOP-LEFT that refits the view */
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
  // Resolve container safely (no comma list in selector)
  let mapContainer = document.getElementById('homepage-map-container');
  if (!mapContainer) {
    mapContainer = document.getElementById('homepage-map');
  }
  if (!mapContainer || typeof mapboxgl === 'undefined') {
    console.warn('[home] Map container not found or mapboxgl missing.');
    return;
  }

  try {
    // Check if Mapbox GL is loaded
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

    // Keep only +/− on top-right
    map.addControl(new mapboxgl.NavigationControl(), 'top-right');
    // Our only crosshair on top-left
    map.addControl(new FitToPinsControl(), 'top-left');

    map.on('load', async function() {
      const memorialsRef = collection(db, "memorials");
      const statuses = ['approved', 'published'];
      const dedup = new Map();

      for (let i = 0; i < statuses.length; i++) {
        const status = statuses[i];
        try {
          const snap = await getDocs(query(memorialsRef, where('status', '==', status)));
          snap.forEach(function(d) {
            dedup.set(d.id, { id: d.id, ...d.data() });
          });
        } catch (err) {
          console.error('[home] Query failed for status=' + status + ':', err);
        }
      }

      const features = [];
      let total = 0;
      let withLoc = 0;

      dedup.forEach(function(m) {
        total++;
        const loc = m && m.location;
        const lat = loc && typeof loc.latitude === 'number' ? loc.latitude : null;
        const lng = loc && typeof loc.longitude === 'number' ? loc.longitude : null;
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

      // Popups (use normal strings to avoid stray back-ticks)
      map.on('click', 'memorial-points', function(e) {
        const f = e && e.features && e.features[0];
        if (!f) return;
        const coords = f.geometry.coordinates;
        const props = f.properties || {};
        const title = props.title || 'Memorial';
        const url = props.url || '#';
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

      // Initial fit
      fitToPinsOrGeolocate();

      setTimeout(function() { map.resize(); }, 150);
    });
  } catch (error) {
    console.error("[home] Homepage map init error:", error);
  }
}

/* ------------------- Cleanup function ------------------- */
function cleanupHomePage() {
  // Clean up map instance to prevent memory leak
  if (map) {
    try {
      map.remove();
    } catch (err) {
      console.error('Error removing map:', err);
    }
    map = null;
  }
}

/* ------------------- Public entry ------------------- */
export async function loadHomePage(appRoot) {
  // Clean up any existing map instance first
  cleanupHomePage();

  try {
    const response = await fetch('/pages/home.html');
    if (!response.ok) throw new Error('Could not load home.html');
    appRoot.innerHTML = await response.text();

    // Removed featured memorials section - focusing on QR tag value proposition instead
    await initializeHomepageMap();
  } catch (error) {
    console.error('Failed to load home page:', error);
    appRoot.innerHTML = '<p class="text-danger text-center">Error loading home page.</p>';
  }
}
