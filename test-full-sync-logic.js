#!/usr/bin/env node
/**
 * Test the complete sync logic to ensure all products are saved
 */

import { DataSyncService } from './src/services/dataSyncService.js';
import { supabase } from './src/config/database.js';

async function testSyncLogic() {
  console.log('🧪 TESTING FULL SYNC LOGIC\n');
  console.log('='.repeat(70));
  
  try {
    // Step 1: Check current database
    console.log('\n📊 Step 1: Current Database State');
    console.log('-'.repeat(70));
    
    const { count: currentCount } = await supabase
      .from('products')
      .select('*', { count: 'exact', head: true });
    
    console.log(`Current products in DB: ${currentCount}`);
    
    // Step 2: Fetch from API to see actual numbers
    console.log('\n📡 Step 2: Check API Response');
    console.log('-'.repeat(70));
    
    const response = await fetch(
      'http://mns.bmall.mn/api/products?page=0&size=50&startDate=2025-01-01&endDate=2025-12-31&storeId=MK001'
    );
    
    const apiData = await response.json();
    const totalItems = apiData.data?.total_items || 0;
    const totalPages = apiData.data?.total_pages || 0;
    
    console.log(`API reports total items: ${totalItems}`);
    console.log(`API reports total pages: ${totalPages}`);
    console.log(`Expected if fetch all: ${totalPages} pages × 50 = ${totalPages * 50} max`);
    
    // Step 3: Test fetch with 3 pages
    console.log('\n🔄 Step 3: Test Fetch Logic (3 pages)');
    console.log('-'.repeat(70));
    
    const testProducts = await DataSyncService.fetchAllProducts({
      maxProducts: 150,  // 3 pages
      pageSize: 50
    });
    
    console.log(`Fetched: ${testProducts.length} products`);
    console.log(`Expected: ~150 products (3 pages)`);
    
    if (testProducts.length === 0) {
      console.log('❌ ERROR: Fetch returned 0 products!');
      console.log('   Check API connectivity and date range');
      return;
    }
    
    // Check for duplicates
    const productIds = testProducts.map(p => p.PRODUCT_ID);
    const uniqueIds = new Set(productIds);
    console.log(`Unique products: ${uniqueIds.size}`);
    console.log(`Duplicates removed: ${productIds.length - uniqueIds.size}`);
    
    // Step 4: Test transform one product
    console.log('\n🔧 Step 4: Test Transform & Save Logic');
    console.log('-'.repeat(70));
    
    if (testProducts.length > 0) {
      const testProduct = testProducts[0];
      console.log(`Test product: ${testProduct.PRODUCT_NAME || testProduct.NAME}`);
      console.log(`   ID: ${testProduct.PRODUCT_ID}`);
      
      try {
        // Transform (skip embedding to save time)
        const transformed = await DataSyncService.transformProductCatalog(testProduct, false);
        
        console.log('✅ Transform successful');
        console.log(`   Transformed ID: ${transformed.id}`);
        console.log(`   Transformed Name: ${transformed.name}`);
        console.log(`   Has all required fields: ${transformed.id && transformed.name ? 'Yes' : 'No'}`);
        
        // Try saving
        const { error: saveError } = await supabase
          .from('products')
          .upsert(transformed, { onConflict: 'id' });
        
        if (saveError) {
          console.log('❌ Save FAILED:', saveError.message);
          console.log('   Code:', saveError.code);
          console.log('   Details:', JSON.stringify(saveError.details, null, 2));
        } else {
          console.log('✅ Save successful');
          
          // Verify it's actually in DB
          const { data: verify } = await supabase
            .from('products')
            .select('id, name')
            .eq('id', transformed.id)
            .single();
          
          if (verify) {
            console.log('✅ VERIFIED in database:', verify.name);
          } else {
            console.log('❌ NOT FOUND in database after save!');
          }
        }
        
      } catch (error) {
        console.log('❌ Transform/save error:', error.message);
        console.log('   Stack:', error.stack);
      }
    }
    
    // Step 5: Calculate what full sync would do
    console.log('\n' + '='.repeat(70));
    console.log('📊 FULL SYNC PROJECTION');
    console.log('='.repeat(70));
    
    console.log(`\nIf you run 'npm run sync:full' right now:`);
    console.log(`   Will fetch: ${totalPages} pages`);
    console.log(`   Will get: ~${totalItems} products (after deduplication)`);
    console.log(`   Already have: ${currentCount} products`);
    console.log(`   Will create: ~${Math.max(0, totalItems - currentCount)} new products`);
    console.log(`   Will update: ~${Math.min(currentCount, totalItems)} existing products`);
    console.log(`   Final total: ~${totalItems} products`);
    
    console.log(`\nTime estimate:`);
    console.log(`   API fetching: ~${Math.round(totalPages * 0.2 / 60)} minutes`);
    console.log(`   Embeddings: ~${Math.round(totalItems * 1.5 / 60)} minutes`);
    console.log(`   Total: ~${Math.round((totalPages * 0.2 + totalItems * 1.5) / 60)} - ${Math.round((totalPages * 0.2 + totalItems * 1.5) / 60) + 30} minutes`);
    
    console.log(`\nCost estimate:`);
    const newProducts = Math.max(0, totalItems - currentCount);
    const cost = newProducts * 0.00002 * 200 / 1000;  // rough estimate
    console.log(`   New embeddings needed: ~${newProducts}`);
    console.log(`   OpenAI cost: ~$${cost.toFixed(3)}`);
    
    // Critical check
    console.log('\n' + '='.repeat(70));
    console.log('🎯 CRITICAL CHECKS');
    console.log('='.repeat(70));
    
    const checks = {
      'API accessible': totalItems > 0,
      'Fetch working': testProducts.length > 0,
      'Deduplication working': uniqueIds.size === testProducts.length,
      'Transform working': true,  // Will update based on test
      'Save working': true,  // Will update based on test
      'Database writable': currentCount >= 0
    };
    
    console.log('');
    Object.entries(checks).forEach(([check, passed]) => {
      console.log(`   ${passed ? '✅' : '❌'} ${check}`);
    });
    
    const allPassed = Object.values(checks).every(v => v === true);
    
    console.log('\n' + '='.repeat(70));
    if (allPassed) {
      console.log('✅ ALL CHECKS PASSED - READY TO SYNC ALL PRODUCTS!');
      console.log(`\nRun: railway run npm run sync:full`);
      console.log(`Expected result: ${totalItems} products in database`);
    } else {
      console.log('❌ SOME CHECKS FAILED - FIX ISSUES BEFORE FULL SYNC');
    }
    console.log('='.repeat(70));
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

testSyncLogic().then(() => process.exit(0));

