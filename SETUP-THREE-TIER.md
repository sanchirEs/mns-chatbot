# 🏗️ Three-Tier Architecture Setup

## Overview

Your AI pharmacy chatbot uses a three-tier data architecture:
- **TIER 1**: Vector DB (PostgreSQL + pgvector) - Static catalog
- **TIER 2**: Redis/DB Cache - Hot data (5-min TTL)
- **TIER 3**: Real-time API - Critical operations

## Database Schema

### Products Table (Static Catalog)
- Product information, embeddings for semantic search
- Updated: Daily at 2 AM

### Product_Inventory Table (Dynamic Data)
- Stock levels, prices, active status
- Updated: Every 5 minutes

### Supporting Tables
- `sync_log` - Sync monitoring
- `product_cache` - Fallback cache

## Sync Operations

### Full Catalog Sync
```bash
npm run sync:full
```
- Syncs all products from business API
- Generates embeddings
- Updates products + inventory tables
- Runs: Daily at 2 AM (production)

### Quick Stock Sync
```bash
npm run sync:quick
```
- Updates stock and prices only
- No embedding generation
- Runs: Every 5 minutes (production)

### Check Status
```bash
npm run sync:status
```

## Configuration

### Environment Variables
```env
# Core Services (Required)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-supabase-key
OPENAI_API_KEY=sk-your-openai-key
JWT_SECRET=your-secret-key-64-chars-min

# Redis (Optional - DB fallback available)
ENABLE_REDIS=true
REDIS_HOST=localhost
REDIS_PORT=6379

# Sync Settings
ENABLE_SCHEDULER=true  # Enable in production
GENERATE_EMBEDDINGS=true
```

### Sync Scheduler (Production)
When `ENABLE_SCHEDULER=true`:
- Stock sync: Every 5 minutes
- Catalog sync: Daily at 2 AM
- Cache cleanup: Every hour
- Health check: Every 30 minutes

## Troubleshooting

### No Search Results
1. Check embeddings exist: Run in Supabase SQL:
   ```sql
   SELECT COUNT(*) FROM products WHERE embedding IS NOT NULL;
   ```
2. If 0, run: `npm run embeddings:generate`
3. Restart server: `npm run dev`

### Sync Failures
1. Check business API: `curl "http://mns.bmall.mn/api/products?page=0&size=1&storeId=MK001"`
2. View sync logs in `sync_log` table
3. Re-run: `npm run migrate`

### Redis Errors
- Set `ENABLE_REDIS=false` in `.env`
- System uses database fallback automatically

## Admin Endpoints

```bash
GET  /api/admin/sync-status    # Check sync health
POST /api/admin/sync           # Manual sync
POST /api/admin/cache/clear    # Clear caches
POST /api/admin/scheduler/:action  # Control scheduler
```

## Production Deployment

1. Set `NODE_ENV=production`
2. Enable scheduler: `ENABLE_SCHEDULER=true`
3. Configure Redis (recommended)
4. Run initial sync: `npm run migrate`
5. Monitor sync health regularly

---

**For complete documentation, see README.md and QUICK-START.md**
