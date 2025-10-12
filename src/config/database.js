import { createClient } from '@supabase/supabase-js';
import config from './environment.js';

/**
 * Enhanced Supabase client with retry logic and monitoring
 */
let supabase;

try {
  if (!config.DATABASE.SUPABASE_URL) {
    throw new Error('SUPABASE_URL environment variable is not set. Please configure your deployment environment variables.');
  }
  
  if (!config.DATABASE.SUPABASE_KEY) {
    throw new Error('SUPABASE_KEY environment variable is not set. Please configure your deployment environment variables.');
  }

  supabase = createClient(
    config.DATABASE.SUPABASE_URL,
    config.DATABASE.SUPABASE_KEY,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      },
      db: {
        schema: 'public'
      },
      realtime: {
        params: {
          eventsPerSecond: 10
        }
      },
      global: {
        headers: {
          'x-application-name': 'ai-pharmacy-chatbot',
          'x-client-version': '1.0.0'
        }
      }
    }
  );
  
  console.log('✅ Supabase client initialized successfully');
} catch (error) {
  console.error('❌ Failed to initialize Supabase client:', error.message);
  console.error('\n🔧 REQUIRED ENVIRONMENT VARIABLES:');
  console.error(`  SUPABASE_URL=${config.DATABASE.SUPABASE_URL || 'NOT_SET'}`);
  console.error(`  SUPABASE_KEY=${config.DATABASE.SUPABASE_KEY || 'NOT_SET'}`);
  console.error('\n📝 Please set these in your deployment platform environment variables.');
  throw error;
}

export { supabase };

/**
 * Database health check with timeout and simplified diagnostics
 */
export async function testDatabaseConnection() {
  try {
    console.log('🔍 Testing database connection...');
    
    // Create a timeout promise to prevent hanging
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Database connection timeout after 10 seconds')), 10000)
    );

    // Test basic connection with timeout
    const connectionTest = supabase
      .from('products')
      .select('id')
      .limit(1);

    const { data, error: connectionError } = await Promise.race([
      connectionTest,
      timeoutPromise
    ]);
    
    if (connectionError) {
      console.error('❌ Database connection failed:', connectionError.message);
      return false;
    }

    console.log('✅ Database connection successful');
    
    // Test additional tables (non-blocking)
    try {
      const { error: conversationError } = await Promise.race([
        supabase.from('conversations').select('id').limit(1),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000))
      ]);
      
      if (conversationError && !conversationError.message.includes('timeout')) {
        console.warn('⚠️ Conversations table might not be set up properly');
      }
    } catch (err) {
      console.warn('⚠️ Could not test conversations table (timeout)');
    }

    return true;
    
  } catch (error) {
    console.error('❌ Database connection test failed:', error.message);
    return false;
  }
}

/**
 * Database utilities and helpers
 */
export class DatabaseUtils {
  /**
   * Execute query with retry logic
   */
  static async executeWithRetry(operation, maxRetries = 3) {
    let lastError;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        
        if (attempt < maxRetries) {
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
          console.warn(`Database operation failed (attempt ${attempt}/${maxRetries}), retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    throw lastError;
  }

  /**
   * Get database statistics
   */
  static async getStats() {
    try {
      const [
        { count: productCount },
        { count: conversationCount }, 
        { count: orderCount }
      ] = await Promise.all([
        supabase.from('products').select('*', { count: 'exact', head: true }),
        supabase.from('conversations').select('*', { count: 'exact', head: true }),
        supabase.from('orders').select('*', { count: 'exact', head: true })
      ]);

      return {
        products: productCount || 0,
        conversations: conversationCount || 0,
        orders: orderCount || 0,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('Error getting database stats:', error);
      return null;
    }
  }

  /**
   * Clean up old data
   */
  static async cleanup(options = {}) {
    const {
      conversationDays = 30,
      analyticsDays = 90,
      dryRun = false
    } = options;

    try {
      const conversationCutoff = new Date();
      conversationCutoff.setDate(conversationCutoff.getDate() - conversationDays);

      const analyticsCutoff = new Date();
      analyticsCutoff.setDate(analyticsCutoff.getDate() - analyticsDays);

      const operations = [];

      if (!dryRun) {
        // Clean old conversations
        operations.push(
          supabase
            .from('conversations')
            .delete()
            .lt('last_activity', conversationCutoff.toISOString())
        );

        // Clean old analytics
        operations.push(
          supabase
            .from('chat_analytics')
            .delete()
            .lt('created_at', analyticsCutoff.toISOString())
        );

        await Promise.all(operations);
      }

      console.log(`${dryRun ? '[DRY RUN] ' : ''}Database cleanup completed`);
      return true;
    } catch (error) {
      console.error('Database cleanup failed:', error);
      return false;
    }
  }
}

/**
 * Connection pool monitoring
 */
let connectionAttempts = 0;
let lastConnectionCheck = 0;

export async function ensureConnection() {
  const now = Date.now();
  
  // Check connection every 5 minutes
  if (now - lastConnectionCheck < 300000) {
    return true;
  }

  try {
    connectionAttempts++;
    const isConnected = await testDatabaseConnection();
    
    if (isConnected) {
      lastConnectionCheck = now;
      if (connectionAttempts > 1) {
        console.log('✅ Database connection restored');
      }
      connectionAttempts = 0;
      return true;
    }
    
    return false;
  } catch (error) {
    console.error('Connection check failed:', error);
    return false;
  }
}

export default supabase;
