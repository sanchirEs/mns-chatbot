# 🔴 Railway Redis Setup - Complete Guide

## ✅ Your Redis Credentials (Already Provided by Railway)

Railway has automatically set these environment variables in your deployment:

```env
REDIS_PASSWORD="qtpGFvKRXwutUNwkiYVShiFpCLiAGCco"
REDIS_URL="redis://default:qtpGFvKRXwutUNwkiYVShiFpCLiAGCco@[host]:6379"
REDISHOST="[railway-private-domain]"
REDISPORT="6379"
REDISUSER="default"
```

**You don't need to set these manually!** Railway does it automatically when you add the Redis database.

---

## 🎯 How Your App Connects (Already Configured!)

Your app is **already set up** to use Railway's Redis. Here's what happens:

### Connection Flow:
```
1. Railway provides REDIS_URL environment variable ✅
2. Your app detects REDIS_URL exists ✅
3. Redis auto-enables (ENABLE_REDIS = true) ✅
4. Connection established automatically ✅
```

### Code (Already in Your App):

**`src/config/environment.js`**
```javascript
REDIS: {
  URL: process.env.REDIS_URL || null,  // ✅ Railway provides this
  ENABLE_REDIS: process.env.ENABLE_REDIS === 'true' || !!process.env.REDIS_URL
  // ↑ Auto-enables when REDIS_URL is detected!
}
```

**`src/services/dataSyncService.js`**
```javascript
static redis = config.REDIS?.ENABLE_REDIS ? (
  process.env.REDIS_URL  // ✅ Uses Railway's complete connection URL
    ? new Redis(process.env.REDIS_URL, { /* options */ })
    : new Redis({ /* individual params fallback */ })
) : null;
```

---

## 🚀 Deploy & Test (3 Steps)

### Step 1: Push Your Code to GitHub
```bash
git add .
git commit -m "Add Railway Redis support"
git push origin main
```

### Step 2: Railway Auto-Deploys
Railway will automatically:
1. Detect your push
2. Build your app
3. Set `REDIS_URL` environment variable
4. Deploy with Redis connected

### Step 3: Test Connection

**Option A: Check Railway Logs**
```bash
# In Railway dashboard, view logs
# Look for:
✅ Redis connected
✅ Cache enabled (Redis)
```

**Option B: Test with CLI**
```bash
# Install Railway CLI
npm install -g @railway/cli

# Login and link
railway login
railway link

# Run Redis test
railway run npm run test:redis
```

**Expected Output:**
```
🔍 Testing Redis Connection...

📋 Environment Variables:
REDIS_URL: ✅ Set
REDIS_PASSWORD: ✅ Set
REDISHOST: railway.internal
REDISPORT: 6379

🔗 Connecting using REDIS_URL...
✅ Redis connected successfully!

🧪 Testing Redis operations...
✅ SET operation successful
✅ GET operation successful: Hello from Railway!
✅ Memory usage: 1.2M
✅ Total keys: 3
✅ Cleanup successful

🎉 All tests passed! Redis is working perfectly.
```

---

## 🔍 Verify in Production

After deploying, test your API:

```bash
# Get your Railway URL from dashboard
RAILWAY_URL="https://your-app.up.railway.app"

# Test health endpoint (should show Redis enabled)
curl $RAILWAY_URL/health

# Expected response:
{
  "status": "healthy",
  "uptime": "2 minutes",
  "cache": "redis",  ← Redis is working!
  "database": "connected",
  "products": 112
}
```

---

## 📊 Understanding Railway's Redis Variables

Railway provides multiple formats for different use cases:

| Variable | Purpose | When to Use |
|----------|---------|-------------|
| `REDIS_URL` | Complete connection string | **✅ Use this (default)** |
| `REDIS_PUBLIC_URL` | External access (TCP proxy) | For external tools |
| `REDIS_PASSWORD` | Password only | Manual config |
| `REDISHOST` | Internal hostname | Manual config |
| `REDISPORT` | Port (6379) | Manual config |
| `REDISUSER` | Username (default) | Manual config |

**Your app uses `REDIS_URL` by default - this is the best and easiest option!**

---

## 🔧 Manual Configuration (If Needed)

If you need to override the automatic configuration:

### Using Environment Variables in Railway Dashboard:

```env
# Option 1: Use complete URL (recommended)
REDIS_URL=redis://default:qtpGFvKRXwutUNwkiYVShiFpCLiAGCco@[host]:6379

# Option 2: Use individual parameters
REDIS_HOST=[railway-internal-host]
REDIS_PORT=6379
REDIS_PASSWORD=qtpGFvKRXwutUNwkiYVShiFpCLiAGCco
REDIS_USER=default
ENABLE_REDIS=true
```

**But you don't need to do this!** Railway sets `REDIS_URL` automatically.

---

## 🐛 Troubleshooting

### ❌ "Redis connection failed"

**Check Railway Dashboard:**
1. Go to your project
2. Click on **Redis service**
3. Verify it's **"Running"** (green status)

**Check Environment Variables:**
```bash
railway variables
# Should show: REDIS_URL=redis://...
```

**Check App Logs:**
```bash
railway logs
# Look for Redis connection messages
```

### ❌ "REDIS_URL not set"

**Solution:**
1. Ensure Redis database exists in Railway project
2. Click **"New"** → **"Database"** → **"Add Redis"**
3. Wait 1-2 minutes for provisioning
4. Railway automatically sets `REDIS_URL`
5. Restart your app (redeploy)

### ❌ "Connection timeout"

**Possible causes:**
- Redis service not in same Railway project
- Network configuration issue
- Redis service crashed

**Solutions:**
1. Check Redis service status in Railway dashboard
2. Restart Redis service
3. Redeploy your app
4. Check Railway status page: https://railway.statuspage.io/

---

## ✅ Connection Checklist

Verify everything is working:

- [ ] Redis service exists in Railway project
- [ ] Redis service status is "Running" (green)
- [ ] `REDIS_URL` appears in environment variables
- [ ] App logs show "✅ Redis connected"
- [ ] `/health` endpoint shows `"cache": "redis"`
- [ ] Search queries return results (using cache)

---

## 🎯 Quick Commands

```bash
# Test Redis connection locally (if you have Railway Redis)
npm run test:redis

# Test on Railway
railway run npm run test:redis

# Check logs
railway logs

# View environment variables
railway variables

# Manual sync with Redis caching
railway run npm run sync:quick

# Check sync status
curl $RAILWAY_URL/api/admin/sync-status
```

---

## 📊 Redis Performance Monitoring

### Check Cache Stats
```bash
curl $RAILWAY_URL/api/admin/sync-status
```

**Response:**
```json
{
  "cache": {
    "enabled": true,
    "type": "redis",
    "keys": 142,
    "usedMemoryMB": "2.34"
  },
  "database": {
    "totalProducts": 112,
    "inStockProducts": 98
  }
}
```

### Railway Redis Metrics
1. Go to Railway dashboard
2. Click **Redis service**
3. View **Metrics** tab
4. See: Memory, Operations/sec, Connections

---

## 💡 Pro Tips

### 1. Redis is Optional
If Redis fails, your app automatically uses database caching. **Zero downtime!**

### 2. Cache TTL
Default: 5 minutes (300 seconds)

To change:
```env
REDIS_CACHE_TTL=180  # 3 minutes
```

### 3. Clear Cache
```bash
# Clear all cache
curl -X POST $RAILWAY_URL/api/admin/cache/clear

# Or via CLI
railway run npm run cache:clear
```

### 4. Monitor Cache Hit Rate
Check logs for cache performance:
```
✅ Product search (cache hit): 165ms
⚠️ Product search (cache miss): 475ms
```

---

## 🎉 You're All Set!

Your Redis is configured and ready:

✅ **Auto-configured** - Railway handles everything  
✅ **Auto-enabled** - App detects REDIS_URL  
✅ **Auto-cached** - Products cached with 5-min TTL  
✅ **Auto-fallback** - Uses DB if Redis unavailable  

**Just deploy and enjoy 3x faster response times!** 🚀

---

## 📚 Additional Resources

- [Railway Redis Docs](https://docs.railway.app/databases/redis)
- [ioredis Documentation](https://github.com/redis/ioredis)
- [Redis Commands](https://redis.io/commands)
- Your app's `src/services/dataSyncService.js` - Redis implementation

---

## 🆘 Need Help?

**Railway Issues:**
- Discord: https://discord.gg/railway
- Docs: https://docs.railway.app/help/getting-started

**App Issues:**
- Check: `railway logs`
- Test: `npm run test:redis`
- Contact: info@monostrade.mn

---

**🎊 Redis is ready to use!** Your chatbot will automatically connect when deployed to Railway.

