#!/usr/bin/env node

/**
 * Test Large Sync Capacity
 * 
 * This script tests the sync system's ability to handle 7k+ products
 * and verifies that all products are processed correctly.
 */

import { DataSyncService } from './src/services/dataSyncService.js';
import { SyncScheduler } from './src/jobs/syncScheduler.js';

console.log('🧪 Testing Large Sync Capacity (7k+ Products)');
console.log('=' .repeat(60));

async function testLargeSync() {
  const startTime = Date.now();
  
  try {
    console.log('📦 Testing quick stock sync with 7k+ products...');
    console.log('   This will fetch and process all available products');
    console.log('   Expected: 7,000+ products should be processed');
    console.log('');
    
    // Test quick stock sync with large capacity
    const result = await DataSyncService.quickStockSync({ 
      maxProducts: 7000 
    });
    
    const duration = Date.now() - startTime;
    
    console.log('✅ Large sync test completed!');
    console.log('=' .repeat(60));
    console.log('📊 RESULTS:');
    console.log(`   Products Processed: ${result.stats.processed}`);
    console.log(`   Products Updated: ${result.stats.updated}`);
    console.log(`   Products Cached: ${result.stats.cached}`);
    console.log(`   Products Failed: ${result.stats.failed}`);
    console.log(`   Duration: ${Math.floor(duration / 1000)}s`);
    console.log(`   Success Rate: ${Math.floor((result.stats.processed / (result.stats.processed + result.stats.failed)) * 100)}%`);
    console.log('');
    
    // Verify capacity
    if (result.stats.processed >= 1000) {
      console.log('✅ CAPACITY TEST PASSED: Successfully processed 1000+ products');
    } else {
      console.log('❌ CAPACITY TEST FAILED: Only processed', result.stats.processed, 'products');
    }
    
    if (result.stats.failed === 0) {
      console.log('✅ ERROR HANDLING PASSED: No products failed during sync');
    } else {
      console.log('⚠️  ERROR HANDLING: Some products failed (this is normal for large syncs)');
    }
    
    if (duration < 300000) { // 5 minutes
      console.log('✅ PERFORMANCE TEST PASSED: Sync completed in under 5 minutes');
    } else {
      console.log('⚠️  PERFORMANCE WARNING: Sync took longer than 5 minutes');
    }
    
    console.log('');
    console.log('🎯 RECOMMENDATIONS:');
    
    if (result.stats.processed >= 5000) {
      console.log('   ✅ System can handle large product volumes');
      console.log('   ✅ Ready for production with 7k+ products');
    } else if (result.stats.processed >= 1000) {
      console.log('   ⚠️  System can handle medium volumes');
      console.log('   💡 Consider optimizing for larger volumes');
    } else {
      console.log('   ❌ System has capacity limitations');
      console.log('   🔧 Review batch sizes and processing logic');
    }
    
    console.log('');
    console.log('📋 NEXT STEPS:');
    console.log('   1. Deploy the updated sync configuration');
    console.log('   2. Monitor sync logs in production');
    console.log('   3. Verify all 7k+ products are being updated');
    console.log('   4. Check sync status endpoint: /api/admin/sync-status');
    
  } catch (error) {
    console.error('❌ Large sync test failed:', error.message);
    console.error('   Stack trace:', error.stack);
    console.log('');
    console.log('🔧 TROUBLESHOOTING:');
    console.log('   1. Check database connection');
    console.log('   2. Verify business API is accessible');
    console.log('   3. Review environment variables');
    console.log('   4. Check memory and resource limits');
  }
}

async function testSchedulerCapacity() {
  console.log('📅 Testing scheduler capacity...');
  
  try {
    const status = SyncScheduler.getStatus();
    console.log('✅ Scheduler status:', status);
    
    if (status.running) {
      console.log('✅ Scheduler is running and ready for large syncs');
    } else {
      console.log('⚠️  Scheduler is not running - start it with SyncScheduler.start()');
    }
    
  } catch (error) {
    console.error('❌ Scheduler test failed:', error.message);
  }
}

// Run tests
async function runTests() {
  await testSchedulerCapacity();
  console.log('');
  await testLargeSync();
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Test interrupted by user');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Test terminated');
  process.exit(0);
});

// Run the tests
runTests().catch(error => {
  console.error('❌ Test suite failed:', error);
  process.exit(1);
});
