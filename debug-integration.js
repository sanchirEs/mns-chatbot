#!/usr/bin/env node
/**
 * Debug vector search and Redis issues
 */

import { supabase } from './src/config/database.js';
import { ProductSearchService } from './src/services/productSearchService.js';
import { DataSyncService } from './src/services/dataSyncService.js';

async function debugIntegration() {
  console.log('🔍 DEBUGGING INTEGRATION ISSUES\n');
  console.log('='.repeat(60));
  
  try {
    // Check database products
    console.log('📊 Checking database products...');
    const { count: productCount } = await supabase
      .from('products')
      .select('*', { count: 'exact', head: true });
    console.log(`   Total products: ${productCount}`);
    
    // Check products with embeddings
    const { count: embeddingCount } = await supabase
      .from('products')
      .select('*', { count: 'exact', head: true })
      .not('embedding', 'is', null);
    console.log(`   Products with embeddings: ${embeddingCount}`);
    
    // Check a sample product
    const { data: sampleProduct } = await supabase
      .from('products')
      .select('id, name, embedding')
      .not('embedding', 'is', null)
      .limit(1)
      .single();
    
    if (sampleProduct) {
      console.log(`   Sample product: ${sampleProduct.name}`);
      console.log(`   Embedding type: ${typeof sampleProduct.embedding}`);
      console.log(`   Embedding length: ${sampleProduct.embedding?.length || 'N/A'}`);
    }
    
    // Test vector search directly
    console.log('\n🧪 Testing vector search directly...');
    if (sampleProduct && sampleProduct.embedding) {
      let queryEmbedding = sampleProduct.embedding;
      if (typeof queryEmbedding === 'string') {
        queryEmbedding = JSON.parse(queryEmbedding);
      }
      
      const { data: vectorResults, error: vectorError } = await supabase.rpc('match_products', {
        query_embedding: queryEmbedding,
        match_threshold: 0.1,
        match_count: 5
      });
      
      if (vectorError) {
        console.log(`❌ Vector search error: ${vectorError.message}`);
      } else {
        console.log(`✅ Vector search returned ${vectorResults?.length || 0} results`);
        if (vectorResults && vectorResults.length > 0) {
          console.log(`   Top result: ${vectorResults[0].name}`);
        }
      }
    }
    
    // Test ProductSearchService
    console.log('\n🔍 Testing ProductSearchService...');
    const searchResult = await ProductSearchService.search('эм', {
      limit: 5,
      threshold: 0.1, // Very low threshold
      includeInactive: true
    });
    
    console.log(`   Search result: ${searchResult.products?.length || 0} products`);
    if (searchResult.error) {
      console.log(`   Error: ${searchResult.error}`);
    }
    
    // Check Redis connection
    console.log('\n🔴 Checking Redis connection...');
    console.log(`   Redis connected: ${DataSyncService.redisConnected}`);
    
    if (DataSyncService.redis) {
      try {
        await DataSyncService.redis.ping();
        console.log('   Redis ping: ✅ Success');
      } catch (error) {
        console.log(`   Redis ping: ❌ ${error.message}`);
      }
    } else {
      console.log('   Redis client: ❌ Not initialized');
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('📊 DIAGNOSIS:');
    console.log(`   Products in DB: ${productCount}`);
    console.log(`   Products with embeddings: ${embeddingCount}`);
    console.log(`   Vector search working: ${vectorResults?.length > 0 ? '✅' : '❌'}`);
    console.log(`   Redis connected: ${DataSyncService.redisConnected ? '✅' : '❌'}`);
    
  } catch (error) {
    console.error('❌ Debug failed:', error.message);
    console.error('Stack:', error.stack);
  }
}

debugIntegration().then(() => process.exit(0));
