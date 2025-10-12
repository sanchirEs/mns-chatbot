#!/usr/bin/env node
/**
 * Fix existing embeddings from JSON string to native PostgreSQL vector format
 */

import { supabase } from './src/config/database.js';

async function fixEmbeddings() {
  console.log('🔧 Fixing Embedding Format...\n');
  
  try {
    // Get all products with embeddings
    console.log('📊 Fetching products with embeddings...');
    const { data: products, error } = await supabase
      .from('products')
      .select('id, name, embedding')
      .not('embedding', 'is', null);
    
    if (error) throw error;
    
    console.log(`✅ Found ${products.length} products with embeddings\n`);
    
    let fixed = 0;
    let alreadyFixed = 0;
    let failed = 0;
    
    for (const product of products) {
      try {
        // Check if embedding is a string (JSON format)
        if (typeof product.embedding === 'string') {
          // Parse the JSON string
          const embeddingArray = JSON.parse(product.embedding);
          
          // Convert to PostgreSQL vector format: '[0.1,0.2,0.3,...]'
          const vectorString = `[${embeddingArray.join(',')}]`;
          
          // Update the database
          const { error: updateError } = await supabase
            .from('products')
            .update({ embedding: vectorString })
            .eq('id', product.id);
          
          if (updateError) throw updateError;
          
          fixed++;
          
          if (fixed % 100 === 0) {
            console.log(`✅ Fixed ${fixed}/${products.length} products...`);
          }
        } else {
          alreadyFixed++;
        }
      } catch (err) {
        console.error(`❌ Failed to fix ${product.id}:`, err.message);
        failed++;
      }
    }
    
    console.log('\n📊 Summary:');
    console.log(`   Fixed: ${fixed} products`);
    console.log(`   Already correct: ${alreadyFixed} products`);
    console.log(`   Failed: ${failed} products`);
    
    if (fixed > 0) {
      console.log('\n✅ Embedding format fixed!');
      console.log('   Vector search should now be faster.');
    } else {
      console.log('\n✅ All embeddings already in correct format!');
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

fixEmbeddings().then(() => {
  console.log('\n🎉 Complete!');
  process.exit(0);
});

