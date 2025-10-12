#!/usr/bin/env node
/**
 * Check embedding format in database
 */

import { supabase } from './src/config/database.js';

async function checkEmbeddings() {
  console.log('🔍 CHECKING EMBEDDING FORMAT\n');
  console.log('='.repeat(60));
  
  try {
    // Get a sample product with embedding
    console.log('📊 Getting sample product with embedding...');
    const { data: sample, error } = await supabase
      .from('products')
      .select('id, name, embedding')
      .not('embedding', 'is', null)
      .limit(1);
    
    if (error) {
      console.log('❌ Error getting sample:', error.message);
      return;
    }
    
    if (!sample || sample.length === 0) {
      console.log('❌ No products with embeddings found');
      return;
    }
    
    const product = sample[0];
    console.log('✅ Sample product found:');
    console.log(`   ID: ${product.id}`);
    console.log(`   Name: ${product.name}`);
    console.log(`   Embedding type: ${typeof product.embedding}`);
    console.log(`   Embedding length: ${product.embedding?.length || 'N/A'}`);
    
    // Check if it's an array or string
    if (Array.isArray(product.embedding)) {
      console.log('✅ Embedding is an array (correct format)');
      console.log(`   First 3 values: [${product.embedding.slice(0, 3).join(', ')}...]`);
    } else if (typeof product.embedding === 'string') {
      console.log('⚠️  Embedding is a string (needs conversion)');
      console.log(`   Sample: ${product.embedding.substring(0, 100)}...`);
      
      try {
        const parsed = JSON.parse(product.embedding);
        console.log(`   Parsed length: ${parsed.length}`);
        console.log(`   First 3 values: [${parsed.slice(0, 3).join(', ')}...]`);
      } catch (parseError) {
        console.log('❌ Cannot parse embedding string:', parseError.message);
      }
    } else {
      console.log('❌ Unknown embedding format:', typeof product.embedding);
    }
    
    // Test vector search with actual embedding
    console.log('\n🧪 Testing vector search with real embedding...');
    const { data: searchResults, error: searchError } = await supabase.rpc('match_products', {
      query_embedding: product.embedding,
      match_threshold: 0.1, // Very low threshold
      match_count: 5
    });
    
    if (searchError) {
      console.log('❌ Vector search error:', searchError.message);
    } else {
      console.log(`✅ Vector search returned ${searchResults?.length || 0} results`);
      if (searchResults && searchResults.length > 0) {
        console.log('   Top result:', searchResults[0].name);
        console.log('   Similarity:', searchResults[0].similarity);
      }
    }
    
  } catch (error) {
    console.error('❌ Check failed:', error.message);
  }
}

checkEmbeddings().then(() => process.exit(0));
