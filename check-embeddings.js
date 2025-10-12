#!/usr/bin/env node
/**
 * Check embeddings in database
 */

import { supabase } from './src/config/database.js';

async function checkEmbeddings() {
  console.log('🔍 Checking Embeddings in Database...\n');
  
  try {
    // Check products table structure
    console.log('📋 1. Products Table Structure:');
    const { data: sample, error: e1 } = await supabase
      .from('products')
      .select('id, name, embedding')
      .limit(1)
      .single();
    
    if (e1) {
      console.error('Error:', e1);
    } else {
      console.log(`   Product ID: ${sample.id}`);
      console.log(`   Product Name: ${sample.name}`);
      console.log(`   Embedding Type: ${typeof sample.embedding}`);
      
      if (sample.embedding) {
        // Embeddings are stored as arrays
        const embeddingArray = sample.embedding;
        console.log(`   Embedding Dimensions: ${embeddingArray.length}`);
        console.log(`   Embedding Format: Array of ${embeddingArray.length} floats`);
        console.log(`   First 5 values: [${embeddingArray.slice(0, 5).map(v => v.toFixed(6)).join(', ')}...]`);
        console.log(`   Last 5 values: [...${embeddingArray.slice(-5).map(v => v.toFixed(6)).join(', ')}]`);
      } else {
        console.log(`   Embedding: NULL (not generated yet)`);
      }
    }
    
    // Check embedding statistics
    console.log('\n📊 2. Embedding Statistics:');
    const { count: total } = await supabase
      .from('products')
      .select('*', { count: 'exact', head: true });
    
    const { count: withEmbeddings } = await supabase
      .from('products')
      .select('*', { count: 'exact', head: true })
      .not('embedding', 'is', null);
    
    console.log(`   Total Products: ${total}`);
    console.log(`   With Embeddings: ${withEmbeddings}`);
    console.log(`   Without Embeddings: ${total - withEmbeddings}`);
    console.log(`   Coverage: ${Math.round((withEmbeddings / total) * 100)}%`);
    
    // Show sample products with embeddings
    console.log('\n📝 3. Sample Products with Embeddings:');
    const { data: samples, error: e2 } = await supabase
      .from('products')
      .select('id, name, embedding')
      .not('embedding', 'is', null)
      .limit(5);
    
    if (e2) {
      console.error('Error:', e2);
    } else {
      samples.forEach((p, i) => {
        const hasEmbedding = p.embedding && p.embedding.length > 0;
        console.log(`   ${i + 1}. ${p.name}`);
        console.log(`      ID: ${p.id}`);
        console.log(`      Embedding: ${hasEmbedding ? `✅ ${p.embedding.length} dimensions` : '❌ Missing'}`);
      });
    }
    
    // Test vector search function
    console.log('\n🔍 4. Testing Vector Search Function:');
    
    if (withEmbeddings > 0) {
      // Get a sample embedding
      const { data: testProduct } = await supabase
        .from('products')
        .select('name, embedding')
        .not('embedding', 'is', null)
        .limit(1)
        .single();
      
      if (testProduct && testProduct.embedding) {
        console.log(`   Using embedding from: "${testProduct.name}"`);
        
        // Test match_products function
        const { data: matches, error: e3 } = await supabase
          .rpc('match_products', {
            query_embedding: testProduct.embedding,
            match_threshold: 0.1,
            match_count: 3
          });
        
        if (e3) {
          console.error('   ❌ Vector search error:', e3.message);
          console.log('   This means the match_products function may not be installed.');
        } else {
          console.log(`   ✅ Vector search working! Found ${matches.length} similar products:`);
          matches.forEach((m, i) => {
            console.log(`      ${i + 1}. ${m.name} (similarity: ${(m.similarity * 100).toFixed(1)}%)`);
          });
        }
      }
    } else {
      console.log('   ⚠️  No embeddings found to test with');
    }
    
    // Storage information
    console.log('\n💾 5. Storage Information:');
    console.log('   Embedding Model: OpenAI text-embedding-3-small');
    console.log('   Vector Dimensions: 1536');
    console.log('   Storage Type: PostgreSQL vector (pgvector extension)');
    console.log('   Column Name: products.embedding');
    console.log('   Column Type: vector(1536)');
    console.log('   Size per embedding: ~6 KB (1536 floats × 4 bytes)');
    console.log(`   Total embedding storage: ~${Math.round((withEmbeddings * 6) / 1024)} MB`);
    
    // How to view in Supabase
    console.log('\n📖 6. How to View Embeddings in Supabase:');
    console.log('   Method 1: SQL Editor');
    console.log('   ```sql');
    console.log('   SELECT id, name, ');
    console.log('          embedding IS NOT NULL as has_embedding,');
    console.log('          array_length(embedding::float[], 1) as dimensions');
    console.log('   FROM products');
    console.log('   LIMIT 10;');
    console.log('   ```');
    console.log('');
    console.log('   Method 2: Check specific product');
    console.log('   ```sql');
    console.log('   SELECT id, name, embedding[1:5] as first_5_values');
    console.log('   FROM products');
    console.log('   WHERE embedding IS NOT NULL');
    console.log('   LIMIT 1;');
    console.log('   ```');
    
    console.log('\n✅ Embedding check complete!');
    
  } catch (error) {
    console.error('❌ Error checking embeddings:', error);
  }
}

checkEmbeddings().then(() => process.exit(0));

