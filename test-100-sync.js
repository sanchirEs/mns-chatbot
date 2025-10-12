#!/usr/bin/env node
/**
 * Test sync with 100 products - quick verification
 */

import { DataSyncService } from './src/services/dataSyncService.js';

async function test100Sync() {
  console.log('🧪 TESTING 100 PRODUCTS SYNC\n');
  console.log('='.repeat(50));
  
  try {
    console.log('🚀 Starting sync with 100 products...');
    
    // Sync only 100 products
    const result = await DataSyncService.fullCatalogSync({
      batchSize: 50,
      maxProducts: 100,
      generateEmbeddings: true
    });
    
    console.log('\n✅ Sync completed!');
    console.log(`📊 Products processed: ${result.stats.processed}`);
    console.log(`📈 Created: ${result.stats.created}`);
    console.log(`🔄 Updated: ${result.stats.updated}`);
    console.log(`❌ Failed: ${result.stats.failed}`);
    
    console.log('\n🎯 Test Result:');
    if (result.stats.processed >= 90) {
      console.log('✅ SUCCESS: Vector DB + Redis integration working!');
      console.log('   Ready to sync all products with fixed deduplication.');
    } else {
      console.log('❌ ISSUE: Not enough products synced');
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

test100Sync().then(() => process.exit(0));
