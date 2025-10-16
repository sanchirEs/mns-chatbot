#!/usr/bin/env node

/**
 * Test Redis Connection
 * 
 * This script tests Redis connection and configuration
 * to diagnose why Redis is empty despite successful sync.
 */

import { DataSyncService } from './src/services/dataSyncService.js';
import config from './src/config/environment.js';

console.log('🔴 Testing Redis Connection');
console.log('=' .repeat(60));

async function testRedisConnection() {
  try {
    console.log('📊 Redis Configuration:');
    console.log(`   ENABLE_REDIS: ${config.REDIS.ENABLE_REDIS}`);
    console.log(`   REDIS_URL: ${process.env.REDIS_URL ? 'SET' : 'NOT_SET'}`);
    console.log(`   REDIS_HOST: ${process.env.REDIS_HOST || 'NOT_SET'}`);
    console.log(`   REDIS_PORT: ${process.env.REDIS_PORT || 'NOT_SET'}`);
    console.log(`   REDIS_PASSWORD: ${process.env.REDIS_PASSWORD ? 'SET' : 'NOT_SET'}`);
    console.log('');
    
    console.log('🔗 Testing Redis Connection...');
    
    // Test Redis initialization
    const connected = await DataSyncService.initializeRedis();
    
    console.log(`   Connection Result: ${connected ? 'SUCCESS' : 'FAILED'}`);
    console.log(`   Redis Connected: ${DataSyncService.redisConnected}`);
    console.log('');
    
    if (connected) {
      console.log('✅ Redis is connected! Testing operations...');
      
      // Test basic Redis operations
      try {
        // Test SET operation
        await DataSyncService.redis.set('test:connection', 'success', 'EX', 60);
        console.log('   ✅ SET operation successful');
        
        // Test GET operation
        const value = await DataSyncService.redis.get('test:connection');
        console.log(`   ✅ GET operation successful: ${value}`);
        
        // Test key count
        const keyCount = await DataSyncService.redis.dbsize();
        console.log(`   📊 Current Redis keys: ${keyCount}`);
        
        // Test product cache format
        const testProduct = {
          PRODUCT_ID: 'TEST123',
          BASE_PRICE: 1000,
          ACTIVE: '1',
          STOCKS: [{
            AVAILABLE: 50,
            ONHAND: 100,
            PROMISE: 0,
            FACILITY_NAME: 'Test Facility'
          }]
        };
        
        console.log('   🧪 Testing product cache format...');
        await DataSyncService.cacheProductInventory(testProduct);
        
        // Check if test product was cached
        const cachedProduct = await DataSyncService.redis.get('product:TEST123');
        if (cachedProduct) {
          console.log('   ✅ Product caching successful');
          console.log(`   📦 Cached data: ${cachedProduct}`);
          
          // Clean up test data
          await DataSyncService.redis.del('test:connection', 'product:TEST123');
          console.log('   🧹 Test data cleaned up');
        } else {
          console.log('   ❌ Product caching failed - no data found');
        }
        
        // Get final key count
        const finalKeyCount = await DataSyncService.redis.dbsize();
        console.log(`   📊 Final Redis keys: ${finalKeyCount}`);
        
      } catch (error) {
        console.error('   ❌ Redis operations failed:', error.message);
      }
      
    } else {
      console.log('❌ Redis connection failed');
      console.log('');
      console.log('🔧 TROUBLESHOOTING:');
      console.log('   1. Check if Redis is configured in your deployment');
      console.log('   2. Verify REDIS_URL environment variable');
      console.log('   3. Check if Redis service is running');
      console.log('   4. Review Redis connection parameters');
    }
    
    console.log('');
    console.log('📋 RECOMMENDATIONS:');
    
    if (!config.REDIS.ENABLE_REDIS) {
      console.log('   ⚠️  Redis is disabled (ENABLE_REDIS=false)');
      console.log('   💡 Set ENABLE_REDIS=true to enable Redis caching');
    } else if (!process.env.REDIS_URL && !process.env.REDIS_HOST) {
      console.log('   ⚠️  No Redis configuration found');
      console.log('   💡 Set REDIS_URL or REDIS_HOST environment variables');
    } else if (!connected) {
      console.log('   ⚠️  Redis connection failed');
      console.log('   💡 Check Redis service status and configuration');
    } else {
      console.log('   ✅ Redis is properly configured and working');
      console.log('   💡 Your sync should populate Redis cache');
    }
    
  } catch (error) {
    console.error('❌ Redis test failed:', error.message);
    console.error('   Stack trace:', error.stack);
  }
}

// Run the test
testRedisConnection().catch(error => {
  console.error('❌ Test failed:', error);
  process.exit(1);
});
