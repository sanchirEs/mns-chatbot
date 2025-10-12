#!/usr/bin/env node
/**
 * Test ProductSearchService directly
 */

import { ProductSearchService } from './src/services/productSearchService.js';

async function testProductSearch() {
  console.log('🧪 TESTING PRODUCT SEARCH SERVICE\n');
  console.log('='.repeat(60));
  
  try {
    console.log('🔍 Testing search for "парацэтэмол"...');
    const result = await ProductSearchService.search('парацэтэмол', {
      limit: 5,
      threshold: 0.5,
      includeInactive: true
    });
    
    console.log('\n📊 SEARCH RESULT:');
    console.log(`   Query: парацэтэмол`);
    console.log(`   Products found: ${result.products?.length || 0}`);
    console.log(`   Total: ${result.total || 0}`);
    console.log(`   Metadata:`, JSON.stringify(result.metadata, null, 2));
    
    if (result.products && result.products.length > 0) {
      console.log('\n🔍 SAMPLE PRODUCTS:');
      result.products.slice(0, 3).forEach((product, index) => {
        console.log(`   ${index + 1}. ${product.name}`);
        console.log(`      Price: ₮${product.price || 'N/A'}`);
        console.log(`      Stock: ${product.available || 0}`);
        console.log(`      Similarity: ${product.similarity || 'N/A'}`);
      });
    } else {
      console.log('\n❌ NO PRODUCTS FOUND!');
      console.log('   This explains why the chatbot gives generic responses.');
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('📊 DIAGNOSIS:');
    if (result.products && result.products.length > 0) {
      console.log('✅ ProductSearchService is working correctly');
      console.log('   Issue must be in the API endpoint or chat controller');
    } else {
      console.log('❌ ProductSearchService is returning 0 results');
      console.log('   Issue is in the search service itself');
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('Stack:', error.stack);
  }
}

testProductSearch().then(() => process.exit(0));
