// Tournament profiles view: cross-player leaderboards for a tournament.
//
// Consumes the precomputed web/data/profiles/<slug>.json (built by
// scripts/build_profiles.py). "Who is most X" = pick feature X → players ranked.
// Leaderboards are pre-sorted server-side (by each feature's `higher` direction); this
// module just renders bars + an n / CI badge, greys sub-min-n entries, and disables
// features whose data the tournament lacks (e.g. clocks). MVP: leaderboard + player
// table; radar/scatter/drill-through come later.

import { CATEGORY_LABEL, ORDER } from './catalog.js';

const $ = (id) => document.getElementById(id);
let current = null; // loaded profile doc
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

function orderedFeatureIds(p) {
  const present = new Set(Object.keys(p.leaderboards));
  const seen = new Set();
  const ids = [];
  for (const id of ORDER) if (present.has(id)) { ids.push(id); seen.add(id); }
  for (const id of Object.keys(p.leaderboards)) if (!seen.has(id)) ids.push(id);
  return ids;
}

function pickDefault(p) {
  if (p.leaderboards['SPC.space']?.available) return 'SPC.space';
  return orderedFeatureIds(p).find((id) => p.leaderboards[id].available) || orderedFeatureIds(p)[0];
}

function render() {
  const p = current;
  const root = $('profilesRoot');
  root.innerHTML = '';

  const head = document.createElement('div');
  head.className = 'phead';
  head.innerHTML = `<h2>${p.label} — player profiles</h2>` +
    `<span class="psub">${Object.keys(p.players).length} players · rank by</span>`;
  head.appendChild(featureSelect(p));
  root.appendChild(head);

  root.appendChild(leaderboard(p, featureId));
  root.appendChild(playerTable(p));
}

function featureSelect(p) {
  const sel = document.createElement('select');
  sel.className = 'featpick';
  let cat = null;
  let group = null;
  for (const id of orderedFeatureIds(p)) {
    const m = p.meta[id] || { name: id, category: '' };
    if (m.category !== cat) {
      group = document.createElement('optgroup');
      group.label = CATEGORY_LABEL[m.category] || m.category;
      sel.appendChild(group);
      cat = m.category;
    }
    const o = document.createElement('option');
    o.value = id;
    const avail = p.leaderboards[id].available;
    o.textContent = m.name + (avail ? '' : ' — no data');
    o.disabled = !avail;
    if (id === featureId) o.selected = true;
    group.appendChild(o);
  }
  sel.addEventListener('change', (e) => { featureId = e.target.value; render(); });
  return sel;
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
  const vals = board.entries.map((e) => Math.abs(e[1] || 0));
  const max = Math.max(1e-9, ...vals);
  const dirNote = board.higher === 'good' ? 'higher is better'
    : board.higher === 'bad' ? 'lower is better' : 'neutral';
  wrap.innerHTML = `<div class="lbhead"><b>${m.name}</b> <span class="psub">${dirNote}</span></div>`;
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

function playerTable(p) {
  const wrap = document.createElement('div');
  wrap.className = 'ptable';
  const rows = Object.entries(p.players)
    .sort((a, b) => b[1].score - a[1].score)
    .map(([name, d]) => {
      const perf = d.performance_elo != null ? d.performance_elo : '–';
      return `<tr><td class="pt-name">${name}</td><td>${fmt(d.score)}/${d.games}</td>` +
        `<td>${d.wins}–${d.draws}–${d.losses}</td><td>${perf}</td></tr>`;
    })
    .join('');
  wrap.innerHTML =
    '<h3>Standings</h3><table class="ptab"><thead><tr><th class="pt-name">Player</th>' +
    '<th>Score</th><th>W–D–L</th><th>Perf</th></tr></thead><tbody>' + rows + '</tbody></table>';
  return wrap;
}
