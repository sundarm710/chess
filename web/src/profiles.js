// Tournament profiles view: an at-a-glance overview matrix (players × features) plus
// a focused single-feature leaderboard.
//
// Consumes the precomputed web/data/profiles/<slug>.json (scripts/build_profiles.py).
// The matrix colour-codes each cell by where the player ranks within that feature's
// column (green = good, red = bad, respecting the feature's `higher`), so you scan the
// whole field across all features at once. Click a column header to drill into that
// feature's ranked leaderboard below. Capability-gated (clockless tournaments omit
// clock columns); min-n players are shown faint and excluded from the colour scale.

import { CATEGORY_LABEL, ORDER } from './catalog.js';

const $ = (id) => document.getElementById(id);
let current = null;
let featureId = null;

const fmt = (x) => (x == null ? '–' : Number.isInteger(x) ? String(x) : String(Math.round(x * 100) / 100));

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
  featureId = pickDefault(current);
  render();
}

function availableFeatures(p) {
  const present = new Set(Object.keys(p.leaderboards));
  const seen = new Set();
  const ids = [];
  for (const id of ORDER) if (present.has(id) && p.leaderboards[id].available) { ids.push(id); seen.add(id); }
  for (const id of Object.keys(p.leaderboards)) {
    if (!seen.has(id) && p.leaderboards[id].available) ids.push(id);
  }
  return ids;
}

function pickDefault(p) {
  const avail = availableFeatures(p);
  return avail.includes('SPC.space') ? 'SPC.space' : avail[0];
}

function playersByScore(p) {
  return Object.entries(p.players).sort((a, b) => b[1].score - a[1].score);
}

// goodness in [0,1] (1 = best for this feature) → a red→pale→green cell background.
function cellColor(goodness) {
  const hue = goodness * 120; // 0 red … 120 green
  const light = 91 - Math.abs(goodness - 0.5) * 14;
  return `hsl(${hue}, 55%, ${light}%)`;
}

function render() {
  const p = current;
  const root = $('profilesRoot');
  root.innerHTML = '';

  const head = document.createElement('div');
  head.className = 'phead';
  head.innerHTML = `<h2>${p.label}</h2><span class="psub">${Object.keys(p.players).length} players · ` +
    `${availableFeatures(p).length} features · click a column to rank by it</span>`;
  root.appendChild(head);

  root.appendChild(matrix(p));

  const focus = document.createElement('div');
  focus.className = 'focuswrap';
  focus.appendChild(leaderboard(p, featureId));
  root.appendChild(focus);
}

function matrix(p) {
  const wrap = document.createElement('div');
  wrap.className = 'matrix-wrap';
  const feats = availableFeatures(p);
  const players = playersByScore(p);
  const nMin = p.n_min || 3;

  // Leading result columns + one column per available feature.
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

  // Per-column min/max over qualified values (for the colour scale).
  for (const c of cols) {
    const vals = players
      .filter(([, d]) => !c.feature || (c.n(d) >= nMin))
      .map(([, d]) => c.get(d))
      .filter((v) => v != null);
    c.min = Math.min(...vals);
    c.max = Math.max(...vals);
  }

  const goodness = (c, v) => {
    if (v == null || c.higher === 'neutral' || c.max === c.min) return null;
    const t = (v - c.min) / (c.max - c.min);
    return c.higher === 'bad' ? 1 - t : t;
  };

  // Mark the first feature column of each category (for a vertical separator).
  let prevCat = null;
  for (const c of cols) {
    if (c.feature) { c.catstart = c.cat !== prevCat; prevCat = c.cat; }
  }
  const cls = (c) =>
    (c.feature ? 'mx-h' : 'mx-res') + (c.id === featureId ? ' sel' : '') + (c.catstart ? ' catstart' : '');

  const header = cols.map((c) =>
    `<th class="${cls(c)}" data-id="${c.id}" title="${c.feature ? CATEGORY_LABEL[c.cat] + ' · ' : ''}${c.label}">${c.label}</th>`
  ).join('');

  let body = '';
  for (const [name, d] of players) {
    body += `<tr><th class="mx-name" title="${name}">${name}</th>`;
    for (const c of cols) {
      const v = c.get(d);
      const low = c.feature && c.n(d) < nMin;
      const g = goodness(c, v);
      const bg = g == null ? '' : `background:${cellColor(g)}`;
      body += `<td class="mx-cell${low ? ' low' : ''}${c.catstart ? ' catstart' : ''}" style="${bg}">${fmt(v)}</td>`;
    }
    body += '</tr>';
  }

  wrap.innerHTML =
    `<table class="matrix"><thead><tr>` +
    `<th class="mx-name">Player</th>${header}</tr></thead><tbody>${body}</tbody></table>`;

  // Click a feature column header → focus that feature (without rebuilding the matrix,
  // so the horizontal scroll position is preserved).
  wrap.querySelectorAll('th.mx-h').forEach((th) => {
    th.addEventListener('click', () => focusFeature(th.dataset.id));
  });
  return wrap;
}

// Re-point the focus leaderboard at a feature, updating only the header highlight and
// the leaderboard element — the matrix DOM (and its scroll) stays put.
function focusFeature(id) {
  featureId = id;
  const root = $('profilesRoot');
  root.querySelectorAll('.matrix th.mx-h.sel').forEach((th) => th.classList.remove('sel'));
  const th = root.querySelector(`.matrix th.mx-h[data-id="${id}"]`);
  if (th) th.classList.add('sel');
  const old = root.querySelector('.lboard');
  if (old) old.replaceWith(leaderboard(current, id));
}

function leaderboard(p, id) {
  const wrap = document.createElement('div');
  wrap.className = 'lboard';
  const board = p.leaderboards[id];
  const m = p.meta[id] || { name: id };
  if (!board || !board.available) {
    wrap.innerHTML = `<p class="perr">“${m.name}” needs data this tournament doesn't have.</p>`;
    return wrap;
  }
  const nMin = p.n_min || 3;
  const max = Math.max(1e-9, ...board.entries.map((e) => Math.abs(e[1] || 0)));
  const dir = board.higher === 'good' ? 'higher is better' : board.higher === 'bad' ? 'lower is better' : 'neutral';
  wrap.innerHTML = `<div class="lbhead"><b>${m.name}</b> <span class="psub">${dir} · click a matrix column to change</span></div>`;
  for (const [name, value, n] of board.entries) {
    const ci = p.players[name]?.rollups?.[id]?.ci;
    const pct = Math.max(2, (Math.abs(value || 0) / max) * 100);
    const row = document.createElement('div');
    row.className = 'lbrow' + (n < nMin ? ' lowsample' : '');
    row.innerHTML =
      `<span class="lbname" title="${name}">${name}</span>` +
      `<span class="lbbar"><span class="lbfill" style="width:${pct}%"></span></span>` +
      `<span class="lbval">${fmt(value)}${ci != null ? ` <span class="lbci">±${fmt(ci)}</span>` : ''}` +
      `<span class="lbn">n=${n}</span></span>`;
    wrap.appendChild(row);
  }
  return wrap;
}
