#!/usr/bin/env node
/**
 * Search for paracetamol products directly in database
 */

import { supabase } from './src/config/database.js';

async function searchParacetamol() {
  console.log('🔍 SEARCHING FOR PARACETAMOL PRODUCTS\n');
  console.log('='.repeat(60));
  
  try {
    // Search by name containing "парацэтэмол"
    console.log('📊 Searching for products with "парацэтэмол" in name...');
    const { data: nameResults, error: nameError } = await supabase
      .from('products')
      .select('id, name, category')
      .ilike('name', '%парацэтэмол%');
    
    if (nameError) {
      console.log('❌ Name search error:', nameError.message);
    } else {
      console.log(`✅ Found ${nameResults?.length || 0} products with "парацэтэмол" in name`);
      nameResults?.forEach((product, index) => {
        console.log(`   ${index + 1}. ${product.name}`);
      });
    }
    
    // Search by name containing "пара"
    console.log('\n📊 Searching for products with "пара" in name...');
    const { data: paraResults, error: paraError } = await supabase
      .from('products')
      .select('id, name, category')
      .ilike('name', '%пара%')
      .limit(10);
    
    if (paraError) {
      console.log('❌ "пара" search error:', paraError.message);
    } else {
      console.log(`✅ Found ${paraResults?.length || 0} products with "пара" in name`);
      paraResults?.forEach((product, index) => {
        console.log(`   ${index + 1}. ${product.name}`);
      });
    }
    
    // Search by generic name
    console.log('\n📊 Searching for products with "парацэтэмол" in generic_name...');
    const { data: genericResults, error: genericError } = await supabase
      .from('products')
      .select('id, name, generic_name, category')
      .ilike('generic_name', '%парацэтэмол%');
    
    if (genericError) {
      console.log('❌ Generic name search error:', genericError.message);
    } else {
      console.log(`✅ Found ${genericResults?.length || 0} products with "парацэтэмол" in generic_name`);
      genericResults?.forEach((product, index) => {
        console.log(`   ${index + 1}. ${product.name} (${product.generic_name})`);
      });
    }
    
    // Search by searchable_text
    console.log('\n📊 Searching for products with "парацэтэмол" in searchable_text...');
    const { data: searchableResults, error: searchableError } = await supabase
      .from('products')
      .select('id, name, searchable_text')
      .ilike('searchable_text', '%парацэтэмол%')
      .limit(5);
    
    if (searchableError) {
      console.log('❌ Searchable text search error:', searchableError.message);
    } else {
      console.log(`✅ Found ${searchableResults?.length || 0} products with "парацэтэмол" in searchable_text`);
      searchableResults?.forEach((product, index) => {
        console.log(`   ${index + 1}. ${product.name}`);
        console.log(`      Searchable text: ${product.searchable_text?.substring(0, 100)}...`);
      });
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('📊 SUMMARY:');
    console.log(`   Products with "парацэтэмол" in name: ${nameResults?.length || 0}`);
    console.log(`   Products with "пара" in name: ${paraResults?.length || 0}`);
    console.log(`   Products with "парацэтэмол" in generic_name: ${genericResults?.length || 0}`);
    console.log(`   Products with "парацэтэмол" in searchable_text: ${searchableResults?.length || 0}`);
    
    if ((nameResults?.length || 0) === 0 && (paraResults?.length || 0) === 0) {
      console.log('\n🚨 ISSUE FOUND: No paracetamol products in database!');
      console.log('   This means the product sync might be incomplete.');
      console.log('   Solution: Run full product sync:');
      console.log('   railway run npm run sync:full');
    }
    
  } catch (error) {
    console.error('❌ Search failed:', error.message);
  }
}

searchParacetamol().then(() => process.exit(0));
