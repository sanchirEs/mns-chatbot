#!/usr/bin/env node
/**
 * Test the product search fix
 */

function isProductRelatedQuery(message) {
  const productKeywords = [
    // English
    'medicine', 'medication', 'drug', 'pill', 'tablet', 'capsule', 'syrup', 'injection',
    'paracetamol', 'aspirin', 'ibuprofen', 'vitamin', 'supplement', 'prescription',
    'available', 'stock', 'price', 'cost', 'buy', 'order', 'pharmacy', 'pharmaceutical',
    
    // Mongolian
    'эм', 'эмийн', 'таблет', 'капсул', 'сироп', 'тарилгын', 'витамин', 'бэлдмэл',
    'парацэтэмол', 'аспирин', 'ибупрофен', 'байгаа', 'агуулах', 'үнэ', 'худалдаж авах',
    'захиалах', 'эмийн сан', 'эмийн бүтээгдэхүүн', 'хэрэглэх', 'унших', 'дэлгэрэнгүй'
  ];
  
  const messageLower = message.toLowerCase();
  return productKeywords.some(keyword => messageLower.includes(keyword));
}

function testProductDetection() {
  console.log('🧪 TESTING PRODUCT QUERY DETECTION\n');
  console.log('='.repeat(60));
  
  const testCases = [
    // Should be detected as product queries
    { query: "парацэтэмол 400 байгааюу", expected: true, desc: "Mongolian paracetamol availability" },
    { query: "танайд пара 400 байгааюу үнэ хэдвэ?", expected: true, desc: "Mongolian paracetamol price" },
    { query: "Do you have paracetamol 400?", expected: true, desc: "English paracetamol availability" },
    { query: "What is the price of aspirin?", expected: true, desc: "English aspirin price" },
    { query: "эмийн сан", expected: true, desc: "Mongolian pharmacy" },
    { query: "vitamin c available", expected: true, desc: "English vitamin availability" },
    { query: "аспирин худалдаж авах", expected: true, desc: "Mongolian buy aspirin" },
    
    // Should NOT be detected as product queries
    { query: "What is your phone number?", expected: false, desc: "Contact info" },
    { query: "Where is your office?", expected: false, desc: "Office location" },
    { query: "How can I contact you?", expected: false, desc: "Contact inquiry" },
    { query: "Tell me about your company", expected: false, desc: "Company info" },
    { query: "Танай компанийн тухай", expected: false, desc: "Mongolian company info" },
    { query: "Харилцагчийн үйлчилгээ", expected: false, desc: "Mongolian customer service" },
  ];
  
  console.log('\n📋 TEST RESULTS:');
  console.log('-'.repeat(60));
  
  let passed = 0;
  let failed = 0;
  
  testCases.forEach((test, index) => {
    const result = isProductRelatedQuery(test.query);
    const status = result === test.expected ? '✅ PASS' : '❌ FAIL';
    
    console.log(`${index + 1}. ${status} - ${test.desc}`);
    console.log(`   Query: "${test.query}"`);
    console.log(`   Expected: ${test.expected}, Got: ${result}`);
    console.log('');
    
    if (result === test.expected) {
      passed++;
    } else {
      failed++;
    }
  });
  
  console.log('='.repeat(60));
  console.log(`📊 SUMMARY: ${passed} passed, ${failed} failed`);
  
  if (failed === 0) {
    console.log('🎉 ALL TESTS PASSED! Product query detection is working correctly.');
    console.log('\n💡 This means:');
    console.log('   ✅ Product queries will bypass FAQ and use product search');
    console.log('   ✅ Non-product queries will use FAQ system');
    console.log('   ✅ Chatbot will now properly handle "парацэтэмол 400 байгааюу"');
  } else {
    console.log('❌ Some tests failed. Product query detection needs adjustment.');
  }
  
  console.log('='.repeat(60));
}

// Run the test
testProductDetection();
