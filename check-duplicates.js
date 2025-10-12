#!/usr/bin/env node
/**
 * Check for duplicate product IDs in API response
 */

async function checkDuplicates() {
  console.log('🔍 Checking for duplicate product IDs in API...\n');
  
  try {
    const response = await fetch(
      'http://mns.bmall.mn/api/products?page=0&size=200&startDate=2025-01-01&endDate=2025-12-31&storeId=MK001'
    );
    
    const data = await response.json();
    const products = data.data?.data?.items || [];
    
    console.log(`📦 Fetched ${products.length} products from API`);
    
    // Check for duplicates
    const productIds = products.map(p => p.PRODUCT_ID);
    const uniqueIds = new Set(productIds);
    
    console.log(`🆔 Unique product IDs: ${uniqueIds.size}`);
    console.log(`🔁 Duplicate count: ${productIds.length - uniqueIds.size}`);
    
    if (uniqueIds.size < productIds.length) {
      console.log('\n⚠️  DUPLICATES FOUND!');
      
      // Find which IDs are duplicated
      const idCounts = {};
      productIds.forEach(id => {
        idCounts[id] = (idCounts[id] || 0) + 1;
      });
      
      const duplicates = Object.entries(idCounts)
        .filter(([id, count]) => count > 1)
        .sort((a, b) => b[1] - a[1]);
      
      console.log(`\n📋 Top duplicated IDs:`);
      duplicates.slice(0, 10).forEach(([id, count]) => {
        console.log(`   ${id}: appears ${count} times`);
      });
    } else {
      console.log('\n✅ No duplicates in this sample');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

checkDuplicates();

