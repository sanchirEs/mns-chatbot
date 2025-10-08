-- ===================================================================
-- THREE-TIER ARCHITECTURE DATABASE SCHEMA
-- Optimized for: Static Catalog + Dynamic Inventory + Redis Cache
-- ===================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";

-- ===================================================================
-- TIER 1: PRODUCTS TABLE (Static Product Catalog)
-- Purpose: Stores product information that rarely changes
-- Sync: Daily or when products are added/removed
-- ===================================================================

CREATE TABLE IF NOT EXISTS products (
  -- Identifiers
  id VARCHAR(50) PRIMARY KEY,                    -- PRODUCT_ID from API
  erp_code VARCHAR(50),                          -- ERP_PRODUCT_CODE
  internal_code VARCHAR(50),                     -- INTERNAL_CODE
  barcode VARCHAR(50),                           -- BARCODE
  bind_id VARCHAR(50),                           -- BIND_ID
  
  -- Names (for search)
  name TEXT NOT NULL,                            -- PRODUCT_NAME
  generic_name TEXT,                             -- GENERIC_NAME
  internal_name TEXT,                            -- INTERNAL_NAME
  english_name TEXT,                             -- ENG_NAME
  
  -- Static Information (doesn't change often)
  description TEXT,                              -- DESCRIPTION
  ingredients TEXT,                              -- INGREDIENTS (cleaned)
  instructions TEXT,                             -- INSTRUCTIONS (cleaned)
  warnings TEXT,                                 -- WARNINGS (cleaned)
  
  -- Categorization
  category VARCHAR(100),                         -- Mapped category
  category_id VARCHAR(50),                       -- CATEG_ID (original)
  manufacturer VARCHAR(255),                     -- MANUFACTURE_NAME
  brand VARCHAR(255),                            -- BRAND_NAME
  
  -- Product Attributes
  volume VARCHAR(50),                            -- VOLUME
  form VARCHAR(100),                             -- Dosage form
  uom_id VARCHAR(10),                            -- UOM_ID
  
  -- Flags
  is_prescription BOOLEAN DEFAULT FALSE,
  is_exclusive BOOLEAN DEFAULT FALSE,            -- IS_EXCLUSIVE
  is_new BOOLEAN DEFAULT FALSE,                  -- IS_NEW
  is_b2b_only BOOLEAN DEFAULT FALSE,             -- IS_ONLY_B2B
  is_virtual BOOLEAN DEFAULT FALSE,              -- IS_VIRTUAL
  
  -- Vector Search
  embedding VECTOR(1536),                        -- OpenAI embedding
  searchable_text TEXT,                          -- Combined searchable content
  
  -- Metadata
  tags TEXT[],                                   -- TAGS
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  last_synced_at TIMESTAMP,
  
  -- Constraints
  CHECK (name IS NOT NULL AND name != '')
);

-- Indexes for fast search
CREATE INDEX IF NOT EXISTS idx_products_name ON products USING gin(to_tsvector('english', name));
CREATE INDEX IF NOT EXISTS idx_products_generic ON products USING gin(to_tsvector('english', generic_name));
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE INDEX IF NOT EXISTS idx_products_manufacturer ON products(manufacturer);
CREATE INDEX IF NOT EXISTS idx_products_embedding ON products USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);
CREATE INDEX IF NOT EXISTS idx_products_internal_code ON products(internal_code);

-- ===================================================================
-- TIER 2: PRODUCT_INVENTORY TABLE (Dynamic Data)
-- Purpose: Stores frequently changing data (stock, price, status)
-- Sync: Every 5 minutes via Redis cache
-- ===================================================================

CREATE TABLE IF NOT EXISTS product_inventory (
  product_id VARCHAR(50) PRIMARY KEY,
  
  -- Stock Information (changes frequently)
  available INT DEFAULT 0,                       -- AVAILABLE
  onhand INT DEFAULT 0,                          -- ONHAND  
  promise INT DEFAULT 0,                         -- PROMISE
  stock_flag VARCHAR(1),                         -- STOCK_FLAG
  
  -- Pricing (can change)
  base_price DECIMAL(12,2) DEFAULT 0,            -- BASE_PRICE
  
  -- Status
  is_active BOOLEAN DEFAULT TRUE,                -- ACTIVE = '1'
  active_flag VARCHAR(1),                        -- FLAG
  
  -- Warehouse Info
  facility_id VARCHAR(50),                       -- FACILITY_ID
  facility_name VARCHAR(255),                    -- FACILITY_NAME
  store_id VARCHAR(50),                          -- STORE_ID
  
  -- Business IDs
  seller_id VARCHAR(50),                         -- SELLER_ID
  manufacturer_id VARCHAR(50),                   -- MANUFACTURER_ID
  pay_to_party_id VARCHAR(50),                   -- PAY_TO_PARTY_ID
  
  -- Timestamps
  updated_at TIMESTAMP DEFAULT NOW(),
  last_api_sync TIMESTAMP,
  
  -- Foreign Key
  CONSTRAINT fk_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);

-- Indexes for inventory queries
CREATE INDEX IF NOT EXISTS idx_inventory_available ON product_inventory(available) WHERE available > 0;
CREATE INDEX IF NOT EXISTS idx_inventory_active ON product_inventory(is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_inventory_facility ON product_inventory(facility_id);
CREATE INDEX IF NOT EXISTS idx_inventory_updated ON product_inventory(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_price ON product_inventory(base_price);

-- ===================================================================
-- SYNC_LOG TABLE (Track synchronization)
-- Purpose: Monitor sync health and debug issues
-- ===================================================================

CREATE TABLE IF NOT EXISTS sync_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sync_type VARCHAR(50) NOT NULL,                -- 'full', 'incremental', 'stock_only'
  status VARCHAR(20) NOT NULL,                   -- 'running', 'completed', 'failed'
  started_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP,
  
  -- Statistics
  products_processed INT DEFAULT 0,
  products_created INT DEFAULT 0,
  products_updated INT DEFAULT 0,
  products_failed INT DEFAULT 0,
  
  -- Error tracking
  error_message TEXT,
  error_details JSONB,
  
  -- Performance
  duration_ms INT,
  api_calls INT DEFAULT 0,
  
  metadata JSONB DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_sync_log_type ON sync_log(sync_type);
CREATE INDEX IF NOT EXISTS idx_sync_log_status ON sync_log(status);
CREATE INDEX IF NOT EXISTS idx_sync_log_started ON sync_log(started_at DESC);

-- ===================================================================
-- PRODUCT_CACHE TABLE (In-memory cache fallback)
-- Purpose: Fallback when Redis is unavailable
-- ===================================================================

CREATE TABLE IF NOT EXISTS product_cache (
  product_id VARCHAR(50) PRIMARY KEY,
  cache_key VARCHAR(100) NOT NULL,
  cache_data JSONB NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cache_expires ON product_cache(expires_at);
CREATE INDEX IF NOT EXISTS idx_cache_key ON product_cache(cache_key);

-- ===================================================================
-- VECTOR SEARCH FUNCTION
-- Purpose: Fast similarity search with PostgreSQL
-- ===================================================================

CREATE OR REPLACE FUNCTION match_products(
  query_embedding VECTOR(1536),
  match_threshold FLOAT DEFAULT 0.7,
  match_count INT DEFAULT 10,
  filter_category VARCHAR DEFAULT NULL
)
RETURNS TABLE (
  id VARCHAR,
  name TEXT,
  generic_name TEXT,
  category VARCHAR,
  manufacturer VARCHAR,
  is_prescription BOOLEAN,
  similarity FLOAT
)
LANGUAGE SQL STABLE
AS $$
  SELECT 
    p.id,
    p.name,
    p.generic_name,
    p.category,
    p.manufacturer,
    p.is_prescription,
    1 - (p.embedding <=> query_embedding) AS similarity
  FROM products p
  WHERE 
    p.embedding IS NOT NULL
    AND (1 - (p.embedding <=> query_embedding)) > match_threshold
    AND (filter_category IS NULL OR p.category = filter_category)
  ORDER BY p.embedding <=> query_embedding
  LIMIT match_count;
$$;

-- ===================================================================
-- TRIGGERS FOR AUTOMATIC UPDATES
-- ===================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE 'plpgsql';

-- Apply triggers
CREATE TRIGGER update_products_updated_at 
  BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_inventory_updated_at 
  BEFORE UPDATE ON product_inventory
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ===================================================================
-- HELPER VIEWS
-- ===================================================================

-- View: Products with current inventory
CREATE OR REPLACE VIEW products_with_inventory AS
SELECT 
  p.*,
  i.available,
  i.onhand,
  i.promise,
  i.base_price,
  i.is_active AS inventory_active,
  i.facility_name,
  i.updated_at AS inventory_updated_at
FROM products p
LEFT JOIN product_inventory i ON p.id = i.product_id;

-- View: In-stock products only
CREATE OR REPLACE VIEW products_in_stock AS
SELECT *
FROM products_with_inventory
WHERE available > 0 AND inventory_active = true;

-- ===================================================================
-- CLEANUP FUNCTION (Remove expired cache entries)
-- ===================================================================

CREATE OR REPLACE FUNCTION cleanup_expired_cache()
RETURNS INT
LANGUAGE plpgsql
AS $$
DECLARE
  deleted_count INT;
BEGIN
  DELETE FROM product_cache
  WHERE expires_at < NOW();
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

-- ===================================================================
-- INITIAL DATA MIGRATION (if upgrading from old schema)
-- ===================================================================

-- Migrate from old 'items' table to new structure (if exists)
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'items') THEN
    -- Migrate to products table
    INSERT INTO products (
      id, name, description, category, brand, manufacturer,
      is_prescription, embedding, searchable_text,
      created_at, updated_at
    )
    SELECT 
      id::VARCHAR, name, description, category, brand,
      COALESCE(brand, manufacturer) AS manufacturer,
      is_prescription, embedding,
      name || ' ' || COALESCE(description, '') AS searchable_text,
      created_at, updated_at
    FROM items
    ON CONFLICT (id) DO NOTHING;
    
    -- Migrate to inventory table
    INSERT INTO product_inventory (
      product_id, available, base_price, is_active, updated_at
    )
    SELECT 
      id::VARCHAR, 
      COALESCE(stock_quantity, 0),
      COALESCE(price, 0),
      COALESCE(is_active, true),
      updated_at
    FROM items
    ON CONFLICT (product_id) DO UPDATE
    SET 
      available = EXCLUDED.available,
      base_price = EXCLUDED.base_price,
      is_active = EXCLUDED.is_active,
      updated_at = EXCLUDED.updated_at;
      
    RAISE NOTICE 'Migration from items table completed';
  END IF;
END $$;

-- ===================================================================
-- GRANT PERMISSIONS (adjust based on your setup)
-- ===================================================================

-- Grant permissions for service role
-- ALTER DEFAULT PRIVILEGES GRANT ALL ON TABLES TO service_role;
-- ALTER DEFAULT PRIVILEGES GRANT ALL ON SEQUENCES TO service_role;

COMMIT;

