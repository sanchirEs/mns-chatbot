#!/usr/bin/env node
/**
 * Test search with actual synced product names
 */

import { supabase } from './src/config/database.js';
import { ProductSearchService } from './src/services/productSearchService.js';

async function testSyncedProducts() {
  console.log('🔍 TESTING SYNCED PRODUCTS\n');
  console.log('='.repeat(50));
  
  try {
    // Get recent products (last 100)
    console.log('📊 Getting recently synced products...');
    const { data: recentProducts } = await supabase
      .from('products')
      .select('id, name, generic_name, updated_at')
      .order('updated_at', { ascending: false })
      .limit(10);
    
    if (recentProducts && recentProducts.length > 0) {
      console.log(`✅ Found ${recentProducts.length} recent products:`);
      recentProducts.forEach((product, index) => {
        console.log(`   ${index + 1}. ${product.name}`);
      });
      
      // Test search with first product name
      const testProduct = recentProducts[0];
      console.log(`\n🔍 Testing search with: "${testProduct.name}"`);
      
      const searchResult = await ProductSearchService.search(testProduct.name, {
        limit: 5,
        threshold: 0.3,
        includeInactive: true
      });
      
      console.log(`✅ Search results: ${searchResult.products?.length || 0} products`);
      if (searchResult.products && searchResult.products.length > 0) {
        console.log('   Top results:');
        searchResult.products.slice(0, 3).forEach((product, index) => {
          console.log(`     ${index + 1}. ${product.name} (similarity: ${product.similarity})`);
        });
      }
      
      // Test search with generic name if available
      if (testProduct.generic_name) {
        console.log(`\n🔍 Testing search with generic name: "${testProduct.generic_name}"`);
        const genericSearch = await ProductSearchService.search(testProduct.generic_name, {
          limit: 3,
          threshold: 0.3,
          includeInactive: true
        });
        
        console.log(`✅ Generic search results: ${genericSearch.products?.length || 0} products`);
      }
      
    } else {
      console.log('❌ No recent products found');
    }
    
    // Test with a simple term
    console.log('\n🔍 Testing with simple term "таблет" (tablet)...');
    const simpleSearch = await ProductSearchService.search('таблет', {
      limit: 3,
      threshold: 0.3,
      includeInactive: true
    });
    
    console.log(`✅ Simple search results: ${simpleSearch.products?.length || 0} products`);
    if (simpleSearch.products && simpleSearch.products.length > 0) {
      console.log('   Results:');
      simpleSearch.products.forEach((product, index) => {
        console.log(`     ${index + 1}. ${product.name}`);
      });
    }
    
    console.log('\n' + '='.repeat(50));
    console.log('🎯 SUMMARY:');
    console.log(`   Recent products found: ${recentProducts?.length || 0}`);
    console.log(`   Search with product name: ${searchResult?.products?.length > 0 ? '✅ Working' : '❌ Failed'}`);
    console.log(`   Search with simple term: ${simpleSearch?.products?.length > 0 ? '✅ Working' : '❌ Failed'}`);
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

testSyncedProducts().then(() => process.exit(0));
