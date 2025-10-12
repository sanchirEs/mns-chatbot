#!/usr/bin/env node
/**
 * Check if match_products SQL function exists
 */

import { supabase } from './src/config/database.js';

async function checkSQLFunction() {
  console.log('🔍 CHECKING SQL FUNCTION\n');
  console.log('='.repeat(60));
  
  try {
    // Try to call the match_products function with dummy data
    console.log('🧪 Testing match_products function...');
    
    const dummyEmbedding = new Array(1536).fill(0.1); // Dummy embedding
    
    const { data, error } = await supabase.rpc('match_products', {
      query_embedding: dummyEmbedding,
      match_threshold: 0.5,
      match_count: 5
    });
    
    if (error) {
      console.log('❌ match_products function error:', error.message);
      console.log('   Code:', error.code);
      console.log('   Details:', error.details);
      console.log('   Hint:', error.hint);
      
      if (error.code === '42883') {
        console.log('\n🚨 ISSUE FOUND: Function does not exist!');
        console.log('   Solution: Run the database migration:');
        console.log('   The match_products function needs to be created.');
      }
    } else {
      console.log('✅ match_products function exists and working');
      console.log(`   Returned ${data?.length || 0} results`);
    }
    
    // Check if we can query products directly
    console.log('\n📊 Testing direct products query...');
    const { data: directData, error: directError } = await supabase
      .from('products')
      .select('id, name')
      .limit(3);
    
    if (directError) {
      console.log('❌ Direct products query error:', directError.message);
    } else {
      console.log('✅ Direct products query working');
      console.log(`   Found ${directData?.length || 0} products`);
      if (directData && directData.length > 0) {
        console.log('   Sample:', directData[0].name);
      }
    }
    
  } catch (error) {
    console.error('❌ Check failed:', error.message);
  }
}

checkSQLFunction().then(() => process.exit(0));
