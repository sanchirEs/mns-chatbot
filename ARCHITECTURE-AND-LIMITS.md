# 🏗️ CHATBOT ARCHITECTURE & LIMITS

## 🔍 **How Product Search Works**

### **Full Pipeline:**

```
User Query: "парацэтмөл 400 байгаа юу?"
     ↓
┌─────────────────────────────────────────────────────────────┐
│ STEP 1: Query Parsing (Your Code)                          │
│ - Extract drug name: "парацетамол"                         │
│ - Extract dosage: "400мг"                                   │
│ - Cost: FREE                                                 │
└─────────────────────────────────────────────────────────────┘
     ↓
┌─────────────────────────────────────────────────────────────┐
│ STEP 2: Pre-Filter (PostgreSQL)                            │
│ - Filter by drug name + variants                            │
│ - SQL LIKE queries                                           │
│ - Cost: FREE (database query)                               │
│ - Result: 11 candidates                                      │
└─────────────────────────────────────────────────────────────┘
     ↓
┌─────────────────────────────────────────────────────────────┐
│ STEP 3: Generate Query Embedding (OpenAI) ✅               │
│ - Model: text-embedding-3-small                             │
│ - Input: "парацэтмөл 400 байгаа юу?" (28 tokens)           │
│ - Output: [0.123, -0.456, ...] (1536 dimensions)           │
│ - Cost: $0.00002 per query                                  │
│ - Speed: ~200ms                                              │
└─────────────────────────────────────────────────────────────┘
     ↓
┌─────────────────────────────────────────────────────────────┐
│ STEP 4: Vector Search (PostgreSQL + pgvector)              │
│ - Compare query embedding vs 11 product embeddings          │
│ - Cosine similarity calculation                             │
│ - Cost: FREE (database operation)                           │
│ - Speed: ~50ms                                               │
│ - Result: 4 similar products                                 │
└─────────────────────────────────────────────────────────────┘
     ↓
┌─────────────────────────────────────────────────────────────┐
│ STEP 5: Enrich with Inventory (Redis/PostgreSQL)           │
│ - Get price, stock, availability                             │
│ - Cost: FREE (cache/database)                               │
│ - Speed: ~10ms                                               │
└─────────────────────────────────────────────────────────────┘
     ↓
┌─────────────────────────────────────────────────────────────┐
│ STEP 6: Smart Ranking (Your Code)                          │
│ - Drug match: +0.40                                          │
│ - Dosage match: +0.30                                        │
│ - Wrong drug: -0.50                                          │
│ - Cost: FREE                                                 │
│ - Speed: ~1ms                                                │
└─────────────────────────────────────────────────────────────┘
     ↓
┌─────────────────────────────────────────────────────────────┐
│ STEP 7: Build Context (Your Code)                          │
│ - Format: "Парацетамол 500мг - ₮572 (2758 ширхэг)"        │
│ - Create searchable context string                          │
│ - Cost: FREE                                                 │
└─────────────────────────────────────────────────────────────┘
     ↓
┌─────────────────────────────────────────────────────────────┐
│ STEP 8: Generate Response (OpenAI Chat) ✅                 │
│ - Model: gpt-4-turbo                                         │
│ - Input:                                                     │
│   * System prompt (rules + product context)                 │
│   * Conversation history (last 10 messages)                 │
│   * User query                                               │
│ - Total tokens: ~500-2000 tokens                            │
│ - Output: Natural language response in Mongolian           │
│ - Cost: $0.01-$0.03 per chat                                │
│ - Speed: ~1000-2000ms                                        │
└─────────────────────────────────────────────────────────────┘
     ↓
Final Response: "Тийм, манайд Парацетамол 500мг №10 
                 бэлэн байна. Үнэ: 572₮, Нөөц: 2758 ширхэг."
```

---

## 💰 **Cost Breakdown**

### **Per Chat Request:**

| Component | Model/Service | Cost | Speed |
|-----------|---------------|------|-------|
| Query Embedding | text-embedding-3-small | $0.00002 | 200ms |
| Vector Search | PostgreSQL pgvector | FREE | 50ms |
| Chat Response | gpt-4-turbo | $0.01-$0.03 | 1-2s |
| **TOTAL** | | **$0.01-$0.03** | **~1.5s** |

### **Monthly Estimates:**

| Volume | Embedding Cost | Chat Cost | Total Cost |
|--------|----------------|-----------|------------|
| 1,000 chats | $0.02 | $10-$30 | **~$15** |
| 10,000 chats | $0.20 | $100-$300 | **~$150** |
| 100,000 chats | $2.00 | $1,000-$3,000 | **~$1,500** |

**Note:** Chat cost varies based on:
- Conversation length (more history = more tokens)
- Product context size (more products = more tokens)
- Response length

---

## ⚡ **Performance Limits**

### **Search Performance:**
- **Simple query (no products):** ~50ms
- **With embeddings:** ~200-300ms
- **With OpenAI chat:** ~1500-2500ms
- **Concurrent users:** 100+ (depending on server)

### **OpenAI API Limits:**

| Plan | RPM (Requests/Min) | TPM (Tokens/Min) | Daily Limit |
|------|-------------------|------------------|-------------|
| Free Tier | 3 | 40,000 | Very limited |
| Pay-as-you-go | 500 | 90,000 | No limit |
| Tier 2 | 5,000 | 450,000 | No limit |

**Your current bottleneck:** OpenAI API rate limits, not your code!

---

## 🎯 **What Uses OpenAI vs What Doesn't**

### **Uses OpenAI:**
✅ **Embedding generation** for search queries  
✅ **Embedding generation** during product sync  
✅ **Chat completions** for natural language responses  

### **Doesn't Use OpenAI:**
❌ Query parsing (regex + dictionary matching)  
❌ Pre-filtering (SQL LIKE queries)  
❌ Vector similarity search (PostgreSQL pgvector)  
❌ Ranking (your scoring algorithm)  
❌ Cache lookups (Redis/PostgreSQL)  

---

## 📊 **Database Performance**

### **Product Embeddings:**
- **Current:** ~2,228 products with embeddings
- **Target:** 7,000 products
- **Storage:** ~43MB for 7,000 products (1536 dims × 4 bytes × 7000)
- **Search speed:** O(n) linear scan, but fast (<50ms for 7000 products)

### **Optimization Opportunity:**
For >10,000 products, consider **HNSW indexing**:
```sql
CREATE INDEX ON products USING hnsw (embedding vector_cosine_ops);
```
This makes search O(log n) but requires more memory.

---

## 🚦 **Rate Limiting Strategy**

### **Current Setup:**
```javascript
// In src/app.js
const chatLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 10, // 10 requests per minute per IP
  message: 'Too many requests, please try again later.'
});
```

### **Recommended Limits:**

| User Type | Rate Limit | Reason |
|-----------|------------|--------|
| Anonymous | 5/min | Prevent abuse |
| Authenticated | 20/min | Normal usage |
| Premium | 60/min | Power users |

---

## 🧪 **How to Test**

### **1. Test Search Only (No OpenAI Chat):**
```bash
node -e "
import('./src/services/productSearchService.js').then(async m => {
  const results = await m.ProductSearchService.search('парацетамол', { limit: 5 });
  console.log('Found:', results.products?.length || 0, 'products');
  results.products?.forEach(p => console.log('  -', p.name));
});
"
```

**This tests:**
- Query parsing
- Pre-filtering
- OpenAI embeddings ✅
- Vector search
- Ranking

**Cost:** $0.00002 per search

---

### **2. Test Full Chat (With OpenAI):**
```bash
# Start your server first
npm start

# Then run test
node test-complete-chat.js
```

**This tests:**
- Full pipeline
- OpenAI embeddings ✅
- OpenAI chat completions ✅
- Conversation history
- System prompts

**Cost:** ~$0.02 per test run

---

### **3. Test on Production (Railway):**
```bash
# Get your Railway URL
railway variables

# Update test script
export API_URL="https://your-app.railway.app"
node test-complete-chat.js
```

---

## 🎛️ **Configuration Options**

### **Search Sensitivity:**
```javascript
// In src/services/productSearchService.js
ProductSearchService.search(query, {
  limit: 5,              // Top N results
  threshold: 0.5,        // Similarity threshold (0-1)
  includeInactive: true, // Show out-of-stock items
  realTimeStock: false   // Call business API for real-time data
})
```

**Lower threshold (0.3)** = More results, less accurate  
**Higher threshold (0.7)** = Fewer results, more accurate

### **OpenAI Model Options:**

| Model | Speed | Cost | Quality |
|-------|-------|------|---------|
| gpt-3.5-turbo | Fast (500ms) | $0.001 | Good |
| gpt-4-turbo | Medium (1.5s) | $0.02 | Excellent |
| gpt-4o | Fast (800ms) | $0.015 | Excellent |

**Recommendation:** Use `gpt-4-turbo` for production (best quality/cost ratio)

---

## 📈 **Scaling Considerations**

### **At 1,000 users/day:**
- Cost: ~$15-$30/month
- Performance: No issues
- Rate limits: No issues

### **At 10,000 users/day:**
- Cost: ~$150-$300/month
- Performance: Consider Redis caching for embeddings
- Rate limits: Upgrade to Tier 2

### **At 100,000 users/day:**
- Cost: ~$1,500-$3,000/month
- Performance: 
  - Add HNSW indexing
  - Cache common queries
  - Consider regional deployments
- Rate limits: Enterprise plan

---

## 🎯 **Testing Recommendations**

### **Basic Tests (Free):**
1. ✅ Query parsing
2. ✅ Pre-filtering
3. ✅ Vector search
4. ✅ Ranking

### **With OpenAI (Costs $):**
1. ✅ Full chat responses
2. ✅ Conversation continuity
3. ✅ Multi-language support
4. ✅ Medical advice refusal

### **Load Testing:**
```bash
# Use Apache Bench or similar
ab -n 100 -c 10 -p query.json -T application/json \
   https://your-app.railway.app/api/chat
```

---

## 💡 **Optimization Tips**

### **1. Cache Common Queries:**
```javascript
// Cache "парацетамол" embedding for 1 hour
const cacheKey = `embedding:${query}`;
const cached = await redis.get(cacheKey);
if (cached) return JSON.parse(cached);
```

### **2. Batch Product Embeddings:**
```javascript
// Generate embeddings in batches during sync
const batchSize = 100;
for (let i = 0; i < products.length; i += batchSize) {
  const batch = products.slice(i, i + batchSize);
  await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: batch.map(p => p.searchable_text)
  });
}
```

### **3. Use Streaming for Chat:**
```javascript
// Stream responses for better UX
const stream = await openai.chat.completions.create({
  model: 'gpt-4-turbo',
  messages: messages,
  stream: true
});
```

---

## 📝 **Summary**

**Yes, you ARE using OpenAI:**
1. **Embeddings** - Every search query and every product
2. **Chat** - Every response generation

**No, it's not ONLY OpenAI:**
- You have smart pre-filtering
- You have pharmaceutical intelligence
- You have custom ranking

**Cost per chat:** ~$0.01-$0.03  
**Speed per chat:** ~1.5 seconds  
**Current limit:** OpenAI API rate limits (500 RPM on pay-as-you-go)

**To test everything, run:**
```bash
node test-complete-chat.js
```

This will show you the full potential and limits! 🚀

