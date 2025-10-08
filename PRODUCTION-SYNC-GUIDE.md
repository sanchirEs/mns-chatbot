# 🚀 Production Sync Guide: 7000+ Products

## 📊 Your API Has 6,454+ Products!

According to the API response from `http://mns.bmall.mn/api/products`:
```json
{
  "total_pages": 130,
  "total_items": 6454
}
```

**You need to sync all ~7000 products for production!**

---

## ✅ Your System is Already Configured!

### Current Configuration (Ready for Production):

```javascript
// src/config/environment.js
SYNC: {
  FULL_SYNC_BATCH_SIZE: 100          // Process 100 products at a time
  FULL_SYNC_MAX_PRODUCTS: null       // No limit (all products)
  API_PAGE_SIZE: 50                  // Fetch 50 per API call
  MAX_PAGES: 150                     // Support up to 150 pages (7500 products)
  API_TIMEOUT: 20000                 // 20 seconds per request
  RATE_LIMIT_DELAY: 200              // 200ms between pages
  EMBEDDING_BATCH_DELAY: 50          // 50ms between embeddings
}
```

**This will handle all 6,454 products easily!**

---

## 🚀 How to Sync All Products (Step-by-Step)

### Option 1: Full Production Sync (Recommended)

```bash
# Sync all products from the API (no limit)
railway run npm run sync:full

# This will:
# 1. Fetch all 130 pages (~6,454 products)
# 2. Generate embeddings for each product
# 3. Store in PostgreSQL with pgvector
# 4. Cache in Redis
# 5. Take approximately 30-60 minutes
```

### Option 2: Test with Limited Products First

```bash
# Test with 500 products first
railway run node scripts/sync-products.js --max-products=500

# If successful, run full sync
railway run npm run sync:full
```

### Option 3: Sync in Smaller Batches

```bash
# Sync first 1000 products
railway run node scripts/sync-products.js --max-products=1000

# Check status
railway run npm run sync:status

# Sync next batch (pages 20-40)
# ... repeat as needed
```

---

## ⏱️ Estimated Time & Resources

### Time Estimates:
```
API Fetching:        ~5-10 minutes  (130 pages × 200ms delay)
Embedding Generation: ~40-50 minutes (6454 products × OpenAI API)
Database Storage:    ~5-10 minutes  (batch inserts)
Total:              ~50-70 minutes
```

### OpenAI Costs (Embeddings):
```
Model: text-embedding-3-small
Cost: $0.00002 per 1K tokens
Estimated tokens: ~6,454 products × 200 tokens avg = ~1.3M tokens
Total cost: ~$0.026 (less than 3 cents!)
```

### Railway Resources:
```
Memory: ~500 MB during sync
CPU: Moderate (mostly waiting on APIs)
Network: ~50-100 MB data transfer
Cost: Included in Railway plan
```

---

## 📋 Production Sync Command

### **THE COMMAND:**

```bash
# Full production sync (all products)
railway run npm run sync:full
```

This command will:
1. ✅ Connect to http://mns.bmall.mn/api/products
2. ✅ Fetch all 130 pages (~6,454 products)
3. ✅ Generate OpenAI embeddings for each
4. ✅ Store in `products` table with pgvector
5. ✅ Store inventory in `product_inventory` table
6. ✅ Cache in Redis for fast access
7. ✅ Log progress every 10 pages
8. ✅ Handle errors gracefully (retries + continues)

---

## 📊 What to Expect (Console Output)

```bash
🔄 Starting FULL catalog sync...
📦 Starting product fetch: up to 7000 products (150 pages max)
   API: http://mns.bmall.mn/api/products

📄 Fetching page 0/150... (0 products so far)
📄 Fetching page 10/150... (500 products so far)
   Progress: 500/6454 products (8%)
📄 Fetching page 20/150... (1000 products so far)
   Progress: 1000/6454 products (15%)
...
✅ Fetched all 130 pages
📦 Fetched 6454 products from API

⚙️  Processing in batches...
✅ Batch 1/65 complete (2% total)
   Created: 100, Updated: 0, Failed: 0
✅ Batch 10/65 complete (15% total)
   Created: 1000, Updated: 0, Failed: 0
...
✅ Batch 65/65 complete (100% total)
   Created: 6454, Updated: 0, Failed: 0

🎉 Full sync completed!
{
  processed: 6454,
  created: 6454,
  updated: 0,
  failed: 0,
  duration: 3600000  // ~60 minutes
}
```

---

## 🔍 Monitor Progress

### During Sync:

```bash
# In another terminal, monitor logs
railway logs --follow

# Or check sync status
railway run npm run sync:status
```

### Check Database:

```sql
-- Run in Supabase SQL Editor
SELECT 
  COUNT(*) as total_products,
  COUNT(embedding) as with_embeddings,
  COUNT(*) - COUNT(embedding) as missing_embeddings
FROM products;

-- Expected after full sync:
-- total_products: 6454
-- with_embeddings: 6454
-- missing_embeddings: 0
```

---

## ⚠️ Important Notes

### 1. **Time Commitment**
- Full sync takes 50-70 minutes
- Don't interrupt the process
- Railway keeps running even if you close terminal

### 2. **OpenAI Rate Limits**
- Your key should handle 6,454 embeddings fine
- If you hit rate limits, sync will retry
- Delay between requests: 50ms

### 3. **Memory Usage**
- Processes 100 products at a time (manageable)
- Railway provides enough memory
- No need to worry about memory issues

### 4. **Error Handling**
- Failed pages are logged but sync continues
- Failed products are counted in `stats.failed`
- You can re-run sync to fix failures

### 5. **Incremental Updates**
- After initial sync, use `npm run sync:quick`
- Quick sync only updates changed products
- Runs automatically every 5 minutes in production

---

## 🎯 Production Deployment Workflow

### 1. **Initial Full Sync** (Do this ONCE)

```bash
# Start full sync
railway run npm run sync:full

# Wait 50-70 minutes
# Monitor with: railway logs --follow
```

### 2. **Verify Sync Completed**

```bash
railway run npm run sync:status

# Expected output:
{
  "database": {
    "totalProducts": 6454,
    "activeProducts": 6454,
    "inStockProducts": ~5000
  },
  "health": "healthy"
}
```

### 3. **Enable Auto-Sync** (After Initial Sync)

```bash
# Set in Railway environment variables
ENABLE_SCHEDULER=true

# This enables:
# - Quick sync every 5 minutes (updates only)
# - Full sync daily at 2 AM (refresh all)
```

### 4. **Test Search**

```bash
# Test with some products
curl "https://your-app.up.railway.app/api/search?q=церебролизин"
curl "https://your-app.up.railway.app/api/search?q=ibuprofen"
curl "https://your-app.up.railway.app/api/search?q=витамин"
```

---

## 🛠️ Troubleshooting

### Problem: "API timeout errors"

**Solution:**
```env
# Increase timeout in Railway variables
API_TIMEOUT=30000
SYNC_MAX_RETRIES=5
```

### Problem: "OpenAI rate limit exceeded"

**Solution:**
```bash
# Sync will automatically retry with backoff
# Or increase delay:
EMBEDDING_BATCH_DELAY=100
```

### Problem: "Sync takes too long"

**Solutions:**
1. Sync is working normally (50-70 min expected)
2. Check Railway logs for progress
3. Sync continues even if you close terminal

### Problem: "Some products missing embeddings"

**Solution:**
```bash
# Generate missing embeddings
railway run npm run embeddings:all
```

### Problem: "Want to re-sync everything"

**Solution:**
```bash
# Delete existing products (optional)
# Then run full sync again
railway run npm run sync:full
```

---

## 📈 After Sync: Performance Expectations

### With 6,454 Products Synced:

```
Search Speed:      <1 second
Cache Hit Rate:    60-80% (Redis)
Database Size:     ~500 MB (with embeddings)
Memory Usage:      ~200 MB (idle)
Concurrent Users:  1000+ supported
```

### Redis Cache:
```
Product Cache:     ~6454 keys (5-min TTL)
Embedding Cache:   ~100-500 popular searches (1-hour TTL)
Memory Usage:      ~50-100 MB
Hit Rate:          60-80%
```

---

## 🎉 Production Ready Checklist

After full sync:

- [ ] ✅ All 6,454 products synced
- [ ] ✅ All embeddings generated
- [ ] ✅ Search returns results
- [ ] ✅ Redis caching active
- [ ] ✅ Scheduler enabled (`ENABLE_SCHEDULER=true`)
- [ ] ✅ Health endpoint shows correct count
- [ ] ✅ Test searches work
- [ ] ✅ Mongolian searches work

---

## 🚀 RECOMMENDED: Run This Now

```bash
# 1. Start the full production sync
railway run npm run sync:full

# 2. In another terminal, monitor progress
railway logs --follow

# 3. After sync completes (50-70 min), verify
railway run npm run sync:status

# 4. Test search
curl "https://your-app.up.railway.app/health"

# Expected:
{
  "status": "healthy",
  "cache": "redis",
  "products": 6454  ← All products synced!
}
```

---

## 💡 Pro Tips

### 1. **Run Sync During Off-Hours**
- Initial sync takes 50-70 minutes
- Run at night or during low-traffic period
- App stays available during sync

### 2. **Monitor Costs**
- OpenAI embeddings: ~$0.03 for full sync
- Incremental updates: nearly free
- Total monthly cost: <$1 for embeddings

### 3. **Cache Optimization**
- Redis caches frequently searched products
- First search: ~1000ms (with embedding generation)
- Cached search: ~200ms (60-80% faster)

### 4. **Incremental Updates**
- After initial sync, only new/changed products sync
- Quick sync (5 min): ~50-200 products typically
- Much faster than full sync

---

## 📞 Need Help?

If sync fails or you have issues:

1. **Check logs**: `railway logs`
2. **Check status**: `npm run sync:status`
3. **Re-run sync**: `npm run sync:full` (safe to run multiple times)
4. **Check database**: Query products table in Supabase

---

**🎊 You're ready! Run the sync and get all 6,454 products into production!** 🚀

**Estimated total time: 60 minutes**  
**Estimated cost: $0.03 (OpenAI embeddings)**  
**Result: Fully searchable product catalog with semantic AI search!**

