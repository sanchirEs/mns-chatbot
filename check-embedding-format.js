#!/usr/bin/env node
/**
 * Check actual embedding format in database
 */

import { supabase } from './src/config/database.js';

async function checkFormat() {
  console.log('🔍 Checking Embedding Format...\n');
  
  const { data, error } = await supabase
    .from('products')
    .select('id, name, embedding')
    .not('embedding', 'is', null)
    .limit(1)
    .single();
  
  if (error) {
    console.error('Error:', error);
    return;
  }
  
  console.log('Product:', data.name);
  console.log('Embedding type:', typeof data.embedding);
  console.log('Embedding constructor:', data.embedding?.constructor?.name);
  console.log('Is Array?', Array.isArray(data.embedding));
  console.log('Is String?', typeof data.embedding === 'string');
  
  if (typeof data.embedding === 'string') {
    console.log('\n⚠️  PROBLEM: Embedding is stored as STRING, not vector!');
    console.log('First 200 characters:', data.embedding.substring(0, 200));
    
    try {
      const parsed = JSON.parse(data.embedding);
      console.log('\n✅ Can be parsed as JSON');
      console.log('Parsed type:', typeof parsed);
      console.log('Parsed is Array?', Array.isArray(parsed));
      if (Array.isArray(parsed)) {
        console.log('Array length:', parsed.length);
        console.log('First 5 values:', parsed.slice(0, 5));
      }
    } catch (e) {
      console.log('❌ Cannot parse as JSON:', e.message);
    }
  } else if (Array.isArray(data.embedding)) {
    console.log('\n✅ Embedding is properly stored as array');
    console.log('Dimensions:', data.embedding.length);
    console.log('First 5 values:', data.embedding.slice(0, 5));
  } else {
    console.log('\n❓ Unknown embedding format');
    console.log('Value:', data.embedding);
  }
}

checkFormat().then(() => process.exit(0));

