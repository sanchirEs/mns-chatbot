import { supabase } from '../config/database.js';
import { openai } from '../config/openai.js';
import { DataSyncService } from './dataSyncService.js';
import config from '../config/environment.js';

/**
 * Product Search Service with Three-Tier Architecture
 * Combines Vector DB + Redis Cache + Real-time API
 */
export class ProductSearchService {
  
  // ================================================================
  // MAIN SEARCH METHOD (Three-Tier Strategy)
  // ================================================================

  /**
   * Smart hybrid search with three-tier data fetching
   */
  static async search(query, options = {}) {
    const {
      limit = 5,
      threshold = 0.5,  // Lowered from 0.7 to be more permissive
      category = null,
      includeInactive = true,  // Changed to true to include all products
      realTimeStock = false
    } = options;

    if (config.LOGGING.LEVEL === 'debug') {
      console.log(`🔍 Searching: "${query}" (limit: ${limit}, threshold: ${threshold})`);
    }

    try {
      // TIER 1: Vector search on products table (static catalog)
      const embedding = await this.generateEmbedding(query);
      
      const vectorResults = await this.vectorSearch(embedding, {
        limit: limit * 2, // Get more candidates
        threshold,
        category,
        query  // Pass query for fallback
      });

      if (vectorResults.length === 0) {
        return { products: [], message: 'No products found matching your query' };
      }

      // TIER 2: Enrich with inventory from cache/DB
      const enriched = await this.enrichWithInventory(vectorResults, includeInactive);

      // TIER 3: Optional real-time API check for critical queries
      if (realTimeStock) {
        await this.enrichWithRealTimeData(enriched);
      }

      // Rank and filter results
      const ranked = this.rankResults(enriched, query);
      const final = ranked.slice(0, limit);

      return {
        products: final,
        total: ranked.length,
        metadata: {
          vectorMatches: vectorResults.length,
          enriched: enriched.length,
          realTimeChecked: realTimeStock,
          query,
          threshold
        }
      };

    } catch (error) {
      console.error('Search error:', error);
      return { 
        products: [], 
        error: error.message,
        query
      };
    }
  }

  // ================================================================
  // TIER 1: VECTOR SEARCH
  // ================================================================

  /**
   * Generate embedding with caching
   */
  static async generateEmbedding(text) {
    const cacheKey = `embedding:${Buffer.from(text.substring(0, 100)).toString('base64')}`;
    
    try {
      // Try Redis cache
      if (DataSyncService.redisConnected) {
        const cached = await DataSyncService.redis.get(cacheKey);
        if (cached) {
          return JSON.parse(cached);
        }
      }

      // Generate new embedding
      const result = await openai.embeddings.create({
        model: config.AI.EMBEDDING_MODEL || 'text-embedding-3-small',
        input: text.substring(0, 8000)
      });

      const embedding = result.data[0].embedding;

      // Cache for 1 hour
      if (DataSyncService.redisConnected) {
        await DataSyncService.redis.setex(cacheKey, 3600, JSON.stringify(embedding));
      }

      return embedding;
      
    } catch (error) {
      console.error('Embedding generation failed:', error);
      throw error;
    }
  }

  /**
   * Vector similarity search using PostgreSQL
   */
  static async vectorSearch(embedding, options) {
    const { limit, threshold, category } = options;

    try {
      // Ensure embedding is in the correct format for PostgreSQL
      let queryEmbedding = embedding;
      if (typeof embedding === 'string') {
        try {
          queryEmbedding = JSON.parse(embedding);
        } catch (parseError) {
          console.error('Failed to parse embedding string:', parseError.message);
          throw new Error('Invalid embedding format');
        }
      }
      
      const { data, error } = await supabase.rpc('match_products', {
        query_embedding: queryEmbedding,
        match_threshold: threshold,
        match_count: limit,
        filter_category: category
      });

      if (error) {
        console.error('Vector search error:', error.message);
        throw error;
      }

      return data || [];
      
    } catch (error) {
      console.error('Vector search failed, using fallback:', error.message);
      // Fallback to keyword search
      return await this.fallbackKeywordSearch(options.query, limit);
    }
  }

  /**
   * Fallback keyword search (if vector search fails)
   */
  static async fallbackKeywordSearch(query, limit = 5) {
    try {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .or(`name.ilike.%${query}%,generic_name.ilike.%${query}%`)
        .limit(limit);

      if (error) throw error;
      return data || [];
      
    } catch (error) {
      console.error('Fallback search failed:', error);
      return [];
    }
  }

  // ================================================================
  // TIER 2: CACHE & DATABASE ENRICHMENT
  // ================================================================

  /**
   * Enrich products with inventory data (cache → DB)
   */
  static async enrichWithInventory(products, includeInactive = false) {
    const enriched = [];

    for (const product of products) {
      try {
        // TIER 2A: Try Redis cache first (fastest)
        const cached = await DataSyncService.getFromCache(product.id);

        if (cached) {
          enriched.push({
            ...product,
            available: cached.available,
            onhand: cached.onhand,
            promise: cached.promise,
            price: cached.price,
            is_active: cached.is_active,
            facility_name: cached.facility_name,
            _data_source: 'redis_cache'
          });
          continue;
        }

        // TIER 2B: Fallback to database inventory
        const { data: inventory, error } = await supabase
          .from('product_inventory')
          .select('*')
          .eq('product_id', product.id)
          .single();

        if (error && error.code !== 'PGRST116') {
          console.warn(`Inventory fetch failed for ${product.id}:`, error.message);
          // Don't skip - include product with default inventory
          enriched.push({
            ...product,
            available: 0,
            onhand: 0,
            promise: 0,
            price: 0,
            is_active: true,
            facility_name: 'Unknown',
            _data_source: 'no_inventory',
            _warning: 'Inventory data unavailable'
          });
          continue;
        }

        if (inventory) {
          // Include product if inventory exists (active or inactive based on option)
          if (includeInactive || inventory.is_active) {
            enriched.push({
              ...product,
              available: inventory.available,
              onhand: inventory.onhand,
              promise: inventory.promise,
              price: inventory.base_price,
              is_active: inventory.is_active,
              facility_name: inventory.facility_name,
              _data_source: 'database'
            });
          }
        } else {
          // No inventory record - include with defaults
          enriched.push({
            ...product,
            available: 0,
            onhand: 0,
            promise: 0,
            price: 0,
            is_active: true,
            facility_name: 'Unknown',
            _data_source: 'no_inventory_record'
          });
        }
        
      } catch (error) {
        console.warn(`Enrichment failed for ${product.id}:`, error.message);
      }
    }

    return enriched;
  }

  // ================================================================
  // TIER 3: REAL-TIME API ENRICHMENT
  // ================================================================

  /**
   * Enrich with real-time data from business API
   */
  static async enrichWithRealTimeData(products) {
    const promises = products.map(async (product) => {
      try {
        const realTimeData = await DataSyncService.fetchRealTimeProduct(product.id);
        
        if (realTimeData) {
          product.available = realTimeData.available;
          product.onhand = realTimeData.onhand;
          product.price = realTimeData.price;
          product.is_active = realTimeData.is_active;
          product._data_source = 'real_time_api';
          product._real_time_checked = true;
        }
      } catch (error) {
        console.warn(`Real-time fetch failed for ${product.id}:`, error.message);
      }
    });

    await Promise.allSettled(promises);
  }

  // ================================================================
  // RANKING AND FILTERING
  // ================================================================

  /**
   * Rank results by relevance
   */
  static rankResults(products, query) {
    const lowerQuery = query.toLowerCase();

    return products
      .map(product => {
        let score = product.similarity || 0;

        // Boost for in-stock items
        if (product.available > 0) score += 0.15;

        // Boost for exact name match
        if (product.name && product.name.toLowerCase().includes(lowerQuery)) {
          score += 0.20;
        }

        // Boost for generic name match
        if (product.generic_name && product.generic_name.toLowerCase().includes(lowerQuery)) {
          score += 0.15;
        }

        // Boost for active products
        if (product.is_active) score += 0.10;

        // Boost for good stock levels
        if (product.available > 50) score += 0.05;

        // Penalty for out of stock
        if (product.available === 0) score -= 0.20;

        return { ...product, _final_score: score };
      })
      .sort((a, b) => b._final_score - a._final_score);
  }

  // ================================================================
  // SPECIALIZED SEARCH METHODS
  // ================================================================

  /**
   * Get product by ID with full data
   */
  static async getById(productId, realTime = false) {
    try {
      // Get product catalog data
      const { data: product, error: productError } = await supabase
        .from('products')
        .select('*')
        .eq('id', productId)
        .single();

      if (productError || !product) {
        return null;
      }

      // Try cache first
      if (!realTime) {
        const cached = await DataSyncService.getFromCache(productId);
        if (cached) {
          return {
            ...product,
            ...cached,
            _data_source: 'cache'
          };
        }
      }

      // Get from inventory table
      const { data: inventory } = await supabase
        .from('product_inventory')
        .select('*')
        .eq('product_id', productId)
        .single();

      // Real-time check if requested
      let finalData = { ...product, ...inventory };
      
      if (realTime) {
        const realTimeData = await DataSyncService.fetchRealTimeProduct(productId);
        if (realTimeData) {
          finalData = { ...finalData, ...realTimeData, _data_source: 'real_time' };
        }
      }

      return finalData;
      
    } catch (error) {
      console.error(`Error getting product ${productId}:`, error);
      return null;
    }
  }

  /**
   * Check stock for specific product
   */
  static async checkStock(productId, quantity = 1, options = {}) {
    const { realTime = false, suggestAlternatives = true } = options;

    try {
      const product = await this.getById(productId, realTime);
      
      if (!product) {
        return {
          available: false,
          error: 'Product not found',
          productId
        };
      }

      const isAvailable = product.available >= quantity;
      const isLowStock = product.available > 0 && product.available < 10;

      const result = {
        available: isAvailable,
        currentStock: product.available,
        onhandStock: product.onhand,
        promiseStock: product.promise,
        requested: quantity,
        productId: product.id,
        productName: product.name,
        price: product.price,
        facilityName: product.facility_name,
        isLowStock,
        isActive: product.is_active,
        dataSource: product._data_source
      };

      // Add alternatives if out of stock
      if (!isAvailable && suggestAlternatives) {
        const alternatives = await this.search(product.generic_name || product.name, {
          limit: 3,
          category: product.category
        });
        
        result.alternatives = alternatives.products
          .filter(alt => alt.id !== productId && alt.available >= quantity);
      }

      return result;
      
    } catch (error) {
      console.error('Stock check error:', error);
      return {
        available: false,
        error: 'Stock check failed',
        details: error.message
      };
    }
  }

  /**
   * Get products by category
   */
  static async getByCategory(category, options = {}) {
    const { limit = 20, inStockOnly = true } = options;

    try {
      let query = supabase
        .from('products_in_stock')
        .select('*')
        .eq('category', category)
        .order('available', { ascending: false })
        .limit(limit);

      if (!inStockOnly) {
        query = supabase
          .from('products_with_inventory')
          .select('*')
          .eq('category', category)
          .limit(limit);
      }

      const { data, error } = await query;
      if (error) throw error;

      return data || [];
      
    } catch (error) {
      console.error(`Error getting category ${category}:`, error);
      return [];
    }
  }

  /**
   * Get popular/trending products
   */
  static async getPopularProducts(options = {}) {
    const { limit = 10, category = null } = options;

    try {
      let query = supabase
        .from('products_in_stock')
        .select('*')
        .order('available', { ascending: false })
        .limit(limit);

      if (category) {
        query = query.eq('category', category);
      }

      const { data, error } = await query;
      if (error) throw error;

      return data || [];
      
    } catch (error) {
      console.error('Error getting popular products:', error);
      return [];
    }
  }

  // ================================================================
  // CACHE MANAGEMENT
  // ================================================================

  /**
   * Warm up cache for frequently accessed products
   */
  static async warmUpCache(productIds) {
    console.log(`🔥 Warming up cache for ${productIds.length} products...`);

    for (const productId of productIds) {
      try {
        const { data: inventory } = await supabase
          .from('product_inventory')
          .select('*')
          .eq('product_id', productId)
          .single();

        if (inventory) {
          const cacheKey = `product:${productId}`;
          const cacheData = {
            available: inventory.available,
            onhand: inventory.onhand,
            promise: inventory.promise,
            price: inventory.base_price,
            is_active: inventory.is_active,
            facility_name: inventory.facility_name,
            updated_at: Date.now()
          };

          if (DataSyncService.redisConnected) {
            await DataSyncService.redis.setex(
              cacheKey,
              300,
              JSON.stringify(cacheData)
            );
          }
        }
      } catch (error) {
        console.warn(`Failed to warm cache for ${productId}:`, error.message);
      }
    }

    console.log('✅ Cache warm-up completed');
  }

  /**
   * Clear search cache
   */
  static async clearSearchCache() {
    try {
      if (DataSyncService.redisConnected) {
        const keys = await DataSyncService.redis.keys('embedding:*');
        if (keys.length > 0) {
          await DataSyncService.redis.del(...keys);
          console.log(`🗑️ Cleared ${keys.length} embedding cache entries`);
        }
      }
    } catch (error) {
      console.warn('Failed to clear search cache:', error.message);
    }
  }

  // ================================================================
  // SEARCH ANALYTICS
  // ================================================================

  /**
   * Track search performance
   */
  static async trackSearchMetrics(query, results, responseTime) {
    try {
      // Store in analytics (optional)
      if (config.FEATURES.ENABLE_ANALYTICS) {
        await supabase
          .from('chat_analytics')
          .insert({
            message_content: query,
            intent_detected: 'product_search',
            response_time_ms: responseTime,
            success: results.length > 0,
            model_used: 'vector_search'
          });
      }
    } catch (error) {
      // Don't fail search for analytics errors
      console.warn('Failed to track metrics:', error.message);
    }
  }

  /**
   * Get search statistics
   */
  static async getSearchStats(days = 7) {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const { data, error } = await supabase
        .from('chat_analytics')
        .select('intent_detected, success, response_time_ms')
        .eq('intent_detected', 'product_search')
        .gte('created_at', startDate.toISOString());

      if (error) throw error;

      const stats = {
        totalSearches: data.length,
        successfulSearches: data.filter(d => d.success).length,
        averageResponseTime: data.reduce((sum, d) => sum + d.response_time_ms, 0) / data.length,
        successRate: (data.filter(d => d.success).length / data.length) * 100
      };

      return stats;
      
    } catch (error) {
      console.error('Error getting search stats:', error);
      return null;
    }
  }

  // ================================================================
  // HELPER METHODS
  // ================================================================

  /**
   * Format product for response
   */
  static formatProduct(product) {
    return {
      id: product.id,
      name: product.name,
      genericName: product.generic_name,
      category: product.category,
      manufacturer: product.manufacturer,
      brand: product.brand,
      
      // Pricing
      price: product.price,
      formattedPrice: `₮${(product.price || 0).toLocaleString()}`,
      currency: 'MNT',
      
      // Stock
      available: product.available,
      onhand: product.onhand,
      stockStatus: this.getStockStatus(product.available),
      inStock: product.available > 0,
      lowStock: product.available > 0 && product.available < 10,
      
      // Details
      description: product.description,
      ingredients: product.ingredients,
      instructions: product.instructions,
      warnings: product.warnings,
      
      // Metadata
      isPrescription: product.is_prescription,
      isActive: product.is_active,
      facilityName: product.facility_name,
      barcode: product.barcode,
      
      // Data source tracking
      dataSource: product._data_source,
      similarity: product.similarity,
      relevanceScore: product._final_score
    };
  }

  /**
   * Get stock status label
   */
  static getStockStatus(quantity) {
    if (quantity === 0) return 'out_of_stock';
    if (quantity < 5) return 'very_low_stock';
    if (quantity < 20) return 'low_stock';
    if (quantity < 100) return 'limited_stock';
    return 'in_stock';
  }

  /**
   * Get cache statistics
   */
  static async getCacheStats() {
    try {
      const stats = {
        redis: { connected: false, keys: 0 },
        database: { entries: 0, expired: 0 }
      };

      if (DataSyncService.redisConnected) {
        const dbSize = await DataSyncService.redis.dbsize();
        const productKeys = await DataSyncService.redis.keys('product:*');
        const embeddingKeys = await DataSyncService.redis.keys('embedding:*');
        
        stats.redis = {
          connected: true,
          totalKeys: dbSize,
          productKeys: productKeys.length,
          embeddingKeys: embeddingKeys.length
        };
      }

      const { count: totalCache } = await supabase
        .from('product_cache')
        .select('*', { count: 'exact', head: true });

      const { count: expiredCache } = await supabase
        .from('product_cache')
        .select('*', { count: 'exact', head: true })
        .lt('expires_at', new Date().toISOString());

      stats.database = {
        entries: totalCache || 0,
        expired: expiredCache || 0
      };

      return stats;
      
    } catch (error) {
      console.error('Error getting cache stats:', error);
      return null;
    }
  }
}

