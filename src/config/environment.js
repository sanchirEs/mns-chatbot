import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables (ES modules compatible)
dotenv.config({ path: join(dirname(__filename), '../../.env') });

/**
 * Centralized configuration management
 */
export const config = {
  // Server Configuration
  SERVER: {
    PORT: parseInt(process.env.PORT) || 3000,
    HOST: process.env.HOST || (process.env.NODE_ENV === 'production' ? '0.0.0.0' : 'localhost'),
    NODE_ENV: process.env.NODE_ENV || 'development',
    IS_PRODUCTION: process.env.NODE_ENV === 'production',
    IS_DEVELOPMENT: process.env.NODE_ENV === 'development'
  },

  // Database Configuration
  DATABASE: {
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_KEY: process.env.SUPABASE_KEY,
    CONNECTION_TIMEOUT: 30000,
    MAX_CONNECTIONS: 20
  },

  // OpenAI Configuration
  AI: {
    API_KEY: process.env.OPENAI_API_KEY,
    MODEL: process.env.AI_MODEL || 'gpt-4o',
    EMBEDDING_MODEL: process.env.EMBEDDING_MODEL || 'text-embedding-3-small',
    TEMPERATURE: parseFloat(process.env.AI_TEMPERATURE) || 0.3,
    MAX_TOKENS: parseInt(process.env.AI_MAX_TOKENS) || 800,
    MAX_RETRIES: 3,
    TIMEOUT: 30000
  },

  // Security Configuration
  SECURITY: {
    JWT_SECRET: process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-this',
    JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d',
    BCRYPT_ROUNDS: parseInt(process.env.BCRYPT_ROUNDS) || 12,
    SESSION_SECRET: process.env.SESSION_SECRET || 'session-secret',
    ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS?.split(',') || [
      'http://localhost:3000',
      'http://localhost:5173', 
      'http://localhost:8080',
      'https://mns-chatbot-production.up.railway.app',
      'https://*.up.railway.app',
      'https://*.railway.app'
    ]
  },

  // Rate Limiting
  RATE_LIMIT: {
    WINDOW_MS: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 60000, // 1 minute
    MAX_REQUESTS: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 20,
    CHAT_MAX_REQUESTS: parseInt(process.env.CHAT_RATE_LIMIT) || 30,
    STRICT_MAX_REQUESTS: parseInt(process.env.STRICT_RATE_LIMIT) || 5,
    SKIP_SUCCESSFUL: process.env.RATE_LIMIT_SKIP_SUCCESS === 'true'
  },

  // Conversation Management
  CONVERSATION: {
    MAX_HISTORY: parseInt(process.env.MAX_CONVERSATION_HISTORY) || 20,
    SESSION_TIMEOUT: parseInt(process.env.SESSION_TIMEOUT_MINUTES) || 30,
    AUTO_CLEANUP_DAYS: parseInt(process.env.AUTO_CLEANUP_DAYS) || 7,
    MAX_MESSAGE_LENGTH: parseInt(process.env.MAX_MESSAGE_LENGTH) || 2000
  },

  // Search Configuration
  SEARCH: {
    DEFAULT_LIMIT: parseInt(process.env.SEARCH_DEFAULT_LIMIT) || 5,
    MAX_LIMIT: parseInt(process.env.SEARCH_MAX_LIMIT) || 20,
    SIMILARITY_THRESHOLD: parseFloat(process.env.SIMILARITY_THRESHOLD) || 0.7,
    HYBRID_SEMANTIC_WEIGHT: parseFloat(process.env.HYBRID_SEMANTIC_WEIGHT) || 0.7
  },

  // Feature Flags
  FEATURES: {
    ENABLE_STREAMING: process.env.ENABLE_STREAMING !== 'false',
    ENABLE_ANALYTICS: process.env.ENABLE_ANALYTICS !== 'false',
    ENABLE_CACHING: process.env.ENABLE_CACHING !== 'false',
    ENABLE_FUNCTION_CALLING: process.env.ENABLE_FUNCTION_CALLING !== 'false',
    ENABLE_EMBEDDINGS: process.env.ENABLE_EMBEDDINGS !== 'false',
    ENABLE_ORDER_MANAGEMENT: process.env.ENABLE_ORDER_MANAGEMENT !== 'false'
  },

  // Logging
  LOGGING: {
    LEVEL: process.env.LOG_LEVEL || 'info',
    ENABLE_REQUEST_LOGGING: process.env.ENABLE_REQUEST_LOGGING !== 'false',
    LOG_ERRORS: process.env.LOG_ERRORS !== 'false',
    LOG_PERFORMANCE: process.env.LOG_PERFORMANCE === 'true'
  },

  // Monitoring
  MONITORING: {
    ENABLE_METRICS: process.env.ENABLE_METRICS === 'true',
    METRICS_PORT: parseInt(process.env.METRICS_PORT) || 9090,
    HEALTH_CHECK_INTERVAL: parseInt(process.env.HEALTH_CHECK_INTERVAL) || 30000
  }
};

/**
 * Validate critical environment variables
 */
export function validateConfig() {
  const required = [
    { key: 'SUPABASE_URL', value: config.DATABASE.SUPABASE_URL },
    { key: 'SUPABASE_KEY', value: config.DATABASE.SUPABASE_KEY },
    { key: 'OPENAI_API_KEY', value: config.AI.API_KEY }
  ];

  const missing = required.filter(({ value }) => !value);

  if (missing.length > 0) {
    const missingKeys = missing.map(({ key }) => key).join(', ');
    
    console.error('❌ Configuration validation failed!');
    console.error(`Missing required environment variables: ${missingKeys}`);
    console.error('\n🔧 DEPLOYMENT SETUP REQUIRED:');
    console.error('Please set these environment variables in your deployment platform:');
    console.error('');
    
    required.forEach(({ key, value }) => {
      const status = value ? '✅' : '❌';
      console.error(`  ${status} ${key}=${value || 'NOT_SET'}`);
    });
    
    console.error('\n📚 For setup instructions, see:');
    console.error('  - Copy .env.example to .env (for local development)');
    console.error('  - Set environment variables in your deployment platform');
    console.error('  - Supabase: https://supabase.com/docs/guides/getting-started');
    console.error('  - OpenAI: https://platform.openai.com/api-keys');
    console.error('');
    
    throw new Error(`Missing required environment variables: ${missingKeys}`);
  }

  // Production-specific validations
  if (config.SERVER.IS_PRODUCTION) {
    if (config.SECURITY.JWT_SECRET === 'your-super-secret-jwt-key-change-this') {
      console.error('❌ JWT_SECRET must be changed in production');
      throw new Error('JWT_SECRET must be changed in production');
    }

    // Only warn about localhost in production if no production origins are set
    const hasProductionOrigins = config.SECURITY.ALLOWED_ORIGINS.some(origin => 
      origin.includes('railway.app') || origin.includes('herokuapp.com') || origin.includes('vercel.app')
    );
    
    if (config.SECURITY.ALLOWED_ORIGINS.includes('http://localhost:3000') && !hasProductionOrigins) {
      console.warn('⚠️  Warning: Only localhost origins configured in production');
    }

    console.log('✅ Production CORS origins:', config.SECURITY.ALLOWED_ORIGINS.join(', '));
  }

  console.log('✅ Configuration validated successfully');
}

/**
 * Get configuration summary for debugging
 */
export function getConfigSummary() {
  return {
    environment: config.SERVER.NODE_ENV,
    port: config.SERVER.PORT,
    aiModel: config.AI.MODEL,
    features: config.FEATURES,
    rateLimit: config.RATE_LIMIT.MAX_REQUESTS + '/min',
    conversationHistory: config.CONVERSATION.MAX_HISTORY
  };
}

export default config;
