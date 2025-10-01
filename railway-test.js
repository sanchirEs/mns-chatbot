#!/usr/bin/env node

/**
 * Railway API Test Script
 * Use this to test your deployed API endpoints
 */

const BASE_URL = 'https://mns-chatbot-production.up.railway.app'; // Replace with your actual Railway URL

async function testEndpoint(endpoint, method = 'GET', body = null) {
  try {
    console.log(`\n🧪 Testing ${method} ${endpoint}`);
    
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Origin': 'https://mns-chatbot-production.up.railway.app'
      }
    };
    
    if (body) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(BASE_URL + endpoint, options);
    const data = await response.text();
    
    console.log(`   Status: ${response.status} ${response.statusText}`);
    console.log(`   Headers: ${JSON.stringify(Object.fromEntries(response.headers), null, 2)}`);
    
    try {
      const jsonData = JSON.parse(data);
      console.log(`   Response: ${JSON.stringify(jsonData, null, 2)}`);
    } catch {
      console.log(`   Response: ${data}`);
    }
    
    return { status: response.status, data };
  } catch (error) {
    console.error(`   ❌ Error: ${error.message}`);
    return { error: error.message };
  }
}

async function runTests() {
  console.log('🚀 Testing Railway Deployed API');
  console.log(`📍 Base URL: ${BASE_URL}`);
  console.log('=' .repeat(60));

  // Test health endpoint
  await testEndpoint('/health');

  // Test status endpoint
  await testEndpoint('/status');

  // Test search endpoint
  await testEndpoint('/api/search?q=test');

  // Test chat endpoint
  await testEndpoint('/api/chat', 'POST', { message: 'Hello' });

  console.log('\n✅ Tests completed!');
  console.log('\n💡 Tips:');
  console.log('- If health/status work but chat fails, check API keys');
  console.log('- If CORS errors occur, check origin configuration');
  console.log('- Check Railway logs for detailed error messages');
}

// Run tests if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runTests().catch(console.error);
}

export { testEndpoint, runTests };
