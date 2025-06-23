# Quick Start Guide

## 5-Minute Setup

### 1. Install iOS Shortcut
- **[Download Template](https://www.icloud.com/shortcuts/82a807520ded4db7b5d06b26fe71cfc8)**
- Edit the **"Text"** action
- Replace `https://credit.yourdomain.com` with your server URL

### 2. Deploy Server
```bash
git clone <your-repo>
cd bank-scraper-api
cp env.template .env
echo "API_KEY=your-secret-key-here" > .env
docker-compose up -d
```

### 3. Test Integration
- Open Capital One app
- Tap "Run" when automation appears
- Check server logs: `docker logs <container-name>`

### 4. Add to Dashboard
- Upload `examples/dakboard-widget.html` to web server
- Edit API URL and key in HTML
- Add as Custom HTML block in Dakboard

## Troubleshooting

**Shortcut not triggering?**
- iOS Settings → Shortcuts → Advanced → Allow Running Scripts ✅

**Data not appearing?**
```bash
curl -X POST http://your-server/update-balances -d "QUICKSILVER $100.00"
curl "http://your-server/balance?key=your-key"
```

**Need help?** Check [Technical Documentation](TECHNICAL.md) for details.

---

## What Happens Next

1. **📱 Open banking app** → Automation runs automatically
2. **🔄 Data syncs** → Server processes and stores balance
3. **📊 Dashboard updates** → Widget refreshes every 10 minutes
4. **✨ Done!** → Hands-free balance tracking

Total time investment: **~10 minutes setup, lifetime of free automation** 