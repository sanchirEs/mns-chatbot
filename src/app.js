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

  // CORS
  app.use(cors({
    origin: config.SECURITY.ALLOWED_ORIGINS,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
  }));

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

  // Chat endpoint
  app.post('/api/chat', async (req, res) => {
    try {
      const { message } = req.body;

      if (!message || typeof message !== 'string') {
        return res.status(400).json({ error: 'Message is required' });
      }

      if (message.length > 2000) {
        return res.status(400).json({ error: 'Message too long' });
      }

      // Get relevant context from database
      let context = '';
      try {
        const { data } = await supabase
          .from('items')
          .select('name, description, price, stock_quantity')
          .eq('is_active', true)
          .limit(5);
        
        if (data && data.length > 0) {
          context = `Available items: ${data.map(item => 
            `${item.name} ($${item.price}, ${item.stock_quantity} in stock)`
          ).join(', ')}`;
        }
      } catch (dbError) {
        console.warn('Could not fetch context from database:', dbError.message);
      }

      // Create AI response
      const systemPrompt = `You are a helpful pharmacy assistant. ${context ? `Context: ${context}` : ''}

Guidelines:
- Be friendly and professional
- Help users find medications and health products
- Provide accurate information about products
- Ask clarifying questions when needed
- Always verify prescription requirements
- Suggest consulting healthcare professionals for medical advice`;

      const { response, metadata } = await OpenAIService.createChatCompletion([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: message }
      ], {
        model: config.AI.MODEL,
        temperature: config.AI.TEMPERATURE,
        maxTokens: config.AI.MAX_TOKENS
      });

      res.json({
        reply: response.choices[0].message.content,
        metadata: {
          model: metadata.model,
          tokensUsed: metadata.tokensUsed,
          responseTime: metadata.responseTime
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
╚════════════════════════════════════════════════════════════╝

🎉 Enterprise AI Pharmacy Chatbot is ready!
🧪 Test with: curl http://${config.SERVER.HOST}:${config.SERVER.PORT}/health
    `);
  });

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