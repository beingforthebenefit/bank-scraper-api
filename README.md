# Banking API - Manual Data Ingestion

A secure Node.js API that processes bank account balance data from mobile app screenshots/text, designed for use with dashboards. I include a Dakboard wigdet as an example. Supports **Capital One** and **Apple Card** data formats.

## ⚠️ Important Notes

- **Manual Process**: This API requires you to manually provide balance data from your mobile banking apps
- **No Automation**: No web scraping or automated login - you control when and what data is shared
- **Privacy Focused**: Your banking credentials are never stored or transmitted
- **Dakboard Ready**: Maintains compatibility with existing Dakboard widgets

## Overview

This service provides a secure way to display bank account balances on your Dakboard without:
- Paying for expensive APIs like Plaid
- Storing banking credentials 
- Automated web scraping that might violate Terms of Service
- Complex 2FA handling

Instead, you simply copy/paste or send text from your mobile banking apps to the API, which parses and serves it in a clean format.

## Features

- 🏦 **Capital One** and **Apple Card** support
- 📱 Mobile app text parsing (no credentials needed)
- 🌐 RESTful JSON API compatible with Dakboard
- 🔐 API key protection for balance endpoint
- 🚀 Fast data updates (seconds vs minutes)
- 📊 Credit utilization calculations
- 🏥 Health check and status endpoints
- 🐳 Docker containerized

## API Endpoints

### `POST /update-balances`
Upload balance data from your mobile banking apps.

**Accepts:**
- Plain text: `Content-Type: text/plain`
- JSON: `Content-Type: application/json` with data in any string property

**Example Capital One text:**
```
QUICKSILVER
...2006
$1,735.98
Current Balance
Minimum $68.00 due 7/6/25 by 8 p.m. ET
SAVOR 6958
$1,888.40
Current Balance
```

**Example Apple Card text:**
```
Card Balance
$1,801.28
$198.72 Available
Payment Due Jun 30
Weekly Activity +$2.35 Daily Cash
```

### `GET /balance?key=YOUR_API_KEY`
Returns structured balance data for Dakboard integration.

**Response:**
```json
{
  "success": true,
  "accounts": [
    {
      "name": "QUICKSILVER",
      "accountNumber": "2006",
      "type": "credit_card",
      "balance": 1735.98,
      "availableCredit": 3000,
      "minimumPayment": 68.00,
      "dueDate": "7/6/25"
    }
  ],
  "summary": {
    "totalBalance": 1735.98,
    "totalRewards": 0,
    "accountCount": 1
  },
  "lastUpdated": "2024-01-15T10:30:00.000Z",
  "source": "mobile_app_scrape",
  "dataAge": "0.5 hours"
}
```

### `GET /health`
Health check endpoint for monitoring.

### `GET /status`
Shows current data status without requiring API key.

## Setup

### 1. Configure Environment Variables

Copy the template and set your API key:

```bash
cd plaid-api
cp env.template .env
```

Edit `.env`:
```bash
API_KEY=your-secret-api-key-here
PORT=3000
NODE_ENV=production
```

### 2. Start the Service

From your main server directory:

```bash
docker-compose up -d banking-scraper-api
```

### 3. Verify

Check that the service is running:

```bash
# Check container status
docker-compose ps banking-scraper-api

# Check logs
docker-compose logs banking-scraper-api

# Test health endpoint
curl http://localhost:3001/health
```

## Usage

### Manual Data Upload

**Option 1: Plain Text**
```bash
curl -X POST http://localhost:3001/update-balances \
  -H "Content-Type: text/plain" \
  --data-binary "QUICKSILVER
...2006
$1,735.98
Current Balance"
```

**Option 2: JSON**
```bash
curl -X POST http://localhost:3001/update-balances \
  -H "Content-Type: application/json" \
  -d '{"data": "QUICKSILVER\n...2006\n$1,735.98\nCurrent Balance"}'
```

**Option 3: Clipboard Scripts**
```bash
# Copy text from your banking app, then:
./send-clipboard.sh http://localhost:3001/update-balances

# Or use Python version:
python3 send-clipboard.py http://localhost:3001/update-balances
```

### Integration with Dakboard

Your Dakboard widget continues to work with the same endpoint:

```javascript
const API_URL = 'http://your-server:3001/balance';
const API_KEY = 'your-secret-api-key-here';

async function fetchBalances() {
  try {
    const response = await fetch(`${API_URL}?key=${API_KEY}`);
    const data = await response.json();
    
    if (data.success) {
      // Update your dashboard elements
      data.accounts.forEach(account => {
        console.log(`${account.name}: $${account.balance} (${account.type})`);
      });
    }
  } catch (error) {
    console.error('Failed to fetch balances:', error);
  }
}

// Refresh every 10 minutes
setInterval(fetchBalances, 10 * 60 * 1000);
```

## Supported Data Formats

### Capital One Mobile App
The parser recognizes:
- ✅ **Account Names**: QUICKSILVER, SAVOR, VENTURE, SPARK
- ✅ **Account Numbers**: ...2006, 6958, 1069
- ✅ **Current Balances**: $1,735.98, $1,888.40
- ✅ **Minimum Payments**: $68.00 due 7/6/25
- ✅ **Available Credit**: Auto-calculated based on known limits

### Apple Card Mobile App
The parser recognizes:
- ✅ **Card Balance**: $1,801.28
- ✅ **Available Credit**: $198.72 Available
- ✅ **Payment Due**: Payment Due Jun 30
- ✅ **Daily Cash**: +$2.35 Daily Cash

## Automation Ideas

### Smartphone Automation
- **iOS Shortcuts**: Create a shortcut to extract text and POST to API
- **Android Tasker**: Automate screenshot → OCR → API upload
- **IFTTT/Zapier**: Trigger updates from various sources

### Desktop Integration
```python
import requests

# Your automation grabs text from banking app
balance_text = get_banking_app_text()

# Send to API
response = requests.post(
    'http://your-server:3001/update-balances',
    data=balance_text,
    headers={'Content-Type': 'text/plain'}
)
```

## Security Considerations

- ✅ **No banking credentials stored**
- ✅ **API key protection for data access**
- ✅ **HTTPS recommended for production**
- ✅ **Non-root container user**
- ✅ **Manual data control**
- ⚠️ **API key transmitted in query parameter**
- ⚠️ **Balance data stored in memory**

## Troubleshooting

### Service Issues
```bash
# Check logs
docker-compose logs banking-scraper-api --tail=50

# Check status
curl http://localhost:3001/status
```

### Data Parsing Issues
- Ensure text format matches supported patterns
- Check for extra spaces or formatting characters
- Use the status endpoint to verify current data

### API Access Issues
- Verify API key is correct
- Check that port 3001 is accessible
- Ensure Docker container is running

## Development

For local development:

```bash
# Install dependencies
npm install

# Set development mode
export NODE_ENV=development
export API_KEY=test-key

# Start server
npm start

# Test endpoints
curl http://localhost:3000/health
curl -X POST http://localhost:3000/update-balances -d "test data"
curl "http://localhost:3000/balance?key=test-key"
```

## Benefits Over Automated Scraping

- ✅ **No bot detection issues**
- ✅ **No Terms of Service violations**
- ✅ **No banking credentials required**
- ✅ **No 2FA complications**
- ✅ **Reliable data parsing**
- ✅ **You control update frequency**
- ✅ **Fast and lightweight**

## Legal Notes

- This tool processes data you manually provide
- No automated access to banking websites
- No storage of banking credentials
- Check your bank's Terms of Service regarding data export
- Use responsibly and at your own discretion

---

*This API provides a secure, manual approach to banking data integration without the complexity and risks of automated web scraping.*
