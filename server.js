const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// ---- Config ----
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.API_KEY || '';
const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), '.state');
const DATA_FILE_PRIMARY = path.join(DATA_DIR, 'balances.json');
const DATA_FILE_LEGACY = path.join(DATA_DIR, 'data.json');
const PERSIST = String(process.env.PERSIST || 'true').toLowerCase() !== 'false';

// ---- App ----
const app = express();
app.use(cors());
app.use(express.json({ limit: '256kb' }));
app.use(express.text({ type: ['text/*', 'text/plain'], limit: '256kb' }));
app.use(express.urlencoded({ extended: true, limit: '256kb' }));

// ---- Helpers ----
function ensureStateDir() {
  try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch {}
}

function readState() {
  try {
    const raw = fs.readFileSync(DATA_FILE_PRIMARY, 'utf8');
    return JSON.parse(raw);
  } catch {}
  try {
    const raw2 = fs.readFileSync(DATA_FILE_LEGACY, 'utf8');
    return JSON.parse(raw2);
  } catch {}
  return { accounts: [], lastIngestedAt: null };
}

function writeState(state) {
  if (!PERSIST) return;
  try {
    ensureStateDir();
    const tmp1 = DATA_FILE_PRIMARY + '.tmp';
    fs.writeFileSync(tmp1, JSON.stringify(state, null, 2));
    fs.renameSync(tmp1, DATA_FILE_PRIMARY);
    const tmp2 = DATA_FILE_LEGACY + '.tmp';
    fs.writeFileSync(tmp2, JSON.stringify(state, null, 2));
    fs.renameSync(tmp2, DATA_FILE_LEGACY);
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

      if (/available/i.test(line)) {
        // handle "$226.56 Available", "Available $226.56", "Available credit $226.56"
        const amt = parseMoney(line) ?? parseMoney(next);
        if (amt != null) available = amt;
      }

      if (/^payment due\b/i.test(line)) {
        due = line.replace(/^payment due\s*/i, '').trim();
      }
    }

    // Derive limit if we have both balance and available; otherwise fallback
    let limit = LIMITS.APPLE_CARD;
    if (typeof available === 'number' && typeof balance === 'number') {
      limit = +(available + balance).toFixed(2);
    }
    if (balance != null) {
      accounts.push({
        issuer: 'Apple',
        product: 'Apple Card',
        last4: null,
        balance,
        limit,
        utilization: limit ? +(balance / limit * 100).toFixed(2) : null,
        dueDate: due || null,
        minimumPayment: null,
        paymentMet: !due,
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

    // Look for minimum payment and due date in the following lines until next card header
    let due = null;
    let minimumPayment = null;
    const nextIdx = cardIdxs.find(i => i > idx) ?? lines.length;
    for (let j = idx; j < Math.min(lines.length, nextIdx); j++) {
      const l = lines[j];
      if (/^payment due\b/i.test(l)) {
        due = l.replace(/^payment due\s*/i, '').trim();
        continue;
      }
      // e.g. "Minimum $35.00 due 09/30/2024"
      const mMin = l.match(/minimum\s+\$?([\d,]+(?:\.\d{2})?)\s+due\s+(\d{1,2}\/\d{1,2}\/\d{2,4})/i);
      if (mMin) {
        minimumPayment = parseFloat(mMin[1].replace(/,/g, ''));
        due = due || mMin[2];
        continue;
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
        dueDate: due || null,
        minimumPayment: typeof minimumPayment === 'number' ? minimumPayment : null,
        paymentMet: (typeof minimumPayment === 'number' ? minimumPayment === 0 : !due),
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

// Accepts text/plain body or JSON with {text|payload|data|content|balance_data|capital_one_data|body}
function ingestHandler(req, res) {
  try {
    let text = '';
    if (typeof req.body === 'string') {
      text = req.body;
    } else if (req.body && typeof req.body === 'object') {
      const candidates = ['text', 'payload', 'data', 'content', 'balance_data', 'capital_one_data', 'body'];
      for (const k of candidates) {
        if (typeof req.body[k] === 'string' && req.body[k].trim().length) {
          text = req.body[k];
          break;
        }
      }
      if (!text) {
        const vals = Object.values(req.body);
        const firstStr = vals.find(v => typeof v === 'string' && v.trim().length > 10);
        if (firstStr) text = firstStr;
      }
    }

    if (!text || text.length < 5) {
      return res.status(400).json({ error: 'Missing text payload' });
    }

    const { accounts: parsed } = parsePayload(text);

    // Merge with existing accounts by unique key (issuer|product|last4|kind)
    const keyFor = (a) => `${a.issuer || ''}|${a.product || ''}|${a.last4 || ''}|${a.kind || ''}`;
    const merged = new Map();
    for (const a of (state.accounts || [])) merged.set(keyFor(a), a);
    for (const a of parsed) merged.set(keyFor(a), a);
    const accounts = Array.from(merged.values());

    state = {
      accounts,
      lastIngestedAt: new Date().toISOString(),
      source: 'ocr_payload',
    };
    writeState(state);

    // Mirror /balances shape for convenience
    const mapped = accounts.map(a => ({
      ...a,
      type: a.kind || null,
      name: a.product || a.issuer || null,
      accountNumber: a.last4 || null,
      availableCredit: a.limit ?? null,
      minimumPayment: a.minimumPayment ?? null,
      paymentMet: typeof a.paymentMet === 'boolean' ? a.paymentMet : (!a.dueDate && !a.minimumPayment),
    }));
    return res.json({
      ok: true,
      success: true,
      count: accounts.length,
      lastUpdated: state.lastIngestedAt,
      accounts: mapped,
    });
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
  // Map accounts to include fields expected by external widget
  const accounts = (state.accounts || []).map(a => ({
    ...a,
    type: a.kind || null,
    name: a.product || a.issuer || null,
    accountNumber: a.last4 || null,
    availableCredit: a.limit ?? null,
    // passthroughs for widget logic
    minimumPayment: a.minimumPayment ?? null,
    paymentMet: typeof a.paymentMet === 'boolean' ? a.paymentMet : (!a.dueDate && !a.minimumPayment),
  }));

  return res.json({
    ok: true,
    success: true,
    lastUpdated: state.lastIngestedAt || null,
    ...state,
    accounts,
  });
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
