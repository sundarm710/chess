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

const PALETTE =['#9A3B2E', '#1F5673', '#0F6E56', '#B0522A', '#7d3b56', '#5d6a37', '#4b3b7d', '#2f6f6a'];
const MAX_RADAR_PLAYERS = 8;
const CLUSTER_MAX = 8; // features per radar (<= 10)
const PHASES = ['opening', 'middlegame', 'endgame'];
const PHASE_LABEL = { opening: 'Opening', middlegame: 'Middlegame', endgame: 'Endgame' };

let current = null;
let featureId = null;
let selectedPlayers = null; // Set of player names for the radar
let scatterX = null;
let scatterY = null;
let phaseFilter = 'all';    // 'all' | 'opening' | 'middlegame' | 'endgame'
let colorFilter = 'all';    // 'all' | 'w' | 'b'
let fpPlayer = null;        // fingerprint / white-vs-black player
let pcView = 'trajectory';  // phase-&-colour sub-view
let radarCharts = []; // one Chart per feature cluster
let scatterChart = null;
let pcCharts = []; // phase-&-colour sub-view charts (trajectory / white-vs-black)
let corrChart = null; // feature ↔ result correlation bar

const curSlice = () => ({ phase: phaseFilter, color: colorFilter });

// Resolve one player's value for a feature under a {phase,color} slice → {mean, n, approx}.
// Falls back to the phase marginal when a phase×colour cross cell isn't stored.
function sliceValue(d, fid, { phase, color }) {
  const r = d && d.rollups && d.rollups[fid];
  if (!r) return { mean: null, n: 0 };
  if (phase === 'all' && color === 'all') return { mean: r.mean, n: r.n };
  if (phase !== 'all' && color === 'all') return r.phases?.[phase] || { mean: null, n: 0 };
  if (phase === 'all' && color !== 'all') {
    return color === 'w'
      ? { mean: r.mean_white, n: r.n_white }
      : { mean: r.mean_black, n: r.n_black };
  }
  const cell = r.cross?.[`${phase}:${color}`];
  if (cell) return cell;
  const m = r.phases?.[phase]; // no cross stored → approximate with the phase marginal
  return m ? { mean: m.mean, n: m.n, approx: true } : { mean: null, n: 0 };
}

// Client-side ranked [[name, mean, n]] for a feature under a slice (sub-min-n pushed down).
function rankedEntries(p, id, slice) {
  const higher = (p.meta[id] || {}).higher || 'neutral';
  const min = nMin(p);
  const rows = [];
  for (const [name, d] of Object.entries(p.players)) {
    const { mean, n } = sliceValue(d, id, slice);
    if (mean != null) rows.push([name, mean, n]);
  }
  const asc = higher === 'bad';
  rows.sort((a, b) => (a[2] < min) - (b[2] < min) || (asc ? a[1] - b[1] : b[1] - a[1]));
  return rows;
}

const sliceLabel = () =>
  (phaseFilter === 'all' ? 'All phases' : PHASE_LABEL[phaseFilter]) +
  ' · ' + (colorFilter === 'all' ? 'both colours' : colorFilter === 'w' ? 'White' : 'Black');

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
  phaseFilter = 'all';
  colorFilter = 'all';
  pcView = 'trajectory';
  fpPlayer = playersByScore(current)[0]?.[0] || null;
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
  radarCharts.forEach((c) => c.destroy());
  radarCharts = [];
  pcCharts.forEach((c) => c.destroy());
  pcCharts = [];
  if (scatterChart) { scatterChart.destroy(); scatterChart = null; }
  if (corrChart) { corrChart.destroy(); corrChart = null; }
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

  root.appendChild(controlRow(p));
  root.appendChild(matrix(p));
  root.appendChild(leaderboard(p, featureId));

  root.appendChild(radarSection(p));
  root.appendChild(scatterCard(p));
  root.appendChild(phaseColourCard(p));
  root.appendChild(correlationCard(p));

  drawRadars();
  drawScatter();
  drawPhaseColour();
  drawCorrelation();
}

// ---- phase / colour filter row ----------------------------------------------
function controlRow(p) {
  const row = document.createElement('div');
  row.className = 'pfilters';
  const hasCross = p.emit_cross;
  const phaseOpts = ['all', ...PHASES].map((v) =>
    `<option value="${v}" ${v === phaseFilter ? 'selected' : ''}>${v === 'all' ? 'All phases' : PHASE_LABEL[v]}</option>`).join('');
  const colorOpts = [['all', 'Both colours'], ['w', 'White'], ['b', 'Black']].map(([v, t]) =>
    `<option value="${v}" ${v === colorFilter ? 'selected' : ''}>${t}</option>`).join('');
  const approx = (phaseFilter !== 'all' && colorFilter !== 'all' && !hasCross)
    ? `<span class="fnote">approx — no phase×colour data this field; showing the ${PHASE_LABEL[phaseFilter]} marginal</span>` : '';
  row.innerHTML =
    `<label>Phase <select class="fphase">${phaseOpts}</select></label>` +
    `<label>Colour <select class="fcolor">${colorOpts}</select></label>` +
    `<span class="fslice">${sliceLabel()}</span>${approx}`;
  row.querySelector('.fphase').addEventListener('change', (e) => { phaseFilter = e.target.value; render(); });
  row.querySelector('.fcolor').addEventListener('change', (e) => { colorFilter = e.target.value; render(); });
  return row;
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
      get: (d) => sliceValue(d, id, curSlice()).mean,
      n: (d) => sliceValue(d, id, curSlice()).n,
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
  if (pcView === 'trajectory') drawPhaseColour(); // trajectory tracks the focused feature
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
  const slice = curSlice();
  const entries = rankedEntries(p, id, slice);
  const dir = board.higher === 'good' ? 'higher is better' : board.higher === 'bad' ? 'lower is better' : 'neutral';
  const max = Math.max(1e-9, ...entries.map((e) => Math.abs(e[1] || 0)));
  const isAll = slice.phase === 'all' && slice.color === 'all';
  let html = `<div class="lbhead"><b>${m.name}</b> <span class="psub">${dir} · ${sliceLabel()}</span></div>`;
  if (m.description) html += `<p class="lbdesc">${m.description}</p>`;
  wrap.innerHTML = html;
  for (const [name, value, n] of entries) {
    const ci = isAll ? p.players[name]?.rollups?.[id]?.ci : null; // CI only on the all/all slice
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

// ---- player radar (all features, clustered into several radars) -------------
// Group available features into category-coherent clusters of <= CLUSTER_MAX.
function clusters(p) {
  const runs = [];
  let run = null;
  for (const id of availableFeatures(p)) {
    const cat = (p.meta[id] || {}).category || '';
    if (!run || run.cat !== cat) { run = { cat, ids: [] }; runs.push(run); }
    run.ids.push(id);
  }
  const out = [];
  let cur = [];
  for (const r of runs) {
    if (cur.length && cur.length + r.ids.length > CLUSTER_MAX) { out.push(cur); cur = []; }
    cur.push(...r.ids);
  }
  if (cur.length) out.push(cur);
  if (out.length >= 2 && out[out.length - 1].length < 3) out[out.length - 2].push(...out.pop());
  return out;
}

function clusterTitle(p, ids) {
  const cats = [];
  for (const id of ids) {
    const c = (p.meta[id] || {}).category || '';
    if (!cats.includes(c)) cats.push(c);
  }
  return cats.map((c) => CATEGORY_LABEL[c] || c).join(' · ');
}

function plottedPlayers(p) {
  return playersByScore(p).map(([n]) => n).filter((n) => selectedPlayers.has(n)).slice(0, MAX_RADAR_PLAYERS);
}

function radarSection(p) {
  const card = document.createElement('div');
  card.className = 'pcard';
  card.innerHTML = `<h3>Player radar</h3><p class="psub">compare up to ${MAX_RADAR_PLAYERS} players — ` +
    `outward = better; all features grouped into clusters</p>`;

  const picks = document.createElement('div');
  picks.className = 'ppicks';
  for (const [name] of playersByScore(p)) {
    const lab = document.createElement('label');
    lab.className = 'ppick';
    lab.innerHTML = `<input type="checkbox" ${selectedPlayers.has(name) ? 'checked' : ''}> ${name}`;
    lab.querySelector('input').addEventListener('change', (e) => {
      if (e.target.checked) {
        if (selectedPlayers.size >= MAX_RADAR_PLAYERS) { e.target.checked = false; return; }
        selectedPlayers.add(name);
      } else {
        selectedPlayers.delete(name);
      }
      drawRadars();
    });
    picks.appendChild(lab);
  }
  card.appendChild(picks);

  const legend = document.createElement('div');
  legend.className = 'radarlegend';
  legend.id = 'radarLegend';
  card.appendChild(legend);

  const grid = document.createElement('div');
  grid.className = 'radargrid';
  clusters(p).forEach((ids, i) => {
    const item = document.createElement('div');
    item.className = 'radaritem';
    item.innerHTML = `<div class="radartitle">${clusterTitle(p, ids)}</div>` +
      `<div class="chartbox"><canvas id="pradar${i}"></canvas></div>`;
    grid.appendChild(item);
  });
  card.appendChild(grid);
  return card;
}

function axisMinMax(p, ids, slice = { phase: 'all', color: 'all' }) {
  const min = nMin(p);
  const stats = {};
  for (const id of ids) {
    const vals = Object.values(p.players)
      .map((d) => sliceValue(d, id, slice))
      .filter((s) => s.n >= min && s.mean != null)
      .map((s) => s.mean);
    stats[id] = { lo: Math.min(...vals), hi: Math.max(...vals) };
  }
  return stats;
}

// Normalize a value to 0..1 goodness (bad features inverted) given an axis range.
function goodnessFn(p, stats) {
  return (id, v) => {
    const s = stats[id];
    if (!s || s.hi === s.lo || v == null) return 0.5;
    const t = (v - s.lo) / (s.hi - s.lo);
    return p.meta[id]?.higher === 'bad' ? 1 - t : t;
  };
}

function drawRadars() {
  const p = current;
  radarCharts.forEach((c) => c.destroy());
  radarCharts = [];
  const slice = curSlice();
  const stats = axisMinMax(p, availableFeatures(p), slice);
  const goodness = goodnessFn(p, stats);
  const plotted = plottedPlayers(p);

  const leg = $('radarLegend');
  if (leg) {
    leg.innerHTML = plotted.map((n, i) =>
      `<span class="rchip"><span class="rdot" style="background:${PALETTE[i % PALETTE.length]}"></span>${n}</span>`
    ).join('') || '<span class="psub">select players above</span>';
  }

  clusters(p).forEach((ids, ci) => {
    const cv = $('pradar' + ci);
    if (!cv) return;
    const datasets = plotted.map((name, i) => {
      const color = PALETTE[i % PALETTE.length];
      const d = p.players[name];
      return {
        label: name,
        data: ids.map((id) => Math.round(goodness(id, sliceValue(d, id, slice).mean) * 100) / 100),
        borderColor: color, backgroundColor: color + '22', borderWidth: 1.5, pointRadius: 2,
      };
    });
    radarCharts.push(new window.Chart(cv, {
      type: 'radar',
      data: { labels: ids.map((id) => (p.meta[id] || {}).name || id), datasets },
      options: {
        responsive: true, maintainAspectRatio: false, animation: false,
        scales: { r: { min: 0, max: 1, ticks: { display: false }, pointLabels: { font: { size: 9 } } } },
        plugins: { legend: { display: false } },
      },
    }));
  });
}

// ---- feature × feature scatter ----------------------------------------------
function scatterCard(p) {
  const card = document.createElement('div');
  card.className = 'pcard scattercard';
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
  if (scatterChart) { scatterChart.destroy(); scatterChart = null; }
  const min = nMin(p);
  const slice = curSlice();
  const pts = playersByScore(p)
    .map(([name, d]) => ({ name, sx: sliceValue(d, scatterX, slice), sy: sliceValue(d, scatterY, slice) }))
    .filter((o) => o.sx.n >= min && o.sy.n >= min && o.sx.mean != null && o.sy.mean != null)
    .map((o) => ({ x: o.sx.mean, y: o.sy.mean, name: o.name }));
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

// ---- phase & colour card (trajectory / fingerprint / white-vs-black) --------
function phaseColourCard(p) {
  const card = document.createElement('div');
  card.className = 'pcard';
  const tabs = [['trajectory', 'Phase trajectory'], ['fingerprint', 'Phase fingerprint'], ['wvb', 'White vs Black']];
  const seg = tabs.map(([v, t]) => `<button class="seg-btn ${v === pcView ? 'on' : ''}" data-pc="${v}" type="button">${t}</button>`).join('');
  const playerOpts = playersByScore(p).map(([n]) => `<option value="${n}" ${n === fpPlayer ? 'selected' : ''}>${n}</option>`).join('');
  card.innerHTML = `<h3>Phase &amp; colour</h3>` +
    `<div class="pcontrols"><div class="seg">${seg}</div>` +
    `<label class="fpplayer">Player <select class="fpsel">${playerOpts}</select></label></div>` +
    `<div class="pchost" id="pcHost"></div>`;
  card.querySelectorAll('.seg-btn').forEach((b) => b.addEventListener('click', () => {
    if (b.dataset.pc === pcView) return;
    pcView = b.dataset.pc;
    card.querySelectorAll('.seg-btn').forEach((x) => x.classList.toggle('on', x.dataset.pc === pcView));
    drawPhaseColour();
  }));
  card.querySelector('.fpsel').addEventListener('change', (e) => { fpPlayer = e.target.value; drawPhaseColour(); });
  return card;
}

function drawPhaseColour() {
  pcCharts.forEach((c) => c.destroy());
  pcCharts = [];
  const host = $('pcHost');
  if (!host) return;
  if (pcView === 'trajectory') drawTrajectory(host);
  else if (pcView === 'fingerprint') drawFingerprint(host);
  else drawWvB(host);
}

function drawTrajectory(host) {
  const p = current;
  const min = nMin(p);
  const cname = (p.meta[featureId] || {}).name || featureId;
  const cside = colorFilter === 'all' ? 'both colours' : colorFilter === 'w' ? 'White' : 'Black';
  host.innerHTML = `<p class="psub"><b>${cname}</b> across phases — one line per selected radar player (${cside}). ` +
    `Click a matrix column to change the feature. Low-sample points are dropped.</p>` +
    `<div class="chartbox"><canvas id="pcTraj"></canvas></div>`;
  const plotted = plottedPlayers(p);
  const datasets = plotted.map((name, i) => {
    const color = PALETTE[i % PALETTE.length];
    const d = p.players[name];
    return {
      label: name, borderColor: color, backgroundColor: color + '22', borderWidth: 2, pointRadius: 3, spanGaps: false,
      data: PHASES.map((ph) => {
        const s = sliceValue(d, featureId, { phase: ph, color: colorFilter });
        return s.n >= min && s.mean != null ? s.mean : null;
      }),
    };
  });
  pcCharts.push(new window.Chart($('pcTraj'), {
    type: 'line',
    data: { labels: PHASES.map((ph) => PHASE_LABEL[ph]), datasets },
    options: {
      responsive: true, maintainAspectRatio: false, animation: false,
      plugins: { legend: { display: true, position: 'bottom', labels: { boxWidth: 10, font: { size: 10 } } } },
      scales: { y: { title: { display: true, text: cname } } },
    },
  }));
}

function drawFingerprint(host) {
  const p = current;
  const d = p.players[fpPlayer];
  const min = nMin(p);
  const feats = availableFeatures(p);
  const goodness = goodnessFn(p, axisMinMax(p, feats, { phase: 'all', color: 'all' }));
  let body = '';
  for (const id of feats) {
    const nm = (p.meta[id] || {}).name || id;
    body += `<tr><th class="mx-name" title="${nm}">${nm}</th>`;
    for (const ph of PHASES) {
      const s = sliceValue(d, id, { phase: ph, color: colorFilter });
      const low = s.mean == null || s.n < min;
      const g = low ? null : goodness(id, s.mean);
      body += `<td class="mx-cell${low ? ' low' : ''}" style="${g == null ? '' : `background:${cellColor(g)}`}">${low ? '—' : fmt(s.mean)}</td>`;
    }
    body += '</tr>';
  }
  host.innerHTML = `<p class="psub"><b>${fpPlayer}</b> — value per phase ` +
    `(${colorFilter === 'all' ? 'both colours' : colorFilter === 'w' ? 'White' : 'Black'}; ` +
    `colour = standing vs the field, — = too few games)</p>` +
    `<div class="matrix-wrap"><table class="matrix"><thead><tr><th class="mx-name">Feature</th>` +
    `${PHASES.map((ph) => `<th class="mx-h">${PHASE_LABEL[ph]}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table></div>`;
}

function drawWvB(host) {
  const p = current;
  const d = p.players[fpPlayer];
  const goodness = goodnessFn(p, axisMinMax(p, availableFeatures(p), { phase: 'all', color: 'all' }));
  const cls = clusters(p);
  host.innerHTML = `<p class="psub"><b>${fpPlayer}</b> — White vs Black profile (outward = better; the gap is colour asymmetry)</p>` +
    `<div class="radarlegend"><span class="rchip"><span class="rdot" style="background:${PALETTE[1]}"></span>White</span>` +
    `<span class="rchip"><span class="rdot" style="background:${PALETTE[0]}"></span>Black</span></div>` +
    `<div class="radargrid">${cls.map((ids, i) =>
      `<div class="radaritem"><div class="radartitle">${clusterTitle(p, ids)}</div>` +
      `<div class="chartbox"><canvas id="pcWvb${i}"></canvas></div></div>`).join('')}</div>`;
  cls.forEach((ids, i) => {
    const mk = (key) => ids.map((id) =>
      Math.round(goodness(id, key === 'w' ? d?.rollups?.[id]?.mean_white : d?.rollups?.[id]?.mean_black) * 100) / 100);
    pcCharts.push(new window.Chart($('pcWvb' + i), {
      type: 'radar',
      data: {
        labels: ids.map((id) => (p.meta[id] || {}).name || id),
        datasets: [
          { label: 'White', data: mk('w'), borderColor: PALETTE[1], backgroundColor: PALETTE[1] + '22', borderWidth: 1.5, pointRadius: 2 },
          { label: 'Black', data: mk('b'), borderColor: PALETTE[0], backgroundColor: PALETTE[0] + '22', borderWidth: 1.5, pointRadius: 2 },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false, animation: false,
        scales: { r: { min: 0, max: 1, ticks: { display: false }, pointLabels: { font: { size: 9 } } } },
        plugins: { legend: { display: false } },
      },
    }));
  });
}

// ---- what wins — feature ↔ result correlation -------------------------------
function correlationCard(p) {
  const card = document.createElement('div');
  card.className = 'pcard';
  card.innerHTML = `<h3>What wins — feature ↔ result</h3>` +
    `<p class="psub">Correlation of each feature with the game result (win 1 · draw 0.5 · loss 0) across every game. ` +
    `+ means more of it goes with winning. Pooled across players — a field-level signal, not proof of cause. ` +
    `Follows the phase filter.</p>` +
    `<div class="chartbox" id="pcCorrBox"><canvas id="pcCorr"></canvas></div>`;
  return card;
}

function drawCorrelation() {
  if (corrChart) { corrChart.destroy(); corrChart = null; }
  const p = current;
  const host = $('pcCorr');
  if (!host || !p.result_correlation) return;
  const ph = phaseFilter;
  const rows = [];
  for (const id of availableFeatures(p)) {
    const rc = p.result_correlation[id];
    if (!rc) continue;
    const r = ph === 'all' ? rc.r : rc.phases?.[ph]?.r;
    if (r == null) continue;
    rows.push([id, r]);
  }
  rows.sort((a, b) => b[1] - a[1]);
  const box = $('pcCorrBox');
  if (box) box.style.height = Math.max(160, rows.length * 16 + 46) + 'px';
  corrChart = new window.Chart(host, {
    type: 'bar',
    data: {
      labels: rows.map(([id]) => (p.meta[id] || {}).name || id),
      datasets: [{ data: rows.map(([, r]) => Math.round(r * 1000) / 1000), backgroundColor: rows.map(([, r]) => (r >= 0 ? '#0F6E56' : '#9A3B2E')) }],
    },
    options: {
      indexAxis: 'y', responsive: true, maintainAspectRatio: false, animation: false,
      scales: {
        x: { min: -1, max: 1, title: { display: true, text: `Pearson r with result${ph === 'all' ? '' : ' · ' + PHASE_LABEL[ph]}` } },
        y: { ticks: { font: { size: 9 } } },
      },
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => `r = ${fmt(c.raw)}` } } },
    },
  });
}
