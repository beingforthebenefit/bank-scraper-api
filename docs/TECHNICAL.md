# Technical Documentation

## API Specification

### POST /update-balances

Accepts banking data from iOS Shortcuts automation.

**Content Types:**
- `text/plain` - Raw text from banking app
- `application/json` - JSON with data in any string property

**Example Capital One Format:**
```
QUICKSILVER
...2006
$1,689.77
Current Balance
Minimum $68.00 due 7/6/25 by 8 p.m. ET
SAVOR
...6958
$1,875.24
Current Balance
```

**Example Apple Card Format:**
```
Card Balance
$1,139.19
$860.81 Available
Payment Due Jun 30
Weekly Activity +$0.76 Daily Cash
```

### GET /balance?key=API_KEY

Returns structured JSON for dashboard consumption.

**Response Schema:**
```json
{
  "success": boolean,
  "accounts": [
    {
      "name": string,
      "accountNumber": string,
      "type": "credit_card",
      "balance": number,
      "availableCredit": number,
      "minimumPayment": number,
      "dueDate": string
    }
  ],
  "summary": {
    "totalBalance": number,
    "totalRewards": number,
    "accountCount": number
  },
  "lastUpdated": string,
  "source": string,
  "dataAge": string
}
```

### GET /health

Health check endpoint returning:
```json
{
  "status": "ok",
  "timestamp": "2024-06-22T21:30:00.000Z",
  "uptime": 3600
}
```

### GET /status

Public status endpoint (no API key required):
```json
{
  "hasData": boolean,
  "lastUpdated": string,
  "accountCount": number,
  "dataAge": string
}
```

## Text Parsing Logic

### Capital One Parser

Regex patterns for extracting:
- **Account Name**: `(QUICKSILVER|SAVOR|VENTURE|SPARK)`
- **Account Number**: `\.\.\.(\d{4})`
- **Balance**: `\$([0-9,]+\.?\d*)`
- **Minimum Payment**: `Minimum \$([0-9,]+\.?\d*) due (\d{1,2}\/\d{1,2}\/\d{2,4})`

### Apple Card Parser

Patterns for:
- **Balance**: `Card Balance\s+\$([0-9,]+\.?\d*)`
- **Available**: `\$([0-9,]+\.?\d*) Available`
- **Due Date**: `Payment Due ([A-Z][a-z]{2} \d{1,2})`
- **Daily Cash**: `\+\$([0-9,]+\.?\d*) Daily Cash`

## Credit Limits Database

Hard-coded limits for calculation:
```javascript
const CREDIT_LIMITS = {
  'QUICKSILVER': { '2006': 3000 },
  'SAVOR': { '6958': 5100, '1069': 5800 },
  'VENTURE': { /* ... */ }
};
```

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `API_KEY` | Yes | - | API key for /balance endpoint |
| `PORT` | No | 3000 | Server port |
| `NODE_ENV` | No | development | Environment mode |

## Docker Configuration

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3000
USER node
CMD ["npm", "start"]
```

## iOS Shortcut Actions

The shortcut template includes these actions:

1. **Get Contents of URL** - Fetches current screen content
2. **Extract Text from Image** - OCR fallback if text extraction fails
3. **Set Variable** - Stores extracted text
4. **Get Contents of URL** - POST to API endpoint
5. **Show Result** - User feedback

## Error Handling

API handles common errors:
- Invalid API key → 401 Unauthorized
- Malformed data → 400 Bad Request with parsing details
- Server errors → 500 Internal Server Error
- Missing data → Empty accounts array with success: true

## Performance Considerations

- In-memory storage for simplicity
- Data persists only during server uptime
- No database dependencies
- Typical response time: <50ms
- Memory usage: ~10MB base + data

## Security Notes

- API key validation on protected endpoints
- No credential storage
- CORS headers for browser access
- Input sanitization for parsing
- Runs as non-root user in container

## Extending Support

To add new banks:

1. Add parsing logic to `parseBalanceData()` function
2. Update credit limits database if needed
3. Add test cases for new format
4. Update documentation

Example parser addition:
```javascript
// Chase Bank parser
if (text.includes('Chase') && text.includes('Available')) {
  // Add Chase-specific parsing logic
}
``` 