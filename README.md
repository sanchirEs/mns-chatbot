# 🤖 AI Pharmacy Chatbot Enterprise

A comprehensive, production-ready AI chatbot system for pharmacy operations built with OpenAI, Supabase, and advanced conversation management.

## ✨ Features

### 🔹 **Core Capabilities**
- **Intelligent Conversations**: Advanced context management with conversation memory
- **RAG (Retrieval Augmented Generation)**: Semantic search with vector embeddings
- **Function Calling**: 14+ specialized pharmacy functions (orders, stock, recommendations)
- **Streaming Responses**: Real-time response streaming for better UX
- **Multi-modal Search**: Hybrid semantic + full-text search

### 🔹 **Enterprise Features** 
- **Authentication**: JWT-based auth with role-based permissions
- **Rate Limiting**: Multiple rate limiting strategies (progressive, token bucket, sliding window)
- **Security**: Comprehensive input validation, XSS prevention, security headers
- **Monitoring**: Request logging, performance metrics, error tracking
- **Scalability**: Optimized database queries, caching, connection pooling

### 🔹 **Pharmacy-Specific Functions**
- Product search with symptom mapping
- Stock availability checking
- Order creation and tracking
- Drug interaction checking
- Dosage information lookup
- Price comparison and insurance coverage
- Pharmacist consultation scheduling
- Medication reminders

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ and npm 8+
- Supabase account
- OpenAI API account

### 1. Clone and Install
```bash
git clone <your-repo-url>
cd ai-pharmacy-chatbot-enterprise
npm install
```

### 2. Environment Setup
```bash
cp .env.example .env
# Edit .env with your actual configuration
```

### 3. Database Setup
```bash
# Run the SQL setup in your Supabase SQL editor
cat supabase-setup.sql
```

### 4. Start Development Server
```bash
npm run dev
```

Visit `http://localhost:3000/health` to verify the installation.

## 📖 Configuration

### Required Environment Variables
```env
# Core Services
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your_supabase_anon_key
OPENAI_API_KEY=sk-your_openai_api_key

# Security
JWT_SECRET=your_secure_secret_key
ALLOWED_ORIGINS=http://localhost:3000

# Features (optional)
AI_MODEL=gpt-4o
AI_TEMPERATURE=0.3
ENABLE_STREAMING=true
```

See `.env.example` for complete configuration options.

## 🏗️ Architecture

### System Overview
```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Frontend      │    │   Express API   │    │   Supabase      │
│   (Your App)    │───▶│   Server        │───▶│   Database      │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                │
                                ▼
                       ┌─────────────────┐
                       │   OpenAI API    │
                       │   (GPT-4 + Emb) │
                       └─────────────────┘
```

### Core Components

#### **Services Layer**
- **ConversationService**: Memory management, context optimization
- **SearchService**: Semantic search, caching, query understanding  
- **OrderService**: Order lifecycle, inventory management, validation

#### **Middleware Stack**
- **Authentication**: JWT, role-based access, session management
- **Rate Limiting**: Progressive limits, IP-based rules, emergency bypass
- **Validation**: Input sanitization, schema validation, security checks

#### **Function Calling System**
- **14 Specialized Functions**: From product search to consultation scheduling
- **Permission-Based**: Role and authentication-based function access
- **Error Handling**: Comprehensive error recovery and fallbacks

## 🔧 API Endpoints

### Chat Interface
```http
POST /api/chat
Content-Type: application/json
Authorization: Bearer <token> (optional)

{
  "message": "I need something for headaches",
  "sessionId": "optional-session-id"
}
```

### Streaming Chat
```http
POST /api/chat/stream
Content-Type: application/json

{
  "message": "Show me pain relief options",
  "sessionId": "session-123"
}
```

### Product Search
```http
GET /api/search?q=paracetamol&category=medicine&limit=10
```

### Order Management
```http
POST /api/orders
Authorization: Bearer <token>

{
  "items": [
    {"itemId": "uuid-here", "quantity": 2}
  ],
  "shippingAddress": { ... }
}
```

## 🛠️ Development

### Project Structure
```
src/
├── config/          # Environment, database, OpenAI setup
├── controllers/     # Request handlers (chat, orders)
├── middleware/      # Auth, validation, rate limiting
├── services/        # Business logic (conversation, search, orders)
├── utils/           # Function definitions and executor
└── app.js           # Main application setup
```

### Available Scripts
```bash
npm run dev          # Development with auto-reload
npm run start        # Production start
npm run test         # Run test suite
npm run lint         # Code linting
npm run db:migrate   # Database migrations
```

### Adding New Functions

1. **Define the function** in `src/utils/functionDefinitions.js`:
```javascript
{
  type: "function",
  function: {
    name: "myNewFunction",
    description: "What this function does",
    parameters: { /* OpenAPI schema */ }
  }
}
```

2. **Implement the function** in `src/utils/functionExecutor.js`:
```javascript
static async myNewFunction(args, context) {
  // Implementation here
  return { success: true, result: "..." };
}
```

3. **Add to the switch statement** in `executeFunction()`.

## 🔒 Security Features

### Input Security
- XSS prevention with HTML escaping
- SQL injection protection via parameterized queries
- Rate limiting with progressive penalties
- Request size limits and timeouts

### Authentication & Authorization
- JWT with configurable expiration
- Role-based function access (user, pharmacist, admin)
- Anonymous user support with limited permissions
- API key authentication for service-to-service calls

### Data Protection
- Conversation data encryption in transit
- PII detection and warnings
- Configurable data retention policies
- Secure session management

## 📊 Monitoring & Analytics

### Health Monitoring
- `/health` - Basic service health
- `/status` - Detailed system status with database and AI connectivity
- Request/response time tracking
- Error rate monitoring

### Conversation Analytics
- Token usage tracking with cost estimation
- Function call success rates
- User engagement metrics
- Performance benchmarks

### Database Maintenance
- Automatic conversation cleanup
- Cache management
- Connection pool monitoring
- Query performance optimization

## 🚀 Production Deployment

### Environment Checklist
- [ ] Set `NODE_ENV=production`
- [ ] Configure strong `JWT_SECRET` (64+ characters)
- [ ] Set restrictive `ALLOWED_ORIGINS`
- [ ] Enable request logging and monitoring
- [ ] Set up database backups
- [ ] Configure log aggregation
- [ ] Set up health check monitoring
- [ ] Enable rate limiting and security headers

### Recommended Infrastructure
- **Application**: PM2 or Docker containers
- **Database**: Supabase Pro with connection pooling
- **Monitoring**: Sentry for errors, DataDog/Grafana for metrics
- **Load Balancer**: nginx with SSL termination
- **CDN**: CloudFlare for static assets and DDoS protection

### Performance Optimizations
- Vector database indexing (pgvector with HNSW)
- Redis for caching (production upgrade from in-memory)
- Database read replicas for search queries
- Response compression and HTTP/2
- Connection pooling and keep-alive

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Code Standards
- ESLint configuration included
- Comprehensive JSDoc comments
- Error handling for all async operations
- Input validation for all endpoints
- Unit tests for critical functions

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

### Getting Help
- 📖 Check this README and inline code documentation
- 🔍 Search existing GitHub issues
- 💬 Create a new issue with detailed description
- 📧 Contact: [your-email@example.com]

### Common Issues

**OpenAI API Errors**: Check API key validity and quota
**Database Connection**: Verify Supabase URL and key
**CORS Issues**: Update `ALLOWED_ORIGINS` in environment
**Rate Limiting**: Adjust limits in configuration or upgrade plan

---

**Built with ❤️ for modern pharmacy operations**
