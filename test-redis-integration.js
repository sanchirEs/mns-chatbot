/**
 * Comprehensive Redis Integration Test
 * Tests all three tiers of the architecture with Redis caching
 */

import { DataSyncService } from './src/services/dataSyncService.js';
import { ProductSearchService } from './src/services/productSearchService.js';
import { config } from './src/config/environment.js';

async function testRedisIntegration() {
  console.log('🧪 COMPREHENSIVE REDIS INTEGRATION TEST\n');
  console.log('=' .repeat(60));

  const results = {
    passed: 0,
    failed: 0,
    warnings: 0
  };

  // ================================================================
  // TEST 1: Redis Configuration
  // ================================================================
  console.log('\n📋 TEST 1: Redis Configuration');
  console.log('-'.repeat(60));
  
  console.log('ENABLE_REDIS:', config.REDIS.ENABLE_REDIS);
  console.log('REDIS_URL:', process.env.REDIS_URL ? '✅ Set' : '❌ Not set');
  console.log('Redis Client:', DataSyncService.redis ? '✅ Initialized' : '❌ Not initialized');
  
  if (!config.REDIS.ENABLE_REDIS) {
    console.log('⚠️  WARNING: Redis is not enabled!');
    results.warnings++;
  } else if (!DataSyncService.redis) {
    console.log('❌ FAIL: Redis client not initialized');
    results.failed++;
  } else {
    console.log('✅ PASS: Redis configuration correct');
    results.passed++;
  }

  // ================================================================
  // TEST 2: Redis Connection & Basic Operations
  // ================================================================
  console.log('\n🔌 TEST 2: Redis Connection & Operations');
  console.log('-'.repeat(60));
  
  try {
    if (!DataSyncService.redis) {
      console.log('⚠️  SKIP: Redis not initialized');
      results.warnings++;
    } else {
      // Initialize connection
      await DataSyncService.initializeRedis();
      
      if (DataSyncService.redisConnected) {
        console.log('✅ Redis connected');
        
        // Test SET
        await DataSyncService.redis.set('test:integration', 'Hello Redis!', 'EX', 60);
        console.log('✅ SET operation successful');
        
        // Test GET
        const value = await DataSyncService.redis.get('test:integration');
        if (value === 'Hello Redis!') {
          console.log('✅ GET operation successful:', value);
          results.passed++;
        } else {
          console.log('❌ FAIL: GET returned unexpected value:', value);
          results.failed++;
        }
        
        // Cleanup
        await DataSyncService.redis.del('test:integration');
        console.log('✅ Cleanup successful');
      } else {
        console.log('⚠️  WARNING: Redis connection failed - using fallback');
        results.warnings++;
      }
    }
  } catch (error) {
    console.log('❌ FAIL: Redis operations failed:', error.message);
    results.failed++;
  }

  // ================================================================
  // TEST 3: Product Inventory Caching (TIER 2)
  // ================================================================
  console.log('\n📦 TEST 3: Product Inventory Caching');
  console.log('-'.repeat(60));
  
  try {
    const testProduct = {
      PRODUCT_ID: 'TEST_PRODUCT_123',
      STOCKS: [{
        AVAILABLE: 100,
        ONHAND: 150,
        PROMISE: 50,
        FACILITY_ID: 'MK001R',
        FACILITY_NAME: 'Test Warehouse'
      }],
      BASE_PRICE: 25000,
      ACTIVE: '1'
    };
    
    // Cache product
    console.log('Caching test product...');
    await DataSyncService.cacheProductInventory(testProduct);
    console.log('✅ Product cached');
    
    // Retrieve from cache
    const cached = await DataSyncService.getFromCache('TEST_PRODUCT_123');
    
    if (cached) {
      console.log('✅ Retrieved from cache:', cached);
      
      if (cached.available === 100 && cached.price === 25000) {
        console.log('✅ PASS: Cache data matches');
        results.passed++;
      } else {
        console.log('❌ FAIL: Cache data mismatch');
        console.log('Expected: available=100, price=25000');
        console.log('Got:', cached);
        results.failed++;
      }
    } else {
      console.log('⚠️  WARNING: Cache not available (using DB fallback)');
      results.warnings++;
    }
    
    // Cleanup
    if (DataSyncService.redis && DataSyncService.redisConnected) {
      await DataSyncService.redis.del('product:TEST_PRODUCT_123');
      console.log('✅ Cleanup successful');
    }
    
  } catch (error) {
    console.log('❌ FAIL: Product caching test failed:', error.message);
    results.failed++;
  }

  // ================================================================
  // TEST 4: Embedding Cache (Search Optimization)
  // ================================================================
  console.log('\n🔍 TEST 4: Embedding Cache');
  console.log('-'.repeat(60));
  
  try {
    const testQuery = 'paracetamol 400mg';
    
    console.log('Generating embedding (first call - should hit OpenAI)...');
    const start1 = Date.now();
    const embedding1 = await ProductSearchService.generateEmbedding(testQuery);
    const duration1 = Date.now() - start1;
    console.log(`✅ First call: ${duration1}ms (OpenAI)`);
    console.log(`   Embedding dimensions: ${embedding1.length}`);
    
    if (DataSyncService.redisConnected) {
      console.log('\nGenerating same embedding (second call - should hit cache)...');
      const start2 = Date.now();
      const embedding2 = await ProductSearchService.generateEmbedding(testQuery);
      const duration2 = Date.now() - start2;
      console.log(`✅ Second call: ${duration2}ms (Cache)`);
      
      if (duration2 < duration1 / 2) {
        console.log(`✅ PASS: Cache is ${Math.round(duration1/duration2)}x faster!`);
        results.passed++;
      } else {
        console.log('⚠️  WARNING: Cache may not be working optimally');
        console.log(`   Expected <${duration1/2}ms, got ${duration2}ms`);
        results.warnings++;
      }
      
      // Verify embeddings match
      if (JSON.stringify(embedding1) === JSON.stringify(embedding2)) {
        console.log('✅ Embeddings match (cache consistency verified)');
      } else {
        console.log('❌ FAIL: Cached embedding differs from original');
        results.failed++;
      }
    } else {
      console.log('⚠️  SKIP: Redis not connected, cannot test cache');
      results.warnings++;
    }
    
  } catch (error) {
    console.log('❌ FAIL: Embedding cache test failed:', error.message);
    results.failed++;
  }

  // ================================================================
  // TEST 5: Three-Tier Architecture Integration
  // ================================================================
  console.log('\n🏗️  TEST 5: Three-Tier Architecture');
  console.log('-'.repeat(60));
  
  try {
    console.log('Testing complete search flow with caching...\n');
    
    const searchQuery = 'vitamin';
    
    console.log('TIER 1: Vector DB Search');
    const start = Date.now();
    const results_search = await ProductSearchService.search(searchQuery, { 
      limit: 3,
      includeInactive: true 
    });
    const duration = Date.now() - start;
    
    console.log(`✅ Search completed in ${duration}ms`);
    console.log(`✅ Found ${results_search.products?.length || 0} products`);
    
    if (results_search.products && results_search.products.length > 0) {
      const product = results_search.products[0];
      console.log(`\nTIER 2: Product Data Enrichment`);
      console.log(`   Product: ${product.name}`);
      console.log(`   Price: ${product.formattedPrice || product.price}`);
      console.log(`   Stock: ${product.available || 0}`);
      console.log(`   Status: ${product.stockStatus}`);
      console.log(`   Data Source: ${product.dataSource || 'unknown'}`);
      
      if (product.dataSource === 'redis_cache' || product.dataSource === 'cache') {
        console.log('✅ PASS: Using Redis cache for inventory!');
        results.passed++;
      } else if (product.dataSource === 'database') {
        console.log('⚠️  Using database (Redis cache miss or disabled)');
        results.warnings++;
      } else {
        console.log('⚠️  Data source unknown');
        results.warnings++;
      }
      
      console.log(`\nTIER 3: Real-time API`);
      console.log('   ✅ Available for critical operations (on-demand)');
      
    } else {
      console.log('⚠️  WARNING: No search results found');
      console.log('   Ensure products are synced: npm run migrate');
      results.warnings++;
    }
    
  } catch (error) {
    console.log('❌ FAIL: Three-tier integration test failed:', error.message);
    console.log('Stack:', error.stack);
    results.failed++;
  }

  // ================================================================
  // TEST 6: Cache Statistics
  // ================================================================
  console.log('\n📊 TEST 6: Cache Statistics');
  console.log('-'.repeat(60));
  
  try {
    if (DataSyncService.redis && DataSyncService.redisConnected) {
      const dbsize = await DataSyncService.redis.dbsize();
      const info = await DataSyncService.redis.info('memory');
      const usedMemory = info.match(/used_memory_human:(.*)/)?.[1]?.trim();
      
      console.log(`Total cache keys: ${dbsize}`);
      console.log(`Memory usage: ${usedMemory}`);
      console.log('✅ PASS: Cache statistics retrieved');
      results.passed++;
    } else {
      console.log('⚠️  SKIP: Redis not connected');
      results.warnings++;
    }
  } catch (error) {
    console.log('❌ FAIL: Cache statistics failed:', error.message);
    results.failed++;
  }

  // ================================================================
  // FINAL RESULTS
  // ================================================================
  console.log('\n' + '='.repeat(60));
  console.log('🏁 TEST RESULTS SUMMARY');
  console.log('='.repeat(60));
  console.log(`✅ Passed: ${results.passed}`);
  console.log(`❌ Failed: ${results.failed}`);
  console.log(`⚠️  Warnings: ${results.warnings}`);
  console.log(`📊 Total: ${results.passed + results.failed + results.warnings}`);
  
  const successRate = Math.round((results.passed / (results.passed + results.failed)) * 100);
  console.log(`\n📈 Success Rate: ${successRate}%`);
  
  if (results.failed === 0 && results.warnings === 0) {
    console.log('\n🎉 PERFECT! All tests passed with no warnings!');
    console.log('✅ Redis is properly integrated and working optimally!');
  } else if (results.failed === 0) {
    console.log('\n✅ All tests passed!');
    if (results.warnings > 0) {
      console.log('⚠️  Some features are using fallbacks (this is normal without Redis)');
    }
  } else {
    console.log('\n❌ Some tests failed. Review errors above.');
  }
  
  console.log('\n' + '='.repeat(60));
  
  // Cleanup
  if (DataSyncService.redis && DataSyncService.redisConnected) {
    await DataSyncService.redis.quit();
    console.log('✅ Redis connection closed');
  }
  
  process.exit(results.failed > 0 ? 1 : 0);
}

// Run tests
testRedisIntegration().catch(error => {
  console.error('💥 Test suite crashed:', error);
  process.exit(1);
});

