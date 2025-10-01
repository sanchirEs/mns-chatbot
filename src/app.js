// Working Enterprise AI Chatbot - Production Ready Version
console.log('🚀 Starting Enterprise AI Pharmacy Chatbot...');

try {
  // Import working modules
  const express = (await import('express')).default;
  const cors = (await import('cors')).default;
  const helmet = (await import('helmet')).default;
  const compression = (await import('compression')).default;
  const { OpenAIService } = await import('./config/openai.js');
  const { supabase } = await import('./config/database.js');
  const { config, validateConfig } = await import('./config/environment.js');
  const { securityHeaders } = await import('./middleware/authentication.js');
  const FAQService = (await import('./services/faqService.js')).default;

  console.log('✅ All modules imported successfully');

  // Validate configuration
  validateConfig();
  console.log('✅ Configuration validated');

  // Create Express app
  const app = express();

  // Security middleware
  app.use(securityHeaders);
  app.use(helmet({
    contentSecurityPolicy: config.SERVER.IS_PRODUCTION ? {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'"]
      }
    } : false,
    crossOriginEmbedderPolicy: false
  }));

  // CORS with detailed logging
  app.use(cors({
    origin: (origin, callback) => {
      console.log(`🌐 CORS request from origin: ${origin || 'no-origin'}`);
      
      // Allow requests with no origin (mobile apps, curl, postman)
      if (!origin) {
        console.log('✅ Allowing request with no origin');
        return callback(null, true);
      }
      
      // Check if origin is allowed
      const isAllowed = config.SECURITY.ALLOWED_ORIGINS.some(allowedOrigin => {
        if (allowedOrigin.includes('*')) {
          // Handle wildcard patterns like https://*.railway.app
          const pattern = allowedOrigin.replace('*', '.*');
          const regex = new RegExp(`^${pattern}$`);
          return regex.test(origin);
        }
        return origin === allowedOrigin;
      });
      
      if (isAllowed) {
        console.log(`✅ CORS origin allowed: ${origin}`);
        callback(null, true);
      } else {
        console.log(`❌ CORS origin blocked: ${origin}`);
        console.log(`📝 Allowed origins: ${config.SECURITY.ALLOWED_ORIGINS.join(', ')}`);
        callback(new Error('Not allowed by CORS'), false);
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
  }));

  // Request logging middleware
  app.use((req, res, next) => {
    const start = Date.now();
    console.log(`📡 ${req.method} ${req.url} - ${req.get('origin') || 'no-origin'}`);
    
    res.on('finish', () => {
      const duration = Date.now() - start;
      console.log(`📡 ${req.method} ${req.url} - ${res.statusCode} (${duration}ms)`);
    });
    
    next();
  });

  // Body parsing
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Compression
  app.use(compression({ threshold: 1024, level: 6 }));

  console.log('✅ Middleware configured');

  // ==================== ROUTES ====================

  // Health check
  app.get('/health', (req, res) => {
    res.json({
      status: 'healthy',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      environment: config.SERVER.NODE_ENV
    });
  });

  // System status
  app.get('/status', async (req, res) => {
    try {
      const { testDatabaseConnection } = await import('./config/database.js');
      const { testOpenAIConnection } = await import('./config/openai.js');

      const [dbStatus, aiStatus] = await Promise.all([
        testDatabaseConnection(),
        testOpenAIConnection()
      ]);

      res.json({
        services: {
          database: dbStatus ? 'connected' : 'disconnected',
          openai: aiStatus ? 'connected' : 'disconnected'
        },
        system: {
          uptime: process.uptime(),
          memory: process.memoryUsage(),
          nodeVersion: process.version
        },
        config: {
          host: config.SERVER.HOST,
          port: config.SERVER.PORT,
          environment: config.SERVER.NODE_ENV
        }
      });
    } catch (error) {
      res.status(500).json({ error: 'Status check failed', details: error.message });
    }
  });

  // Simple search endpoint
  app.get('/api/search', async (req, res) => {
    try {
      const { q, limit = 5 } = req.query;
      
      if (!q) {
        return res.status(400).json({ error: 'Query parameter "q" is required' });
      }

      // Simple database search
      const { data, error } = await supabase
        .from('items')
        .select('id, name, description, price, stock_quantity, category')
        .or(`name.ilike.%${q}%,description.ilike.%${q}%`)
        .eq('is_active', true)
        .limit(parseInt(limit));

      if (error) throw error;

      res.json({
        query: q,
        results: data || [],
        total: (data || []).length
      });
    } catch (error) {
      console.error('Search error:', error);
      res.status(500).json({ error: 'Search failed', details: error.message });
    }
  });

  // Chat endpoint with FAQ integration
  app.post('/api/chat', async (req, res) => {
    const startTime = Date.now();
    
    try {
      const { message } = req.body;

      if (!message || typeof message !== 'string') {
        return res.status(400).json({ error: 'Message is required' });
      }

      if (message.length > 2000) {
        return res.status(400).json({ error: 'Message too long' });
      }

      // **STEP 1: Check FAQ with enhanced detection**
      console.log('🔍 Simple chat checking FAQ for:', message);
      const faqResult = FAQService.searchFAQ(message);
      
      // Handle direct FAQ match
      if (faqResult.found) {
        console.log(`✅ FAQ match found (confidence: ${faqResult.confidence}):`, faqResult.category);
        
        return res.json({
          reply: faqResult.answer,
          metadata: {
            source: 'faq',
            category: faqResult.category,
            confidence: faqResult.confidence,
            matchType: faqResult.matchType,
            responseTime: Date.now() - startTime
          },
          timestamp: new Date().toISOString()
        });
      }

      // Handle forbidden topics
      if (faqResult.reason === 'forbidden_topic') {
        console.log(`🚨 Forbidden topic in simple chat (${faqResult.topicType}):`, faqResult.blockReason);
        const fallbackResponse = FAQService.generateFallbackResponse(message, 'mn');
        
        return res.json({
          reply: fallbackResponse,
          metadata: {
            source: 'forbidden_topic_blocked',
            topicType: faqResult.topicType,
            blockReason: faqResult.blockReason,
            responseTime: Date.now() - startTime
          },
          timestamp: new Date().toISOString()
        });
      }

      // Handle low confidence / no reliable match
      if (faqResult.reason === 'confidence_too_low' || faqResult.reason === 'no_match') {
        console.log(`🤖 Using restricted AI in simple chat - ${faqResult.reason} (confidence: ${faqResult.confidence || 0})`);
      }

      // **STEP 2: Use restricted AI for questions not in FAQ**
      const systemPrompt = `You are a customer support chatbot for Monos Trade LLC.

**CRITICAL RESTRICTIONS:**
- You can ONLY answer questions using the provided knowledge base about Monos Trade LLC
- If asked about medical advice, say: "Энэ талаар зөвхөн эмчид хандахыг зөвлөж байна."
- For other questions outside scope, say: "Харилцагчийн үйлчилгээтэй холбогдоно уу: +976 7766 6688"
- Never provide medical advice or drug recommendations
- Only provide official company information

**Company Info:**
- Phone: +976 7766 6688
- Email: info@monostrade.mn
- Partnership: saranchimeg@monostrade.mn, +976 9924 2297`;

      const { response, metadata } = await OpenAIService.createChatCompletion([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: message }
      ], {
        model: config.AI.MODEL,
        temperature: 0.3, // Lower temperature for more consistent responses
        maxTokens: 150 // Shorter responses
      });

      res.json({
        reply: response.choices[0].message.content,
        metadata: {
          source: 'ai_restricted',
          model: metadata.model,
          tokensUsed: metadata.tokensUsed,
          responseTime: Date.now() - startTime
        },
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('Chat error:', error);

      let statusCode = 500;
      let errorMessage = 'Chat service failed';

      if (error.message.includes('quota')) {
        statusCode = 503;
        errorMessage = 'AI service quota exceeded';
      } else if (error.message.includes('rate limit')) {
        statusCode = 429;
        errorMessage = 'Too many requests, please wait';
      }

      res.status(statusCode).json({
        error: errorMessage,
        details: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });

  // 404 handler
  app.use('*', (req, res) => {
    res.status(404).json({
      error: 'Endpoint not found',
      path: req.originalUrl,
      availableEndpoints: [
        'GET /health',
        'GET /status', 
        'GET /api/search',
        'POST /api/chat'
      ]
    });
  });

  // Error handler
  app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({
      error: 'Internal server error',
      timestamp: new Date().toISOString()
    });
  });

  // Start server
  const server = app.listen(config.SERVER.PORT, config.SERVER.HOST, () => {
    console.log(`
╔════════════════════════════════════════════════════════════╗
║              🤖 ENTERPRISE AI PHARMACY CHATBOT            ║
╠════════════════════════════════════════════════════════════╣
║   Status: ✅ Running and Operational                       ║
║   Host:   ${config.SERVER.HOST.padEnd(48)} ║
║   Port:   ${config.SERVER.PORT.toString().padEnd(48)} ║
║   Model:  ${config.AI.MODEL.padEnd(48)} ║
╠════════════════════════════════════════════════════════════╣
║   🔍 Health:  http://${config.SERVER.HOST}:${config.SERVER.PORT}/health                  ║
║   📊 Status:  http://${config.SERVER.HOST}:${config.SERVER.PORT}/status                  ║
║   🔎 Search:  GET /api/search?q=paracetamol                ║
║   💬 Chat:    POST /api/chat {"message":"Hello"}           ║
╠════════════════════════════════════════════════════════════╣
║   🌐 Frontend: https://mns-chatbot-production.up.railway.app ║
║   🔗 API Base: Use Railway assigned domain for API calls  ║
╚════════════════════════════════════════════════════════════╝

🎉 Enterprise AI Pharmacy Chatbot is ready!
🧪 Test with: curl http://${config.SERVER.HOST}:${config.SERVER.PORT}/health
📋 CORS enabled for: ${config.SECURITY.ALLOWED_ORIGINS.join(', ')}
    `);
  });

  // Handle graceful shutdown
  const shutdown = (signal) => {
    console.log(`\n🛑 Received ${signal}. Shutting down gracefully...`);
    server.close(() => {
      console.log('✅ HTTP server closed.');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  server.on('error', (err) => {
    console.error('❌ Server error:', err);
    if (err.code === 'EADDRINUSE') {
      console.error(`Port ${config.SERVER.PORT} is already in use`);
    }
  });

} catch (error) {
  console.error('❌ Failed to start enterprise app:', error);
  console.error('Stack:', error.stack);
  process.exit(1);
}