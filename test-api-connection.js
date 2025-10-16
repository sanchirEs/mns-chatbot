#!/usr/bin/env node

/**
 * Test Business API Connection
 * 
 * This script tests the business API connection and response format
 * to diagnose why 0 products are being returned.
 */

import fetch from 'node-fetch';

const BUSINESS_API_BASE = 'http://mns.bmall.mn/api';

async function testApiConnection() {
  console.log('🔍 Testing Business API Connection');
  console.log('=' .repeat(60));
  
  try {
    console.log('📡 Testing API endpoint...');
    console.log(`   URL: ${BUSINESS_API_BASE}/products`);
    console.log('   Parameters: page=0&size=10&startDate=2025-01-01&endDate=2025-12-31&storeId=MK001');
    console.log('');
    
    const response = await fetch(
      `${BUSINESS_API_BASE}/products?page=0&size=10&startDate=2025-01-01&endDate=2025-12-31&storeId=MK001`,
      { 
        timeout: 15000,
        headers: {
          'User-Agent': 'Chatbot-Sync-Test/1.0',
          'Accept': 'application/json'
        }
      }
    );
    
    console.log('📊 Response Details:');
    console.log(`   Status: ${response.status} ${response.statusText}`);
    console.log(`   Headers:`, Object.fromEntries(response.headers.entries()));
    console.log('');
    
    if (!response.ok) {
      console.error(`❌ API request failed: ${response.status} ${response.statusText}`);
      const errorText = await response.text();
      console.error('   Error body:', errorText);
      return;
    }
    
    const data = await response.json();
    
    console.log('📦 Response Structure Analysis:');
    console.log('   Full response:', JSON.stringify(data, null, 2));
    console.log('');
    
    // Analyze response structure
    console.log('🔍 Structure Analysis:');
    console.log('   Root keys:', Object.keys(data));
    
    if (data.data) {
      console.log('   data keys:', Object.keys(data.data));
      
      if (data.data.data) {
        console.log('   data.data keys:', Object.keys(data.data.data));
        
        if (data.data.data.items) {
          console.log('   ✅ Found products in data.data.data.items');
          console.log(`   Product count: ${data.data.data.items.length}`);
          console.log('   Sample product:', JSON.stringify(data.data.data.items[0], null, 2));
        }
      }
      
      if (data.data.items) {
        console.log('   ✅ Found products in data.data.items');
        console.log(`   Product count: ${data.data.items.length}`);
        console.log('   Sample product:', JSON.stringify(data.data.items[0], null, 2));
      }
    }
    
    if (data.items) {
      console.log('   ✅ Found products in data.items');
      console.log(`   Product count: ${data.items.length}`);
      console.log('   Sample product:', JSON.stringify(data.items[0], null, 2));
    }
    
    if (Array.isArray(data)) {
      console.log('   ✅ Found products as direct array');
      console.log(`   Product count: ${data.length}`);
      console.log('   Sample product:', JSON.stringify(data[0], null, 2));
    }
    
    // Test different page sizes
    console.log('');
    console.log('🧪 Testing different page sizes...');
    
    const testSizes = [5, 50, 100];
    for (const size of testSizes) {
      try {
        const testResponse = await fetch(
          `${BUSINESS_API_BASE}/products?page=0&size=${size}&startDate=2025-01-01&endDate=2025-12-31&storeId=MK001`,
          { timeout: 10000 }
        );
        
        if (testResponse.ok) {
          const testData = await testResponse.json();
          let productCount = 0;
          
          if (testData.data?.data?.items) productCount = testData.data.data.items.length;
          else if (testData.data?.items) productCount = testData.data.items.length;
          else if (testData.items) productCount = testData.items.length;
          else if (Array.isArray(testData)) productCount = testData.length;
          
          console.log(`   Size ${size}: ${productCount} products`);
        } else {
          console.log(`   Size ${size}: Failed (${testResponse.status})`);
        }
      } catch (error) {
        console.log(`   Size ${size}: Error - ${error.message}`);
      }
    }
    
    console.log('');
    console.log('🎯 RECOMMENDATIONS:');
    
    if (data.data?.data?.items && data.data.data.items.length > 0) {
      console.log('   ✅ Use format: data.data.data.items');
    } else if (data.data?.items && data.data.items.length > 0) {
      console.log('   ✅ Use format: data.data.items');
    } else if (data.items && data.items.length > 0) {
      console.log('   ✅ Use format: data.items');
    } else if (Array.isArray(data) && data.length > 0) {
      console.log('   ✅ Use format: direct array');
    } else {
      console.log('   ❌ No products found in any format');
      console.log('   🔧 Check API endpoint and parameters');
    }
    
  } catch (error) {
    console.error('❌ API test failed:', error.message);
    console.error('   Stack trace:', error.stack);
    console.log('');
    console.log('🔧 TROUBLESHOOTING:');
    console.log('   1. Check if business API is accessible');
    console.log('   2. Verify network connectivity');
    console.log('   3. Check API endpoint URL');
    console.log('   4. Verify storeId parameter');
  }
}

// Run the test
testApiConnection().catch(error => {
  console.error('❌ Test failed:', error);
  process.exit(1);
});
