// Thin client for the analysis backend (chesslab.api). Used only in "backend
// analysis" mode; quick mode never touches it, so the app stays openable offline.

/** Ingest a PGN and return its full analysis payload (same shape as analysis.js). */
export async function analyzeGame(baseUrl, pgn) {
  const resp = await fetch(`${trim(baseUrl)}/games`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pgn }),
  });
  if (!resp.ok) {
    const detail = await safeDetail(resp);
    throw new Error(`Backend ${resp.status}: ${detail}`);
  }
  const body = await resp.json();
  return body.analysis;
}

/** Fetch the feature manifest (the registry projection). */
export async function fetchManifest(baseUrl) {
  const resp = await fetch(`${trim(baseUrl)}/features`);
  if (!resp.ok) throw new Error(`Backend ${resp.status} fetching /features`);
  return resp.json();
}

function trim(url) {
  return url.replace(/\/+$/, '');
}

async function safeDetail(resp) {
  try {
    const body = await resp.json();
    return body.detail || JSON.stringify(body);
  } catch {
    return resp.statusText;
  }
}
