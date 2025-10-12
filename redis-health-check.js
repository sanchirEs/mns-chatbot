/**
 * Redis Health Check & Diagnostic Tool
 * Comprehensive check of Redis status, usage, and performance
 */

import Redis from 'ioredis';
import dotenv from 'dotenv';
import { DataSyncService } from './src/services/dataSyncService.js';

dotenv.config();

// ANSI colors for better output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

function log(message, color = '') {
  console.log(`${color}${message}${colors.reset}`);
}

function section(title) {
  console.log('\n' + '='.repeat(60));
  log(`  ${title}`, colors.bright + colors.cyan);
  console.log('='.repeat(60) + '\n');
}

function status(label, value, isGood = true) {
  const symbol = isGood ? '✅' : '⚠️';
  console.log(`${symbol} ${label}: ${colors.bright}${value}${colors.reset}`);
}

function warn(message) {
  log(`⚠️  ${message}`, colors.yellow);
}

function error(message) {
  log(`❌ ${message}`, colors.red);
}

function success(message) {
  log(`✅ ${message}`, colors.green);
}

async function checkRedisHealth() {
  section('REDIS HEALTH CHECK & DIAGNOSTIC REPORT');
  
  const report = {
    connection: null,
    config: null,
    performance: null,
    usage: null,
    health: 'unknown',
    recommendations: []
  };

  // ================================================================
  // 1. CHECK CONFIGURATION
  // ================================================================
  section('1. CONFIGURATION');
  
  const redisEnabled = process.env.REDIS_URL || process.env.ENABLE_REDIS === 'true';
  const redisUrl = process.env.REDIS_URL;
  
  status('Redis Enabled', redisEnabled ? 'YES' : 'NO', redisEnabled);
  
  if (redisUrl) {
    // Mask password in URL
    const maskedUrl = redisUrl.replace(/:([^@]+)@/, ':****@');
    status('Redis URL', maskedUrl, true);
  } else {
    status('Redis Host', process.env.REDIS_HOST || 'localhost', false);
    status('Redis Port', process.env.REDIS_PORT || '6379', false);
    warn('REDIS_URL not found - using individual parameters or disabled');
  }
  
  status('Cache TTL', process.env.REDIS_CACHE_TTL || '300 seconds (5 min)', true);
  status('Key Prefix', process.env.REDIS_KEY_PREFIX || 'chatbot:', true);
  
  report.config = {
    enabled: redisEnabled,
    url: !!redisUrl,
    ttl: parseInt(process.env.REDIS_CACHE_TTL) || 300
  };

  if (!redisEnabled) {
    warn('Redis is disabled. The application will use database-only mode.');
    report.health = 'disabled';
    return report;
  }

  // ================================================================
  // 2. TEST CONNECTION
  // ================================================================
  section('2. CONNECTION TEST');
  
  let redis;
  try {
    if (redisUrl) {
      redis = new Redis(redisUrl, {
        retryStrategy: (times) => {
          if (times > 3) return null;
          return Math.min(times * 50, 2000);
        },
        maxRetriesPerRequest: 3,
        lazyConnect: true,
        connectTimeout: 5000
      });
    } else {
      error('No Redis connection URL found');
      report.connection = { status: 'failed', error: 'No connection URL' };
      report.health = 'unhealthy';
      return report;
    }

    const connectStart = Date.now();
    await redis.connect();
    const connectTime = Date.now() - connectStart;
    
    success(`Connected successfully in ${connectTime}ms`);
    
    report.connection = {
      status: 'connected',
      latency: connectTime,
      timestamp: new Date().toISOString()
    };

  } catch (err) {
    error(`Connection failed: ${err.message}`);
    report.connection = { status: 'failed', error: err.message };
    report.health = 'unhealthy';
    
    console.log('\n🔧 Troubleshooting:');
    console.log('1. Check if Redis service is running in Railway dashboard');
    console.log('2. Verify REDIS_URL environment variable is set');
    console.log('3. Check Railway logs for connection errors');
    console.log('4. Ensure Redis service is in the same Railway project');
    
    if (redis) {
      try { await redis.quit(); } catch (e) { /* ignore */ }
    }
    return report;
  }

  // ================================================================
  // 3. SERVER INFORMATION
  // ================================================================
  section('3. SERVER INFORMATION');
  
  try {
    const serverInfo = await redis.info('server');
    const memoryInfo = await redis.info('memory');
    const statsInfo = await redis.info('stats');
    const clientsInfo = await redis.info('clients');
    
    // Parse server info
    const parseInfo = (info) => {
      const lines = info.split('\r\n');
      const data = {};
      lines.forEach(line => {
        if (line && !line.startsWith('#')) {
          const [key, value] = line.split(':');
          if (key && value) data[key] = value;
        }
      });
      return data;
    };
    
    const server = parseInfo(serverInfo);
    const memory = parseInfo(memoryInfo);
    const stats = parseInfo(statsInfo);
    const clients = parseInfo(clientsInfo);
    
    status('Redis Version', server.redis_version || 'unknown', true);
    status('Redis Mode', server.redis_mode || 'unknown', true);
    status('Uptime', `${Math.floor((server.uptime_in_seconds || 0) / 3600)} hours`, true);
    status('Connected Clients', clients.connected_clients || '0', true);
    
    console.log();
    status('Memory Used', memory.used_memory_human || 'unknown', true);
    status('Memory Peak', memory.used_memory_peak_human || 'unknown', true);
    status('Memory Fragmentation', memory.mem_fragmentation_ratio || 'unknown', 
           parseFloat(memory.mem_fragmentation_ratio || 1) < 1.5);
    
    console.log();
    status('Total Connections', stats.total_connections_received || '0', true);
    status('Total Commands', stats.total_commands_processed || '0', true);
    status('Ops Per Second', stats.instantaneous_ops_per_sec || '0', true);
    
    report.usage = {
      version: server.redis_version,
      uptime: server.uptime_in_seconds,
      memory: {
        used: memory.used_memory_human,
        peak: memory.used_memory_peak_human,
        fragmentation: memory.mem_fragmentation_ratio
      },
      stats: {
        connections: stats.total_connections_received,
        commands: stats.total_commands_processed,
        opsPerSec: stats.instantaneous_ops_per_sec
      }
    };
    
  } catch (err) {
    warn(`Could not fetch server info: ${err.message}`);
  }

  // ================================================================
  // 4. KEY ANALYSIS
  // ================================================================
  section('4. CURRENT CACHE CONTENTS');
  
  try {
    const dbsize = await redis.dbsize();
    status('Total Keys', dbsize, dbsize > 0);
    
    if (dbsize === 0) {
      warn('No keys found in Redis cache');
      warn('This might mean:');
      console.log('  - No products have been cached yet');
      console.log('  - No searches have been performed yet');
      console.log('  - Cache was recently cleared');
    } else {
      // Analyze keys by type
      console.log('\n📊 Key Distribution:');
      
      const patterns = [
        { pattern: 'product:*', desc: 'Product inventory cache' },
        { pattern: 'embedding:*', desc: 'Search embedding cache' },
        { pattern: 'chatbot:*', desc: 'General chatbot cache' },
        { pattern: 'faq:*', desc: 'FAQ cache' },
        { pattern: 'test:*', desc: 'Test keys' }
      ];
      
      let totalCategorized = 0;
      
      for (const { pattern, desc } of patterns) {
        const keys = await redis.keys(pattern);
        if (keys.length > 0) {
          status(`  ${desc}`, `${keys.length} keys`, true);
          totalCategorized += keys.length;
          
          // Sample first key
          if (keys[0]) {
            const ttl = await redis.ttl(keys[0]);
            const type = await redis.type(keys[0]);
            console.log(`    Example: ${keys[0]} (type: ${type}, TTL: ${ttl > 0 ? ttl + 's' : 'no expiry'})`);
          }
        }
      }
      
      if (totalCategorized < dbsize) {
        const other = dbsize - totalCategorized;
        status(`  Other keys`, `${other} keys`, true);
      }
    }
    
    report.usage = {
      ...report.usage,
      totalKeys: dbsize,
      isEmpty: dbsize === 0
    };
    
  } catch (err) {
    warn(`Could not analyze keys: ${err.message}`);
  }

  // ================================================================
  // 5. PERFORMANCE TEST
  // ================================================================
  section('5. PERFORMANCE TEST');
  
  try {
    // Test SET operation
    const setStart = Date.now();
    await redis.set('healthcheck:test', JSON.stringify({ test: true, timestamp: Date.now() }), 'EX', 60);
    const setTime = Date.now() - setStart;
    status('SET operation', `${setTime}ms`, setTime < 50);
    
    // Test GET operation
    const getStart = Date.now();
    const value = await redis.get('healthcheck:test');
    const getTime = Date.now() - getStart;
    status('GET operation', `${getTime}ms`, getTime < 50);
    status('Data integrity', value ? 'OK' : 'FAILED', !!value);
    
    // Test DEL operation
    const delStart = Date.now();
    await redis.del('healthcheck:test');
    const delTime = Date.now() - delStart;
    status('DEL operation', `${delTime}ms`, delTime < 50);
    
    // Overall latency assessment
    const avgLatency = (setTime + getTime + delTime) / 3;
    console.log();
    status('Average Latency', `${avgLatency.toFixed(2)}ms`, avgLatency < 50);
    
    let perfRating = 'excellent';
    if (avgLatency > 100) perfRating = 'poor';
    else if (avgLatency > 50) perfRating = 'acceptable';
    else if (avgLatency > 20) perfRating = 'good';
    
    status('Performance Rating', perfRating.toUpperCase(), avgLatency < 50);
    
    report.performance = {
      setLatency: setTime,
      getLatency: getTime,
      delLatency: delTime,
      avgLatency,
      rating: perfRating
    };
    
  } catch (err) {
    error(`Performance test failed: ${err.message}`);
  }

  // ================================================================
  // 6. WHAT REDIS SHOULD BE DOING
  // ================================================================
  section('6. EXPECTED REDIS USAGE (Three-Tier Architecture)');
  
  console.log('📋 According to your architecture, Redis should be caching:\n');
  
  console.log('1️⃣  TIER 2 - Product Inventory (Hot Data):');
  console.log('   Key pattern: product:PRODUCT_ID');
  console.log('   Contains: stock levels, prices, availability');
  console.log('   TTL: 5 minutes (300 seconds)');
  console.log('   Updated: Every 5 minutes by quickStockSync()');
  console.log('   Purpose: Fast inventory lookups for chat responses\n');
  
  console.log('2️⃣  Search Embeddings (Performance Optimization):');
  console.log('   Key pattern: embedding:QUERY_HASH');
  console.log('   Contains: OpenAI embedding vectors');
  console.log('   TTL: 1 hour (3600 seconds)');
  console.log('   Purpose: Avoid regenerating embeddings for common searches');
  console.log('   Impact: 12-61% faster responses, reduced OpenAI costs\n');
  
  console.log('3️⃣  FAQ Responses (Optional):');
  console.log('   Key pattern: faq:CATEGORY or faq:QUESTION_ID');
  console.log('   Contains: Pre-generated FAQ responses');
  console.log('   TTL: 1 hour or more');
  console.log('   Purpose: Instant responses for common questions\n');

  // ================================================================
  // 7. HEALTH ASSESSMENT
  // ================================================================
  section('7. HEALTH ASSESSMENT');
  
  let healthScore = 100;
  const issues = [];
  const recommendations = [];
  
  // Connection check
  if (report.connection.status !== 'connected') {
    healthScore -= 100;
    issues.push('Redis not connected');
    recommendations.push('Fix Redis connection - check Railway dashboard and REDIS_URL');
  }
  
  // Latency check
  if (report.performance?.avgLatency > 100) {
    healthScore -= 30;
    issues.push('High latency detected');
    recommendations.push('Check network connection to Redis server');
  } else if (report.performance?.avgLatency > 50) {
    healthScore -= 10;
    issues.push('Moderate latency');
  }
  
  // Memory check
  const memFrag = parseFloat(report.usage?.memory?.fragmentation || 1);
  if (memFrag > 2.0) {
    healthScore -= 20;
    issues.push('High memory fragmentation');
    recommendations.push('Consider restarting Redis to defragment memory');
  }
  
  // Usage check
  if (report.usage?.totalKeys === 0) {
    healthScore -= 5;
    issues.push('No cached data (cache is empty)');
    recommendations.push('Run sync operations to populate cache: npm run sync:quick');
  }
  
  // Determine overall health
  if (healthScore >= 90) report.health = 'excellent';
  else if (healthScore >= 70) report.health = 'good';
  else if (healthScore >= 50) report.health = 'fair';
  else if (healthScore >= 30) report.health = 'poor';
  else report.health = 'critical';
  
  const healthColor = {
    excellent: colors.green,
    good: colors.green,
    fair: colors.yellow,
    poor: colors.yellow,
    critical: colors.red
  }[report.health] || colors.yellow;
  
  log(`\n🏥 Overall Health: ${report.health.toUpperCase()} (${healthScore}/100)`, colors.bright + healthColor);
  
  if (issues.length > 0) {
    console.log('\n⚠️  Issues Found:');
    issues.forEach(issue => console.log(`   - ${issue}`));
  }
  
  if (recommendations.length > 0) {
    console.log('\n💡 Recommendations:');
    recommendations.forEach((rec, i) => console.log(`   ${i + 1}. ${rec}`));
  } else {
    success('\n✅ No issues found - Redis is operating optimally!');
  }
  
  report.recommendations = recommendations;

  // ================================================================
  // 8. QUICK ACTIONS
  // ================================================================
  section('8. QUICK ACTIONS');
  
  console.log('Available commands to manage Redis:\n');
  console.log('  npm run sync:quick          - Populate cache with latest inventory');
  console.log('  npm run sync:full           - Full catalog sync (includes Redis cache)');
  console.log('  npm run test:complete       - Test search with caching');
  console.log('  node redis-health-check.js  - Run this diagnostic again\n');
  
  console.log('Manual Redis operations (if needed):');
  console.log('  - Clear all cache: redis.flushdb()');
  console.log('  - Check specific key: redis.get("product:PRODUCT_ID")');
  console.log('  - Set TTL: redis.expire("key", seconds)');

  // ================================================================
  // 9. SUMMARY
  // ================================================================
  section('9. SUMMARY');
  
  const summary = {
    '🔌 Connection': report.connection?.status === 'connected' ? '✅ Connected' : '❌ Disconnected',
    '⚡ Performance': report.performance?.rating ? `✅ ${report.performance.rating}` : '❓ Unknown',
    '💾 Cache Size': report.usage?.totalKeys !== undefined ? `${report.usage.totalKeys} keys` : 'Unknown',
    '🏥 Health Status': `${report.health.toUpperCase()}`,
    '📊 Health Score': `${healthScore}/100`
  };
  
  Object.entries(summary).forEach(([key, value]) => {
    console.log(`${key}: ${colors.bright}${value}${colors.reset}`);
  });

  // Cleanup
  try {
    await redis.quit();
  } catch (e) {
    // Ignore quit errors
  }

  section('END OF REPORT');
  
  return report;
}

// Run the health check
checkRedisHealth()
  .then((report) => {
    if (report.health === 'excellent' || report.health === 'good') {
      process.exit(0);
    } else if (report.health === 'disabled') {
      process.exit(2);
    } else {
      process.exit(1);
    }
  })
  .catch((error) => {
    console.error('\n❌ Health check failed with error:', error.message);
    console.error(error.stack);
    process.exit(1);
  });

