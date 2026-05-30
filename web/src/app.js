// Interactive stepper UI (CLAUDE.md §3). Feature math lives in engine.js; PGN
// handling in parser.js; per-ply analysis in analysis.js (quick) or the backend
// (api.js) — both share one render path. This module is the view/controller.

import { Board, FeatureEngine } from './engine.js';
import { PgnParser } from './parser.js';
import { PIECE_SVG } from './pieces.js';
import { buildAnalysis, indexPly } from './analysis.js';
// plyIndex: per-ply {id -> {side -> result}} for O(1) lookup by list, chart, panel.
import { highlightsFor } from './highlights.js';
import { renderFeatureList, renderExplain } from './explain.js';
import { analyzeGame } from './api.js';
import { loadProfiles } from './profiles.js';

const engine = new FeatureEngine();

/* ---------- state ---------- */
const S = {
  boards: [],
  feats: [],
  moves: [], // normalized: {san, mover, from, to}
  analysis: null, // {meta, plies}
  plyIndex: [], // analysis.plies.map(indexPly)
  ply: 0,
  name: { w: 'White', b: 'Black' },
  selectedId: 'MAT.hanging',
  view: 'game', // 'game' | 'profiles'
  index: [], // [{slug, label, ...}] from web/data/library.json
  tournaments: {}, // slug -> {games:[...]} (lazy-fetched, cached)
  byId: {}, // game id -> game record (across loaded tournaments)
  backend: true, // analyze via the Python backend by default
  backendUrl: 'http://localhost:8001',
  lastLoad: null, // {pgn, wn, bn}
};
let chart = null;

const $ = (id) => document.getElementById(id);

/* ---------- loading ---------- */
function buildFromFens(fens, moves) {
  S.boards = fens.map((f) => Board.fromFen(f));
  S.feats = S.boards.map((b) => engine.features(b));
  S.moves = moves;
}

function loadQuick(pgn, wn, bn) {
  const parser = new PgnParser();
  const { moves, fens } = parser.parse(pgn);
  const norm = moves.map((m) => ({
    san: m.san, mover: m.color, from: m.from, to: m.to,
    uci: m.from + m.to + (m.promotion || ''),
  }));
  buildFromFens(fens, norm);
  S.analysis = buildAnalysis({ fens, boards: S.boards, feats: S.feats, moves: norm });
  finishLoad(wn, bn);
}

async function loadBackend(pgn, wn, bn) {
  const analysis = await analyzeGame(S.backendUrl, pgn);
  const fens = analysis.plies.map((p) => p.fen);
  const norm = analysis.plies.slice(1).map((p) => ({
    san: p.san, mover: p.mover,
    from: p.uci ? p.uci.slice(0, 2) : null,
    to: p.uci ? p.uci.slice(2, 4) : null,
  }));
  buildFromFens(fens, norm);
  S.analysis = analysis;
  finishLoad(wn, bn);
}

function finishLoad(wn, bn) {
  S.plyIndex = S.analysis.plies.map(indexPly);
  S.ply = 0;
  S.name = { w: wn, b: bn };
  $('wName').textContent = wn;
  $('bName').textContent = bn;
  if (!chart) buildChart();
  render();
}

// ---- games library (two-level filter: tournament · section → round/game) ----
const fmtName = (name, elo) => (elo ? `${name} (${elo})` : name);
const opt = (val, text) => {
  const o = document.createElement('option');
  o.value = val;
  o.textContent = text;
  return o;
};

// Fetch the index and populate the tournament filter (+ a custom-PGN option).
async function loadIndex() {
  const resp = await fetch('./data/library.json');
  if (!resp.ok) throw new Error('library index not found');
  S.index = (await resp.json()).tournaments;
  const sel = $('tournamentSel');
  sel.innerHTML = '';
  for (const t of S.index) sel.appendChild(opt(t.slug, t.label));
  sel.appendChild(opt('custom', 'Custom PGN…'));
}

// Lazy-fetch one tournament's games (cached), index them by id.
async function loadTournament(slug) {
  if (!S.tournaments[slug]) {
    const resp = await fetch(`./data/t/${slug}.json`);
    if (!resp.ok) throw new Error(`tournament ${slug} not found`);
    const doc = await resp.json();
    S.tournaments[slug] = doc;
    for (const g of doc.games) S.byId[g.id] = g;
  }
  return S.tournaments[slug];
}

// Populate the round/game filter for a tournament, grouped by round.
function buildGameSelect(doc) {
  const sel = $('gameSel');
  sel.innerHTML = '';
  let round = null;
  let group = null;
  for (const g of doc.games) {
    if (g.round !== round) {
      group = document.createElement('optgroup');
      group.label = `Round ${g.round}`;
      sel.appendChild(group);
      round = g.round;
    }
    group.appendChild(opt(g.id, g.label));
  }
}

// Tournament filter changed: custom → paste box; otherwise load games + the first one.
async function selectTournament(slug, gameId) {
  if (slug === 'custom') {
    $('pgnbox').style.display = 'block';
    $('gameSel').disabled = true;
    return;
  }
  $('pgnbox').style.display = 'none';
  $('gameSel').disabled = false;
  try {
    const doc = await loadTournament(slug);
    buildGameSelect(doc);
    const target = gameId && S.byId[gameId] ? gameId : doc.games[0]?.id;
    if (target) {
      $('gameSel').value = target;
      await loadGameById(target);
    }
  } catch (e) {
    $('err').textContent = e.message || String(e);
  }
}

function loadGameById(id) {
  const g = S.byId[id];
  if (!g) return;
  return loadGame(g.pgn, fmtName(g.white, g.welo), fmtName(g.black, g.belo));
}

// Switch between the game stepper and the tournament-profiles view.
function setView(view) {
  S.view = view;
  const profiles = view === 'profiles';
  document.querySelector('.dash').style.display = profiles ? 'none' : '';
  $('profilesRoot').style.display = profiles ? 'block' : 'none';
  $('gameSel').style.display = profiles ? 'none' : '';
  $('loadBtn').style.display = profiles ? 'none' : '';
  if (!profiles) $('pgnbox').style.display = 'none';
  for (const b of $('viewTabs').querySelectorAll('[data-view]')) {
    b.classList.toggle('on', b.dataset.view === view);
  }
  if (profiles) loadProfiles($('tournamentSel').value);
}

async function loadGame(pgn, wn, bn) {
  const err = $('err');
  err.textContent = '';
  S.lastLoad = { pgn, wn, bn };
  if (S.backend) {
    try {
      await loadBackend(pgn, wn, bn);
      return;
    } catch (e) {
      // Backend unreachable/failed — fall back to the offline engine, with a note.
      err.textContent = 'Backend unreachable — showing offline analysis. (' + (e.message || e) + ')';
    }
  }
  try {
    loadQuick(pgn, wn, bn);
  } catch (e) {
    err.textContent = e.message || String(e);
  }
}

/* ---------- board ---------- */
function renderBoard() {
  const board = S.boards[S.ply];
  const el = $('board');
  el.innerHTML = '';
  const mv = S.ply > 0 ? S.moves[S.ply - 1] : null;
  const hl = highlightsFor(board, S.selectedId);
  const hlSet = new Set(hl.squares);
  for (let ri = 0; ri < 8; ri++) {
    const rank = 7 - ri;
    for (let ci = 0; ci < 8; ci++) {
      const file = ci;
      const sqName = 'abcdefgh'[file] + (rank + 1);
      const dark = (file + rank) % 2 === 0;
      const d = document.createElement('div');
      d.className = 'sq ' + (dark ? 'd' : 'l');
      if (mv && (sqName === mv.from || sqName === mv.to)) d.classList.add('mv');
      if (hlSet.has(sqName)) d.classList.add('fx-' + hl.kind);
      const p = board.pieceAt(file, rank);
      if (p) {
        const s = document.createElement('span');
        s.className = 'pc';
        s.innerHTML = PIECE_SVG[p.color + p.type];
        d.appendChild(s);
      }
      el.appendChild(d);
    }
  }
}

function moveLabel(ply) {
  if (ply === 0) return 'starting position';
  const m = S.moves[ply - 1];
  const num = Math.ceil(ply / 2);
  return num + (ply % 2 === 1 ? '. ' : '… ') + m.san;
}

function renderChip() {
  const chip = $('chip');
  if (S.ply === 0) {
    chip.innerHTML = '<span style="color:var(--ink2)">Starting position — step forward to begin.</span>';
    return;
  }
  const m = S.moves[S.ply - 1];
  const mover = S.ply % 2 === 1 ? 'w' : 'b';
  const side = mover === 'w' ? 'White' : 'Black';
  const cls = mover === 'w' ? 'colw' : 'colb';
  let tags = '';
  const san = m.san;
  if (san.includes('x')) tags += '<span class="tag cap">capture</span>';
  if (san.includes('#')) tags += '<span class="tag chk">checkmate</span>';
  else if (san.includes('+')) tags += '<span class="tag chk">check</span>';
  if (san.startsWith('O-O')) tags += '<span class="tag cas">castles</span>';
  const before = S.feats[S.ply - 1][mover].hang_val;
  const after = S.feats[S.ply][mover].hang_val;
  if (after > before) tags += '<span class="tag exp">left en prise +' + (after - before) + '</span>';
  if (S.ply <= 20) {
    const db = S.feats[S.ply - 1][mover].dev;
    const da = S.feats[S.ply][mover].dev;
    if (da > db) tags += '<span class="tag dev">develops</span>';
  }
  if (!tags) tags = '<span style="color:var(--ink2)">quiet move</span>';
  chip.innerHTML = '<span class="' + cls + '" style="font-weight:600">' + side + ': ' + san + '</span>' + tags;
}

/* ---------- feature list + explanation ---------- */
function onSelectFeature(id) {
  S.selectedId = id;
  renderBoard();
  renderPanel();
  renderChart();
}

function renderPanel() {
  if (!S.analysis) return;
  const byId = S.plyIndex[S.ply];
  const meta = S.analysis.meta;
  $('ptag').textContent = 'after move ' + S.ply + ' — ' + moveLabel(S.ply);
  const tally = renderFeatureList($('ftbody'), byId, meta, S, onSelectFeature);
  $('favSummary').innerHTML =
    `<span class="favw">◀ ${tally.w}</span><span class="favb">${tally.b} ▶</span>`;
  renderExplain($('explain'), byId, meta, S);
}

/* ---------- chart (unchanged data source: S.feats) ---------- */
function buildChart() {
  const ctx = $('chart');
  chart = new window.Chart(ctx, {
    type: 'line',
    data: {
      labels: [],
      datasets: [
        { label: 'White', data: [], borderColor: '#9A3B2E', backgroundColor: '#9A3B2E', borderWidth: 2, pointRadius: 0, tension: 0.25 },
        { label: 'Black', data: [], borderColor: '#1F5673', backgroundColor: '#1F5673', borderWidth: 2, borderDash: [5, 4], pointRadius: 0, tension: 0.25 },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false, animation: false,
      plugins: { legend: { display: false }, tooltip: { enabled: true } },
      scales: {
        x: { title: { display: true, text: 'ply' }, grid: { display: false }, ticks: { maxTicksLimit: 10, color: '#5C5345' } },
        y: { beginAtZero: true, grid: { color: '#e3dccb' }, ticks: { color: '#5C5345' } },
      },
    },
  });
}
// The trend chart plots whatever feature is currently selected in the list.
function renderChart() {
  if (!S.analysis) return;
  const id = S.selectedId;
  const meta = S.analysis.meta[id];
  const upto = S.ply;
  const labels = [];
  for (let i = 0; i <= upto; i++) labels.push(i);
  $('trendPly').textContent = upto;
  $('chartFeat').textContent = meta ? meta.name : id;
  const val = (i, side) => {
    const r = S.plyIndex[i][id] && S.plyIndex[i][id][side];
    return r ? r.value : null;
  };
  const shared = S.plyIndex[0][id] && S.plyIndex[0][id].shared !== undefined;
  const legend = $('legend');
  if (shared) {
    legend.style.visibility = 'hidden';
    chart.data.labels = labels;
    chart.data.datasets[0].data = labels.map((i) => val(i, 'shared'));
    chart.data.datasets[0].label = meta ? meta.name : id;
    chart.data.datasets[0].borderColor = chart.data.datasets[0].backgroundColor = '#5C5345';
    chart.data.datasets[0].borderDash = [];
    chart.data.datasets[1].data = [];
  } else {
    legend.style.visibility = 'visible';
    chart.data.labels = labels;
    chart.data.datasets[0].data = labels.map((i) => val(i, 'w'));
    chart.data.datasets[1].data = labels.map((i) => val(i, 'b'));
    chart.data.datasets[0].label = 'White';
    chart.data.datasets[1].label = 'Black';
    chart.data.datasets[0].borderColor = chart.data.datasets[0].backgroundColor = '#9A3B2E';
    chart.data.datasets[1].borderColor = chart.data.datasets[1].backgroundColor = '#1F5673';
    chart.data.datasets[0].borderDash = [];
    chart.data.datasets[1].borderDash = [5, 4];
  }
  chart.update();
}

/* ---------- aggregates (unchanged) ---------- */
function renderAgg() {
  const upto = S.ply;
  const agg = { w: { exp: 0, spSum: 0, spN: 0, def: 0 }, b: { exp: 0, spSum: 0, spN: 0, def: 0 } };
  for (let i = 1; i <= upto; i++) {
    const mover = i % 2 === 1 ? 'w' : 'b';
    if (S.feats[i][mover].hang_val > S.feats[i - 1][mover].hang_val) agg[mover].exp++;
    agg[mover].spSum += S.feats[i][mover].space;
    agg[mover].spN++;
    for (const c of ['w', 'b']) {
      const d = S.feats[i][c === 'w' ? 'b' : 'w'].mat - S.feats[i][c].mat;
      if (d > agg[c].def) agg[c].def = d;
    }
  }
  const avg = (o) => (o.spN ? (o.spSum / o.spN).toFixed(1) : '0');
  $('aWexp').textContent = agg.w.exp;
  $('aBexp').textContent = agg.b.exp;
  $('aWsp').textContent = avg(agg.w);
  $('aBsp').textContent = avg(agg.b);
  $('aWdef').textContent = agg.w.def;
  $('aBdef').textContent = agg.b.def;
  const read = $('read');
  if (upto === 0) {
    read.textContent = 'Step through the game to accumulate the comparison.';
    return;
  }
  const diff = S.feats[upto].w.mat - S.feats[upto].b.mat;
  const bigW = agg.w.def >= 4;
  const bigB = agg.b.def >= 4;
  let msg;
  if (bigB && diff >= 3) {
    msg = 'Black was down as much as ' + agg.b.def + ' and is still ' + diff + ' behind — material that left and never came back. That permanent cliff is the signature of a club blunder.';
  } else if (bigW && diff <= -3) {
    msg = 'White was down as much as ' + agg.w.def + ' and is still ' + -diff + ' behind — a clean, lasting material loss.';
  } else if (bigW && diff >= -1) {
    msg = 'White was down as much as ' + agg.w.def + ' at one point, yet material is back to roughly level — that reads as a sacrifice with compensation, not a blunder. A pure en-prise count cannot tell those apart; separating them is exactly where the optional eval / outcome overlay earns its place.';
  } else if (bigB && diff <= 1) {
    msg = 'Black was down as much as ' + agg.b.def + ' at one point, yet material is back to roughly level — sacrifice with compensation rather than a blunder. Telling a sound sac from a real blunder is the one thing this engine-free metric cannot do alone.';
  } else if (agg.w.exp + agg.b.exp === 0) {
    msg = 'No material has been left en prise — both sides keep everything defended. Clean, controlled play on these metrics.';
  } else {
    msg = 'Material has been put en prise ' + (agg.w.exp + agg.b.exp) + ' time(s), but nothing has stuck as a lasting deficit yet. Watch the worst-deficit cards and the hanging-material trend — a permanent jump there is the club-vs-master tell.';
  }
  read.textContent = msg;
}

/* ---------- driver ---------- */
function render() {
  if (!S.boards.length) return;
  renderBoard();
  renderChip();
  renderPanel();
  renderChart();
  renderAgg();
  $('counter').innerHTML = '<b>' + S.ply + '</b> / ' + S.moves.length + '<span class="hint">←/→</span>';
  $('first').disabled = $('prev').disabled = S.ply === 0;
  $('last').disabled = $('next').disabled = S.ply === S.moves.length;
}
function goto(p) {
  S.ply = Math.max(0, Math.min(S.moves.length, p));
  render();
}

/* ---------- events ---------- */
function wireEvents() {
  // View tabs (Game / Profiles).
  $('viewTabs').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-view]');
    if (btn) setView(btn.dataset.view);
  });
  // First filter: tournament · section (or Custom PGN). Routes by current view.
  $('tournamentSel').addEventListener('change', (e) => {
    if (S.view === 'profiles') loadProfiles(e.target.value);
    else selectTournament(e.target.value);
  });
  // Second filter: picking a game loads it immediately.
  $('gameSel').addEventListener('change', (e) => loadGameById(e.target.value));
  // Load button: only needed for the custom-PGN path.
  $('loadBtn').addEventListener('click', () => {
    if ($('tournamentSel').value === 'custom') {
      const t = $('pgnIn').value.trim();
      if (!t) { $('err').textContent = 'Paste a PGN first.'; return; }
      loadGame(t, 'White', 'Black');
    } else {
      loadGameById($('gameSel').value);
    }
  });
  $('first').onclick = () => goto(0);
  $('prev').onclick = () => goto(S.ply - 1);
  $('next').onclick = () => goto(S.ply + 1);
  $('last').onclick = () => goto(S.moves.length);

  // Backend-analysis mode.
  $('backendToggle').addEventListener('change', (e) => {
    S.backend = e.target.checked;
    $('backendUrl').disabled = !S.backend;
    if (S.lastLoad) loadGame(S.lastLoad.pgn, S.lastLoad.wn, S.lastLoad.bn);
  });
  $('backendUrl').addEventListener('change', (e) => { S.backendUrl = e.target.value.trim(); });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') goto(S.ply + 1);
    else if (e.key === 'ArrowLeft') goto(S.ply - 1);
  });
}

/* ---------- boot ---------- */
// Optional deep link: #<game-id>@<ply>, e.g. #candidates-2026-open__r01b01@20.
// The slug (tournament) is the part before "__".
function parseHash() {
  const prof = (location.hash || '').match(/^#profiles\/([\w-]+)$/);
  if (prof) return { profiles: prof[1] };
  const m = (location.hash || '').match(/^#([\w-]+__r\d+b\d+)(?:@(\d+))?$/);
  return m ? { game: m[1], ply: Number(m[2] || 0) } : null;
}

async function boot() {
  wireEvents();
  $('backendUrl').disabled = !S.backend;
  if (!window.Chess) {
    $('err').textContent = 'Chess library failed to load — check your network/CDN access.';
    return;
  }
  try {
    await loadIndex();
  } catch (e) {
    $('err').textContent = 'Could not load the games library — ' + (e.message || e);
    return;
  }
  const h = parseHash();
  if (h && h.profiles) {
    $('tournamentSel').value = h.profiles;
    setView('profiles');
    return;
  }
  if (h && h.game) {
    const slug = h.game.split('__')[0];
    $('tournamentSel').value = slug;
    await selectTournament(slug, h.game);
    if (h.ply) goto(h.ply);
  } else {
    // Default to the first tournament's first game.
    const first = S.index[0];
    if (first) {
      $('tournamentSel').value = first.slug;
      await selectTournament(first.slug);
    }
  }
}

boot();
