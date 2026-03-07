'use strict';

// ── Constants ──────────────────────────────────────────────────────────────────
const VEHICLE_COLORS = [
  '#7eb4eb', '#f0883e', '#3fb950', '#d2a8ff',
  '#64e3e7', '#b1ce89', '#d356b2', '#c4141c',
  '#f9d423', '#6618b9', '#9cacad', '#bd630e',
];

// ── State ──────────────────────────────────────────────────────────────────────
const state = {
  mode: 'delivery',
  pendingPickup: null,  // { id, lat, lon, marker }
  items: [],            // vehicle | delivery objects
  nextId: 1,
  lastResponse: null,
  resultLayers: [],     // polylines + numbered stop markers to clear
  displayMode: 'detailed',
};

// ── Map initialisation ─────────────────────────────────────────────────────────
const PARIS_CENTER = [48.8566, 2.3522];
const map = L.map('map').setView(PARIS_CENTER, 12);
L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>',
  maxZoom: 19,
  opacity: 1.0,
}).addTo(map);

// ── Icon helpers ───────────────────────────────────────────────────────────────
function circleIcon(color, label, size = 28) {
  return L.divIcon({
    className: '',
    html: `<div style="
      width:${size}px;height:${size}px;border-radius:50%;
      background:${color};border:2px solid rgba(255,255,255,0.85);
      display:flex;align-items:center;justify-content:center;
      color:#fff;font-weight:700;font-size:${size < 26 ? 10 : 12}px;
      box-shadow:0 2px 6px rgba(0,0,0,0.45);
      line-height:1;">${label}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    tooltipAnchor: [size / 2, 0],
  });
}

function vehicleIcon(color) {
  return L.divIcon({
    className: '',
    html: `<div style="
      width:34px;height:34px;border-radius:6px;
      background:${color};border:2px solid rgba(255,255,255,0.85);
      display:flex;align-items:center;justify-content:center;
      font-size:17px;
      box-shadow:0 2px 6px rgba(0,0,0,0.45);">🚚</div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
    tooltipAnchor: [17, 0],
  });
}

// ── ID generator ───────────────────────────────────────────────────────────────
function uid() {
  return `id${state.nextId++}`;
}

// ── Vehicle placement ──────────────────────────────────────────────────────────
function addVehicle(latlng) {
  const id = uid();
  const capacity = parseInt(document.getElementById('vehicle-capacity').value, 10) || 3;
  const vehicleIndex = state.items.filter(i => i.type === 'vehicle').length;
  const color = VEHICLE_COLORS[vehicleIndex % VEHICLE_COLORS.length];

  const marker = L.marker(latlng, { icon: vehicleIcon(color) })
    .addTo(map)
    .bindTooltip(`Vehicle ${id} · cap ${capacity}`, { permanent: false, offset: [18, 0] });

  marker.on('contextmenu', e => {
    L.DomEvent.stopPropagation(e);
    removeItem(id);
  });

  state.items.push({ type: 'vehicle', id, lat: latlng.lat, lon: latlng.lng, capacity, color, marker });
  updateCounters();
}

// ── Delivery placement (two-click) ─────────────────────────────────────────────
function startPickup(latlng) {
  const id = uid();
  const marker = L.marker(latlng, { icon: circleIcon('#3fb950', 'P') })
    .addTo(map)
    .bindTooltip('Pickup — click map for dropoff', { permanent: false });

  marker.on('contextmenu', e => {
    L.DomEvent.stopPropagation(e);
    state.pendingPickup = null;
    marker.remove();
    document.getElementById('pending-hint').classList.add('hidden');
    updateCounters();
  });

  state.pendingPickup = { id, lat: latlng.lat, lon: latlng.lng, marker };
  document.getElementById('pending-hint').classList.remove('hidden');
}

function completeDelivery(latlng) {
  const pending = state.pendingPickup;
  state.pendingPickup = null;
  document.getElementById('pending-hint').classList.add('hidden');

  const dropoffMarker = L.marker(latlng, { icon: circleIcon('#f85149', 'D') })
    .addTo(map)
    .bindTooltip(`Dropoff (pair ${pending.id})`, { permanent: false });

  const dashLine = L.polyline(
    [[pending.lat, pending.lon], [latlng.lat, latlng.lng]],
    { color: '#6e7681', dashArray: '5 6', weight: 1.5, opacity: 0.7 }
  ).addTo(map);

  const item = {
    type: 'delivery',
    id: pending.id,
    pickup:  { lat: pending.lat, lon: pending.lon, marker: pending.marker },
    dropoff: { lat: latlng.lat,  lon: latlng.lng,  marker: dropoffMarker },
    line: dashLine,
  };

  pending.marker.on('contextmenu', e => {
    L.DomEvent.stopPropagation(e);
    removeItem(pending.id);
  });
  dropoffMarker.on('contextmenu', e => {
    L.DomEvent.stopPropagation(e);
    removeItem(pending.id);
  });

  state.items.push(item);
  updateCounters();
}

function removeItem(id) {
  const idx = state.items.findIndex(i => i.id === id);
  if (idx === -1) return;
  const item = state.items[idx];
  if (item.type === 'vehicle') {
    item.marker.remove();
  } else {
    item.pickup.marker.remove();
    item.dropoff.marker.remove();
    item.line.remove();
  }
  state.items.splice(idx, 1);
  updateCounters();
}

// ── Map click ─────────────────────────────────────────────────────────────────
map.on('click', e => {
  if (state.mode === 'vehicle') {
    addVehicle(e.latlng);
  } else {
    if (!state.pendingPickup) {
      startPickup(e.latlng);
    } else {
      completeDelivery(e.latlng);
    }
  }
});

// ── Mode radio ────────────────────────────────────────────────────────────────
document.querySelectorAll('input[name="mode"]').forEach(radio => {
  radio.addEventListener('change', e => {
    state.mode = e.target.value;
    document.getElementById('vehicle-options').style.display =
      state.mode === 'vehicle' ? 'block' : 'none';
    // Cancel pending pickup when switching away from delivery mode
    if (state.pendingPickup && state.mode !== 'delivery') {
      state.pendingPickup.marker.remove();
      state.pendingPickup = null;
      document.getElementById('pending-hint').classList.add('hidden');
    }
  });
});

// ── Counter display ───────────────────────────────────────────────────────────
function updateCounters() {
  const vCount = state.items.filter(i => i.type === 'vehicle').length;
  const dCount = state.items.filter(i => i.type === 'delivery').length;
  document.getElementById('vehicle-count').textContent =
    `${vCount} vehicle${vCount !== 1 ? 's' : ''}`;
  document.getElementById('delivery-count').textContent =
    `${dCount} deliver${dCount !== 1 ? 'ies' : 'y'}`;
}

// ── Clear results layers ───────────────────────────────────────────────────────
function clearResultLayers() {
  state.resultLayers.forEach(l => l.remove());
  state.resultLayers = [];
}

function clearResults() {
  clearResultLayers();
  state.lastResponse = null;
  state.displayMode = 'detailed';
  const detailedRadio = document.querySelector('input[name="display-mode"][value="detailed"]');
  if (detailedRadio) detailedRadio.checked = true;
  document.getElementById('results').classList.add('hidden');
}

// ── Clear all ─────────────────────────────────────────────────────────────────
document.getElementById('btn-clear').addEventListener('click', () => {
  clearResults();
  if (state.pendingPickup) {
    state.pendingPickup.marker.remove();
    state.pendingPickup = null;
    document.getElementById('pending-hint').classList.add('hidden');
  }
  state.items.forEach(item => {
    if (item.type === 'vehicle') {
      item.marker.remove();
    } else {
      item.pickup.marker.remove();
      item.dropoff.marker.remove();
      item.line.remove();
    }
  });
  state.items = [];
  state.nextId = 1;
  updateCounters();
});

// ── Generate ──────────────────────────────────────────────────────────────────
document.getElementById('btn-generate').addEventListener('click', async () => {
  const vehicles  = state.items.filter(i => i.type === 'vehicle');
  const deliveries = state.items.filter(i => i.type === 'delivery');

  if (vehicles.length === 0)  { alert('Add at least one vehicle first.'); return; }
  if (deliveries.length === 0) { alert('Add at least one delivery first.'); return; }

  clearResults();
  document.getElementById('loading').classList.remove('hidden');
  document.getElementById('btn-generate').disabled = true;

  const body = {
    vehicles: vehicles.map(v => ({
      id: v.id, lat: v.lat, lon: v.lon, capacity: v.capacity,
    })),
    deliveries: deliveries.map(d => ({
      id: d.id,
      pickup_lat:  d.pickup.lat,  pickup_lon:  d.pickup.lon,
      dropoff_lat: d.dropoff.lat, dropoff_lon: d.dropoff.lon,
    })),
  };

  try {
    const res = await fetch('/solve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      alert(`Error: ${err.detail || res.statusText}`);
      return;
    }

    const data = await res.json();
    state.lastResponse = data;
    renderResults(data, vehicles);
  } catch (err) {
    alert(`Request failed: ${err.message}`);
  } finally {
    document.getElementById('loading').classList.add('hidden');
    document.getElementById('btn-generate').disabled = false;
  }
});

// ── Render results ─────────────────────────────────────────────────────────────
function renderResults(data, vehicles) {
  // Map vehicle ids → colors used during placement
  const colorByVehicleId = {};
  vehicles.forEach(v => { colorByVehicleId[v.id] = v.color; });

  // vehicle_id → polyline / markers, for hover highlight
  const polylineByVehicleId = {};
  const markersByVehicleId  = {};

  // Include vehicle depot markers (placed during setup)
  vehicles.forEach(v => {
    markersByVehicleId[v.id] = [v.marker];
  });

  let routeHtml = '';
  const boundsCoords = [];

  data.routes.forEach((route, rIdx) => {
    const color = colorByVehicleId[route.vehicle_id] || VEHICLE_COLORS[rIdx % VEHICLE_COLORS.length];
    const deliveryStops = route.stops.filter(s => s.type === 'pickup');
    if (deliveryStops.length === 0) return;  // empty route — skip

    // Polyline — road geometry (detailed) or straight lines between stops (simplified)
    const coords = state.displayMode === 'simplified'
      ? route.stops.map(s => [s.lat, s.lon])
      : route.geometry;
    const polyline = L.polyline(coords, { color, weight: 4, opacity: 0.9 }).addTo(map);
    const el = polyline.getElement();
    if (el) {
      el.style.strokeDasharray = '12 8';
      el.style.strokeDashoffset = '0';
      el.style.animation = 'dash-move 0.6s linear infinite';
    }
    polylineByVehicleId[route.vehicle_id] = polyline;
    state.resultLayers.push(polyline);
    boundsCoords.push(...coords);

    // Numbered stop markers (skip start/end depot)
    let stopNum = 0;
    route.stops.forEach(stop => {
      if (stop.type === 'start' || stop.type === 'end') return;
      stopNum++;
      const stopColor = stop.type === 'pickup' ? '#3fb950' : '#f85149';
      const marker = L.marker([stop.lat, stop.lon], { icon: circleIcon(stopColor, String(stopNum), 24) })
        .addTo(map)
        .bindTooltip(
          `${stop.type === 'pickup' ? '▲ Pickup' : '▼ Dropoff'} · ${stop.delivery_id}`,
          { permanent: false }
        );
      state.resultLayers.push(marker);
      if (!markersByVehicleId[route.vehicle_id]) markersByVehicleId[route.vehicle_id] = [];
      markersByVehicleId[route.vehicle_id].push(marker);
    });

    const km   = (route.distance_m / 1000).toFixed(1);
    const mins = Math.round(route.duration_s / 60);
    routeHtml += `
      <div class="route-item" style="border-left-color:${color}" data-vehicle-id="${route.vehicle_id}">
        <strong>${route.vehicle_id}</strong> &nbsp;cap ${route.capacity}<br>
        ${deliveryStops.length} deliveries · ${km} km · ${mins} min
      </div>`;
  });

  // Status & unassigned
  const statusClass = `status-${data.solver_status.toLowerCase()}`;
  let statusHtml = `<p class="${statusClass}">${data.solver_status}</p>`;
  if (data.unassigned_delivery_ids.length > 0) {
    statusHtml += `<p class="warning">
      ⚠ ${data.unassigned_delivery_ids.length} unassigned: ${data.unassigned_delivery_ids.join(', ')}
    </p>`;
  }

  document.getElementById('solver-status').innerHTML = statusHtml;
  document.getElementById('route-stats').innerHTML   = routeHtml || '<p style="font-size:.8rem;color:#8b949e">No active routes.</p>';

  // Hover highlight: dim all other polylines + markers
  document.querySelectorAll('.route-item[data-vehicle-id]').forEach(item => {
    const vid = item.dataset.vehicleId;
    item.addEventListener('mouseenter', () => {
      Object.entries(polylineByVehicleId).forEach(([id, pl]) => {
        pl.setStyle({ opacity: id === vid ? 0.9 : 0.2 });
      });
      Object.entries(markersByVehicleId).forEach(([id, markers]) => {
        markers.forEach(m => m.setOpacity(id === vid ? 1 : 0.2));
      });
    });
    item.addEventListener('mouseleave', () => {
      Object.values(polylineByVehicleId).forEach(pl => pl.setStyle({ opacity: 0.9 }));
      Object.values(markersByVehicleId).forEach(markers => markers.forEach(m => m.setOpacity(1)));
    });
  });
  document.getElementById('results').classList.remove('hidden');

  // Fit map to solution
  if (boundsCoords.length > 0) {
    map.fitBounds(L.latLngBounds(boundsCoords), { padding: [40, 40] });
  }
}

// ── Downloads ─────────────────────────────────────────────────────────────────
function blobDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

document.getElementById('btn-download-json').addEventListener('click', () => {
  if (!state.lastResponse) return;
  blobDownload(
    new Blob([JSON.stringify(state.lastResponse, null, 2)], { type: 'application/json' }),
    'vrp-solution.json'
  );
});

document.getElementById('btn-download-csv').addEventListener('click', () => {
  if (!state.lastResponse) return;
  const rows = ['vehicle_id,stop_type,delivery_id,lat,lon,distance_m,duration_s'];
  state.lastResponse.routes.forEach(route => {
    route.stops.forEach(stop => {
      rows.push([
        route.vehicle_id, stop.type, stop.delivery_id ?? '',
        stop.lat, stop.lon, route.distance_m, route.duration_s,
      ].join(','));
    });
  });
  blobDownload(
    new Blob([rows.join('\n')], { type: 'text/csv' }),
    'vrp-solution.csv'
  );
});

// ── Display mode toggle ────────────────────────────────────────────────────────
document.addEventListener('change', e => {
  if (e.target.name !== 'display-mode') return;
  state.displayMode = e.target.value;
  if (!state.lastResponse) return;
  const vehicles = state.items.filter(i => i.type === 'vehicle');
  clearResultLayers();
  renderResults(state.lastResponse, vehicles);
});

// ── Boot ──────────────────────────────────────────────────────────────────────
updateCounters();
