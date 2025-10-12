#!/usr/bin/env node
/**
 * Check what's actually in the database
 */

import { supabase } from './src/config/database.js';

async function checkDatabase() {
  console.log('🔍 CHECKING DATABASE CONTENTS\n');
  console.log('='.repeat(60));
  
  try {
    // Check products table
    console.log('\n📊 PRODUCTS TABLE:');
    const { count: productsCount } = await supabase
      .from('products')
      .select('*', { count: 'exact', head: true });
    console.log(`   Total products: ${productsCount}`);
    
    // Check product_inventory table  
    console.log('\n📦 PRODUCT_INVENTORY TABLE:');
    const { count: inventoryCount } = await supabase
      .from('product_inventory')
      .select('*', { count: 'exact', head: true });
    console.log(`   Total inventory records: ${inventoryCount}`);
    
    // Check items table (old table)
    console.log('\n📋 ITEMS TABLE (old):');
    try {
      const { count: itemsCount } = await supabase
        .from('items')
        .select('*', { count: 'exact', head: true });
      console.log(`   Total items: ${itemsCount}`);
    } catch (error) {
      console.log(`   Items table: ${error.message}`);
    }
    
    // Get sample products if any exist
    if (productsCount > 0) {
      console.log('\n🔍 SAMPLE PRODUCTS:');
      const { data: sampleProducts } = await supabase
        .from('products')
        .select('id, name, category')
        .limit(3);
      
      sampleProducts?.forEach((product, index) => {
        console.log(`   ${index + 1}. ${product.name} (${product.category})`);
      });
    }
    
    // Check if embeddings exist
    if (productsCount > 0) {
      console.log('\n🧠 EMBEDDINGS:');
      const { count: withEmbeddings } = await supabase
        .from('products')
        .select('*', { count: 'exact', head: true })
        .not('embedding', 'is', null);
      console.log(`   Products with embeddings: ${withEmbeddings}`);
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('📊 SUMMARY:');
    console.log(`   Products table: ${productsCount} records`);
    console.log(`   Inventory table: ${inventoryCount} records`);
    console.log(`   Database is: ${productsCount > 0 ? '✅ HAS DATA' : '❌ EMPTY'}`);
    
    if (productsCount === 0) {
      console.log('\n🚨 ISSUE FOUND: Products table is empty!');
      console.log('   Solution: Run product sync first:');
      console.log('   railway run npm run sync:full');
    }
    
  } catch (error) {
    console.error('❌ Database check failed:', error.message);
  }
}

checkDatabase().then(() => process.exit(0));
