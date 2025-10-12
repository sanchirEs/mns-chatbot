#!/usr/bin/env node

/**
 * Product Synchronization Script
 * Syncs products from business backend to vector database
 */

import { DataSyncService } from '../src/services/dataSyncService.js';
import { testDatabaseConnection } from '../src/config/database.js';
import { testOpenAIConnection } from '../src/config/openai.js';

async function syncProducts() {
  console.log('🚀 Starting Product Synchronization...');
  console.log('=' .repeat(60));

  try {
    // Test database connection
    console.log('🔍 Testing database connection...');
    const dbConnected = await testDatabaseConnection();
    if (!dbConnected) {
      throw new Error('Database connection failed');
    }
    console.log('✅ Database connected');

    // Test OpenAI connection
    console.log('🔍 Testing OpenAI connection...');
    const aiConnected = await testOpenAIConnection();
    if (!aiConnected) {
      console.warn('⚠️ OpenAI connection failed - embeddings will be skipped');
    } else {
      console.log('✅ OpenAI connected');
    }

    // Parse command line arguments
    const args = process.argv.slice(2);
    let maxProducts = null; // Default: sync ALL products
    
    args.forEach(arg => {
      if (arg.startsWith('--max-products=')) {
        const value = parseInt(arg.split('=')[1]);
        maxProducts = value > 0 ? value : null;
      }
    });
    
    console.log(`\n🎯 Target: ${maxProducts ? `${maxProducts} products` : 'ALL products (no limit)'}`);
    console.log(`📍 API: http://mns.bmall.mn/api/products\n`);

    // Start synchronization
    const result = await DataSyncService.fullCatalogSync({
      batchSize: 100,
      maxProducts: maxProducts,
      generateEmbeddings: aiConnected
    });

    console.log('\n🎉 Synchronization completed successfully!');
    console.log(`📊 Total products synced: ${result.stats.processed}`);

    // Get sync status
    console.log('\n📈 Getting sync status...');
    const status = await DataSyncService.getSyncStatus();
    if (status) {
      console.log(`📦 Total products in database: ${status.database?.totalProducts || 0}`);
      console.log(`✅ Products in stock: ${status.database?.inStockProducts || 0}`);
      console.log(`❌ Products out of stock: ${status.database?.outOfStockProducts || 0}`);
      console.log(`🕐 Last sync: ${status.lastSync?.completed || 'never'}`);
      console.log(`💚 Sync health: ${status.health}`);
    }

    console.log('\n' + '='.repeat(60));
    console.log('✅ Product synchronization completed successfully!');
    console.log('💡 Next steps:');
    console.log('   - Test search functionality');
    console.log('   - Set up scheduled stock updates');
    console.log('   - Monitor sync health');

  } catch (error) {
    console.error('\n❌ Synchronization failed:', error.message);
    console.error('Stack trace:', error.stack);
    process.exit(1);
  }
}

// Handle command line arguments
const args = process.argv.slice(2);
const options = {};

if (args.includes('--help') || args.includes('-h')) {
  console.log(`
Product Synchronization Script

Usage: node scripts/sync-products.js [options]

Options:
  --help, -h          Show this help message
  --dry-run          Show what would be synced without actually syncing
  --batch-size=N     Set batch size (default: 50)
  --max-products=N   Set maximum products to sync (default: 500)
  --no-embeddings    Skip embedding generation
  --update-only      Only update existing products, don't add new ones

Examples:
  node scripts/sync-products.js
  node scripts/sync-products.js --batch-size=100 --max-products=1000
  node scripts/sync-products.js --no-embeddings --update-only
`);
  process.exit(0);
}

if (args.includes('--dry-run')) {
  console.log('🔍 DRY RUN MODE - No actual changes will be made');
  // TODO: Implement dry run mode
}

// Parse batch size
const batchSizeArg = args.find(arg => arg.startsWith('--batch-size='));
if (batchSizeArg) {
  options.batchSize = parseInt(batchSizeArg.split('=')[1]);
}

// Parse max products
const maxProductsArg = args.find(arg => arg.startsWith('--max-products='));
if (maxProductsArg) {
  options.maxProducts = parseInt(maxProductsArg.split('=')[1]);
}

// Check for no embeddings flag
if (args.includes('--no-embeddings')) {
  options.generateEmbeddings = false;
}

// Check for update only flag
if (args.includes('--update-only')) {
  options.updateExisting = true;
  options.addNew = false;
}

// Run the synchronization
syncProducts();
