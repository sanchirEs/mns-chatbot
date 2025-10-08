/**
 * Test Redis Connection
 * Run this on Railway or locally to verify Redis connection
 */

import Redis from 'ioredis';
import dotenv from 'dotenv';

dotenv.config();

async function testRedisConnection() {
  console.log('🔍 Testing Redis Connection...\n');

  // Check environment variables
  console.log('📋 Environment Variables:');
  console.log('REDIS_URL:', process.env.REDIS_URL ? '✅ Set' : '❌ Not set');
  console.log('REDIS_PASSWORD:', process.env.REDIS_PASSWORD ? '✅ Set' : '❌ Not set');
  console.log('REDISHOST:', process.env.REDISHOST || 'Not set');
  console.log('REDISPORT:', process.env.REDISPORT || 'Not set');
  console.log('REDISUSER:', process.env.REDISUSER || 'Not set');
  console.log();

  // Attempt connection
  let redis;
  
  try {
    if (process.env.REDIS_URL) {
      console.log('🔗 Connecting using REDIS_URL...');
      redis = new Redis(process.env.REDIS_URL, {
        retryStrategy: (times) => {
          if (times > 3) return null;
          return Math.min(times * 50, 2000);
        },
        maxRetriesPerRequest: 3,
        lazyConnect: true
      });
    } else if (process.env.REDISHOST) {
      console.log('🔗 Connecting using individual parameters...');
      redis = new Redis({
        host: process.env.REDISHOST,
        port: parseInt(process.env.REDISPORT) || 6379,
        password: process.env.REDIS_PASSWORD || process.env.REDISPASSWORD,
        username: process.env.REDISUSER || 'default',
        retryStrategy: (times) => {
          if (times > 3) return null;
          return Math.min(times * 50, 2000);
        },
        maxRetriesPerRequest: 3,
        lazyConnect: true
      });
    } else {
      console.log('❌ No Redis credentials found!');
      process.exit(1);
    }

    // Connect
    await redis.connect();
    console.log('✅ Redis connected successfully!\n');

    // Test operations
    console.log('🧪 Testing Redis operations...');
    
    // SET
    await redis.set('test:connection', 'Hello from Railway!', 'EX', 60);
    console.log('✅ SET operation successful');

    // GET
    const value = await redis.get('test:connection');
    console.log('✅ GET operation successful:', value);

    // INFO
    const info = await redis.info('memory');
    const usedMemory = info.match(/used_memory_human:(.*)/)?.[1]?.trim();
    console.log('✅ Memory usage:', usedMemory);

    // Keys count
    const dbsize = await redis.dbsize();
    console.log('✅ Total keys:', dbsize);

    // Cleanup
    await redis.del('test:connection');
    console.log('✅ Cleanup successful\n');

    console.log('🎉 All tests passed! Redis is working perfectly.');

    await redis.quit();
    process.exit(0);

  } catch (error) {
    console.error('\n❌ Redis connection failed:');
    console.error('Error:', error.message);
    console.error('\nTroubleshooting:');
    console.error('1. Check if Redis service is running in Railway dashboard');
    console.error('2. Verify REDIS_URL is set in environment variables');
    console.error('3. Check Railway logs for connection errors');
    console.error('4. Ensure Redis service is in the same project');
    
    if (redis) {
      try {
        await redis.quit();
      } catch (e) {
        // Ignore quit errors
      }
    }
    
    process.exit(1);
  }
}

// Run test
testRedisConnection();

