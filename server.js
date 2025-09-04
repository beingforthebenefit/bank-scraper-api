const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// ---- Config ----
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.API_KEY || '';
const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), '.state');
const DATA_FILE = path.join(DATA_DIR, 'data.json');
const PERSIST = String(process.env.PERSIST || 'true').toLowerCase() !== 'false';

// ---- App ----
const app = express();
app.use(cors());
app.use(express.json({ limit: '256kb' }));
app.use(express.text({ type: ['text/*', 'text/plain'], limit: '256kb' }));

// ---- Helpers ----
function ensureStateDir() {
  try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch {}
}

function readState() {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    return JSON.parse(raw);
  } catch {
    return { accounts: [], lastIngestedAt: null };
  }
}

function writeState(state) {
  if (!PERSIST) return;
  try {
    ensureStateDir();
    const tmp = DATA_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
    fs.renameSync(tmp, DATA_FILE);
  } catch (e) {
    console.error('Failed to persist state:', e.message);
  }
}

function authOK(req) {
  if (!API_KEY) return true; // no key configured => open
  const key = req.query.key || req.query.api_key || req.header('x-api-key');
  return key && key === API_KEY;
}

function normalize(text) {
  return text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map(s => s.trim())
    .filter(Boolean);
}

function parseMoney(s) {
  const m = (s || '').match(/-?\$[\d,]+(?:\.\d{2})?/);
  if (!m) return null;
  return Math.abs(parseFloat(m[0].replace(/[$,]/g, '')));
}

// Limits map per instructions
const LIMITS = {
  '6958': 5300,
  '1069': 5800,
  APPLE_CARD: 2000,
};

// Main parser: supports Capital One (multiple cards) and Apple Card
function parsePayload(rawText) {
  const text = String(rawText || '');
  const lc = text.toLowerCase();
  const lines = normalize(text);

  const accounts = [];

  const isApple = lc.includes('mastercard') && lc.includes('card balance');
  if (isApple) {
    // Apple Card
    let balance = null;
    let due = null;
    let available = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const next = lines[i + 1] || '';

      if (/^card balance$/i.test(line)) {
        const amt = parseMoney(next) ?? parseMoney(line);
        if (amt != null) balance = amt;
      }

      if (/available$/i.test(line)) {
        const amt = parseMoney(line);
        if (amt != null) available = amt;
      }

      if (/^payment due\b/i.test(line)) {
        due = line.replace(/^payment due\s*/i, '').trim();
      }
    }

    const limit = LIMITS.APPLE_CARD;
    if (balance != null) {
      accounts.push({
        issuer: 'Apple',
        product: 'Apple Card',
        last4: null,
        balance,
        limit,
        utilization: limit ? +(balance / limit * 100).toFixed(2) : null,
        dueDate: due || null,
        kind: 'credit_card',
      });
    }
    return { accounts };
  }

  // Capital One: find card headings and their balances
  // Examples: "SAVOR R6958" or "SAVOR.1069"
  const cardNameRe = /\b(QUICKSILVER|SAVOR|VENTURE|SPARK)\b/i;

  // Collect candidate indices where a card name appears
  const cardIdxs = [];
  for (let i = 0; i < lines.length; i++) {
    if (cardNameRe.test(lines[i])) cardIdxs.push(i);
  }

  for (const idx of cardIdxs) {
    const header = lines[idx];
    const tail1 = lines[idx + 1] || '';
    const tail2 = lines[idx + 2] || '';
    const mName = header.match(cardNameRe);
    const product = mName ? mName[1].toUpperCase() : 'CARD';

    // Extract last4 from header or nearby line
    const last4 = (() => {
      const find4 = (s) => {
        const m = (s || '').match(/(\d{4})\b/);
        return m ? m[1] : null;
      };
      return find4(header) || find4(tail1) || find4(tail2);
    })();

    // Find the first "$x" that is labeled as Current balance on the next line, from idx forward
    let balance = null;
    for (let j = idx; j < Math.min(lines.length - 1, idx + 20); j++) {
      const maybeAmount = parseMoney(lines[j]);
      if (maybeAmount != null && /current balance/i.test(lines[j + 1] || '')) {
        balance = maybeAmount;
        break;
      }
    }

    // Only count as a card if we found a balance
    if (balance != null) {
      const limit = last4 && LIMITS[last4] ? LIMITS[last4] : null;
      accounts.push({
        issuer: 'Capital One',
        product,
        last4: last4 || null,
        balance,
        limit,
        utilization: limit ? +(balance / limit * 100).toFixed(2) : null,
        dueDate: null,
        kind: 'credit_card',
      });
    }
  }

  return { accounts };
}

// ---- In-memory state ----
ensureStateDir();
let state = readState();

// ---- Routes ----
app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'bank-scraper-api', lastIngestedAt: state.lastIngestedAt || null });
});

// Accepts text/plain body or JSON with {text|payload}
function ingestHandler(req, res) {
  try {
    let text = '';
    if (typeof req.body === 'string') {
      text = req.body;
    } else if (req.is('application/json')) {
      text = req.body.text || req.body.payload || '';
    }

    if (!text || text.length < 5) {
      return res.status(400).json({ error: 'Missing text payload' });
    }

    const { accounts } = parsePayload(text);
    state = {
      accounts,
      lastIngestedAt: new Date().toISOString(),
      source: 'ocr_payload',
    };
    writeState(state);

    return res.json({ ok: true, count: accounts.length, accounts });
  } catch (e) {
    console.error('ingest error:', e);
    return res.status(500).json({ error: 'Parse failed', message: e.message });
  }
}

app.post('/ingest', ingestHandler);
// Back-compat with old route name
app.post('/update-balances', ingestHandler);

// Returns the most recent accounts parsed
function balancesHandler(req, res) {
  if (!authOK(req)) return res.status(401).json({ error: 'Unauthorized' });
  return res.json({ ok: true, ...state });
}

app.get('/balances', balancesHandler);
// Back-compat with old route name
app.get('/balance', balancesHandler);

// 404
app.use((req, res) => {
  res.status(404).json({ error: 'Not found', path: req.path, endpoints: ['/health', '/ingest', '/balances'] });
});

app.listen(PORT, () => {
  console.log(`Listening on http://0.0.0.0:${PORT}`);
});
