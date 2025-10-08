#!/usr/bin/env node

/**
 * Test Synchronization Script
 * Tests the data synchronization functionality
 */

import { DataSyncService } from '../src/services/dataSyncService.js';
import { SearchService } from '../src/services/searchService.js';
import { testDatabaseConnection } from '../src/config/database.js';

async function testSync() {
  console.log('🧪 Testing Data Synchronization...');
  console.log('=' .repeat(60));

  try {
    // Test 1: Database connection
    console.log('🔍 Test 1: Database Connection');
    const dbConnected = await testDatabaseConnection();
    if (!dbConnected) {
      throw new Error('Database connection failed');
    }
    console.log('✅ Database connection successful');

    // Test 2: Sync status check
    console.log('\n🔍 Test 2: Sync Status Check');
    const status = await DataSyncService.getSyncStatus();
    if (status) {
      console.log(`📊 Current status:`);
      console.log(`   Total products: ${status.totalProducts}`);
      console.log(`   In stock: ${status.inStockProducts}`);
      console.log(`   Out of stock: ${status.outOfStockProducts}`);
      console.log(`   Last sync: ${status.lastSync}`);
      console.log(`   Health: ${status.syncHealth}`);
    } else {
      console.log('⚠️ No sync status available (no products synced yet)');
    }

    // Test 3: Small product sync (if no products exist)
    if (!status || status.totalProducts === 0) {
      console.log('\n🔍 Test 3: Initial Product Sync (Small Batch)');
      console.log('Syncing first 10 products...');
      
      const syncResult = await DataSyncService.syncProducts({
        batchSize: 10,
        maxProducts: 10,
        updateExisting: true,
        generateEmbeddings: false // Skip embeddings for faster testing
      });
      
      console.log(`✅ Initial sync completed: ${syncResult.totalSynced} products`);
    } else {
      console.log('\n🔍 Test 3: Product Sync (Skipped - products already exist)');
    }

    // Test 4: Search functionality
    console.log('\n🔍 Test 4: Search Functionality');
    const testQueries = [
      'paracetamol',
      'ibuprofen', 
      'vitamin',
      'pain relief'
    ];

    for (const query of testQueries) {
      try {
        console.log(`   Searching for: "${query}"`);
        const results = await SearchService.semanticSearch(query, { limit: 3 });
        console.log(`   ✅ Found ${results.length} results`);
        
        if (results.length > 0) {
          const firstResult = results[0];
          console.log(`   📦 Sample result: ${firstResult.name} (₮${firstResult.price})`);
        }
      } catch (error) {
        console.log(`   ❌ Search failed for "${query}": ${error.message}`);
      }
    }

    // Test 5: Business data search
    console.log('\n🔍 Test 5: Business Data Search');
    try {
      const businessResults = await SearchService.searchProductsWithBusinessData('paracetamol', {
        includeStock: true,
        includePricing: true,
        realTimeStock: false
      });
      
      console.log(`✅ Business data search: ${businessResults.length} results`);
      
      if (businessResults.length > 0) {
        const sample = businessResults[0];
        console.log(`📦 Sample with business data:`);
        console.log(`   Name: ${sample.name}`);
        console.log(`   Price: ${sample.pricing?.formatted_price || 'N/A'}`);
        console.log(`   Stock: ${sample.stock_quantity} (${sample.stock_status})`);
        console.log(`   Business ID: ${sample.business_info?.bind_id || 'N/A'}`);
      }
    } catch (error) {
      console.log(`❌ Business data search failed: ${error.message}`);
    }

    // Test 6: Stock sync (if products exist)
    if (status && status.totalProducts > 0) {
      console.log('\n🔍 Test 6: Stock Sync');
      try {
        await DataSyncService.syncStockUpdates();
        console.log('✅ Stock sync completed');
      } catch (error) {
        console.log(`⚠️ Stock sync failed: ${error.message}`);
      }
    } else {
      console.log('\n🔍 Test 6: Stock Sync (Skipped - no products to sync)');
    }

    console.log('\n' + '='.repeat(60));
    console.log('🎉 All synchronization tests completed!');
    console.log('\n💡 Next steps:');
    console.log('   1. Run full sync: node scripts/sync-products.js');
    console.log('   2. Test chat functionality with real queries');
    console.log('   3. Monitor sync health in production');

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error('Stack trace:', error.stack);
    process.exit(1);
  }
}

// Run tests
testSync();
