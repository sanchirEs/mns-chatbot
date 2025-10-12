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
  const { DataSyncService } = await import('./services/dataSyncService.js');
  const { ProductSearchService } = await import('./services/productSearchService.js');
  const { SyncScheduler } = await import('./jobs/syncScheduler.js');

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

  // Initialize Redis if enabled
  if (config.REDIS.ENABLE_REDIS) {
    console.log('🔴 Initializing Redis...');
    try {
      await DataSyncService.initializeRedis();
      if (DataSyncService.redisConnected) {
        console.log('✅ Redis connected and ready');
        console.log(`   Cache TTL: ${config.REDIS.CACHE_TTL}s`);
      } else {
        console.log('⚠️  Redis connection failed - using database fallback');
      }
    } catch (error) {
      console.log('⚠️  Redis initialization error:', error.message);
      console.log('   Continuing with database fallback...');
    }
  } else {
    console.log('⚠️  Redis is disabled - using database cache only');
  }

  // ==================== ROUTES ====================

  // Health check with Redis status
  app.get('/health', async (req, res) => {
    try {
      // Check database
      const { data: productsCount } = await supabase
        .from('products')
        .select('id', { count: 'exact', head: true });
      
      // Check Redis
      let cacheStatus = 'disabled';
      let cacheKeys = 0;
      
      if (config.REDIS.ENABLE_REDIS && DataSyncService.redisConnected) {
        cacheStatus = 'redis';
        try {
          cacheKeys = await DataSyncService.redis.dbsize();
        } catch (e) {
          cacheStatus = 'redis_error';
        }
      } else if (config.REDIS.ENABLE_REDIS) {
        cacheStatus = 'database_fallback';
      }
      
      res.json({
        status: 'healthy',
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        environment: config.SERVER.NODE_ENV,
        cache: cacheStatus,
        cacheKeys: cacheKeys,
        products: productsCount || 0,
        uptime: `${Math.floor(process.uptime() / 60)} minutes`
      });
    } catch (error) {
      res.status(500).json({
        status: 'unhealthy',
        error: error.message
      });
    }
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

  // Enhanced search endpoint with three-tier architecture
  app.get('/api/search', async (req, res) => {
    const startTime = Date.now();
    
    try {
      const { q, limit = 5, category, realtime } = req.query;
      
      if (!q) {
        return res.status(400).json({ error: 'Query parameter "q" is required' });
      }

      // Use new ProductSearchService
      const searchResults = await ProductSearchService.search(q, {
        limit: parseInt(limit),
        category: category || null,
        realTimeStock: realtime === 'true',
        threshold: 0.5,  // Lower threshold for better recall
        includeInactive: true  // Include all products
      });

      const responseTime = Date.now() - startTime;

      res.json({
        query: q,
        results: searchResults.products.map(p => ProductSearchService.formatProduct(p)),
        total: searchResults.products.length,
        metadata: {
          ...searchResults.metadata,
          responseTime
        }
      });
    } catch (error) {
      console.error('Search error:', error);
      res.status(500).json({ error: 'Search failed', details: error.message });
    }
  });

  // Chat endpoint with product search priority
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

      // **STEP 1: Check if this is a product-related query**
      const isProductQuery = isProductRelatedQuery(message);
      
      if (isProductQuery) {
        console.log('🔍 Product query detected:', message);
        
        // Search for products first
        const searchResults = await ProductSearchService.search(message, {
          limit: 5,
          threshold: 0.3,
          includeInactive: true
        });
        
        if (searchResults.products && searchResults.products.length > 0) {
          console.log(`✅ Found ${searchResults.products.length} products matching query`);
          
          // Build product response
          const productList = searchResults.products.map((product, index) => {
            return `${index + 1}. ${product.name} - ${product.formattedPrice || 'Цаг бүртгэх'} (${product.available || 0} ширхэг бэлэн)`;
          }).join('\n');
          
          const productResponse = `Би танд ${searchResults.products.length} бүтээгдэхүүн олсон:\n\n${productList}\n\nДэлгэрэнгүй мэдээллийг авахын тулд харилцагчийн үйлчилгээтэй холбогдоно уу: +976 7766 6688`;
          
          return res.json({
            reply: productResponse,
            metadata: {
              source: 'product_search',
              productsFound: searchResults.products.length,
              responseTime: Date.now() - startTime
            },
            timestamp: new Date().toISOString()
          });
        } else {
          console.log('❌ No products found for query');
        }
      }

      // **STEP 2: Check FAQ with enhanced detection**
      console.log('🔍 Checking FAQ for:', message);
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

      // **STEP 3: Use restricted AI for questions not in FAQ**
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

  // ==================== THREE-TIER ARCHITECTURE SETUP ====================
  
  console.log('\n🏗️ Initializing Three-Tier Architecture...');
  console.log('   TIER 1: Vector DB (static catalog)');
  console.log('   TIER 2: Redis Cache (hot data - 5 min TTL)');
  console.log('   TIER 3: Real-time API (on-demand)');

  // Start sync scheduler (enabled by default for automatic Redis caching)
  if (config.SYNC.ENABLE_SCHEDULER) {
    try {
      SyncScheduler.start();
      console.log('✅ Sync scheduler started (Redis auto-caching every 5 minutes)');
      
      // Run initial sync after 10 seconds to populate cache immediately
      setTimeout(async () => {
        console.log('🔄 Running initial cache population...');
        try {
          await SyncScheduler.runManualSync('stock', { maxProducts: 100 });
          console.log('✅ Initial cache populated with 100 products');
        } catch (error) {
          console.warn('⚠️ Initial cache population failed:', error.message);
          console.warn('   Cache will be populated on next scheduled sync (5 min)');
        }
      }, 10000);
      
    } catch (error) {
      console.error('❌ Failed to start scheduler:', error.message);
      console.log('⚠️ Continuing without scheduler (manual sync still available)');
    }
  } else {
    console.log('ℹ️ Scheduler disabled (set ENABLE_SCHEDULER=true to enable)');
    console.log('   Redis cache will NOT auto-update. Run manual syncs or enable scheduler.');
  }

  // ==================== ADMIN ENDPOINTS ====================
  
  // Admin: Sync status
  app.get('/api/admin/sync-status', async (req, res) => {
    try {
      const status = await DataSyncService.getSyncStatus();
      const schedulerStatus = SyncScheduler.getStatus();
      const cacheStats = await ProductSearchService.getCacheStats();

      res.json({
        success: true,
        sync: status,
        scheduler: schedulerStatus,
        cache: cacheStats,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Failed to get sync status:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // Admin: Manual sync trigger
  app.post('/api/admin/sync', async (req, res) => {
    try {
      const { type = 'stock', options = {} } = req.body;
      
      console.log(`🔄 Manual ${type} sync requested...`);
      const result = await SyncScheduler.runManualSync(type, options);
      
      res.json({
        success: true,
        message: `${type} sync completed`,
        result
      });
    } catch (error) {
      console.error('Manual sync failed:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // Admin: Clear cache
  app.post('/api/admin/cache/clear', async (req, res) => {
    try {
      await DataSyncService.clearAllCaches();
      await ProductSearchService.clearSearchCache();
      
      res.json({
        success: true,
        message: 'All caches cleared'
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // Admin: Scheduler control
  app.post('/api/admin/scheduler/:action', async (req, res) => {
    try {
      const { action } = req.params;
      
      if (action === 'start') {
        SyncScheduler.start();
      } else if (action === 'stop') {
        SyncScheduler.stop();
      } else if (action === 'restart') {
        SyncScheduler.stop();
        SyncScheduler.start();
      } else {
        return res.status(400).json({
          error: 'Invalid action',
          validActions: ['start', 'stop', 'restart']
        });
      }
      
      res.json({
        success: true,
        action,
        status: SyncScheduler.getStatus()
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  console.log('✅ Admin endpoints configured:');
  console.log('   GET  /api/admin/sync-status');
  console.log('   POST /api/admin/sync');
  console.log('   POST /api/admin/cache/clear');
  console.log('   POST /api/admin/scheduler/:action');

} catch (error) {
  console.error('❌ Failed to start enterprise app:', error);
  console.error('Stack:', error.stack);
  process.exit(1);
}

// Helper function to detect product-related queries
function isProductRelatedQuery(message) {
  const productKeywords = [
    // English
    'medicine', 'medication', 'drug', 'pill', 'tablet', 'capsule', 'syrup', 'injection',
    'paracetamol', 'acetaminophen', 'ibuprofen', 'aspirin', 'vitamin', 'supplement',
    'prescription', 'dosage', 'mg', 'ml', 'available', 'stock', 'price', 'cost',
    
    // Mongolian
    'эм', 'эмнэлэг', 'эмийн', 'таблет', 'капсул', 'шингэн', 'тарилга', 'уусмал',
    'парацэтэмол', 'парацетамол', 'пара', 'витамин', 'өвчин', 'өвчин намдаах',
    'байгаа', 'байна', 'байгааюу', 'үнэ', 'хэдэн', 'хэдвэ', 'хэдэн төгрөг',
    'шинж тэмдэг', 'тэмдэг', 'өвчин', 'зовирол', 'зовирол намдаах'
  ];
  
  const lowerMessage = message.toLowerCase();
  return productKeywords.some(keyword => lowerMessage.includes(keyword.toLowerCase()));
}