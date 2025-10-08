#!/usr/bin/env node

/**
 * Generate Embeddings for Existing Products
 * Run this if embeddings are missing after sync
 */

import { supabase } from '../src/config/database.js';
import { openai } from '../src/config/openai.js';
import config from '../src/config/environment.js';

async function generateEmbeddings() {
  console.log('🔄 Generating embeddings for existing products...');
  console.log('=' .repeat(60));

  try {
    // Get products without embeddings
    const { data: products, error } = await supabase
      .from('products')
      .select('id, name, generic_name, searchable_text')
      .is('embedding', null)
      .limit(200); // Process 200 at a time

    if (error) throw error;

    if (!products || products.length === 0) {
      console.log('✅ All products already have embeddings!');
      console.log('📊 Checking total products with embeddings...');
      
      const { count } = await supabase
        .from('products')
        .select('*', { count: 'exact', head: true })
        .not('embedding', 'is', null);
      
      console.log(`   ${count || 0} products have embeddings`);
      return { generated: 0, total: count || 0 };
    }

    console.log(`📦 Found ${products.length} products without embeddings`);
    console.log('🔄 Generating embeddings for Mongolian products...\n');

    let generated = 0;
    let failed = 0;
    const startTime = Date.now();

    for (const product of products) {
      try {
        const text = product.searchable_text || product.name || product.generic_name;
        
        if (!text || text.trim().length === 0) {
          console.log(`⚠️ [${generated + failed + 1}/${products.length}] Skipping ${product.id} - no searchable text`);
          failed++;
          continue;
        }
        
        // Show progress with Mongolian product name
        const displayName = product.name ? product.name.substring(0, 60) : product.id;
        console.log(`🔄 [${generated + failed + 1}/${products.length}] ${displayName}...`);
        
        // Generate embedding
        const result = await openai.embeddings.create({
          model: config.AI.EMBEDDING_MODEL || 'text-embedding-3-small',
          input: text.substring(0, 8000)
        });

        const embedding = result.data[0].embedding;

        // Update product with embedding
        const { error: updateError } = await supabase
          .from('products')
          .update({ embedding })
          .eq('id', product.id);

        if (updateError) throw updateError;

        generated++;
        const tokensUsed = result.usage?.total_tokens || 0;
        console.log(`   ✅ Embedding generated (${tokensUsed} tokens, ${embedding.length} dimensions)`);

        // Rate limiting - wait 100ms between requests to avoid OpenAI rate limits
        await new Promise(resolve => setTimeout(resolve, 100));

      } catch (error) {
        failed++;
        console.log(`   ❌ Failed: ${error.message}`);
        
        // If rate limit error, wait longer
        if (error.message.includes('rate limit') || error.status === 429) {
          console.log('   ⏸️ Rate limit detected, waiting 10 seconds...');
          await new Promise(resolve => setTimeout(resolve, 10000));
        }
      }
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log('\n' + '='.repeat(60));
    console.log('🎉 Embedding generation completed!');
    console.log(`✅ Generated: ${generated}`);
    console.log(`❌ Failed: ${failed}`);
    console.log(`⏱️ Duration: ${duration} seconds`);
    console.log(`📊 Success rate: ${((generated / products.length) * 100).toFixed(1)}%`);
    console.log(`💰 Estimated cost: $${(generated * 0.00002).toFixed(4)}`);

    // Check if more products need embeddings
    const { count: remaining } = await supabase
      .from('products')
      .select('*', { count: 'exact', head: true })
      .is('embedding', null);

    if (remaining > 0) {
      console.log(`\n⚠️ ${remaining} products still need embeddings`);
      console.log('💡 Run this script again to continue: node scripts/generate-embeddings.js');
    } else {
      console.log('\n🎊 All products now have embeddings!');
      console.log('✅ Semantic search is ready to use');
    }

    return { generated, failed, remaining: remaining || 0 };

  } catch (error) {
    console.error('\n❌ Embedding generation failed:', error);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

// Handle command line arguments
const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  console.log(`
Generate Embeddings for Products

Usage: node scripts/generate-embeddings.js [options]

Options:
  --help, -h          Show this help message
  --batch-size=N      Process N products at a time (default: 200)
  --all               Process all products (may take a long time)

Examples:
  node scripts/generate-embeddings.js
  node scripts/generate-embeddings.js --batch-size=50
  node scripts/generate-embeddings.js --all

Note: This script processes products with Mongolian (Cyrillic) names.
      OpenAI embeddings fully support multilingual text including Cyrillic!
`);
  process.exit(0);
}

// Run the generation
generateEmbeddings().then(result => {
  console.log('\n✅ Done!');
  process.exit(0);
}).catch(error => {
  console.error('❌ Error:', error);
  process.exit(1);
});

