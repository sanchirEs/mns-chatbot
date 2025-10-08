# ⚡ Quick Start Guide

## 🚀 5-Minute Setup

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment
Create `.env` file:
```env
# Required
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-supabase-anon-key
OPENAI_API_KEY=sk-your-openai-key
JWT_SECRET=your-secure-secret-min-64-chars

# Optional
REDIS_HOST=localhost
REDIS_PORT=6379
ENABLE_REDIS=false  # Set true if Redis available
NODE_ENV=development
```

### 3. Database Setup
1. Open Supabase Dashboard → SQL Editor
2. Copy contents of `supabase/migrations/20250108000000_three_tier_architecture.sql`
3. Paste and run in SQL Editor

### 4. Initial Data Sync
```bash
npm run migrate
```

This will:
- ✅ Sync products from http://mns.bmall.mn/api
- ✅ Generate embeddings for semantic search
- ✅ Test all components

### 5. Start Server
```bash
npm run dev
```

**Done! Server running at http://localhost:3000** 🎉

## 🧪 Test Your Setup

```bash
# Test search
curl "http://localhost:3000/api/search?q=vitamin"

# Test chat  
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Do you have vitamin?"}'

# Check sync status
curl http://localhost:3000/api/admin/sync-status
```

---

## 📋 **Common Commands**

```bash
# Sync Operations
npm run sync:test       # Test sync
npm run sync:quick      # Quick stock sync
npm run sync:full       # Full catalog sync (1000 products)
npm run sync:status     # Check sync status

# Development
npm run dev             # Start dev server
npm run health-check    # Health check

# Maintenance
npm run cache:clear     # Clear all caches
npm run cleanup         # Clean old data
```

---

## 🎯 **Expected Results**

### **After `npm run migrate`**:
```
✅ 200 products synced
✅ Embeddings generated
✅ Search working
✅ Health: healthy
```

### **After `npm run sync:status`**:
```json
{
  "database": {
    "totalProducts": 200,
    "inStockProducts": 156,
    "activeProducts": 189
  },
  "health": "healthy"
}
```

### **After search test**:
```json
{
  "query": "paracetamol",
  "results": [
    {
      "name": "Парацетамол 400мг №10",
      "price": 18040,
      "available": 206,
      "stockStatus": "in_stock"
    }
  ]
}
```

---

## 🚨 **Troubleshooting**

### **Problem: Sync fails**
```bash
# Check business API
curl "http://mns.bmall.mn/api/products?page=0&size=1&storeId=MK001"

# Check if it returns JSON
```

### **Problem: No search results**
```bash
# Verify products exist
npm run sync:status

# Re-run sync
npm run sync:quick
```

### **Problem: Redis connection failed**
```bash
# It's OK! System will use database fallback
# To enable Redis:
docker run -d -p 6379:6379 redis:alpine
```

---

## 🎉 **You're Ready!**

Your three-tier architecture is:
- ✅ Installed
- ✅ Configured
- ✅ Synced
- ✅ Running

**Next**: Read `ARCHITECTURE-GUIDE.md` for details or `SETUP-THREE-TIER.md` for advanced configuration.

**Support**: All guides are in the project root.

