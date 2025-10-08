#!/usr/bin/env node

/**
 * Migration Script: Old Schema → Three-Tier Architecture
 * Migrates existing data to the new products + product_inventory structure
 */

import { supabase } from '../src/config/database.js';
import { DataSyncService } from '../src/services/dataSyncService.js';
import { SyncScheduler } from '../src/jobs/syncScheduler.js';

async function migrate() {
  console.log('🔄 Starting Migration to Three-Tier Architecture...');
  console.log('=' .repeat(60));

  try {
    // Step 1: Check if new schema exists
    console.log('🔍 Step 1: Checking database schema...');
    const { data: tables, error: schemaError } = await supabase
      .from('products')
      .select('id')
      .limit(1);

    if (schemaError && schemaError.code === '42P01') {
      console.log('❌ New schema not found!');
      console.log('📝 Please run the migration SQL first:');
      console.log('   psql -h your-host -d your-db -f supabase/migrations/20250108000000_three_tier_architecture.sql');
      console.log('   OR run it in Supabase SQL editor');
      process.exit(1);
    }

    console.log('✅ New schema exists');

    // Step 2: Check if old items table exists
    console.log('\n🔍 Step 2: Checking for old data...');
    const { data: oldItems, error: oldError } = await supabase
      .from('items')
      .select('*')
      .limit(1);

    if (oldError && oldError.code === '42P01') {
      console.log('ℹ️ No old "items" table found - starting fresh');
      console.log('   Proceeding with business API sync...');
    } else if (oldItems) {
      console.log(`📦 Found old "items" table with data`);
      console.log('   Migration will be handled by SQL script');
    }

    // Step 3: Run initial sync from business API
    console.log('\n🔄 Step 3: Running initial sync from business API...');
    console.log('   This will fetch products from http://mns.bmall.mn/api/products');
    
    const syncResult = await DataSyncService.fullCatalogSync({
      batchSize: 50,
      maxProducts: 200, // Start with 200 products
      generateEmbeddings: true
    });

    console.log('\n✅ Initial sync completed!');
    console.log(`   Products synced: ${syncResult.stats.processed}`);
    console.log(`   New products: ${syncResult.stats.created}`);
    console.log(`   Updated products: ${syncResult.stats.updated}`);
    console.log(`   Failed: ${syncResult.stats.failed}`);

    // Step 4: Verify migration
    console.log('\n🔍 Step 4: Verifying migration...');
    const status = await DataSyncService.getSyncStatus();
    
    if (status) {
      console.log('✅ Migration verification:');
      console.log(`   Total products: ${status.database.totalProducts}`);
      console.log(`   Active products: ${status.database.activeProducts}`);
      console.log(`   In-stock products: ${status.database.inStockProducts}`);
      console.log(`   Health status: ${status.health}`);
    }

    // Step 5: Test search
    console.log('\n🔍 Step 5: Testing search functionality...');
    const { ProductSearchService } = await import('../src/services/productSearchService.js');
    
    const testQueries = ['paracetamol', 'vitamin', 'pain'];
    for (const query of testQueries) {
      try {
        const results = await ProductSearchService.search(query, { limit: 3 });
        console.log(`   ✅ "${query}": ${results.products.length} results found`);
      } catch (error) {
        console.log(`   ❌ "${query}": ${error.message}`);
      }
    }

    // Step 6: Setup recommendations
    console.log('\n📋 Step 6: Next steps...');
    console.log('');
    console.log('✅ Migration completed successfully!');
    console.log('');
    console.log('📝 Recommended next steps:');
    console.log('   1. Run full sync: npm run sync:products -- --max-products=1000');
    console.log('   2. Start the server: npm run dev');
    console.log('   3. Test admin endpoints: GET http://localhost:3000/api/admin/sync-status');
    console.log('   4. Enable scheduler in production: Set ENABLE_SCHEDULER=true');
    console.log('   5. Configure Redis: Set REDIS_HOST and REDIS_PORT');
    console.log('');
    console.log('🎯 Your three-tier architecture is ready!');
    console.log('=' .repeat(60));

  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    console.error('Stack:', error.stack);
    console.log('\n🔧 Troubleshooting:');
    console.log('   1. Ensure database schema is created');
    console.log('   2. Check SUPABASE_URL and SUPABASE_KEY');
    console.log('   3. Verify business API is accessible');
    console.log('   4. Check OpenAI API key for embeddings');
    process.exit(1);
  }
}

// Run migration
migrate();

