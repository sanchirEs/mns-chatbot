import { supabase } from '../config/database.js';
import { openai } from '../config/openai.js';
import Redis from 'ioredis';
import config from '../config/environment.js';

/**
 * Three-Tier Data Synchronization Service
 * TIER 1: Vector DB (static catalog) - daily sync
 * TIER 2: Redis Cache (hot data) - 5 min TTL
 * TIER 3: Real-time API - on-demand
 */
export class DataSyncService {
  static BUSINESS_API_BASE = 'http://mns.bmall.mn/api';
  
  // Redis client initialization (only if enabled)
  static redis = config.REDIS?.ENABLE_REDIS ? (
    // Use REDIS_URL if provided (Railway format), otherwise use individual params
    process.env.REDIS_URL 
      ? new Redis(process.env.REDIS_URL, {
          retryStrategy: (times) => Math.min(times * 50, 2000),
          maxRetriesPerRequest: 3,
          enableReadyCheck: true,
          lazyConnect: true
        })
      : new Redis({
          host: process.env.REDIS_HOST || 'localhost',
          port: parseInt(process.env.REDIS_PORT) || 6379,
          password: process.env.REDIS_PASSWORD || undefined,
          retryStrategy: (times) => Math.min(times * 50, 2000),
          maxRetriesPerRequest: 3,
          enableReadyCheck: true,
          lazyConnect: true
        })
  ) : null;

  static redisConnected = false;

  /**
   * Initialize Redis connection
   */
  static async initializeRedis() {
    if (this.redisConnected) return true;

    try {
      await this.redis.connect();
      this.redis.on('error', (err) => {
        console.error('Redis error:', err);
        this.redisConnected = false;
      });
      this.redis.on('connect', () => {
        console.log('✅ Redis connected');
        this.redisConnected = true;
      });
      this.redisConnected = true;
      return true;
    } catch (error) {
      console.warn('⚠️ Redis connection failed - using database fallback:', error.message);
      this.redisConnected = false;
      return false;
    }
  }

  // ================================================================
  // TIER 1: FULL CATALOG SYNC (Daily or on-demand)
  // ================================================================
  
  /**
   * Full catalog sync - products table with embeddings
   */
  static async fullCatalogSync(options = {}) {
    const {
      batchSize = 50,
      maxProducts = null,
      generateEmbeddings = true
    } = options;

    const syncId = await this.createSyncLog('full');
    console.log('🔄 Starting FULL catalog sync...');
    
    const stats = {
      processed: 0,
      created: 0,
      updated: 0,
      failed: 0,
      startTime: Date.now()
    };

    try {
      const products = await this.fetchAllProducts({ maxProducts, pageSize: batchSize });
      console.log(`📦 Fetched ${products.length} products from business API`);

      // Process in batches
      for (let i = 0; i < products.length; i += batchSize) {
        const batch = products.slice(i, i + batchSize);
        
        try {
          await this.processCatalogBatch(batch, stats, generateEmbeddings);
          const progress = Math.floor((i / products.length) * 100);
          console.log(`✅ Progress: ${progress}% (${stats.processed}/${products.length})`);
        } catch (error) {
          console.error(`❌ Batch ${Math.floor(i / batchSize)} failed:`, error.message);
          stats.failed += batch.length;
        }

        // Rate limiting to avoid overwhelming APIs
        await this.sleep(100);
      }

      const duration = Date.now() - stats.startTime;
      await this.completeSyncLog(syncId, 'completed', stats, null, duration);
      
      console.log('🎉 Full catalog sync completed!');
      console.log(`📊 Created: ${stats.created}, Updated: ${stats.updated}, Failed: ${stats.failed}`);
      
      return { success: true, stats };

    } catch (error) {
      const duration = Date.now() - stats.startTime;
      await this.completeSyncLog(syncId, 'failed', stats, error, duration);
      console.error('❌ Full catalog sync failed:', error);
      throw error;
    }
  }

  // ================================================================
  // TIER 2: QUICK STOCK SYNC (Every 5 minutes)
  // ================================================================
  
  /**
   * Quick stock sync - inventory table + Redis cache
   */
  static async quickStockSync(options = {}) {
    const { maxProducts = 200 } = options;
    
    const syncId = await this.createSyncLog('stock_only');
    console.log('⚡ Starting QUICK stock sync...');

    const stats = {
      processed: 0,
      updated: 0,
      failed: 0,
      cached: 0,
      startTime: Date.now()
    };

    try {
      // Fetch recent products from business API
      const response = await fetch(
        `${this.BUSINESS_API_BASE}/products?page=0&size=${maxProducts}&startDate=2025-01-01&endDate=2025-12-31&storeId=MK001`,
        { timeout: 10000 }
      );
      
      if (!response.ok) {
        throw new Error(`Business API error: ${response.status}`);
      }
      
      const data = await response.json();
      const products = data.data?.data?.items || [];

      console.log(`📦 Fetched ${products.length} products for stock sync`);

      // Update inventory in parallel batches
      const BATCH_SIZE = 20;
      for (let i = 0; i < products.length; i += BATCH_SIZE) {
        const batch = products.slice(i, i + BATCH_SIZE);
        
        await Promise.allSettled(
          batch.map(async (product) => {
            try {
              // Update database inventory
              await this.updateInventoryOnly(product);
              stats.updated++;
              
              // Update Redis cache
              await this.cacheProductInventory(product);
              stats.cached++;
              
              stats.processed++;
            } catch (error) {
              console.warn(`Failed to update ${product.PRODUCT_ID}:`, error.message);
              stats.failed++;
            }
          })
        );
      }

      const duration = Date.now() - stats.startTime;
      await this.completeSyncLog(syncId, 'completed', stats, null, duration);
      
      console.log(`✅ Stock sync completed: ${stats.updated} updated, ${stats.cached} cached`);
      
      return { success: true, stats };

    } catch (error) {
      const duration = Date.now() - stats.startTime;
      await this.completeSyncLog(syncId, 'failed', stats, error, duration);
      console.error('❌ Stock sync failed:', error);
      throw error;
    }
  }

  // ================================================================
  // DATA FETCHING FROM BUSINESS API
  // ================================================================

  /**
   * Fetch all products from business API (Production: supports 7000+ products)
   */
  static async fetchAllProducts(options = {}) {
    const { 
      maxProducts = options.maxProducts || null,  // null = no limit (fetch all)
      pageSize = 50,
      maxPages = 200  // Support up to 10,000 products (200 pages × 50)
    } = options;
    const allProducts = [];
    let page = 0;
    
    console.log(`📦 Starting product fetch: ${maxProducts ? `up to ${maxProducts}` : 'ALL'} products (max ${maxPages} pages)`);
    console.log(`   API: ${this.BUSINESS_API_BASE}/products`);
    
      while (page < maxPages) {
      try {
        // Progress logging every 10 pages
        if (page % 10 === 0) {
          console.log(`📄 Fetching page ${page}/${maxPages}... (${allProducts.length} products so far)`);
        }
        
        const response = await fetch(
          `${this.BUSINESS_API_BASE}/products?page=${page}&size=${pageSize}&startDate=2025-01-01&endDate=2025-12-31&storeId=MK001`,
          { timeout: 15000 }
        );

        if (!response.ok) {
          console.warn(`⚠️  API request failed for page ${page}: ${response.status}`);
          // Don't break - try next page
          page++;
          continue;
        }

        const data = await response.json();
        
        // Handle different API response formats
        // Format 1: { data: { data: { items: [...] } } } (old)
        // Format 2: { data: { items: [...] } } (new)
        const items = data.data?.data?.items || data.data?.items || data.items || [];
        const totalPagesFromAPI = data.data?.data?.total_pages || data.data?.total_pages || data.total_pages || 0;
        const totalItemsFromAPI = data.data?.data?.total_items || data.data?.total_items || data.total_items || 0;
        
        // On first page, update maxPages if API provides it
        if (page === 0 && totalPagesFromAPI > 0) {
          const actualMaxPages = Math.min(totalPagesFromAPI, 300); // Safety limit
          console.log(`📊 API reports ${totalItemsFromAPI} items across ${totalPagesFromAPI} pages`);
          console.log(`   Will fetch up to ${actualMaxPages} pages`);
        }
        
        if (items.length === 0) {
          console.log(`✅ No more products on page ${page}, stopping`);
          break;
        }
        
        allProducts.push(...items);
        
        page++;

        // Stop if we've reached max products
        if (maxProducts && allProducts.length >= maxProducts) {
          console.log(`✅ Reached maxProducts limit: ${maxProducts}`);
          break;
        }
        
        // Stop if we've fetched all pages reported by API
        if (totalPagesFromAPI > 0 && page >= totalPagesFromAPI) {
          console.log(`✅ Fetched all ${totalPagesFromAPI} pages`);
          break;
        }

        // Rate limiting
        await this.sleep(200);
        
      } catch (error) {
        console.error(`⚠️  Page ${page} error:`, error.message);
        // Don't break on error - continue to next page
        page++;
        if (page >= maxPages - 10) break; // Only stop if near end
      }
    }
    
    console.log(`\n✅ Fetch complete: ${page} pages retrieved, ${allProducts.length} products (before dedup)`);
    

    // Deduplicate products by ID (in case of fetch errors/retries)
    const uniqueProducts = [];
    const seenIds = new Set();
    
    for (const product of allProducts) {
      if (!seenIds.has(product.PRODUCT_ID)) {
        seenIds.add(product.PRODUCT_ID);
        uniqueProducts.push(product);
      }
    }
    
    if (uniqueProducts.length < allProducts.length) {
      const duplicates = allProducts.length - uniqueProducts.length;
      console.log(`⚠️  Removed ${duplicates} duplicate products`);
    }
    
    console.log(`✅ Unique products fetched: ${uniqueProducts.length}`);
    
    return maxProducts ? uniqueProducts.slice(0, maxProducts) : uniqueProducts;
  }

  // ================================================================
  // DATA TRANSFORMATION
  // ================================================================

  /**
   * Process catalog batch - insert/update products table
   */
  static async processCatalogBatch(products, stats, generateEmbeddings) {
    for (const product of products) {
      try {
        // Transform to catalog format
        const catalogData = await this.transformProductCatalog(product, generateEmbeddings);
        
        // Check if product exists
        const { data: existing } = await supabase
          .from('products')
          .select('id')
          .eq('id', catalogData.id)
          .single();

        if (existing) {
          // Update existing product
          const { error } = await supabase
            .from('products')
            .update(catalogData)
            .eq('id', catalogData.id);
            
          if (error) throw error;
          stats.updated++;
        } else {
          // Insert new product
          const { error } = await supabase
            .from('products')
            .insert(catalogData);
            
          if (error) throw error;
          stats.created++;
        }

        // Always update inventory table
        const inventoryData = this.transformInventory(product);
        await supabase
          .from('product_inventory')
          .upsert(inventoryData, { onConflict: 'product_id' });

        stats.processed++;

      } catch (error) {
        console.error(`Failed to process ${product.PRODUCT_ID}:`, error.message);
        stats.failed++;
      }
    }
  }

  /**
   * Transform product to catalog format (static data)
   */
  static async transformProductCatalog(product, generateEmbeddings = true) {
    const searchableText = this.createSearchableText(product);
    
    // Generate embedding if requested
    let embedding = null;
    if (generateEmbeddings && searchableText) {
      try {
        const result = await openai.embeddings.create({
          model: config.AI.EMBEDDING_MODEL || 'text-embedding-3-small',
          input: searchableText.substring(0, 8000) // Limit to 8K chars
        });
        // Convert to PostgreSQL vector format: '[0.1,0.2,0.3,...]'
        const embeddingArray = result.data[0].embedding;
        embedding = `[${embeddingArray.join(',')}]`;
        
        // Small delay to avoid rate limits
        await this.sleep(50);
      } catch (error) {
        console.warn(`Embedding failed for ${product.PRODUCT_ID}:`, error.message);
      }
    }

    return {
      id: product.PRODUCT_ID,
      erp_code: product.ERP_PRODUCT_CODE,
      internal_code: product.INTERNAL_CODE,
      barcode: product.BARCODE,
      bind_id: product.BIND_ID,
      
      name: product.PRODUCT_NAME || product.NAME,
      generic_name: product.GENERIC_NAME,
      internal_name: product.INTERNAL_NAME,
      english_name: product.ENG_NAME,
      
      description: this.cleanHtml(product.DESCRIPTION),
      ingredients: this.cleanHtml(product.INGREDIENTS),
      instructions: this.cleanHtml(product.INSTRUCTIONS),
      warnings: this.cleanHtml(product.WARNINGS),
      
      category: this.mapCategory(product.CATEG_ID),
      category_id: product.CATEG_ID,
      manufacturer: product.MANUFACTURE_NAME,
      brand: product.BRAND_NAME || '',
      
      volume: product.VOLUME,
      uom_id: product.UOM_ID,
      
      is_prescription: this.isPrescriptionRequired(product),
      is_exclusive: product.IS_EXCLUSIVE === 'T',
      is_new: product.IS_NEW === 'Y',
      is_b2b_only: product.IS_ONLY_B2B === 'Y',
      is_virtual: product.IS_VIRTUAL === 'Y',
      
      embedding,
      searchable_text: searchableText,
      
      tags: product.TAGS ? product.TAGS.split(',').filter(Boolean) : [],
      
      updated_at: new Date().toISOString(),
      last_synced_at: new Date().toISOString()
    };
  }

  /**
   * Transform inventory data (dynamic data)
   */
  static transformInventory(product) {
    const stock = product.STOCKS?.[0] || {};
    
    return {
      product_id: product.PRODUCT_ID,
      
      available: stock.AVAILABLE || 0,
      onhand: stock.ONHAND || 0,
      promise: stock.PROMISE || 0,
      stock_flag: product.STOCK_FLAG,
      
      base_price: product.BASE_PRICE || 0,
      
      is_active: product.ACTIVE === '1',
      active_flag: product.FLAG,
      
      facility_id: stock.FACILITY_ID,
      facility_name: stock.FACILITY_NAME,
      store_id: product.STORE_ID,
      
      seller_id: product.SELLER_ID,
      manufacturer_id: product.MANUFACTURER_ID,
      pay_to_party_id: product.PAY_TO_PARTY_ID,
      
      updated_at: new Date().toISOString(),
      last_api_sync: new Date().toISOString()
    };
  }

  /**
   * Update only inventory table (quick sync)
   * Only updates if product exists in products table
   */
  static async updateInventoryOnly(product) {
    // First check if product exists in products table
    const { data: productExists, error: checkError } = await supabase
      .from('products')
      .select('id')
      .eq('id', product.PRODUCT_ID)
      .single();
    
    if (checkError || !productExists) {
      // Product doesn't exist, skip inventory update
      return { skipped: true, reason: 'product_not_found' };
    }
    
    const inventory = this.transformInventory(product);
    
    const { error } = await supabase
      .from('product_inventory')
      .upsert(inventory, { onConflict: 'product_id' });

    if (error) throw error;
    return { updated: true };
  }

  // ================================================================
  // TIER 2: REDIS CACHING
  // ================================================================

  /**
   * Cache product inventory in Redis (5 min TTL)
   */
  static async cacheProductInventory(product) {
    // Check if Redis is available
    if (!this.redis) {
      return; // Silently skip if Redis not configured
    }
    
    if (!this.redisConnected) {
      await this.initializeRedis();
    }

    if (!this.redisConnected) {
      // Silently skip Redis caching (database is source of truth)
      return;
    }

    try {
      const stock = product.STOCKS?.[0] || {};
      const cacheKey = `product:${product.PRODUCT_ID}`;
      
      const cacheData = {
        available: stock.AVAILABLE || 0,
        onhand: stock.ONHAND || 0,
        promise: stock.PROMISE || 0,
        price: product.BASE_PRICE || 0,
        is_active: product.ACTIVE === '1',
        facility_name: stock.FACILITY_NAME,
        updated_at: Date.now()
      };

      await this.redis.setex(
        cacheKey,
        300, // 5 minutes TTL
        JSON.stringify(cacheData)
      );

    } catch (error) {
      console.warn('Redis cache failed, using DB fallback:', error.message);
      await this.cacheToDB(product);
    }
  }

  /**
   * Get product from Redis cache
   */
  static async getFromCache(productId) {
    // Check if Redis is available
    if (!this.redis || !this.redisConnected) {
      return null; // Return null, let caller use database
    }

    try {
      const cached = await this.redis.get(`product:${productId}`);
      if (cached) {
        return JSON.parse(cached);
      }
      
      // Fallback to database cache
      return await this.getFromDBCache(productId);
      
    } catch (error) {
      console.warn('Redis get error:', error.message);
      return await this.getFromDBCache(productId);
    }
  }

  /**
   * Database cache fallback
   */
  static async cacheToDB(product) {
    const stock = product.STOCKS?.[0] || {};
    
    const cacheData = {
      product_id: product.PRODUCT_ID,
      cache_key: `product:${product.PRODUCT_ID}`,
      cache_data: {
        available: stock.AVAILABLE || 0,
        onhand: stock.ONHAND || 0,
        price: product.BASE_PRICE || 0,
        is_active: product.ACTIVE === '1'
      },
      expires_at: new Date(Date.now() + 300000).toISOString() // 5 min
    };

    await supabase
      .from('product_cache')
      .upsert(cacheData, { onConflict: 'product_id' });
  }

  /**
   * Get from database cache
   */
  static async getFromDBCache(productId) {
    const { data, error } = await supabase
      .from('product_cache')
      .select('cache_data, expires_at')
      .eq('product_id', productId)
      .single();

    if (error || !data) return null;

    // Check if expired
    if (new Date(data.expires_at) < new Date()) {
      return null;
    }

    return data.cache_data;
  }

  // ================================================================
  // TIER 3: REAL-TIME API CALLS
  // ================================================================

  /**
   * Fetch real-time product data from business API
   */
  static async fetchRealTimeProduct(productId) {
    try {
      // Note: Adjust endpoint based on your API structure
      const response = await fetch(
        `${this.BUSINESS_API_BASE}/products/${productId}?storeId=MK001`,
        { timeout: 5000 }
      );

      if (!response.ok) return null;

      const data = await response.json();
      const product = data.data || data;

      return {
        available: product.STOCKS?.[0]?.AVAILABLE || 0,
        onhand: product.STOCKS?.[0]?.ONHAND || 0,
        price: product.BASE_PRICE || 0,
        is_active: product.ACTIVE === '1'
      };
      
    } catch (error) {
      console.warn(`Real-time fetch failed for ${productId}:`, error.message);
      return null;
    }
  }

  // ================================================================
  // UTILITY METHODS
  // ================================================================

  /**
   * Create searchable text from product
   */
  static createSearchableText(product) {
    return [
      product.PRODUCT_NAME,
      product.GENERIC_NAME,
      product.INTERNAL_NAME,
      product.MANUFACTURE_NAME,
      this.cleanHtml(product.INGREDIENTS),
      this.cleanHtml(product.DESCRIPTION)
    ]
      .filter(Boolean)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Clean HTML content
   */
  static cleanHtml(html) {
    if (!html) return '';
    return html
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .trim();
  }

  /**
   * Map category ID to category name
   */
  static mapCategory(categoryId) {
    const categoryMap = {
      '91': 'gynecology',
      '127': 'neurology',
      '154': 'neurology',
      '116': 'pain_relief',
      '55': 'vitamins',
      '34': 'medical_supplies'
    };
    return categoryMap[categoryId] || 'general';
  }

  /**
   * Determine if prescription is required
   */
  static isPrescriptionRequired(product) {
    const prescriptionKeywords = ['тарилгын', 'injection', 'уусмал', 'solution', 'ампул'];
    const name = (product.PRODUCT_NAME || '').toLowerCase();
    return prescriptionKeywords.some(keyword => name.includes(keyword));
  }

  // ================================================================
  // SYNC LOGGING
  // ================================================================

  /**
   * Create sync log entry
   */
  static async createSyncLog(syncType) {
    try {
      const { data, error } = await supabase
        .from('sync_log')
        .insert({
          sync_type: syncType,
          status: 'running',
          started_at: new Date().toISOString()
        })
        .select()
        .single();

      if (error) throw error;
      return data.id;
    } catch (error) {
      console.warn('Failed to create sync log:', error.message);
      return null;
    }
  }

  /**
   * Complete sync log entry
   */
  static async completeSyncLog(syncId, status, stats, error = null, duration = 0) {
    if (!syncId) return;

    try {
      await supabase
        .from('sync_log')
        .update({
          status,
          completed_at: new Date().toISOString(),
          products_processed: stats.processed || 0,
          products_created: stats.created || 0,
          products_updated: stats.updated || 0,
          products_failed: stats.failed || 0,
          duration_ms: duration,
          error_message: error?.message || null,
          error_details: error ? { stack: error.stack, message: error.message } : null
        })
        .eq('id', syncId);
    } catch (err) {
      console.warn('Failed to update sync log:', err.message);
    }
  }

  // ================================================================
  // STATUS AND MONITORING
  // ================================================================

  /**
   * Get comprehensive sync status
   */
  static async getSyncStatus() {
    try {
      // Get product counts
      const { count: totalProducts } = await supabase
        .from('products')
        .select('*', { count: 'exact', head: true });

      const { count: activeProducts } = await supabase
        .from('product_inventory')
        .select('*', { count: 'exact', head: true })
        .eq('is_active', true);

      const { count: inStockProducts } = await supabase
        .from('product_inventory')
        .select('*', { count: 'exact', head: true })
        .gt('available', 0);

      // Get last sync info
      const { data: lastSync } = await supabase
        .from('sync_log')
        .select('*')
        .order('started_at', { ascending: false })
        .limit(1)
        .single();

      // Get Redis stats
      let redisStats = null;
      if (this.redisConnected) {
        try {
          const info = await this.redis.info('stats');
          const keys = await this.redis.dbsize();
          redisStats = {
            connected: true,
            totalKeys: keys,
            info: info.split('\n')[0]
          };
        } catch (error) {
          redisStats = { connected: false, error: error.message };
        }
      }

      return {
        database: {
          totalProducts: totalProducts || 0,
          activeProducts: activeProducts || 0,
          inStockProducts: inStockProducts || 0,
          outOfStockProducts: (activeProducts || 0) - (inStockProducts || 0)
        },
        lastSync: lastSync ? {
          type: lastSync.sync_type,
          status: lastSync.status,
          started: lastSync.started_at,
          completed: lastSync.completed_at,
          processed: lastSync.products_processed,
          duration: lastSync.duration_ms,
          error: lastSync.error_message
        } : null,
        redis: redisStats,
        health: this.calculateSyncHealth(totalProducts, lastSync),
        timestamp: new Date().toISOString()
      };
      
    } catch (error) {
      console.error('Error getting sync status:', error);
      return {
        error: error.message,
        health: 'unhealthy'
      };
    }
  }

  /**
   * Calculate overall sync health
   */
  static calculateSyncHealth(totalProducts, lastSync) {
    if (!totalProducts || totalProducts === 0) return 'no_data';
    if (!lastSync) return 'never_synced';
    if (lastSync.status === 'failed') return 'unhealthy';
    
    const hoursSinceSync = (Date.now() - new Date(lastSync.completed_at).getTime()) / (1000 * 60 * 60);
    
    if (hoursSinceSync > 48) return 'stale';
    if (hoursSinceSync > 24) return 'aging';
    
    return 'healthy';
  }

  /**
   * Sleep utility
   */
  static sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Clear all caches
   */
  static async clearAllCaches() {
    try {
      if (this.redisConnected) {
        await this.redis.flushdb();
        console.log('✅ Redis cache cleared');
      }
      
      await supabase
        .from('product_cache')
        .delete()
        .lt('expires_at', new Date().toISOString());
      
      console.log('✅ Database cache cleared');
      
    } catch (error) {
      console.error('Cache clear failed:', error);
    }
  }
}
