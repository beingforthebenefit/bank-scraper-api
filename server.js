const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// API key for security (set in environment variables)
const API_KEY = process.env.API_KEY || 'your-secret-api-key-here';

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.text({ type: 'text/plain' }));

// In-memory storage for parsed balance data
let balanceData = {
  accounts: [],
  lastUpdated: null,
  source: 'manual'
};

// Helper function to get available credit based on account number
function getAvailableCredit(accountNumber) {
  const creditLimits = {
    '2006': 3000,
    '6958': 5100,
    '1069': 5800
  };
  
  return creditLimits[accountNumber] || null;
}

// Helper function to parse credit card app text (Capital One and Apple Card)
function parseCreditCardText(text) {
  const accounts = [];
  const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
  
  let currentAccount = null;
  let rewardsCash = null;
  let dailyCash = null;
  
  // Check if this is Apple Card data
  const isAppleCard = text.toLowerCase().includes('mastercard') && text.toLowerCase().includes('card balance');
  
  if (isAppleCard) {
    // Parse Apple Card format
    let balance = null;
    let availableCredit = null;
    let dueDate = null;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Look for Card Balance
      if (line.toLowerCase() === 'card balance') {
        const nextLine = i + 1 < lines.length ? lines[i + 1] : '';
        if (nextLine && nextLine.match(/^\$[\d,]+\.\d{2}$/)) {
          balance = parseFloat(nextLine.replace(/[$,]/g, ''));
        }
      }
      
      // Look for Available credit
      if (line.match(/^\$[\d,]+\.\d{2}\s+Available$/i)) {
        const match = line.match(/^\$([\d,]+\.\d{2})\s+Available$/i);
        if (match) {
          availableCredit = parseFloat(match[1].replace(/,/g, ''));
        }
      }
      
      // Look for Payment Due date
      if (line.match(/^Payment Due\s+(.+)$/i)) {
        const match = line.match(/^Payment Due\s+(.+)$/i);
        if (match) {
          dueDate = match[1].trim();
        }
      }
      
      // Look for Daily Cash
      if (line.match(/Daily Cash$/i)) {
        const match = line.match(/\+?\$?([\d,]+\.\d{2})\s+Daily Cash$/i);
        if (match) {
          dailyCash = parseFloat(match[1].replace(/,/g, ''));
        }
      }
    }
    
    if (balance !== null) {
      // Calculate total credit limit from balance + available
      const totalCredit = availableCredit ? balance + availableCredit : null;
      
      accounts.push({
        name: 'Apple Card',
        accountNumber: '',
        type: 'credit_card',
        balance: balance,
        availableCredit: totalCredit,
        minimumPayment: null, // Apple Card doesn't show minimum payments in this format
        dueDate: dueDate
      });
    }
    
    if (dailyCash !== null) {
      accounts.push({
        name: 'Daily Cash',
        accountNumber: '',
        type: 'rewards',
        balance: dailyCash,
        availableCredit: null,
        minimumPayment: null,
        dueDate: null
      });
    }
  } else {
    // Parse Capital One format
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const nextLine = i + 1 < lines.length ? lines[i + 1] : '';
      
      // Look for account names with account numbers
      // Format: "QUICKSILVER", "...2006", "SAVOR 6958", "SAVOR 1069"
      if (line.match(/^(QUICKSILVER|SAVOR|VENTURE|SPARK)/i)) {
        if (currentAccount) {
          accounts.push(currentAccount);
        }
        
        // Extract account number from the line
        let accountNumber = '';
        let accountName = line;
        
        // Check if the line contains the account number (e.g., "SAVOR 6958")
        const nameWithNumber = line.match(/^(QUICKSILVER|SAVOR|VENTURE|SPARK)\s+(\d+)/i);
        if (nameWithNumber) {
          accountName = nameWithNumber[1];
          accountNumber = nameWithNumber[2];
        } else {
          // Look for "...XXXX" pattern in the same line or the next line
          if (line.includes('...')) {
            const parts = line.split('...');
            if (parts.length > 1) {
              accountName = parts[0].trim();
              accountNumber = parts[1].trim();
            }
          } else if (nextLine && nextLine.match(/^\.{3}\d+$/)) {
            // Next line is "...XXXX"
            accountNumber = nextLine.replace('...', '');
          }
        }
        
        currentAccount = {
          name: accountName,
          accountNumber: accountNumber,
          type: 'credit_card',
          balance: null,
          availableCredit: getAvailableCredit(accountNumber),
          minimumPayment: null,
          dueDate: null
        };
      }
      
      // Look for balance amounts
      if (line.match(/^\$[\d,]+\.\d{2}$/)) {
        const amount = parseFloat(line.replace(/[$,]/g, ''));
        
        // Check if this is a current balance
        if (nextLine && nextLine.toLowerCase().includes('current balance')) {
          if (currentAccount) {
            currentAccount.balance = amount;
          }
        }
        // Check if this is rewards cash
        else if (nextLine && nextLine.toLowerCase().includes('rewards cash')) {
          rewardsCash = amount;
        }
      }
      
      // Look for minimum payment info
      if (line.toLowerCase().includes('minimum') && line.includes('due')) {
        const match = line.match(/minimum\s+\$?([\d,]+\.\d{2})\s+due\s+(\d+\/\d+\/\d+)/i);
        if (match && currentAccount) {
          currentAccount.minimumPayment = parseFloat(match[1].replace(/,/g, ''));
          currentAccount.dueDate = match[2];
        }
      }
    }
    
    // Add the last account if it exists
    if (currentAccount) {
      accounts.push(currentAccount);
    }
    
    // Add rewards cash as a separate "account"
    if (rewardsCash !== null) {
      accounts.push({
        name: 'Rewards Cash',
        accountNumber: '',
        type: 'rewards',
        balance: rewardsCash,
        availableCredit: null,
        minimumPayment: null,
        dueDate: null
      });
    }
  }
  
  return {
    accounts,
    totalBalance: accounts
      .filter(acc => acc.type === 'credit_card')
      .reduce((sum, acc) => sum + (acc.balance || 0), 0),
    totalRewards: accounts
      .filter(acc => acc.type === 'rewards')
      .reduce((sum, acc) => sum + (acc.balance || 0), 0),
    lastUpdated: new Date().toISOString(),
    source: 'mobile_app_scrape'
  };
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'banking-scraper-api',
    dataSource: balanceData.source,
    lastUpdated: balanceData.lastUpdated
  });
});

// Endpoint to receive scraped Capital One app data
app.post('/update-balances', (req, res) => {
  try {
    let scrapedText;
    
    // Handle both JSON and plain text payloads
    if (typeof req.body === 'string') {
      // Plain text payload
      scrapedText = req.body;
    } else if (req.body && typeof req.body === 'object') {
      // JSON payload - look for text in any property
      const possibleKeys = ['text', 'data', 'content', 'payload', 'balance_data', 'capital_one_data'];
      
      // First try common key names
      for (const key of possibleKeys) {
        if (req.body[key] && typeof req.body[key] === 'string') {
          scrapedText = req.body[key];
          break;
        }
      }
      
      // If not found in common keys, try the first string value in the object
      if (!scrapedText) {
        const values = Object.values(req.body);
        const firstStringValue = values.find(value => typeof value === 'string' && value.length > 10);
        if (firstStringValue) {
          scrapedText = firstStringValue;
        }
      }
      
      if (!scrapedText) {
        return res.status(400).json({
          error: 'Invalid JSON payload',
          message: 'Expected JSON object with a string property containing Capital One text data',
          receivedKeys: Object.keys(req.body),
          example: { "data": "QUICKSILVER\\n...2006\\n$1,735.98\\nCurrent Balance" }
        });
      }
    } else {
      return res.status(400).json({
        error: 'Invalid payload',
        message: 'Expected either plain text or JSON object with Capital One text data'
      });
    }
    
    console.log('Received scraped text data, length:', scrapedText.length);
    console.log('First 200 characters:', scrapedText.substring(0, 200));
    
    // Check if this is Apple Card data for logging
    const isAppleCardData = scrapedText.toLowerCase().includes('mastercard') && scrapedText.toLowerCase().includes('card balance');
    console.log('Data type detected:', isAppleCardData ? 'Apple Card' : 'Capital One');
    
    // Parse the scraped text
    const parsedData = parseCreditCardText(scrapedText);
    
    console.log('Parsed data from parseCreditCardText:', {
      accountCount: parsedData.accounts.length,
      accounts: parsedData.accounts.map(acc => ({ name: acc.name, type: acc.type, balance: acc.balance }))
    });
    
    // Check if this is Apple Card data
    const isAppleCard = scrapedText.toLowerCase().includes('mastercard') && scrapedText.toLowerCase().includes('card balance');
    
    if (isAppleCard) {
      // Merge Apple Card data with existing Capital One data
      if (balanceData.accounts && balanceData.accounts.length > 0) {
        console.log('Merging Apple Card data with existing Capital One data');
        console.log('Existing accounts before merge:', balanceData.accounts.length);
        console.log('New Apple Card accounts to add:', parsedData.accounts.length);
        
        // Remove any existing Apple Card data
        const existingAccounts = balanceData.accounts.filter(acc => acc.name !== 'Apple Card' && acc.name !== 'Daily Cash');
        console.log('Existing accounts after filtering:', existingAccounts.length);
        
        // Add new Apple Card data
        const mergedAccounts = [...existingAccounts, ...parsedData.accounts];
        console.log('Total merged accounts:', mergedAccounts.length);
        
        // Update balance data with merged accounts
        balanceData = {
          accounts: mergedAccounts,
          totalBalance: mergedAccounts
            .filter(acc => acc.type === 'credit_card')
            .reduce((sum, acc) => sum + (acc.balance || 0), 0),
          totalRewards: mergedAccounts
            .filter(acc => acc.type === 'rewards')
            .reduce((sum, acc) => sum + (acc.balance || 0), 0),
          lastUpdated: new Date().toISOString(),
          source: 'mobile_app_scrape'
        };
      } else {
        // No existing data, use Apple Card data as-is
        console.log('No existing data, using Apple Card data as-is');
        balanceData = parsedData;
      }
    } else {
      // Capital One data - check if we need to merge with existing Apple Card data
      if (balanceData.accounts && balanceData.accounts.length > 0) {
        const existingAppleCard = balanceData.accounts.filter(acc => acc.name === 'Apple Card' || acc.name === 'Daily Cash');
        
        if (existingAppleCard.length > 0) {
          console.log('Merging Capital One data with existing Apple Card data');
          
          // Merge Capital One data with existing Apple Card data
          const mergedAccounts = [...parsedData.accounts, ...existingAppleCard];
          
          balanceData = {
            accounts: mergedAccounts,
            totalBalance: mergedAccounts
              .filter(acc => acc.type === 'credit_card')
              .reduce((sum, acc) => sum + (acc.balance || 0), 0),
            totalRewards: mergedAccounts
              .filter(acc => acc.type === 'rewards')
              .reduce((sum, acc) => sum + (acc.balance || 0), 0),
            lastUpdated: new Date().toISOString(),
            source: 'mobile_app_scrape'
          };
        } else {
          // No Apple Card data to preserve, replace with Capital One data
          balanceData = parsedData;
        }
      } else {
        // No existing data, use Capital One data as-is
        balanceData = parsedData;
      }
    }
    
    console.log('Successfully parsed data:', {
      accountCount: parsedData.accounts.length,
      totalBalance: parsedData.totalBalance,
      totalRewards: parsedData.totalRewards
    });
    
    res.json({
      success: true,
      message: 'Balance data updated successfully',
      summary: {
        accountCount: parsedData.accounts.length,
        totalBalance: parsedData.totalBalance,
        totalRewards: parsedData.totalRewards,
        lastUpdated: parsedData.lastUpdated
      }
    });
    
  } catch (error) {
    console.error('Error parsing scraped data:', error);
    res.status(500).json({
      error: 'Parsing failed',
      message: error.message
    });
  }
});

// Main balance endpoint for Dakboard (with API key security)
app.get('/balance', async (req, res) => {
  try {
    // Check API key for security
    const providedKey = req.query.key || req.query.api_key;
    console.log('API_KEY', API_KEY)
    if (!providedKey || providedKey !== API_KEY) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Valid API key required as query parameter'
      });
    }
    
    // Check if we have manual data
    if (!balanceData.lastUpdated) {
      return res.status(404).json({
        error: 'No data available',
        message: 'No balance data has been uploaded yet. Please use POST /update-balances to provide data.'
      });
    }
    
    // Serve manual data (regardless of age)
    const lastUpdate = new Date(balanceData.lastUpdated);
    const now = new Date();
    const hoursSinceUpdate = (now - lastUpdate) / (1000 * 60 * 60);
    
    console.log('Serving manual balance data');
    return res.json({
      success: true,
      accounts: balanceData.accounts,
      summary: {
        totalBalance: balanceData.totalBalance,
        totalRewards: balanceData.totalRewards,
        accountCount: balanceData.accounts.length
      },
      lastUpdated: balanceData.lastUpdated,
      source: balanceData.source,
      dataAge: `${Math.round(hoursSinceUpdate * 10) / 10} hours`
    });

  } catch (error) {
    console.error('Error in balance endpoint:', error);
    res.status(500).json({
      error: 'Balance retrieval failed',
      message: error.message
    });
  }
});



// Endpoint to get current stored data without triggering updates
app.get('/status', (req, res) => {
  res.json({
    hasData: balanceData.lastUpdated !== null,
    lastUpdated: balanceData.lastUpdated,
    source: balanceData.source,
    accountCount: balanceData.accounts.length,
    accounts: balanceData.accounts.map(acc => ({
      name: acc.name,
      type: acc.type,
      hasBalance: acc.balance !== null
    }))
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ 
    error: 'Endpoint not found',
    available_endpoints: ['/health', '/balance', '/test-scrape (dev only)']
  });
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  process.exit(0);
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Banking Scraper API server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log(`Balance endpoint: http://localhost:${PORT}/balance`);
  console.log(`Update endpoint: http://localhost:${PORT}/update-balances`);
  console.log(`Status endpoint: http://localhost:${PORT}/status`);
  
  console.log('\nEnvironment variables check:');
  console.log(`- NODE_ENV: ${process.env.NODE_ENV || 'undefined'}`);
  console.log(`- API_KEY configured: ${!!process.env.API_KEY}`);
}); 