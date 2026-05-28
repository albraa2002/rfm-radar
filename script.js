/**
 * script.js — RFM Profit Radar · Dashboard Logic
 * ══════════════════════════════════════════════════
 * Responsibilities:
 *   1. Fetch rfm_data.json
 *   2. Calculate and render KPI cards
 *   3. Render Chart.js Bubble Chart (color-coded by segment)
 *   4. Populate the At-Risk VIP Rescue List
 *   5. Drive the Rescue Modal
 *   6. Live clock
 * ══════════════════════════════════════════════════
 */

'use strict';

/* ─────────────────────────────────────────
   CONSTANTS
   ───────────────────────────────────────── */

/** Segment → display color mapping */
const SEGMENT_COLORS = {
  'At-Risk VIP': '#ff2d55',
  'Champion':    '#00f0ff',
  'Loyal':       '#00ff88',
  'New':         '#f7c948',
  'Lost':        '#555e7a',
};

/** Segment → bubble opacity */
const SEGMENT_ALPHA = {
  'At-Risk VIP': 0.85,
  'Champion':    0.80,
  'Loyal':       0.70,
  'New':         0.65,
  'Lost':        0.40,
};

/** Desired render order (At-Risk on top) */
const SEGMENT_ORDER = ['Lost', 'New', 'Loyal', 'Champion', 'At-Risk VIP'];

/* ─────────────────────────────────────────
   UTILITIES
   ───────────────────────────────────────── */

/**
 * Format a number as USD currency string.
 * @param {number} value
 * @returns {string}  e.g. "$1,234.56"
 */
function formatCurrency(value) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

/**
 * Animate a numeric counter from 0 to target.
 * @param {HTMLElement} el - Target element
 * @param {number}      target - Final value
 * @param {number}      [duration=600] - Animation duration ms
 * @param {Function}    [formatter] - Optional value formatter
 */
function animateCounter(el, target, duration = 600, formatter = null) {
  const start     = performance.now();
  const startVal  = 0;

  function tick(now) {
    const elapsed  = now - start;
    const progress = Math.min(elapsed / duration, 1);
    // Ease-out cubic
    const eased    = 1 - Math.pow(1 - progress, 3);
    const current  = startVal + (target - startVal) * eased;
    el.textContent = formatter ? formatter(current) : Math.round(current).toString();
    if (progress < 1) requestAnimationFrame(tick);
  }

  requestAnimationFrame(tick);
}

/* ─────────────────────────────────────────
   LIVE CLOCK
   ───────────────────────────────────────── */
function startClock() {
  const clockEl = document.getElementById('live-clock');
  if (!clockEl) return;

  function update() {
    const now = new Date();
    clockEl.textContent = now.toLocaleTimeString('en-US', { hour12: false });
  }

  update();
  setInterval(update, 1000);
}

/* ─────────────────────────────────────────
   KPI POPULATION
   ───────────────────────────────────────── */

/**
 * Compute all KPI metrics from the raw data array and inject them into the DOM.
 * @param {Array<Object>} data - Full customer dataset
 */
function populateKPIs(data) {
  // Total customers
  const totalCustomers = data.length;

  // VIPs = Champions + Loyal
  const totalVIPs = data.filter(d =>
    d.Segment === 'Champion' || d.Segment === 'Loyal'
  ).length;

  // At-Risk VIPs
  const atRiskVIPs = data.filter(d => d.Segment === 'At-Risk VIP');
  const atRiskCount = atRiskVIPs.length;

  // Revenue at Risk = sum of Monetary values of At-Risk VIPs
  const revenueAtRisk = atRiskVIPs.reduce((sum, d) => sum + d.Monetary, 0);

  // Animate values into the KPI cards
  animateCounter(
    document.getElementById('kpi-total-customers'),
    totalCustomers,
    700
  );

  animateCounter(
    document.getElementById('kpi-total-vips'),
    totalVIPs,
    700
  );

  animateCounter(
    document.getElementById('kpi-atrisk-count'),
    atRiskCount,
    700
  );

  animateCounter(
    document.getElementById('kpi-revenue-risk'),
    revenueAtRisk,
    900,
    (v) => formatCurrency(v)
  );
}

/* ─────────────────────────────────────────
   CHART.JS BUBBLE CHART — "THE PROFIT RADAR"
   ───────────────────────────────────────── */

/**
 * Convert raw Frequency (1–50) to a Chart.js bubble radius (3–28).
 * Scaled to make visual differences meaningful.
 * @param {number} freq
 * @returns {number}
 */
function freqToRadius(freq) {
  const minR = 4, maxR = 26;
  return minR + ((freq - 1) / (50 - 1)) * (maxR - minR);
}

/**
 * Convert a hex color and alpha to rgba string.
 * @param {string} hex  - "#rrggbb"
 * @param {number} alpha - 0–1
 * @returns {string}    - "rgba(r,g,b,a)"
 */
function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/**
 * Build and render the Chart.js Bubble Chart.
 * @param {Array<Object>} data
 */
function renderBubbleChart(data) {
  const canvas = document.getElementById('rfm-bubble-chart');
  if (!canvas) return;

  // Group data by segment (in render order so At-Risk renders on top)
  const datasets = SEGMENT_ORDER.map(segment => {
    const segmentData = data
      .filter(d => d.Segment === segment)
      .map(d => ({
        x:     d.Recency,          // X axis: days since last purchase
        y:     d.Monetary,         // Y axis: lifetime spend
        r:     freqToRadius(d.Frequency), // Bubble size: frequency
        // Store extra data for tooltip
        _name: d.Customer_Name,
        _id:   d.Customer_ID,
        _freq: d.Frequency,
        _rfm:  d.RFM_Score,
      }));

    const color = SEGMENT_COLORS[segment] || '#ffffff';
    const alpha = SEGMENT_ALPHA[segment] || 0.6;

    return {
      label:            segment,
      data:             segmentData,
      backgroundColor:  hexToRgba(color, alpha),
      borderColor:      hexToRgba(color, Math.min(alpha + 0.2, 1)),
      borderWidth:      segment === 'At-Risk VIP' ? 2 : 1,
      // Glowing halo on hover
      hoverBackgroundColor: hexToRgba(color, 0.95),
      hoverBorderColor:     color,
      hoverBorderWidth:     2.5,
    };
  });

  // Custom plugin: draw a "danger zone" shading (high monetary + high recency = danger)
  const dangerZonePlugin = {
    id: 'dangerZone',
    beforeDraw(chart) {
      const { ctx, chartArea, scales } = chart;
      if (!chartArea) return;

      const { left, right, top, bottom } = chartArea;
      const xThreshold = scales.x.getPixelForValue(60); // 60+ days = danger
      const width = right - xThreshold;
      if (width <= 0) return;

      ctx.save();
      const grad = ctx.createLinearGradient(xThreshold, 0, right, 0);
      grad.addColorStop(0, 'rgba(255, 45, 85, 0)');
      grad.addColorStop(1, 'rgba(255, 45, 85, 0.06)');
      ctx.fillStyle = grad;
      ctx.fillRect(xThreshold, top, width, bottom - top);

      // Dashed vertical threshold line
      ctx.strokeStyle = 'rgba(255, 45, 85, 0.25)';
      ctx.lineWidth   = 1;
      ctx.setLineDash([4, 6]);
      ctx.beginPath();
      ctx.moveTo(xThreshold, top);
      ctx.lineTo(xThreshold, bottom);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }
  };

  new Chart(canvas, {
    type: 'bubble',
    plugins: [dangerZonePlugin],
    data: { datasets },
    options: {
      responsive:          true,
      maintainAspectRatio: false,
      animation: {
        duration: 900,
        easing:   'easeOutQuart',
      },
      plugins: {
        legend: {
          display: false, // We render a custom legend in HTML
        },
        tooltip: {
          backgroundColor: 'rgba(13, 21, 38, 0.95)',
          borderColor:     'rgba(0, 240, 255, 0.3)',
          borderWidth:     1,
          titleFont:       { family: "'Orbitron', sans-serif", size: 11, weight: '700' },
          bodyFont:        { family: "'IBM Plex Mono', monospace", size: 10 },
          padding:         12,
          cornerRadius:    8,
          callbacks: {
            title(items) {
              const d = items[0].raw;
              return d._name;
            },
            label(item) {
              const d   = item.raw;
              const seg = item.dataset.label;
              return [
                `Segment:   ${seg}`,
                `Recency:   ${d.x} days ago`,
                `Monetary:  ${formatCurrency(d.y)}`,
                `Frequency: ${d._freq} orders`,
                `RFM Score: ${d._rfm}`,
              ];
            },
          },
        },
      },
      scales: {
        x: {
          title: {
            display:     true,
            text:        'RECENCY (Days Since Last Purchase)  →  Higher = More At-Risk',
            color:       'rgba(136, 153, 187, 0.7)',
            font:        { family: "'IBM Plex Mono', monospace", size: 9 },
            padding:     { top: 8 },
          },
          min: 0,
          max: 125,
          grid: {
            color:     'rgba(255, 255, 255, 0.04)',
            lineWidth: 1,
          },
          ticks: {
            color:  'rgba(136, 153, 187, 0.6)',
            font:   { family: "'IBM Plex Mono', monospace", size: 9 },
            maxTicksLimit: 8,
          },
        },
        y: {
          title: {
            display:     true,
            text:        'LIFETIME VALUE (Monetary $)',
            color:       'rgba(136, 153, 187, 0.7)',
            font:        { family: "'IBM Plex Mono', monospace", size: 9 },
            padding:     { bottom: 8 },
          },
          grid: {
            color:     'rgba(255, 255, 255, 0.04)',
            lineWidth: 1,
          },
          ticks: {
            color:    'rgba(136, 153, 187, 0.6)',
            font:     { family: "'IBM Plex Mono', monospace", size: 9 },
            callback: (v) => `$${(v / 1000).toFixed(0)}k`,
            maxTicksLimit: 7,
          },
        },
      },
    },
  });
}

/* ─────────────────────────────────────────
   SEGMENT DISTRIBUTION BAR
   ───────────────────────────────────────── */

/**
 * Render a proportional colour bar showing segment split.
 * @param {Array<Object>} data
 */
function renderSegmentBar(data) {
  const bar     = document.getElementById('segment-bar');
  const keysEl  = document.getElementById('segment-bar-keys');
  if (!bar || !keysEl) return;

  const counts = {};
  data.forEach(d => { counts[d.Segment] = (counts[d.Segment] || 0) + 1; });

  bar.innerHTML  = '';
  keysEl.innerHTML = '';

  SEGMENT_ORDER.slice().reverse().forEach(seg => {
    const count = counts[seg] || 0;
    if (!count) return;

    const pct    = (count / data.length) * 100;
    const color  = SEGMENT_COLORS[seg];

    // Bar segment
    const seg_el = document.createElement('div');
    seg_el.className = 'segment-bar-segment';
    seg_el.style.cssText = `
      flex: ${pct};
      background: ${color};
      opacity: ${SEGMENT_ALPHA[seg]};
    `;
    seg_el.title = `${seg}: ${count} (${pct.toFixed(1)}%)`;
    bar.appendChild(seg_el);

    // Key label
    const key = document.createElement('div');
    key.className = 'segment-bar-key';
    key.innerHTML = `
      <span style="width:8px;height:8px;border-radius:50%;background:${color};display:inline-block;"></span>
      ${seg} (${count})
    `;
    keysEl.appendChild(key);
  });
}

/* ─────────────────────────────────────────
   RESCUE LIST
   ───────────────────────────────────────── */

/**
 * Sort and render the At-Risk VIP rescue list table.
 * Sorted by Monetary value descending (biggest loss first).
 * @param {Array<Object>} data - Full dataset (filtered internally)
 */
function populateRescueList(data) {
  const tbody  = document.getElementById('rescue-tbody');
  if (!tbody) return;

  // Filter, sort by Monetary descending (highest LTV at most risk = top priority)
  const atRisk = data
    .filter(d => d.Segment === 'At-Risk VIP')
    .sort((a, b) => b.Monetary - a.Monetary);

  // Clear loading state
  tbody.innerHTML = '';

  if (atRisk.length === 0) {
    tbody.innerHTML = `
      <div style="padding: 32px 16px; text-align: center; color: var(--text-dim); font-size: 0.7rem;">
        ✓ No At-Risk VIPs detected at this time.
      </div>`;
    return;
  }

  // Render rows
  atRisk.forEach((customer, index) => {
    const row = document.createElement('div');
    row.className = 'rescue-row';
    row.style.animationDelay = `${index * 0.05}s`;

    row.innerHTML = `
      <!-- Rank -->
      <div class="col-rank">${index + 1}</div>

      <!-- Name + ID -->
      <div class="col-name">
        <span class="row-name" title="${customer.Customer_Name}">${customer.Customer_Name}</span>
        <span class="row-id">${customer.Customer_ID}</span>
      </div>

      <!-- RFM Score badges -->
      <div class="col-rfm">
        <span class="rfm-badge" title="Recency Score (1=worst)">R${customer.R_Score}</span>
        <span class="rfm-badge" title="Frequency Score">F${customer.F_Score}</span>
        <span class="rfm-badge" title="Monetary Score">M${customer.M_Score}</span>
      </div>

      <!-- Lost LTV -->
      <div class="col-ltv">${formatCurrency(customer.Monetary)}</div>

      <!-- Last purchase days ago -->
      <div class="col-days">
        ${customer.Recency}d
        <span>ago</span>
      </div>

      <!-- Rescue button -->
      <div>
        <button
          class="btn-rescue"
          data-id="${customer.Customer_ID}"
          aria-label="Rescue ${customer.Customer_Name}"
        >RESCUE</button>
      </div>
    `;

    tbody.appendChild(row);
  });

  // Wire up rescue buttons via event delegation
  tbody.addEventListener('click', (e) => {
    const btn = e.target.closest('.btn-rescue');
    if (!btn) return;

    const customerId = btn.dataset.id;
    const customer   = atRisk.find(d => d.Customer_ID === customerId);
    if (customer) openRescueModal(customer);
  });

  // Populate footer stats
  populateRescueFooter(atRisk);
}

/**
 * Render aggregate stats in the rescue list footer.
 * @param {Array<Object>} atRisk - Filtered At-Risk VIP records
 */
function populateRescueFooter(atRisk) {
  if (!atRisk.length) return;

  const avgDays = Math.round(
    atRisk.reduce((s, d) => s + d.Recency, 0) / atRisk.length
  );
  const avgFreq = (
    atRisk.reduce((s, d) => s + d.Frequency, 0) / atRisk.length
  ).toFixed(1);
  const avgLTV = formatCurrency(
    atRisk.reduce((s, d) => s + d.Monetary, 0) / atRisk.length
  );

  const el = (id) => document.getElementById(id);
  animateCounter(el('stat-avg-days'), avgDays, 600);
  animateCounter(el('stat-avg-freq'), parseFloat(avgFreq), 600);
  animateCounter(el('stat-avg-ltv'),
    atRisk.reduce((s, d) => s + d.Monetary, 0) / atRisk.length,
    700,
    (v) => formatCurrency(v)
  );
}

/* ─────────────────────────────────────────
   RESCUE MODAL
   ───────────────────────────────────────── */

/**
 * Open the rescue protocol modal for a specific customer.
 * @param {Object} customer - Single customer record
 */
function openRescueModal(customer) {
  const overlay    = document.getElementById('modal-overlay');
  const nameEl     = document.getElementById('modal-customer-name');
  const statsEl    = document.getElementById('modal-stats');

  if (!overlay) return;

  // Populate customer name
  nameEl.textContent = customer.Customer_Name;

  // Populate quick stats
  statsEl.innerHTML = `
    <div class="modal-stat-item">
      <span class="modal-stat-label">Last Purchase</span>
      <span class="modal-stat-value">${customer.Recency}d ago</span>
    </div>
    <div class="modal-stat-item">
      <span class="modal-stat-label">Total Orders</span>
      <span class="modal-stat-value">${customer.Frequency}</span>
    </div>
    <div class="modal-stat-item">
      <span class="modal-stat-label">Lifetime Value</span>
      <span class="modal-stat-value">${formatCurrency(customer.Monetary)}</span>
    </div>
  `;

  // Show modal
  overlay.hidden = false;
  document.body.style.overflow = 'hidden'; // prevent scroll
}

/** Close the rescue modal. */
function closeRescueModal() {
  const overlay = document.getElementById('modal-overlay');
  if (overlay) overlay.hidden = true;
  document.body.style.overflow = '';
}

/** Wire up all modal close interactions. */
function initModal() {
  document.getElementById('modal-close')?.addEventListener('click', closeRescueModal);
  document.getElementById('modal-cancel')?.addEventListener('click', closeRescueModal);
  document.getElementById('modal-confirm')?.addEventListener('click', () => {
    closeRescueModal();
    // In production: POST to CRM API to log the contact attempt
    console.log('[RFM Radar] Customer marked as contacted.');
  });

  // Close on overlay click
  document.getElementById('modal-overlay')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeRescueModal();
  });

  // Close on Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeRescueModal();
  });
}

/* ─────────────────────────────────────────
   MAIN ENTRY POINT
   ───────────────────────────────────────── */

/**
 * Main bootstrap function — fetch data then render all dashboard components.
 * All rendering is deferred until data is available.
 */
async function initDashboard() {
  startClock();
  initModal();

  try {
    // ── STEP 1: Fetch JSON data ──────────────────────────
    const response = await fetch('rfm_data.json');
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: Could not load rfm_data.json`);
    }
    const data = await response.json();

    // Validate we got an array
    if (!Array.isArray(data) || data.length === 0) {
      throw new Error('rfm_data.json is empty or malformed.');
    }

    console.log(`[RFM Radar] Loaded ${data.length} customer records.`);

    // ── STEP 2: KPI Cards ────────────────────────────────
    populateKPIs(data);

    // ── STEP 3: Bubble Chart ─────────────────────────────
    renderBubbleChart(data);

    // ── STEP 4: Segment Distribution Bar ─────────────────
    renderSegmentBar(data);

    // ── STEP 5: Rescue List ──────────────────────────────
    populateRescueList(data);

  } catch (error) {
    console.error('[RFM Radar] Dashboard init failed:', error);

    // Surface the error to the user gracefully
    const rescue = document.getElementById('rescue-tbody');
    if (rescue) {
      rescue.innerHTML = `
        <div style="padding: 24px 16px; color: var(--red); font-size: 0.7rem; line-height: 1.8;">
          ⚠ Failed to load data feed.<br>
          <span style="color: var(--text-dim);">
            Ensure rfm_data.json is in the same directory and served over HTTP (not file://).
            <br>Run: <code style="color: var(--cyan);">python -m http.server 8080</code>
          </span>
        </div>`;
    }
  }
}

// Kick off when DOM is ready
document.addEventListener('DOMContentLoaded', initDashboard);
