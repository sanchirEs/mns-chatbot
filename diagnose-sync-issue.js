#!/usr/bin/env node
/**
 * Diagnose why only 2121 products exist when 6778 were synced
 */

import { supabase } from './src/config/database.js';

async function diagnose() {
  console.log('🔍 Diagnosing Sync Issue...\n');
  
  try {
    // Check products table
    console.log('📊 Products Table:');
    const { count: productsCount, error: e1 } = await supabase
      .from('products')
      .select('*', { count: 'exact', head: true });
    
    if (e1) console.error('Error:', e1);
    console.log(`   Total products: ${productsCount}`);
    
    // Check product_inventory table
    console.log('\n📦 Product Inventory Table:');
    const { count: inventoryCount, error: e2 } = await supabase
      .from('product_inventory')
      .select('*', { count: 'exact', head: true });
    
    if (e2) console.error('Error:', e2);
    console.log(`   Total inventory records: ${inventoryCount}`);
    
    // Check for products with embeddings
    console.log('\n🧠 Embeddings Status:');
    const { count: withEmbeddings, error: e3 } = await supabase
      .from('products')
      .select('*', { count: 'exact', head: true })
      .not('embedding', 'is', null);
    
    if (e3) console.error('Error:', e3);
    console.log(`   Products with embeddings: ${withEmbeddings}`);
    console.log(`   Products without embeddings: ${productsCount - withEmbeddings}`);
    
    // Check sync log
    console.log('\n📋 Last Sync Log:');
    const { data: syncLog, error: e4 } = await supabase
      .from('sync_log')
      .select('*')
      .order('started_at', { ascending: false })
      .limit(1)
      .single();
    
    if (e4) console.error('Error:', e4);
    if (syncLog) {
      console.log(`   Type: ${syncLog.sync_type}`);
      console.log(`   Status: ${syncLog.status}`);
      console.log(`   Processed: ${syncLog.products_processed}`);
      console.log(`   Created: ${syncLog.products_created}`);
      console.log(`   Updated: ${syncLog.products_updated}`);
      console.log(`   Failed: ${syncLog.products_failed}`);
      console.log(`   Duration: ${Math.round(syncLog.duration_ms / 1000)}s`);
    }
    
    // Sample products to check structure
    console.log('\n📝 Sample Products:');
    const { data: samples, error: e5 } = await supabase
      .from('products')
      .select('id, name, embedding')
      .limit(5);
    
    if (e5) console.error('Error:', e5);
    if (samples) {
      samples.forEach((p, i) => {
        console.log(`   ${i+1}. ${p.id} - ${p.name}`);
        console.log(`      Embedding: ${p.embedding ? 'Yes' : 'No'}`);
      });
    }
    
    // Check for duplicate IDs in last sync
    console.log('\n🔍 Checking for Issues:');
    
    // Get product IDs that exist
    const { data: productIds } = await supabase
      .from('products')
      .select('id');
    
    console.log(`   Unique product IDs in DB: ${productIds?.length || 0}`);
    
    // Analysis
    console.log('\n📊 Analysis:');
    const expectedProducts = 6778;
    const actualProducts = productsCount;
    const discrepancy = expectedProducts - actualProducts;
    
    console.log(`   Expected (from sync): ${expectedProducts}`);
    console.log(`   Actual (in database): ${actualProducts}`);
    console.log(`   Discrepancy: ${discrepancy} products missing`);
    
    if (discrepancy > 0) {
      console.log('\n⚠️  ISSUE DETECTED:');
      console.log(`   ${discrepancy} products were processed but not saved!`);
      console.log('\n   Possible causes:');
      console.log('   1. Products without required fields (name, id)');
      console.log('   2. Embedding generation failures');
      console.log('   3. Database constraints violations');
      console.log('   4. Transaction rollbacks');
      console.log('   5. Duplicate product IDs (updates instead of creates)');
    }
    
    // Check embeddings generation rate
    if (withEmbeddings < actualProducts) {
      const missingEmbeddings = actualProducts - withEmbeddings;
      console.log(`\n⚠️  ${missingEmbeddings} products missing embeddings`);
      console.log('   This could affect search functionality!');
    }
    
  } catch (error) {
    console.error('❌ Diagnostic failed:', error);
  }
}

diagnose().then(() => {
  console.log('\n✅ Diagnostic complete');
  process.exit(0);
}).catch(err => {
  console.error('💥 Error:', err);
  process.exit(1);
});

