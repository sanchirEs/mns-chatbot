#!/usr/bin/env node
/**
 * Trace sync flow to identify where products are lost
 */

import { DataSyncService } from './src/services/dataSyncService.js';
import { supabase } from './src/config/database.js';

async function traceSync() {
  console.log('🔍 TRACING SYNC FLOW TO FIND ISSUES...\n');
  console.log('='.repeat(70));
  
  try {
    // Step 1: Check current database state
    console.log('\n📊 STEP 1: Current Database State');
    console.log('-'.repeat(70));
    
    const { count: beforeCount } = await supabase
      .from('products')
      .select('*', { count: 'exact', head: true });
    
    console.log(`Products in DB before sync: ${beforeCount}`);
    
    // Step 2: Fetch a small sample from API
    console.log('\n📦 STEP 2: Fetch Sample from API (1 page)');
    console.log('-'.repeat(70));
    
    const response = await fetch(
      'http://mns.bmall.mn/api/products?page=0&size=50&startDate=2025-01-01&endDate=2025-12-31&storeId=MK001'
    );
    
    const data = await response.json();
    const apiProducts = data.data?.data?.items || [];
    const totalItems = data.data?.data?.total_items || 0;
    const totalPages = data.data?.data?.total_pages || 0;
    
    console.log(`API Total Items: ${totalItems}`);
    console.log(`API Total Pages: ${totalPages}`);
    console.log(`Sample fetched: ${apiProducts.length} products`);
    console.log(`Expected if fetch all: ${totalPages} pages × 50 = ~${totalPages * 50} products`);
    
    // Step 3: Check fetchAllProducts logic
    console.log('\n🔄 STEP 3: Test Fetch Logic (3 pages only)');
    console.log('-'.repeat(70));
    
    const testProducts = await DataSyncService.fetchAllProducts({ 
      maxProducts: 150,  // Just test 3 pages
      pageSize: 50 
    });
    
    console.log(`Fetched products: ${testProducts.length}`);
    console.log(`Expected: ~150 (3 pages × 50)`);
    
    if (testProducts.length < 150) {
      console.log('⚠️  WARNING: Fetched fewer products than expected!');
    }
    
    // Step 4: Check for duplicates in fetched data
    console.log('\n🔍 STEP 4: Check for Duplicates');
    console.log('-'.repeat(70));
    
    const productIds = testProducts.map(p => p.PRODUCT_ID);
    const uniqueIds = new Set(productIds);
    
    console.log(`Total fetched: ${productIds.length}`);
    console.log(`Unique IDs: ${uniqueIds.size}`);
    console.log(`Duplicates: ${productIds.length - uniqueIds.size}`);
    
    if (uniqueIds.size < productIds.length) {
      console.log('⚠️  DUPLICATES FOUND IN FETCH!');
    }
    
    // Step 5: Test transform and save one product
    console.log('\n💾 STEP 5: Test Save One Product');
    console.log('-'.repeat(70));
    
    if (testProducts.length > 0) {
      const testProduct = testProducts[0];
      console.log(`Testing with: ${testProduct.PRODUCT_NAME}`);
      
      try {
        // Transform (without embedding to save time)
        const transformed = await DataSyncService.transformProductCatalog(testProduct, false);
        
        console.log('Transformed product:');
        console.log(`   ID: ${transformed.id}`);
        console.log(`   Name: ${transformed.name}`);
        console.log(`   Embedding: ${transformed.embedding ? 'Yes' : 'No'}`);
        
        // Try to save
        const { error: saveError } = await supabase
          .from('products')
          .upsert(transformed, { onConflict: 'id' });
        
        if (saveError) {
          console.log('❌ Save failed:', saveError.message);
          console.log('   Error code:', saveError.code);
          console.log('   Error details:', saveError.details);
        } else {
          console.log('✅ Product saved successfully');
          
          // Verify it's actually in DB
          const { data: verify, error: verifyError } = await supabase
            .from('products')
            .select('id, name')
            .eq('id', transformed.id)
            .single();
          
          if (verify) {
            console.log('✅ Verified in database:', verify.name);
          } else {
            console.log('❌ NOT FOUND in database after save!', verifyError);
          }
        }
        
      } catch (error) {
        console.log('❌ Transform/save failed:', error.message);
      }
    }
    
    // Step 6: Analysis
    console.log('\n' + '='.repeat(70));
    console.log('📊 ANALYSIS');
    console.log('='.repeat(70));
    
    console.log(`\nAPI has: ${totalItems} total products`);
    console.log(`Database has: ${beforeCount} products`);
    console.log(`Missing: ${totalItems - beforeCount} products`);
    
    console.log('\n🎯 To sync all products:');
    console.log(`   Need to fetch: ${totalPages} pages`);
    console.log(`   Expected products: ~${totalItems}`);
    console.log(`   Time estimate: ${Math.round(totalPages * 0.2 / 60)} minutes (fetch only)`);
    console.log(`   Embedding time: ${Math.round(totalItems * 1.5 / 60)} minutes`);
    console.log(`   Total: ~${Math.round((totalPages * 0.2 + totalItems * 1.5) / 60)} minutes`);
    
    console.log('\n💡 Recommendations:');
    if (totalItems - beforeCount > 1000) {
      console.log('   ⚠️  You have many products to sync');
      console.log('   Run: railway run npm run sync:full');
      console.log(`   This will take ~${Math.round((totalPages * 0.2 + totalItems * 1.5) / 60)}-${Math.round((totalPages * 0.2 + totalItems * 1.5) / 60) + 20} minutes`);
    } else {
      console.log('   ✅ Most products already synced');
      console.log('   Run: railway run npm run sync:quick');
    }
    
  } catch (error) {
    console.error('❌ Trace failed:', error);
  }
}

traceSync().then(() => {
  console.log('\n✅ Trace complete');
  process.exit(0);
});

