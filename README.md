# 🏥 AI Pharmacy Chatbot - Monos Trade

Enterprise-grade AI chatbot for pharmaceutical distribution with intelligent product search, RAG (Retrieval Augmented Generation), and multi-language support.

## 🌟 Features

- **🔍 Intelligent Product Search** - Semantic search with OpenAI embeddings + PostgreSQL pgvector
- **💊 Pharmaceutical Intelligence** - Recognizes drug names, dosages, and brand variants
- **🇲🇳 Mongolian Language Support** - Native support for Cyrillic and common misspellings
- **💬 Natural Conversations** - Multi-turn dialogue with context awareness
- **📊 Real-time Inventory** - Redis caching with PostgreSQL fallback
- **🚫 Safety First** - Refuses medical advice, redirects to healthcare professionals
- **⚡ High Performance** - ~1.5s response time, supports 100+ concurrent users

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ User Query                                                  │
│ "танайд парацэтмөл 400 байгаа юу?"                         │
└──────────────────┬──────────────────────────────────────────┘
                   ↓
┌──────────────────────────────────────────────────────────────┐
│ Query Parser (Your Code)                                     │
│ Extracts: Drug="парацетамол", Dosage="400мг"                │
└──────────────────┬───────────────────────────────────────────┘
                   ↓
┌──────────────────────────────────────────────────────────────┐
│ Pre-Filter (PostgreSQL)                                      │
│ Filters by drug name + brand variants                        │
└──────────────────┬───────────────────────────────────────────┘
                   ↓
┌──────────────────────────────────────────────────────────────┐
│ OpenAI Embeddings API                                        │
│ Converts query to 1536-dimensional vector                    │
└──────────────────┬───────────────────────────────────────────┘
                   ↓
┌──────────────────────────────────────────────────────────────┐
│ Vector Search (pgvector)                                     │
│ Finds similar products using cosine similarity               │
└──────────────────┬───────────────────────────────────────────┘
                   ↓
┌──────────────────────────────────────────────────────────────┐
│ Smart Ranking                                                 │
│ Drug match +0.40, Dosage match +0.30, Wrong drug -0.50      │
└──────────────────┬───────────────────────────────────────────┘
                   ↓
┌──────────────────────────────────────────────────────────────┐
│ OpenAI Chat Completion                                       │
│ Generates natural Mongolian response with product info       │
└──────────────────┬───────────────────────────────────────────┘
                   ↓
                Response
```

## 📦 Tech Stack

- **Backend:** Node.js + Express
- **Database:** PostgreSQL (Supabase) with pgvector extension
- **Cache:** Redis (Railway)
- **AI:** OpenAI GPT-4 Turbo + text-embedding-3-small
- **Deployment:** Railway
- **Language:** JavaScript (ES Modules)

## 🚀 Quick Start

### 1. Prerequisites

```bash
node >= 18.0.0
npm >= 8.0.0
PostgreSQL 15+ with pgvector extension
Redis (optional but recommended)
```

### 2. Installation

```bash
# Clone repository
git clone <your-repo-url>
cd chatbot

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your credentials
```

### 3. Environment Variables

```env
# Required
DATABASE_URL=postgresql://...
SUPABASE_URL=https://...
SUPABASE_ANON_KEY=...
OPENAI_API_KEY=sk-...

# Business API
BUSINESS_API_BASE=http://mns.bmall.mn/api
BUSINESS_API_STORE_ID=MK001

# Redis (optional)
REDIS_URL=redis://...

# Server
PORT=3000
NODE_ENV=production
```

### 4. Database Setup

```bash
# Run migrations
psql $DATABASE_URL < supabase/migrations/20250108000000_three_tier_architecture.sql
```

### 5. Sync Products

```bash
# Initial sync (one-time)
npm run sync:full

# This will:
# - Fetch all products from business API
# - Generate OpenAI embeddings
# - Store in PostgreSQL with pgvector
# - Takes ~10-20 minutes for 7,000 products
```

### 6. Start Server

```bash
# Development
npm run dev

# Production
npm start
```

### 7. Test

```bash
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"message": "парацетамол байгаа юу?", "sessionId": "test123"}'
```

## 📚 API Documentation

### POST `/api/chat`

**Request:**
```json
{
  "message": "танайд парацэтмөл 400 байгаа юу?",
  "sessionId": "optional-session-id",
  "metadata": {}
}
```

**Response:**
```json
{
  "reply": "Тийм, манайд Парацетамол 500мг №10 бэлэн байна...",
  "sessionId": "session_abc123",
  "metadata": {
    "source": "product_search",
    "productsFound": 3,
    "responseTime": 1250
  },
  "timestamp": "2025-10-12T07:39:52.947Z"
}
```

### GET `/health`

Health check endpoint for monitoring.

## 🎯 Key Features Explained

### 1. Intelligent Query Parsing

Understands natural language queries in Mongolian:
- "танайд парацэтмөл 400 байгаа юу?" → Drug: парацетамол, Dosage: 400мг
- "ибупрофен байгаа юу?" → Drug: ибупрофен
- Handles spelling variants (парацэтамол, парацэтмөл, парацетмол)

### 2. Brand Name Recognition

Recognizes brand names and generic names:
- "Ибумон" = Ibuprofen
- "Гофен" = Ibuprofen  
- "Нольпаза" = Pantoprazole
- "Чамп" = Paracetamol

### 3. Smart Ranking System

| Factor | Score Adjustment | Example |
|--------|-----------------|---------|
| Exact drug match | +0.40 | "Парацетамол" for "парацетамол" query |
| Exact dosage match | +0.30 | "400мг" for "400" query |
| Close dosage (±20%) | +0.15 | "500мг" for "400" query |
| Wrong drug | -0.50 | "Пантопразол" for "парацетамол" query |
| In stock | +0.10 | available > 0 |

### 4. Safety Features

- ✅ Refuses medical advice
- ✅ Refuses dosage recommendations
- ✅ Redirects to healthcare professionals
- ✅ Only provides product availability information

## 📊 Performance & Cost

### Response Times
- **Simple query:** ~50ms
- **With embeddings:** ~300ms
- **Full chat:** ~1.5s

### Costs (per chat)
- **Embedding:** $0.00002
- **Chat completion:** $0.01-$0.03
- **Total:** ~$0.02 per chat

### Monthly Estimates
| Volume | Cost |
|--------|------|
| 1,000 chats | ~$15 |
| 10,000 chats | ~$150 |
| 100,000 chats | ~$1,500 |

## 🛠️ Available Scripts

```bash
# Development
npm run dev              # Start with nodemon

# Production
npm start                # Start server
npm run sync:full        # Sync all products from API
npm run sync:quick       # Quick inventory update
npm run cache:clear      # Clear Redis cache

# Utilities
npm run embeddings:generate  # Generate missing embeddings
npm run migrate              # Run database migrations
```

## 📁 Project Structure

```
chatbot/
├── src/
│   ├── app.js                      # Express app & routes
│   ├── config/                     # Configuration
│   │   ├── database.js             # Supabase client
│   │   ├── environment.js          # Environment variables
│   │   └── openai.js               # OpenAI client
│   ├── controllers/
│   │   └── chatController.js       # Chat logic
│   ├── services/
│   │   ├── dataSyncService.js      # Product sync
│   │   ├── productSearchService.js # Intelligent search
│   │   ├── conversationService.js  # Conversation management
│   │   └── faqService.js           # FAQ & safety checks
│   ├── middleware/
│   │   ├── authentication.js       # JWT auth
│   │   ├── rateLimiting.js         # Rate limits
│   │   └── validation.js           # Input validation
│   └── jobs/
│       └── syncScheduler.js        # Scheduled syncs
├── scripts/
│   ├── sync-products.js            # Manual sync
│   ├── generate-embeddings.js      # Embedding generation
│   └── migrate-to-three-tier.js    # Migration script
├── supabase/
│   └── migrations/
│       └── 20250108000000_three_tier_architecture.sql
└── package.json
```

## 🚢 Deployment (Railway)

### 1. Create Railway Project

```bash
railway login
railway init
```

### 2. Add Services

- PostgreSQL (with pgvector)
- Redis
- Node.js app

### 3. Set Environment Variables

```bash
railway variables set OPENAI_API_KEY=sk-...
railway variables set BUSINESS_API_BASE=http://mns.bmall.mn/api
# ... (set all required variables)
```

### 4. Deploy

```bash
git push origin main
# Railway auto-deploys from main branch
```

### 5. Run Initial Sync

```bash
railway run npm run sync:full
```

## 🔧 Configuration

### Search Sensitivity

```javascript
// Lower threshold = more results, less accurate
// Higher threshold = fewer results, more accurate
ProductSearchService.search(query, {
  threshold: 0.5  // Default: 0.5 (balanced)
})
```

### Rate Limiting

```javascript
// In src/middleware/rateLimiting.js
const chatLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,  // 1 minute
  max: 10                    // 10 requests per minute
});
```

## 📖 Documentation

- **[Quick Start Guide](./QUICK-START.md)** - Get started quickly
- **[Deployment Guide](./DEPLOYMENT.md)** - Deploy to Railway
- **[Architecture & Limits](./ARCHITECTURE-AND-LIMITS.md)** - Technical deep dive
- **[Search Improvements](./SEARCH-IMPROVEMENTS-SUMMARY.md)** - How search works

## 🐛 Troubleshooting

### "No products found" error
- Check if products are synced: `railway run npm run sync:status`
- Run full sync: `railway run npm run sync:full`

### Slow responses
- Check OpenAI API status
- Verify Redis connection
- Monitor database performance

### Rate limit errors
- Adjust rate limits in `src/middleware/rateLimiting.js`
- Upgrade OpenAI plan for higher limits

## 📝 License

MIT

## 🤝 Contact

- **Company:** Monos Trade LLC
- **Phone:** +976 7766 6688
- **Email:** info@monostrade.mn

---

**Built with ❤️ for pharmaceutical distribution in Mongolia**
