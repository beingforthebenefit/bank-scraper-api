# Bank Scraper API

Minimal API to parse OCR text payloads into normalized credit card balances.

Supports:
- Capital One cards (e.g., SAVOR) with last4 and current balance
- Apple Card (Mastercard) with current balance (no last4)

Limits used (built-in):
- 6958 → $5300
- 1069 → $5800
- Apple Card → $2000

## Run

Local:
```
npm install
PORT=3000 API_KEY=yourkey npm start
```

Docker:
```
docker build -t bank-scraper-api .
docker run -p 3000:3000 -e API_KEY=yourkey bank-scraper-api
```

Optional persistence: set `DATA_DIR` (defaults to `.state`) and `PERSIST=true|false`.

## Endpoints

- `/health` GET: Basic health.
- `/ingest` POST: Accepts `text/plain` body or JSON `{ text: "..." }`. Returns parsed accounts.
- `/balances` GET: Returns last parsed result. If `API_KEY` is set, provide it via `?key=` or header `x-api-key`.

Example (Capital One):
```
6:48
84
Capital One

SAVOR R6958
$0.00
Current balance
SAVOR.1069
$0.00
Current balance
```

Example (Apple Card):
```
6:49
mastercard
Card Balance
$1,773.44
$226.56 Available
Payment Due Sep 30
```

Response shape:
```
{
  "ok": true,
  "count": 2,
  "accounts": [
    { "issuer":"Capital One", "product":"SAVOR", "last4":"6958", "balance":0, "limit":5300, "utilization":0 },
    { "issuer":"Capital One", "product":"SAVOR", "last4":"1069", "balance":0, "limit":5800, "utilization":0 }
  ]
}
```

License: MIT
