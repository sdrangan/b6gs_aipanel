// Wow vs. Crisis live scoreboard for the B6GS 2026 university panel.
// `node server.js` (Node 18+). State is in memory. The AI Bot column calls
// Claude and needs ANTHROPIC_API_KEY; everything else works without it.
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const ADMIN_KEY = process.env.ADMIN_KEY || 'changeme';
const PANELISTS = ['Sundeep', 'Kaushik', 'Gerhard', 'Tommaso', 'Danijela'];
const AI_NAME = 'AI Bot';
const AI_MODEL = 'claude-opus-5-5';
const MAX_VOTERS = 5000;
const PHOTO_DIR = path.join(__dirname, 'public', 'photos');
const PHOTO_TYPES = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };

function freshState() {
  return {
    round: 1,
    open: false,
    panel: { 1: {}, 2: {} },                   // round -> name -> { wow, crisis, reasoning? }
    votes: { 1: new Map(), 2: new Map() },     // round -> voterId -> { wow, crisis }
    aiBusy: false,
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
    ai: AI_NAME,
    aiBusy: state.aiBusy,
    panel: state.panel,
    audience: { 1: summarize(state.votes[1]), 2: summarize(state.votes[2]) },
  };
}

function score(x) {
  const n = Number(x);
  return Number.isInteger(n) && n >= 1 && n <= 10 ? n : null;
}

// --- AI Bot ---------------------------------------------------------------

let anthropic = null;
function aiClient() {
  // Loaded lazily so the rest of the app runs even without the SDK or a key.
  if (!anthropic) {
    const Anthropic = require('@anthropic-ai/sdk').default;
    anthropic = new Anthropic();
  }
  return anthropic;
}

const AI_SYSTEM = `You are the "AI Bot" panelist on a university panel at the Brooklyn 6G Summit about AI-native 6G wireless research. The human panelists are wireless professors who have each described an AI moment from the past year and scored themselves on two scales from 1 to 10:
- Wow: how much AI has amazed them.
- Crisis: how much it has made them wonder what is left for faculty and students to do.

Now it is your turn to score yourself on the same two scales, from your perspective as an AI. You are on stage in front of a live audience of researchers and engineers, so be witty and a little self-aware, but say something real. Keep the reasoning to one or two short sentences (under 40 words) that read well on a big screen. No emoji, no markdown.`;

const AI_SCHEMA = {
  type: 'object',
  properties: {
    wow: { type: 'integer', description: 'Wow score from 1 to 10' },
    crisis: { type: 'integer', description: 'Crisis score from 1 to 10' },
    reasoning: { type: 'string', description: 'One or two short sentences explaining both scores' },
  },
  required: ['wow', 'crisis', 'reasoning'],
  additionalProperties: false,
};

async function askAI(note) {
  const r = state.round;
  const fmt = (v) => (v == null ? 'not given' : Number.isInteger(v) ? v : v.toFixed(1));
  const panel = PANELISTS.map((n) => {
    const s = state.panel[r][n] || {};
    return `- ${n}: Wow ${fmt(s.wow)}, Crisis ${fmt(s.crisis)}`;
  }).join('\n');
  const aud = summarize(state.votes[r]);
  let prompt = `Round ${r}${r === 2 ? ' (the end of the panel: has your score changed?)' : ''}.\n\n` +
    `Panelist scores so far:\n${panel}\n\n` +
    `Audience (${aud.n} votes): average Wow ${fmt(aud.wow)}, average Crisis ${fmt(aud.crisis)}`;
  const prev = state.panel[1][AI_NAME];
  if (r === 2 && prev?.wow) {
    prompt += `\n\nIn round 1 you gave Wow ${prev.wow}, Crisis ${prev.crisis}: "${prev.reasoning || ''}"`;
  }
  if (note) prompt += `\n\nThe moderator adds: ${note}`;

  const response = await aiClient().beta.messages.create({
    model: AI_MODEL,
    max_tokens: 4000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'low', format: { type: 'json_schema', schema: AI_SCHEMA } },
    system: AI_SYSTEM,
    messages: [{ role: 'user', content: prompt }],
  });
  if (response.stop_reason === 'refusal') throw new Error('The AI declined to answer');
  const text = response.content.find((b) => b.type === 'text')?.text;
  const out = JSON.parse(text);
  const clamp = (v) => Math.min(10, Math.max(1, Math.round(Number(v)) || 1));
  state.panel[r][AI_NAME] = { wow: clamp(out.wow), crisis: clamp(out.crisis), reasoning: String(out.reasoning).slice(0, 400) };
}

// --- HTTP -----------------------------------------------------------------

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

// /photos/<name> serves public/photos/<name>.jpg (or .jpeg, .png, .webp).
function sendPhoto(res, name) {
  if (/^[a-z0-9_-]+$/i.test(name)) {
    for (const [ext, type] of Object.entries(PHOTO_TYPES)) {
      const file = path.join(PHOTO_DIR, name.toLowerCase() + ext);
      if (fs.existsSync(file)) {
        res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'max-age=300' });
        return fs.createReadStream(file).pipe(res);
      }
    }
  }
  send(res, 404, 'No photo', 'text/plain');
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
  if (req.method === 'GET' && url.pathname.startsWith('/photos/')) {
    return sendPhoto(res, url.pathname.slice('/photos/'.length));
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
        if (![...PANELISTS, AI_NAME].includes(b.name) || !['wow', 'crisis'].includes(b.field)) {
          return send(res, 400, { error: 'Bad panelist or field' });
        }
        const scores = (state.panel[state.round][b.name] ||= {});
        const v = score(b.value);
        if (v) scores[b.field] = v;
        else delete scores[b.field];
        break;
      }
      case 'reasoning': {
        const scores = (state.panel[state.round][AI_NAME] ||= {});
        scores.reasoning = String(b.text || '').slice(0, 400);
        break;
      }
      case 'ask': {
        if (state.aiBusy) return send(res, 409, { error: 'The AI is already thinking' });
        state.aiBusy = true;
        try {
          await askAI(String(b.note || '').slice(0, 500));
        } catch (err) {
          console.error('AI request failed:', err);
          return send(res, 502, { error: `AI request failed: ${err.message}` });
        } finally {
          state.aiBusy = false;
        }
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
}).on('error', (err) => {
  if (err.code !== 'EADDRINUSE') throw err;
  console.error(`Port ${PORT} is already in use. Stop the other server or pick another port, e.g. PORT=8000 node server.js`);
  process.exit(1);
}).listen(PORT, () => console.log(`Scoreboard listening on http://localhost:${PORT}`));
