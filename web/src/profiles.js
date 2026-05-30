// Tournament profiles view:
//   1. Overview matrix — players × features, colour-coded (the at-a-glance scan).
//   2. Focused leaderboard — pick a feature (click a matrix column) → ranked players,
//      with the feature's plain-language description.
//   3. Player radar — compare a few players across a curated set of features (normalized
//      so outward = better).
//   4. Feature × feature scatter — every player as a dot on two chosen features.
//
// Consumes web/data/profiles/<slug>.json (scripts/build_profiles.py). Capability-gated;
// min-n players shown faint and excluded from colour/normalization scales. Backend-only
// aggregation — this module just renders. Charts use the already-loaded Chart.js.

import { CATEGORY_LABEL, ORDER } from './catalog.js';

const $ = (id) => document.getElementById(id);
const fmt = (x) => (x == null ? '–' : Number.isInteger(x) ? String(x) : String(Math.round(x * 100) / 100));

// A curated radar set spanning categories (filtered to what a tournament has).
const RADAR_FEATURES = [
  'SPC.space', 'ACT.mobility', 'ACT.coordination', 'DYN.initiative',
  'DEC.prophylaxis', 'STR.tension_hold', 'KSF.zone_pressure', 'MAT.hanging',
];
const PALETTE = ['#9A3B2E', '#1F5673', '#0F6E56', '#B0522A', '#7d3b56', '#5d6a37'];

let current = null;
let featureId = null;
let selectedPlayers = null; // Set of player names for the radar
let scatterX = null;
let scatterY = null;
let radarChart = null;
let scatterChart = null;

export async function loadProfiles(slug) {
  const root = $('profilesRoot');
  root.innerHTML = '<p class="phint">Loading profiles…</p>';
  try {
    const resp = await fetch(`./data/profiles/${slug}.json`);
    if (!resp.ok) throw new Error(`status ${resp.status}`);
    current = await resp.json();
  } catch (e) {
    root.innerHTML = `<p class="perr">No profile data for ${slug} (${e.message}). Run <code>scripts/build_profiles.py</code>.</p>`;
    return;
  }
  const avail = availableFeatures(current);
  featureId = avail.includes('SPC.space') ? 'SPC.space' : avail[0];
  selectedPlayers = new Set(playersByScore(current).slice(0, 3).map(([n]) => n));
  scatterX = avail.includes('DYN.initiative') ? 'DYN.initiative' : avail[0];
  scatterY = avail.includes('DEC.prophylaxis') ? 'DEC.prophylaxis' : avail[1] || avail[0];
  render();
}

function availableFeatures(p) {
  const present = new Set(Object.keys(p.leaderboards));
  const seen = new Set();
  const ids = [];
  for (const id of ORDER) if (present.has(id) && p.leaderboards[id].available) { ids.push(id); seen.add(id); }
  for (const id of Object.keys(p.leaderboards)) if (!seen.has(id) && p.leaderboards[id].available) ids.push(id);
  return ids;
}

const playersByScore = (p) => Object.entries(p.players).sort((a, b) => b[1].score - a[1].score);
const nMin = (p) => p.n_min || 3;

function cellColor(goodness) {
  const hue = goodness * 120;
  return `hsl(${hue}, 55%, ${91 - Math.abs(goodness - 0.5) * 14}%)`;
}

function destroyCharts() {
  if (radarChart) { radarChart.destroy(); radarChart = null; }
  if (scatterChart) { scatterChart.destroy(); scatterChart = null; }
}

function render() {
  const p = current;
  const root = $('profilesRoot');
  destroyCharts();
  root.innerHTML = '';

  const head = document.createElement('div');
  head.className = 'phead';
  head.innerHTML = `<h2>${p.label}</h2><span class="psub">${Object.keys(p.players).length} players · ` +
    `${availableFeatures(p).length} features · click a column to rank by it</span>`;
  root.appendChild(head);

  root.appendChild(matrix(p));
  root.appendChild(leaderboard(p, featureId));

  const charts = document.createElement('div');
  charts.className = 'pcharts';
  charts.appendChild(radarCard(p));
  charts.appendChild(scatterCard(p));
  root.appendChild(charts);

  drawRadar();
  drawScatter();
}

// ---- overview matrix --------------------------------------------------------
function matrix(p) {
  const wrap = document.createElement('div');
  wrap.className = 'matrix-wrap';
  const feats = availableFeatures(p);
  const players = playersByScore(p);
  const min = nMin(p);

  const cols = [
    { id: 'score', label: 'Pts', higher: 'good', get: (d) => d.score },
    { id: 'perf', label: 'TPR', higher: 'good', get: (d) => d.performance_elo },
    ...feats.map((id) => ({
      id, label: (p.meta[id] || {}).name || id, higher: (p.meta[id] || {}).higher || 'neutral',
      cat: (p.meta[id] || {}).category || '', feature: true,
      get: (d) => (d.rollups[id] ? d.rollups[id].mean : null),
      n: (d) => (d.rollups[id] ? d.rollups[id].n : 0),
    })),
  ];
  for (const c of cols) {
    const vals = players.filter(([, d]) => !c.feature || c.n(d) >= min).map(([, d]) => c.get(d)).filter((v) => v != null);
    c.min = Math.min(...vals);
    c.max = Math.max(...vals);
  }
  const goodness = (c, v) => {
    if (v == null || c.higher === 'neutral' || c.max === c.min) return null;
    const t = (v - c.min) / (c.max - c.min);
    return c.higher === 'bad' ? 1 - t : t;
  };

  let prevCat = null;
  for (const c of cols) if (c.feature) { c.catstart = c.cat !== prevCat; prevCat = c.cat; }
  const cls = (c) => (c.feature ? 'mx-h' : 'mx-res') + (c.id === featureId ? ' sel' : '') + (c.catstart ? ' catstart' : '');
  const header = cols.map((c) =>
    `<th class="${cls(c)}" data-id="${c.id}" title="${c.feature ? CATEGORY_LABEL[c.cat] + ' · ' : ''}${c.label}">${c.label}</th>`
  ).join('');

  let body = '';
  for (const [name, d] of players) {
    body += `<tr><th class="mx-name" title="${name}">${name}</th>`;
    for (const c of cols) {
      const v = c.get(d);
      const low = c.feature && c.n(d) < min;
      const g = goodness(c, v);
      body += `<td class="mx-cell${low ? ' low' : ''}${c.catstart ? ' catstart' : ''}" style="${g == null ? '' : `background:${cellColor(g)}`}">${fmt(v)}</td>`;
    }
    body += '</tr>';
  }
  wrap.innerHTML = `<table class="matrix"><thead><tr><th class="mx-name">Player</th>${header}</tr></thead><tbody>${body}</tbody></table>`;
  wrap.querySelectorAll('th.mx-h').forEach((th) => th.addEventListener('click', () => focusFeature(th.dataset.id)));
  return wrap;
}

function focusFeature(id) {
  featureId = id;
  const root = $('profilesRoot');
  root.querySelectorAll('.matrix th.mx-h.sel').forEach((th) => th.classList.remove('sel'));
  const th = root.querySelector(`.matrix th.mx-h[data-id="${id}"]`);
  if (th) th.classList.add('sel');
  const old = root.querySelector('.lboard');
  if (old) old.replaceWith(leaderboard(current, id));
}

// ---- focused leaderboard (with description) ---------------------------------
function leaderboard(p, id) {
  const wrap = document.createElement('div');
  wrap.className = 'lboard';
  const board = p.leaderboards[id];
  const m = p.meta[id] || { name: id };
  if (!board || !board.available) {
    wrap.innerHTML = `<p class="perr">“${m.name}” needs data this tournament doesn't have.</p>`;
    return wrap;
  }
  const dir = board.higher === 'good' ? 'higher is better' : board.higher === 'bad' ? 'lower is better' : 'neutral';
  const max = Math.max(1e-9, ...board.entries.map((e) => Math.abs(e[1] || 0)));
  let html = `<div class="lbhead"><b>${m.name}</b> <span class="psub">${dir}</span></div>`;
  if (m.description) html += `<p class="lbdesc">${m.description}</p>`;
  wrap.innerHTML = html;
  for (const [name, value, n] of board.entries) {
    const ci = p.players[name]?.rollups?.[id]?.ci;
    const pct = Math.max(2, (Math.abs(value || 0) / max) * 100);
    const row = document.createElement('div');
    row.className = 'lbrow' + (n < nMin(p) ? ' lowsample' : '');
    row.innerHTML =
      `<span class="lbname" title="${name}">${name}</span>` +
      `<span class="lbbar"><span class="lbfill" style="width:${pct}%"></span></span>` +
      `<span class="lbval">${fmt(value)}${ci != null ? ` <span class="lbci">±${fmt(ci)}</span>` : ''}<span class="lbn">n=${n}</span></span>`;
    wrap.appendChild(row);
  }
  return wrap;
}

// ---- player radar -----------------------------------------------------------
function radarCard(p) {
  const card = document.createElement('div');
  card.className = 'pcard';
  card.innerHTML = '<h3>Player radar</h3><p class="psub">compare players across features — outward = better</p>';
  const picks = document.createElement('div');
  picks.className = 'ppicks';
  for (const [name] of playersByScore(p)) {
    const id = `rp-${name.replace(/\W+/g, '_')}`;
    const lab = document.createElement('label');
    lab.className = 'ppick';
    lab.innerHTML = `<input type="checkbox" ${selectedPlayers.has(name) ? 'checked' : ''}> ${name}`;
    lab.querySelector('input').addEventListener('change', (e) => {
      if (e.target.checked) selectedPlayers.add(name);
      else selectedPlayers.delete(name);
      drawRadar();
    });
    picks.appendChild(lab);
  }
  card.appendChild(picks);
  const cv = document.createElement('div');
  cv.className = 'chartbox';
  cv.innerHTML = '<canvas id="pradar"></canvas>';
  card.appendChild(cv);
  return card;
}

function axisMinMax(p, ids) {
  const min = nMin(p);
  const stats = {};
  for (const id of ids) {
    const vals = Object.values(p.players)
      .filter((d) => d.rollups[id] && d.rollups[id].n >= min && d.rollups[id].mean != null)
      .map((d) => d.rollups[id].mean);
    stats[id] = { lo: Math.min(...vals), hi: Math.max(...vals) };
  }
  return stats;
}

function drawRadar() {
  const p = current;
  const ids = RADAR_FEATURES.filter((id) => p.leaderboards[id]?.available);
  const stats = axisMinMax(p, ids);
  const goodness = (id, v) => {
    const s = stats[id];
    if (!s || s.hi === s.lo || v == null) return 0.5;
    const t = (v - s.lo) / (s.hi - s.lo);
    return p.meta[id]?.higher === 'bad' ? 1 - t : t;
  };
  const datasets = [...selectedPlayers].map((name, i) => {
    const color = PALETTE[i % PALETTE.length];
    const d = p.players[name];
    return {
      label: name,
      data: ids.map((id) => Math.round(goodness(id, d?.rollups?.[id]?.mean) * 100) / 100),
      borderColor: color, backgroundColor: color + '22', borderWidth: 2, pointRadius: 2,
    };
  });
  radarChart = new window.Chart($('pradar'), {
    type: 'radar',
    data: { labels: ids.map((id) => (p.meta[id] || {}).name || id), datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      scales: { r: { min: 0, max: 1, ticks: { display: false }, pointLabels: { font: { size: 10 } } } },
      plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 11 } } } },
    },
  });
}

// ---- feature × feature scatter ----------------------------------------------
function scatterCard(p) {
  const card = document.createElement('div');
  card.className = 'pcard';
  const avail = availableFeatures(p);
  const opts = (sel) => avail.map((id) =>
    `<option value="${id}" ${id === sel ? 'selected' : ''}>${(p.meta[id] || {}).name || id}</option>`).join('');
  card.innerHTML = `<h3>Feature scatter</h3><div class="pcontrols">` +
    `<label>x <select class="sx">${opts(scatterX)}</select></label>` +
    `<label>y <select class="sy">${opts(scatterY)}</select></label></div>` +
    `<div class="chartbox"><canvas id="pscatter"></canvas></div>`;
  card.querySelector('.sx').addEventListener('change', (e) => { scatterX = e.target.value; drawScatter(); });
  card.querySelector('.sy').addEventListener('change', (e) => { scatterY = e.target.value; drawScatter(); });
  return card;
}

function drawScatter() {
  const p = current;
  const min = nMin(p);
  const pts = playersByScore(p)
    .filter(([, d]) => d.rollups[scatterX]?.n >= min && d.rollups[scatterY]?.n >= min)
    .map(([name, d]) => ({ x: d.rollups[scatterX].mean, y: d.rollups[scatterY].mean, name }));
  scatterChart = new window.Chart($('pscatter'), {
    type: 'scatter',
    data: { datasets: [{ data: pts, backgroundColor: '#9A3B2E', pointRadius: 4 }] },
    options: {
      responsive: true, maintainAspectRatio: false,
      scales: {
        x: { title: { display: true, text: (p.meta[scatterX] || {}).name || scatterX } },
        y: { title: { display: true, text: (p.meta[scatterY] || {}).name || scatterY } },
      },
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: (c) => `${c.raw.name}: ${fmt(c.raw.x)}, ${fmt(c.raw.y)}` } },
      },
    },
  });
}
