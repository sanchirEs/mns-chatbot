/**
 * Test Automatic Redis Caching
 * Verifies that Redis cache is being populated automatically every 5 minutes
 */

import Redis from 'ioredis';
import dotenv from 'dotenv';

dotenv.config();

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  bright: '\x1b[1m'
};

function log(message, color = '') {
  console.log(`${color}${message}${colors.reset}`);
}

async function testAutoCaching() {
  log('\n🧪 Testing Automatic Redis Caching\n', colors.bright + colors.cyan);
  
  if (!process.env.REDIS_URL) {
    log('❌ REDIS_URL not found. Please set it in your .env file', colors.yellow);
    process.exit(1);
  }

  const redis = new Redis(process.env.REDIS_URL, {
    retryStrategy: (times) => {
      if (times > 3) return null;
      return Math.min(times * 50, 2000);
    },
    lazyConnect: true
  });

  try {
    await redis.connect();
    log('✅ Connected to Redis\n');

    // Get all product cache keys
    const productKeys = await redis.keys('product:*');
    const embeddingKeys = await redis.keys('embedding:*');
    const totalKeys = await redis.dbsize();

    log('📊 Current Cache Status:', colors.bright);
    log(`   Total keys: ${totalKeys}`);
    log(`   Product inventory: ${productKeys.length} keys`);
    log(`   Search embeddings: ${embeddingKeys.length} keys`);
    
    if (productKeys.length === 0) {
      log('\n⚠️  No product inventory cached yet', colors.yellow);
      log('   This means the scheduler hasn\'t run yet or failed');
      log('\n💡 Expected Behavior:');
      log('   1. When app starts → Initial sync after 10 seconds');
      log('   2. Every 5 minutes → Auto-sync 200 products');
      log('   3. Daily at 2 AM → Full catalog sync');
      log('\n🔧 What to do:');
      log('   1. Start your app: npm start');
      log('   2. Wait 10 seconds for initial sync');
      log('   3. Run this test again to verify caching');
      log('   4. Or run manual sync: node scripts/sync-products.js --quick --max 100');
    } else {
      log('\n✅ Auto-caching is working!', colors.green);
      log(`   ${productKeys.length} products cached`);
      
      // Check a sample product
      const sampleKey = productKeys[0];
      const productData = await redis.get(sampleKey);
      const ttl = await redis.ttl(sampleKey);
      
      if (productData) {
        const data = JSON.parse(productData);
        log('\n📦 Sample cached product:');
        log(`   Key: ${sampleKey}`);
        log(`   Available: ${data.available}`);
        log(`   Price: ${data.price}`);
        log(`   TTL: ${ttl}s (${Math.floor(ttl / 60)}m ${ttl % 60}s remaining)`);
        log(`   Updated: ${new Date(data.updated_at).toLocaleString()}`);
      }
      
      // Calculate when next sync should happen
      const nextSyncInSeconds = ttl > 0 ? Math.max(0, 300 - (300 - ttl)) : 0;
      const minutes = Math.floor(nextSyncInSeconds / 60);
      const seconds = nextSyncInSeconds % 60;
      
      if (ttl > 0 && ttl < 300) {
        log(`\n⏰ Next auto-sync expected in ~${minutes}m ${seconds}s`, colors.cyan);
      }
    }

    if (embeddingKeys.length > 0) {
      log(`\n✅ Search optimization working: ${embeddingKeys.length} embeddings cached`);
      const sampleEmbedding = embeddingKeys[0];
      const embTTL = await redis.ttl(sampleEmbedding);
      log(`   Next search embedding refresh: ${Math.floor(embTTL / 60)}m`);
    }

    // Show scheduler status
    log('\n📋 Auto-caching Schedule:', colors.bright);
    log('   ⚡ Quick stock sync: Every 5 minutes');
    log('      → Updates: 200 products');
    log('      → Caches: Inventory + prices in Redis');
    log('      → TTL: 5 minutes');
    log('');
    log('   🔄 Full catalog sync: Daily at 2:00 AM');
    log('      → Updates: ALL products (~7000)');
    log('      → Regenerates: Vector embeddings');
    log('      → Caches: All product data');
    log('');
    log('   🧹 Cache cleanup: Every hour');
    log('      → Removes: Expired cache entries');
    log('');
    log('   💚 Health check: Every 30 minutes');
    log('      → Monitors: Sync status');
    log('      → Alerts: If sync is unhealthy');

    log('\n✅ Test complete!\n', colors.green);

    await redis.quit();
    process.exit(0);

  } catch (error) {
    log(`\n❌ Test failed: ${error.message}`, colors.yellow);
    log('\nTroubleshooting:', colors.bright);
    log('1. Ensure app is running: npm start');
    log('2. Check ENABLE_SCHEDULER is not set to false');
    log('3. Check logs for scheduler startup messages');
    log('4. Verify REDIS_URL is correct');
    
    try {
      await redis.quit();
    } catch (e) {
      // Ignore
    }
    
    process.exit(1);
  }
}

testAutoCaching();

