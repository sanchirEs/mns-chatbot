#!/usr/bin/env node
/**
 * Test chatbot with paracetamol query
 */

import { ProductSearchService } from './src/services/productSearchService.js';

async function testChatbot() {
  console.log('🧪 TESTING CHATBOT WITH PARACETAMOL\n');
  console.log('='.repeat(50));
  
  try {
    // Test the exact query from the user's screenshot
    const query = 'парацэтэмол 400 байгааюу';
    console.log(`🔍 Testing query: "${query}"`);
    
    const result = await ProductSearchService.search(query, {
      limit: 5,
      threshold: 0.3,
      includeInactive: true
    });
    
    console.log(`✅ Search results: ${result.products?.length || 0} products`);
    
    if (result.products && result.products.length > 0) {
      console.log('\n📋 Found products:');
      result.products.forEach((product, index) => {
        console.log(`   ${index + 1}. ${product.name}`);
        console.log(`      Price: ₮${product.formattedPrice || 'N/A'}`);
        console.log(`      Stock: ${product.available || 0} (${product.stockStatus || 'N/A'})`);
        console.log(`      Similarity: ${product.similarity || 'N/A'}`);
        console.log('');
      });
      
      console.log('🎉 SUCCESS: Chatbot should now respond with product info!');
      console.log('   Instead of generic "contact customer service" message.');
      
    } else {
      console.log('❌ No products found');
      console.log('   Chatbot will still give generic responses.');
    }
    
    // Test with just "парацэтэмол"
    console.log('\n🔍 Testing with just "парацэтэмол"...');
    const simpleResult = await ProductSearchService.search('парацэтэмол', {
      limit: 3,
      threshold: 0.3,
      includeInactive: true
    });
    
    console.log(`✅ Simple search: ${simpleResult.products?.length || 0} products`);
    if (simpleResult.products && simpleResult.products.length > 0) {
      console.log('   Products:');
      simpleResult.products.forEach((product, index) => {
        console.log(`     ${index + 1}. ${product.name}`);
      });
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

testChatbot().then(() => process.exit(0));
