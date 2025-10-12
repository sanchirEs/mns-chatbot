#!/usr/bin/env node

/**
 * Test script for improved pharmaceutical search with query parsing and pre-filtering
 */

import { supabase } from './src/config/database.js';
import { ProductSearchService } from './src/services/productSearchService.js';
import { openai } from './src/config/openai.js';

console.log('🧪 TESTING IMPROVED PHARMACEUTICAL SEARCH\n');
console.log('='.repeat(80));

async function testSearch(query, expectedDrug) {
  console.log(`\n📝 Query: "${query}"`);
  console.log(`Expected drug: ${expectedDrug}`);
  console.log('-'.repeat(80));

  try {
    const startTime = Date.now();
    const results = await ProductSearchService.search(query, {
      limit: 5,
      threshold: 0.4,
      includeInactive: true
    });
    const duration = Date.now() - startTime;

    if (results.products && results.products.length > 0) {
      console.log(`✅ Found ${results.products.length} products (${duration}ms)\n`);

      if (results.metadata?.parsed) {
        console.log(`🧠 Query Parsing:`);
        console.log(`   - Detected drug: ${results.metadata.parsed.drugName || 'none'}`);
        console.log(`   - Detected dosage: ${results.metadata.parsed.fullDosage || 'none'}`);
        console.log(`   - Pre-filter candidates: ${results.metadata.candidatesFound || 0}`);
        console.log(`   - Vector matches: ${results.metadata.vectorMatches || 0}\n`);
      }

      console.log(`📦 Search Results:`);
      results.products.forEach((product, index) => {
        const correctDrug = (product.name || '').toLowerCase().includes(expectedDrug.toLowerCase());
        const icon = correctDrug ? '✅' : '❌';
        
        console.log(`\n   ${icon} ${index + 1}. ${product.name}`);
        console.log(`      Price: ₮${product.price?.toLocaleString() || 'N/A'}`);
        console.log(`      Stock: ${product.available || 0}`);
        console.log(`      Similarity: ${product.similarity?.toFixed(3) || 'N/A'}`);
        console.log(`      Final Score: ${product.relevanceScore?.toFixed(3) || 'N/A'}`);
        
        if (product._ranking_reasons) {
          console.log(`      Ranking: ${product._ranking_reasons.join(', ')}`);
        }
      });

      // Analyze results
      const correctDrugCount = results.products.filter(p => 
        (p.name || '').toLowerCase().includes(expectedDrug.toLowerCase())
      ).length;

      const accuracy = (correctDrugCount / results.products.length) * 100;
      console.log(`\n   📊 Accuracy: ${accuracy.toFixed(0)}% (${correctDrugCount}/${results.products.length} correct drug)`);

      if (accuracy === 100) {
        console.log(`   🎉 PERFECT! All results match the requested drug!`);
      } else if (accuracy >= 60) {
        console.log(`   ⚠️  GOOD: Most results are correct, but some wrong items included`);
      } else {
        console.log(`   ❌ POOR: Many wrong products returned!`);
      }

    } else {
      console.log(`❌ No products found`);
      if (results.error) {
        console.log(`   Error: ${results.error}`);
      }
    }

  } catch (error) {
    console.error(`❌ Test failed:`, error.message);
    console.error(error.stack);
  }
}

async function main() {
  try {
    // Initialize Supabase connection
    console.log(`\n🔌 Checking database connection...`);
    const { data, error } = await supabase.from('products').select('count').limit(1);
    if (error) throw error;
    console.log(`✅ Database connected\n`);

    // Test cases
    console.log(`\n${'='.repeat(80)}`);
    console.log(`TEST 1: Paracetamol 400mg (Mongolian spelling)`);
    console.log(`${'='.repeat(80)}`);
    await testSearch('танайд парацэтмөл 400 байгаа юу?', 'парацетамол');

    console.log(`\n${'='.repeat(80)}`);
    console.log(`TEST 2: Ibuprofen 400mg`);
    console.log(`${'='.repeat(80)}`);
    await testSearch('ибупрофен 400мг байгаа юу?', 'ибупрофен');

    console.log(`\n${'='.repeat(80)}`);
    console.log(`TEST 3: Just drug name (no dosage)`);
    console.log(`${'='.repeat(80)}`);
    await testSearch('парацетамол', 'парацетамол');

    console.log(`\n${'='.repeat(80)}`);
    console.log(`TEST 4: Pantoprazole (should NOT return Paracetamol)`);
    console.log(`${'='.repeat(80)}`);
    await testSearch('пантопразол 40мг', 'пантопразол');

    console.log(`\n${'='.repeat(80)}`);
    console.log(`✅ ALL TESTS COMPLETED`);
    console.log(`${'='.repeat(80)}\n`);

    console.log(`\n📊 SUMMARY:`);
    console.log(`- Query parsing: Detects drug names and dosages`);
    console.log(`- Pre-filtering: Narrows down candidates before vector search`);
    console.log(`- Intelligent ranking: Prioritizes exact drug+dosage matches`);
    console.log(`- Penalty system: Reduces score for wrong drugs`);
    console.log(`\n🎯 The improved search should now return ONLY relevant products!`);

  } catch (error) {
    console.error('\n❌ Test suite failed:', error);
    process.exit(1);
  }

  process.exit(0);
}

main();

