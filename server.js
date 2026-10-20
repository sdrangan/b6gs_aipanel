// Wow vs. Crisis live scoreboard for the B6GS 2026 university panel.
// No dependencies: `node server.js` (Node 18+). State is in memory.
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const ADMIN_KEY = process.env.ADMIN_KEY || 'changeme';
const PANELISTS = ['Sundeep', 'Kaushik', 'Gerhard', 'Tommaso', 'Danijela'];
const MAX_VOTERS = 5000;

function freshState() {
  return {
    round: 1,
    open: false,
    panel: { 1: {}, 2: {} },                   // round -> name -> { wow, crisis }
    votes: { 1: new Map(), 2: new Map() },     // round -> voterId -> { wow, crisis }
  };
}
const state = freshState();

function summarize(votes) {
  const hist = { wow: Array(10).fill(0), crisis: Array(10).fill(0) };
  let wow = 0, crisis = 0;
  for (const v of votes.values()) {
    hist.wow[v.wow - 1]++;
    hist.crisis[v.crisis - 1]++;
    wow += v.wow;
    crisis += v.crisis;
  }
  const n = votes.size;
  return { n, wow: n ? wow / n : null, crisis: n ? crisis / n : null, hist };
}

function publicState() {
  return {
    round: state.round,
    open: state.open,
    panelists: PANELISTS,
    panel: state.panel,
    audience: { 1: summarize(state.votes[1]), 2: summarize(state.votes[2]) },
  };
}

function score(x) {
  const n = Number(x);
  return Number.isInteger(n) && n >= 1 && n <= 10 ? n : null;
}

function send(res, code, body, type = 'application/json') {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(type === 'application/json' ? JSON.stringify(body) : body);
}

function readJson(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => { data += c; if (data.length > 10000) req.destroy(); });
    req.on('end', () => { try { resolve(JSON.parse(data)); } catch { resolve(null); } });
    req.on('close', () => resolve(null));
  });
}

const pages = {
  '/': fs.readFileSync(path.join(__dirname, 'public', 'vote.html')),
  '/screen': fs.readFileSync(path.join(__dirname, 'public', 'screen.html')),
};

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');

  if (req.method === 'GET' && pages[url.pathname]) {
    return send(res, 200, pages[url.pathname], 'text/html; charset=utf-8');
  }
  if (req.method === 'GET' && url.pathname === '/api/state') {
    return send(res, 200, publicState());
  }

  if (req.method === 'POST' && url.pathname === '/api/vote') {
    const b = await readJson(req);
    if (!state.open) return send(res, 403, { error: 'Voting is closed' });
    const wow = score(b?.wow), crisis = score(b?.crisis);
    if (typeof b?.voter !== 'string' || b.voter.length > 64 || !wow || !crisis) {
      return send(res, 400, { error: 'Pick a Wow and a Crisis score' });
    }
    const votes = state.votes[state.round];
    if (!votes.has(b.voter) && votes.size >= MAX_VOTERS) {
      return send(res, 429, { error: 'Too many voters' });
    }
    votes.set(b.voter, { wow, crisis });
    return send(res, 200, { ok: true, round: state.round });
  }

  if (req.method === 'POST' && url.pathname === '/api/admin') {
    const b = await readJson(req);
    if (b?.key !== ADMIN_KEY) return send(res, 403, { error: 'Bad admin key' });
    switch (b.action) {
      case 'set': {
        if (!PANELISTS.includes(b.name) || !['wow', 'crisis'].includes(b.field)) {
          return send(res, 400, { error: 'Bad panelist or field' });
        }
        const scores = (state.panel[state.round][b.name] ||= {});
        const v = score(b.value);
        if (v) scores[b.field] = v;
        else delete scores[b.field];
        break;
      }
      case 'open': state.open = true; break;
      case 'close': state.open = false; break;
      case 'round':
        if (b.round !== 1 && b.round !== 2) return send(res, 400, { error: 'Bad round' });
        state.round = b.round;
        state.open = false;
        break;
      case 'reset': Object.assign(state, freshState()); break;
      default: return send(res, 400, { error: 'Unknown action' });
    }
    return send(res, 200, publicState());
  }

  send(res, 404, 'Not found', 'text/plain');
}).listen(PORT, () => console.log(`Scoreboard listening on port ${PORT}`));
