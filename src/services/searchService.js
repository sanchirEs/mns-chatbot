import { supabase } from '../config/database.js';
import { OpenAIService } from '../config/openai.js';
import config from '../config/environment.js';

/**
 * Advanced Search Service with Hybrid RAG Capabilities
 * Combines semantic search, full-text search, and intelligent filtering
 */
export class SearchService {
  static embeddingCache = new Map();
  static searchCache = new Map();

  /**
   * Generate embedding with caching
   */
  static async generateEmbedding(text, useCache = true) {
    if (!text || text.trim().length === 0) {
      throw new Error('Text is required for embedding generation');
    }

    const cacheKey = text.trim().toLowerCase();
    
    if (useCache && this.embeddingCache.has(cacheKey)) {
      return this.embeddingCache.get(cacheKey);
    }

    try {
      const result = await OpenAIService.generateEmbedding(text);
      
      // Cache the embedding (limit cache size)
      if (this.embeddingCache.size > 1000) {
        const firstKey = this.embeddingCache.keys().next().value;
        this.embeddingCache.delete(firstKey);
      }
      
      if (useCache) {
        this.embeddingCache.set(cacheKey, result.embedding);
      }
      
      return result.embedding;
    } catch (error) {
      console.error('Error generating embedding:', error);
      throw error;
    }
  }

  /**
   * Advanced semantic search with intelligent filtering
   */
  static async semanticSearch(query, options = {}) {
    const {
      limit = config.SEARCH.DEFAULT_LIMIT,
      threshold = config.SEARCH.SIMILARITY_THRESHOLD,
      category = null,
      subcategory = null,
      prescriptionRequired = null,
      minStock = 0,
      maxPrice = null,
      brand = null,
      useCache = true
    } = options;

    const cacheKey = JSON.stringify({ query, ...options });
    
    if (useCache && this.searchCache.has(cacheKey)) {
      const cached = this.searchCache.get(cacheKey);
      if (Date.now() - cached.timestamp < 300000) { // 5 minutes cache
        return cached.results;
      }
    }

    try {
      // Generate embedding for query
      const embedding = await this.generateEmbedding(query, useCache);

      // Call enhanced database function
      const { data, error } = await supabase.rpc('search_items_semantic', {
        query_embedding: embedding,
        similarity_threshold: threshold,
        result_limit: Math.min(limit, config.SEARCH.MAX_LIMIT),
        category_filter: category,
        subcategory_filter: subcategory,
        prescription_filter: prescriptionRequired,
        min_stock: minStock,
        max_price: maxPrice,
        brand_filter: brand
      });

      if (error) throw error;

      const results = (data || []).map(item => ({
        id: item.id,
        sku: item.sku,
        name: item.name,
        description: item.description,
        category: item.category,
        subcategory: item.subcategory,
        brand: item.brand,
        price: parseFloat(item.price),
        stock: item.stock_quantity,
        isPrescription: item.is_prescription,
        similarity: parseFloat(item.similarity_score),
        relevanceScore: this.calculateRelevanceScore(item, query)
      }));

      // Cache results
      if (useCache) {
        this.searchCache.set(cacheKey, {
          results,
          timestamp: Date.now()
        });
      }

      return results;
      
    } catch (error) {
      console.error('Error in semantic search:', error);
      // Fallback to keyword search
      return await this.keywordSearch(query, options);
    }
  }

  /**
   * Full-text keyword search (fallback)
   */
  static async keywordSearch(query, options = {}) {
    const { limit = config.SEARCH.DEFAULT_LIMIT } = options;

    try {
      const { data, error } = await supabase.rpc('search_items_fulltext', {
        search_query: query,
        result_limit: limit
      });

      if (error) throw error;

      return (data || []).map(item => ({
        id: item.id,
        name: item.name,
        description: item.description,
        category: item.category,
        price: parseFloat(item.price),
        stock: item.stock_quantity,
        relevanceScore: parseFloat(item.rank)
      }));
      
    } catch (error) {
      console.error('Error in keyword search:', error);
      return [];
    }
  }

  /**
   * Hybrid search combining semantic + keyword search
   */
  static async hybridSearch(query, options = {}) {
    const {
      semanticWeight = config.SEARCH.HYBRID_SEMANTIC_WEIGHT,
      limit = config.SEARCH.DEFAULT_LIMIT
    } = options;

    try {
      const embedding = await this.generateEmbedding(query);

      const { data, error } = await supabase.rpc('search_items_hybrid', {
        search_query: query,
        query_embedding: embedding,
        result_limit: limit,
        semantic_weight: semanticWeight
      });

      if (error) throw error;

      return (data || []).map(item => ({
        id: item.id,
        name: item.name,
        description: item.description,
        category: item.category,
        price: parseFloat(item.price),
        stock: item.stock_quantity,
        combinedScore: parseFloat(item.combined_score)
      }));
      
    } catch (error) {
      console.error('Error in hybrid search:', error);
      return await this.semanticSearch(query, options);
    }
  }

  /**
   * Intelligent search with query understanding
   */
  static async intelligentSearch(query, options = {}) {
    const analyzedQuery = this.analyzeQuery(query);
    
    const searchOptions = {
      ...options,
      category: analyzedQuery.category || options.category,
      prescriptionRequired: analyzedQuery.isPrescriptionQuery || options.prescriptionRequired,
      minStock: analyzedQuery.inStockOnly ? 1 : options.minStock || 0
    };

    // Choose search method based on query type
    if (analyzedQuery.isSpecificProduct) {
      return await this.hybridSearch(query, { ...searchOptions, limit: 3 });
    } else if (analyzedQuery.isSymptomQuery) {
      return await this.symptomBasedSearch(query, searchOptions);
    } else {
      return await this.semanticSearch(query, searchOptions);
    }
  }

  /**
   * Enhanced search with business data integration
   */
  static async searchProductsWithBusinessData(query, options = {}) {
    const {
      includeStock = true,
      includePricing = true,
      realTimeStock = false,
      businessDataOnly = false
    } = options;

    console.log(`🔍 Searching products with business data: "${query}"`);

    try {
      // Use existing semantic search
      const results = await this.semanticSearch(query, options);
      
      // Enhance results with business data
      const enhancedResults = results.map(product => {
        const enhanced = { ...product };
        
        // Add business data if available
        if (product.business_data) {
          enhanced.business_info = {
            seller_id: product.business_data.seller_id,
            bind_id: product.business_data.bind_id,
            facility_name: product.business_data.facility_name,
            promise_quantity: product.business_data.promise_quantity,
            last_stock_sync: product.business_data.last_stock_sync
          };
        }

        // Add stock status
        if (includeStock) {
          enhanced.stock_status = this.getStockStatus(product.stock_quantity);
          enhanced.availability = {
            in_stock: product.stock_quantity > 0,
            low_stock: product.stock_quantity > 0 && product.stock_quantity < 10,
            out_of_stock: product.stock_quantity === 0
          };
        }

        // Add pricing info
        if (includePricing && product.price) {
          enhanced.pricing = {
            base_price: product.price,
            formatted_price: `₮${product.price.toLocaleString()}`,
            currency: 'MNT'
          };
        }

        return enhanced;
      });

      // If real-time stock is requested, fetch from business API
      if (realTimeStock) {
        console.log('🔄 Fetching real-time stock data...');
        for (const product of enhancedResults) {
          try {
            // Import DataSyncService dynamically to avoid circular imports
            const { DataSyncService } = await import('./dataSyncService.js');
            const stockData = await DataSyncService.fetchProductStock(product.id);
            
            if (stockData) {
              product.stock_quantity = stockData.available;
              product.real_time_stock = true;
              product.stock_updated = new Date().toISOString();
            }
          } catch (error) {
            console.warn(`Failed to get real-time stock for ${product.id}:`, error.message);
          }
        }
      }

      console.log(`✅ Found ${enhancedResults.length} products with business data`);
      return enhancedResults;

    } catch (error) {
      console.error('Error in searchProductsWithBusinessData:', error);
      throw error;
    }
  }

  /**
   * Get stock status description
   */
  static getStockStatus(quantity) {
    if (quantity === 0) return 'out_of_stock';
    if (quantity < 5) return 'low_stock';
    if (quantity < 20) return 'limited_stock';
    return 'in_stock';
  }

  /**
   * Symptom-based product recommendations
   */
  static async symptomBasedSearch(query, options = {}) {
    const symptomMappings = {
      'headache': ['pain-relief', 'analgesics'],
      'fever': ['pain-relief', 'antipyretics'],
      'cough': ['cough-cold', 'respiratory'],
      'allergy': ['antihistamines', 'allergy'],
      'stomach': ['digestive', 'antacids'],
      'pain': ['pain-relief', 'analgesics'],
      'cold': ['cough-cold', 'decongestants'],
      'flu': ['cough-cold', 'pain-relief']
    };

    const detectedSymptoms = Object.keys(symptomMappings).filter(symptom =>
      query.toLowerCase().includes(symptom)
    );

    if (detectedSymptoms.length > 0) {
      const categories = [...new Set(detectedSymptoms.flatMap(s => symptomMappings[s]))];
      
      const results = [];
      for (const category of categories) {
        const categoryResults = await this.semanticSearch(query, {
          ...options,
          category,
          limit: 3
        });
        results.push(...categoryResults);
      }

      // Remove duplicates and sort by relevance
      const uniqueResults = results.filter((item, index, array) =>
        array.findIndex(other => other.id === item.id) === index
      );

      return uniqueResults
        .sort((a, b) => (b.similarity || b.relevanceScore || 0) - (a.similarity || a.relevanceScore || 0))
        .slice(0, options.limit || config.SEARCH.DEFAULT_LIMIT);
    }

    return await this.semanticSearch(query, options);
  }

  /**
   * Get item by ID with enhanced details
   */
  static async getItemById(itemId) {
    try {
      // Try new products_with_inventory view first
      let { data, error } = await supabase
        .from('products_with_inventory')
        .select('*')
        .eq('id', itemId)
        .eq('inventory_active', true)
        .single();
      
      // Fallback to old items table if new table doesn't exist
      if (error && error.code === '42P01') {
        const fallback = await supabase
          .from('items')
          .select('*')
          .eq('id', itemId)
          .eq('is_active', true)
          .single();
        data = fallback.data;
        error = fallback.error;
      }

      if (error) throw error;

      return {
        id: data.id,
        sku: data.sku,
        name: data.name,
        description: data.description,
        category: data.category,
        subcategory: data.subcategory,
        price: parseFloat(data.price),
        stock: data.stock_quantity,
        lowStockThreshold: data.low_stock_threshold,
        isPrescription: data.is_prescription,
        brand: data.brand,
        dosage: data.dosage,
        metadata: data.metadata || {},
        createdAt: data.created_at,
        updatedAt: data.updated_at
      };
      
    } catch (error) {
      console.error('Error getting item:', error);
      return null;
    }
  }

  /**
   * Advanced stock checking with recommendations
   */
  static async checkStock(itemId, quantity = 1, options = {}) {
    try {
      const item = await this.getItemById(itemId);
      if (!item) {
        return { 
          available: false, 
          error: 'Item not found',
          currentStock: 0 
        };
      }

      const isAvailable = item.stock >= quantity;
      const isLowStock = item.stock <= item.lowStockThreshold;

      const result = {
        available: isAvailable,
        currentStock: item.stock,
        requested: quantity,
        itemName: item.name,
        itemPrice: item.price,
        isLowStock,
        isPrescription: item.isPrescription
      };

      // Add alternatives if out of stock
      if (!isAvailable && options.suggestAlternatives) {
        const alternatives = await this.semanticSearch(item.name, {
          category: item.category,
          limit: 3,
          minStock: quantity
        });
        
        result.alternatives = alternatives.filter(alt => alt.id !== itemId);
      }

      return result;
      
    } catch (error) {
      console.error('Error checking stock:', error);
      return { 
        available: false, 
        error: 'Stock check failed',
        currentStock: 0 
      };
    }
  }

  /**
   * Get personalized recommendations
   */
  static async getRecommendations(userId, options = {}) {
    const {
      basedOn = 'popular',
      limit = config.SEARCH.DEFAULT_LIMIT,
      category = null
    } = options;

    try {
      switch (basedOn) {
        case 'purchase_history':
          return await this.getHistoryBasedRecommendations(userId, { limit, category });
        case 'popular':
          return await this.getPopularItems({ limit, category });
        case 'trending':
          return await this.getTrendingItems({ limit, category });
        default:
          return await this.getPopularItems({ limit, category });
      }
    } catch (error) {
      console.error('Error getting recommendations:', error);
      return [];
    }
  }

  /**
   * Get popular items
   */
  static async getPopularItems(options = {}) {
    const { limit = 5, category = null } = options;

    try {
      // Try new products_in_stock view first
      let query = supabase
        .from('products_in_stock')
        .select('*')
        .order('available', { ascending: false }) // High stock = popular
        .limit(limit);
      
      // Fallback to old items table if new view doesn't exist
      let { data, error } = await query;
      if (error && error.code === '42P01') {
        query = supabase
          .from('items')
          .select('*')
          .eq('is_active', true)
          .gt('stock_quantity', 0)
          .order('stock_quantity', { ascending: false })
          .limit(limit);
        const fallback = await query;
        data = fallback.data;
        error = fallback.error;
      } else {
        // Continue with original query result
      }

      if (category) {
        query = query.eq('category', category);
      }

      const result = await query;
      if (result.error) throw result.error;

      return (result.data || []).map(item => ({
        id: item.id,
        name: item.name,
        description: item.description,
        category: item.category,
        price: parseFloat(item.price),
        stock: item.stock_quantity,
        brand: item.brand
      }));
      
    } catch (error) {
      console.error('Error getting popular items:', error);
      return [];
    }
  }

  /**
   * Calculate relevance score based on multiple factors
   */
  static calculateRelevanceScore(item, query) {
    let score = 0;

    // Exact name match
    if (item.name.toLowerCase().includes(query.toLowerCase())) {
      score += 0.5;
    }

    // Category relevance
    if (item.category && query.toLowerCase().includes(item.category.toLowerCase())) {
      score += 0.2;
    }

    // Brand match
    if (item.brand && query.toLowerCase().includes(item.brand.toLowerCase())) {
      score += 0.2;
    }

    // Stock availability bonus
    if (item.stock_quantity > 10) {
      score += 0.1;
    }

    return score;
  }

  /**
   * Analyze query to understand intent
   */
  static analyzeQuery(query) {
    const lowerQuery = query.toLowerCase();
    
    return {
      isSpecificProduct: /^[a-zA-Z0-9\-_]+\s*\d*mg?$/.test(query.trim()),
      isSymptomQuery: /headache|fever|cough|pain|cold|flu|allergy|stomach/.test(lowerQuery),
      isPrescriptionQuery: /prescription|rx|doctor|prescribed/.test(lowerQuery),
      isBrandQuery: /brand|manufacturer|company/.test(lowerQuery),
      isPriceQuery: /price|cost|cheap|expensive|budget/.test(lowerQuery),
      inStockOnly: /available|in stock|stock/.test(lowerQuery),
      category: this.extractCategoryFromQuery(lowerQuery)
    };
  }

  /**
   * Extract category from query
   */
  static extractCategoryFromQuery(query) {
    const categoryMappings = {
      'medicine': ['medicine', 'medication', 'drug', 'tablet', 'pill'],
      'vitamins': ['vitamin', 'supplement', 'nutrients'],
      'pain-relief': ['pain', 'headache', 'ache', 'relief'],
      'antibiotics': ['antibiotic', 'infection', 'bacterial'],
      'cold-flu': ['cold', 'flu', 'cough', 'fever'],
      'allergy': ['allergy', 'allergic', 'antihistamine'],
      'digestive': ['stomach', 'digestive', 'antacid', 'nausea']
    };

    for (const [category, keywords] of Object.entries(categoryMappings)) {
      if (keywords.some(keyword => query.includes(keyword))) {
        return category;
      }
    }

    return null;
  }

  /**
   * Clear search caches
   */
  static clearCaches() {
    this.embeddingCache.clear();
    this.searchCache.clear();
    console.log('Search caches cleared');
  }

  /**
   * Get cache statistics
   */
  static getCacheStats() {
    return {
      embeddingCacheSize: this.embeddingCache.size,
      searchCacheSize: this.searchCache.size,
      timestamp: new Date().toISOString()
    };
  }
}
