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
  "success": true,
  "lastIngestedAt": "2024-09-03T19:37:00.000Z",
  "lastUpdated": "2024-09-03T19:37:00.000Z",
  "accounts": [
    {
      "issuer": "Capital One",
      "product": "SAVOR",
      "last4": "6958",
      "balance": 0,
      "limit": 5300,
      "utilization": 0,
      "dueDate": null,
      "minimumPayment": null,
      "paymentMet": true,
      "kind": "credit_card",
      // Aliases for widget consumers
      "type": "credit_card",
      "name": "SAVOR",
      "accountNumber": "6958",
      "availableCredit": 5300
    }
  ]
}
```

Notes:
- The `/balances` response preserves original fields and adds aliases (`success`, `lastUpdated`, and account aliases like `type`, `name`, `accountNumber`, `availableCredit`) for widget consumers.
- Apple Card now reports a `dueDate` when present, and its limit is derived from `balance + available` when both are present; otherwise it falls back to a configured default.
- New fields per account: `minimumPayment` (number|null) and `paymentMet` (boolean). For Capital One, `minimumPayment` is parsed from lines like "Minimum $35.00 due 09/30/2024"; `paymentMet` is true when minimum is 0 or when no due/minimum is detected. For Apple Card, `paymentMet` is true when no "Payment Due" line is present.

License: MIT
