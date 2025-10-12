#!/usr/bin/env node
/**
 * Test sync with 100 products to verify vector DB + Redis integration
 */

import { DataSyncService } from './src/services/dataSyncService.js';
import { ProductSearchService } from './src/services/productSearchService.js';

async function test100Products() {
  console.log('🧪 TESTING 100 PRODUCTS SYNC\n');
  console.log('='.repeat(60));
  
  try {
    console.log('🚀 Starting sync with 100 products...');
    
    // Sync only 100 products
    const result = await DataSyncService.fullCatalogSync({
      batchSize: 50,
      maxProducts: 100,
      generateEmbeddings: true
    });
    
    console.log('\n✅ Sync completed!');
    console.log(`📊 Products synced: ${result.stats.processed}`);
    console.log(`📈 Created: ${result.stats.created}`);
    console.log(`🔄 Updated: ${result.stats.updated}`);
    
    // Test vector search
    console.log('\n🔍 Testing vector search...');
    const searchResult = await ProductSearchService.search('эм', {
      limit: 5,
      threshold: 0.5,
      includeInactive: true
    });
    
    console.log(`✅ Vector search found: ${searchResult.products?.length || 0} products`);
    
    if (searchResult.products && searchResult.products.length > 0) {
      console.log('\n📋 Sample results:');
      searchResult.products.slice(0, 3).forEach((product, index) => {
        console.log(`   ${index + 1}. ${product.name}`);
        console.log(`      Price: ₮${product.price || 'N/A'}`);
        console.log(`      Stock: ${product.available || 0}`);
        console.log(`      Data source: ${product.dataSource || 'N/A'}`);
      });
    }
    
    // Test Redis cache
    console.log('\n🔴 Testing Redis cache...');
    const cacheStats = await ProductSearchService.getCacheStats();
    console.log(`✅ Redis status: ${JSON.stringify(cacheStats, null, 2)}`);
    
    console.log('\n' + '='.repeat(60));
    console.log('🎯 INTEGRATION TEST RESULTS:');
    console.log(`   Vector DB: ${searchResult.products?.length > 0 ? '✅ Working' : '❌ Failed'}`);
    console.log(`   Redis Cache: ${cacheStats.enabled ? '✅ Working' : '❌ Failed'}`);
    console.log(`   Product Search: ${searchResult.products?.length > 0 ? '✅ Working' : '❌ Failed'}`);
    
    if (searchResult.products?.length > 0 && cacheStats.enabled) {
      console.log('\n🎉 SUCCESS: Vector DB + Redis integration is working!');
      console.log('   Ready to fix the duplicate fetching issue and sync all 6,780 products.');
    } else {
      console.log('\n❌ ISSUE: Integration test failed');
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('Stack:', error.stack);
  }
}

test100Products().then(() => process.exit(0));
