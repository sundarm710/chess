// Renders the registry-driven feature list and the "why did this change?" panel.
// Source-agnostic (quick or backend): it reads an indexed ply (byId), the manifest
// (meta), and UI state. Columns are fixed-width so values don't jump as deltas come
// and go; the last column shows which side each feature favours.

import { CATEGORY_LABEL, HIGHER, ORDER } from './catalog.js';

const SIDE_LABEL = { w: 'White', b: 'Black', shared: 'Both' };

// Direction (good/bad/neutral): JS map for board features; manifest `higher` for
// backend-only ones; neutral otherwise.
const dirOf = (id, meta) => HIGHER[id] || (meta[id] && meta[id].higher) || 'neutral';

// Up to 2 decimals, trailing zeros stripped; integers stay integers.
function fmtNum(x) {
  if (x === null || x === undefined) return '';
  if (Number.isInteger(x)) return String(x);
  return String(Math.round(x * 100) / 100);
}

function fmtValue(id, fr) {
  if (!fr || fr.value === null || fr.value === undefined) return '–';
  if (id === 'KSF.castle') return fr.value ? 'yes' : 'no';
  return fmtNum(fr.value);
}

function deltaClass(delta, higher) {
  const up = delta > 0;
  if (higher === 'good') return up ? 'pos' : 'neg';
  if (higher === 'bad') return up ? 'neg' : 'pos';
  return 'neu';
}

// A fixed-width delta slot — always present (empty when no change) so the value
// column never shifts.
function deltaSlot(fr, higher) {
  let inner = '';
  let cls = 'neu';
  if (fr && fr.delta != null && fr.delta !== 0) {
    cls = deltaClass(fr.delta, higher);
    inner = (fr.delta > 0 ? '▲' : '▼') + fmtNum(Math.abs(fr.delta));
  }
  return `<span class="dlt ${cls}">${inner}</span>`;
}

function valCell(id, fr, higher) {
  return `<td class="val"><span class="num">${fmtValue(id, fr)}</span>${deltaSlot(fr, higher)}</td>`;
}

// Which side a feature favours (null = even / not applicable).
function winner(higher, w, b) {
  if (!w || !b || higher === 'neutral') return null;
  if (w.value === b.value || w.value == null || b.value == null) return null;
  if (higher === 'good') return w.value > b.value ? 'w' : 'b';
  if (higher === 'bad') return w.value < b.value ? 'w' : 'b';
  return null;
}

function cmpCell(side) {
  if (side === 'w') return '<td class="cmp cmp-w" title="favours White">◀</td>';
  if (side === 'b') return '<td class="cmp cmp-b" title="favours Black">▶</td>';
  return '<td class="cmp cmp-x">·</td>';
}

// Feature ids in display order: ORDER first (filtered to what's present), then any
// remaining manifest ids appended.
function orderedIds(meta) {
  const present = new Set(Object.keys(meta));
  const seen = new Set();
  const ids = [];
  for (const id of ORDER) if (present.has(id)) { ids.push(id); seen.add(id); }
  for (const id of Object.keys(meta)) if (!seen.has(id)) ids.push(id);
  return ids;
}

function groupByCategory(meta) {
  const order = [];
  const groups = {};
  for (const id of orderedIds(meta)) {
    const cat = meta[id].category;
    if (!groups[cat]) { groups[cat] = []; order.push(cat); }
    groups[cat].push(id);
  }
  return order.map((cat) => [cat, groups[cat]]);
}

/** Render the list; returns the favour tally {w, b} for the summary. */
export function renderFeatureList(tbody, byId, meta, state, onSelect) {
  tbody.innerHTML = '';
  const tally = { w: 0, b: 0 };
  for (const [cat, ids] of groupByCategory(meta)) {
    const hdr = document.createElement('tr');
    hdr.className = 'cat';
    hdr.innerHTML = `<td colspan="4">${CATEGORY_LABEL[cat] || cat}</td>`;
    tbody.appendChild(hdr);
    for (const id of ids) {
      const m = meta[id];
      const higher = dirOf(id, meta);
      const rows = byId[id] || {};
      const tr = document.createElement('tr');
      tr.className = 'frow' + (state.selectedId === id ? ' sel' : '');
      let cells;
      if (rows.shared) {
        cells =
          `<td class="val shared" colspan="2"><span class="num">${fmtValue(id, rows.shared)}</span>` +
          `${deltaSlot(rows.shared, higher)}</td>` + cmpCell(null);
      } else {
        const win = winner(higher, rows.w, rows.b);
        if (win === 'w') tally.w++;
        else if (win === 'b') tally.b++;
        cells = valCell(id, rows.w, higher) + valCell(id, rows.b, higher) + cmpCell(win);
      }
      tr.innerHTML = `<td class="feat">${m.name}</td>${cells}`;
      tr.addEventListener('click', () => onSelect(id));
      tbody.appendChild(tr);
    }
  }
  return tally;
}

// "Why it changed" — generated from value + delta (works in both modes).
function whyNote(name, side, fr, higher) {
  if (!fr || fr.delta == null) return ''; // first ply: no transition
  const prev = fr.value - fr.delta;
  const sign = fr.delta >= 0 ? '+' : '';
  const tech = `<span class="tech">${fmtNum(prev)}→${fmtNum(fr.value)} (Δ${sign}${fmtNum(fr.delta)})</span>`;
  if (fr.delta === 0) return tech; // show the transition even when unchanged
  const who = side === 'shared' ? 'Board' : `${SIDE_LABEL[side]}’s ${name.toLowerCase()}`;
  const dir = fr.delta > 0 ? 'rose' : 'fell';
  let tail = '.';
  if (higher === 'good') tail = fr.delta > 0 ? ' — an improvement.' : ' — a step back.';
  else if (higher === 'bad') tail = fr.delta > 0 ? ' — a warning sign.' : ' — relief.';
  return `${who} ${dir} by ${fmtNum(Math.abs(fr.delta))}${tail} ${tech}`;
}

export function renderExplain(panel, byId, meta, state) {
  const id = state.selectedId;
  const m = meta[id];
  if (!m) {
    panel.innerHTML = '<span class="exhint">Select a feature to see what it means and why it moved.</span>';
    return;
  }
  const higher = dirOf(id, meta);
  const rows = byId[id] || {};
  const sides = rows.shared ? ['shared'] : ['w', 'b'];

  let vals = '';
  let notes = '';
  let unavailable = false;
  for (const side of sides) {
    const fr = rows[side];
    if (!fr) continue;
    if (fr.status && fr.status !== 'ok') unavailable = true;
    vals +=
      `<div class="evside ${side}"><span class="evlbl">${SIDE_LABEL[side]}</span>` +
      `<span class="evval">${fmtValue(id, fr)}</span>${deltaSlot(fr, higher)}</div>`;
    const note = whyNote(m.name, side, fr, higher);
    if (note) notes += `<li>${note}</li>`;
  }

  panel.innerHTML =
    `<div class="exhead"><span class="exname">${m.name}</span>` +
    `<span class="tier t${m.tier}">${m.tier}</span>` +
    `<span class="excat">${CATEGORY_LABEL[m.category] || m.category}</span></div>` +
    `<p class="exdesc">${m.description}</p>` +
    `<p class="exdesc tech">${m.computation}</p>` +
    `<div class="exvals">${vals}</div>` +
    (notes ? `<div class="exwhy"><div class="exwhy-h">Why it changed this move</div><ul>${notes}</ul></div>` : '') +
    (unavailable ? '<p class="exna">Needs eval/clock data — not available for this game.</p>' : '');
}
