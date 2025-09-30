-- ===================================================================
-- ENTERPRISE AI CHATBOT DATABASE SETUP
-- ===================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";

-- ===================================================================
-- CORE TABLES
-- ===================================================================

-- Enhanced items/products table
CREATE TABLE items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sku VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  category VARCHAR(100),
  subcategory VARCHAR(100),
  price DECIMAL(10,2) NOT NULL,
  stock_quantity INTEGER NOT NULL DEFAULT 0,
  low_stock_threshold INTEGER DEFAULT 10,
  is_prescription BOOLEAN DEFAULT FALSE,
  brand VARCHAR(255),
  dosage VARCHAR(100),
  metadata JSONB DEFAULT '{}',
  embedding VECTOR(1536), -- For semantic search
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  -- Constraints
  CHECK (price >= 0),
  CHECK (stock_quantity >= 0)
);

-- Indexes for performance
CREATE INDEX idx_items_category ON items(category);
CREATE INDEX idx_items_active ON items(is_active) WHERE is_active = TRUE;
CREATE INDEX idx_items_stock ON items(stock_quantity);
CREATE INDEX idx_items_embedding ON items USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX idx_items_search ON items USING GIN(to_tsvector('english', name || ' ' || COALESCE(description, '')));

-- Conversations with memory management
CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id VARCHAR(255) NOT NULL,
  session_id VARCHAR(255) NOT NULL,
  title VARCHAR(255),
  messages JSONB NOT NULL DEFAULT '[]',
  context JSONB DEFAULT '{}',
  message_count INTEGER DEFAULT 0,
  total_tokens INTEGER DEFAULT 0,
  last_activity TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  UNIQUE(user_id, session_id)
);

CREATE INDEX idx_conversations_user ON conversations(user_id);
CREATE INDEX idx_conversations_session ON conversations(session_id);
CREATE INDEX idx_conversations_activity ON conversations(last_activity DESC);
CREATE INDEX idx_conversations_user_activity ON conversations(user_id, last_activity DESC);

-- Orders with comprehensive tracking
CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_number VARCHAR(50) UNIQUE NOT NULL,
  user_id VARCHAR(255) NOT NULL,
  pharmacy_id VARCHAR(255),
  items JSONB NOT NULL,
  subtotal DECIMAL(10,2) NOT NULL,
  tax DECIMAL(10,2) DEFAULT 0,
  shipping DECIMAL(10,2) DEFAULT 0,
  total DECIMAL(10,2) NOT NULL,
  status VARCHAR(50) DEFAULT 'pending',
  payment_status VARCHAR(50) DEFAULT 'pending',
  shipping_address JSONB,
  notes TEXT,
  created_by_ai BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  CHECK (total >= 0),
  CHECK (status IN ('pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded'))
);

CREATE INDEX idx_orders_user ON orders(user_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_created ON orders(created_at DESC);
CREATE INDEX idx_orders_number ON orders(order_number);

-- User profiles and preferences
CREATE TABLE user_profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id VARCHAR(255) UNIQUE NOT NULL,
  preferences JSONB DEFAULT '{}',
  purchase_history JSONB DEFAULT '[]',
  favorite_items UUID[] DEFAULT '{}',
  allergies TEXT[],
  prescriptions JSONB DEFAULT '[]',
  total_orders INTEGER DEFAULT 0,
  lifetime_value DECIMAL(10,2) DEFAULT 0,
  ai_interactions INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_user_profiles_user_id ON user_profiles(user_id);

-- Analytics and monitoring
CREATE TABLE chat_analytics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id VARCHAR(255),
  session_id VARCHAR(255),
  conversation_id UUID,
  message_content TEXT,
  response_content TEXT,
  intent_detected VARCHAR(100),
  functions_called TEXT[],
  response_time_ms INTEGER,
  tokens_used INTEGER,
  cost_usd DECIMAL(6,4),
  success BOOLEAN DEFAULT TRUE,
  error_code VARCHAR(50),
  error_message TEXT,
  model_used VARCHAR(50),
  created_at TIMESTAMP DEFAULT NOW(),
  
  FOREIGN KEY (conversation_id) REFERENCES conversations(id)
);

CREATE INDEX idx_analytics_user ON chat_analytics(user_id);
CREATE INDEX idx_analytics_session ON chat_analytics(session_id);
CREATE INDEX idx_analytics_created ON chat_analytics(created_at DESC);
CREATE INDEX idx_analytics_success ON chat_analytics(success);

-- ===================================================================
-- ADVANCED SEARCH FUNCTIONS
-- ===================================================================

-- Semantic search with advanced filters
CREATE OR REPLACE FUNCTION search_items_semantic(
  query_embedding VECTOR(1536),
  similarity_threshold FLOAT DEFAULT 0.7,
  result_limit INT DEFAULT 10,
  category_filter VARCHAR DEFAULT NULL,
  subcategory_filter VARCHAR DEFAULT NULL,
  prescription_filter BOOLEAN DEFAULT NULL,
  min_stock INT DEFAULT 0,
  max_price DECIMAL DEFAULT NULL,
  brand_filter VARCHAR DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  sku VARCHAR,
  name VARCHAR,
  description TEXT,
  category VARCHAR,
  subcategory VARCHAR,
  brand VARCHAR,
  price DECIMAL,
  stock_quantity INT,
  is_prescription BOOLEAN,
  similarity_score FLOAT
)
LANGUAGE SQL STABLE
AS $$
  SELECT 
    i.id,
    i.sku,
    i.name,
    i.description,
    i.category,
    i.subcategory,
    i.brand,
    i.price,
    i.stock_quantity,
    i.is_prescription,
    1 - (i.embedding <=> query_embedding) AS similarity_score
  FROM items i
  WHERE 
    i.is_active = TRUE
    AND (1 - (i.embedding <=> query_embedding)) > similarity_threshold
    AND (category_filter IS NULL OR i.category = category_filter)
    AND (subcategory_filter IS NULL OR i.subcategory = subcategory_filter)
    AND (prescription_filter IS NULL OR i.is_prescription = prescription_filter)
    AND (brand_filter IS NULL OR i.brand = brand_filter)
    AND i.stock_quantity > min_stock
    AND (max_price IS NULL OR i.price <= max_price)
  ORDER BY similarity_score DESC, stock_quantity DESC
  LIMIT result_limit;
$$;

-- Hybrid search combining semantic + full-text
CREATE OR REPLACE FUNCTION search_items_hybrid(
  search_query TEXT,
  query_embedding VECTOR(1536),
  result_limit INT DEFAULT 10,
  semantic_weight FLOAT DEFAULT 0.7
)
RETURNS TABLE (
  id UUID,
  name VARCHAR,
  description TEXT,
  category VARCHAR,
  price DECIMAL,
  stock_quantity INT,
  combined_score FLOAT
)
LANGUAGE SQL STABLE
AS $$
  WITH semantic_results AS (
    SELECT 
      i.id, i.name, i.description, i.category, i.price, i.stock_quantity,
      (1 - (i.embedding <=> query_embedding)) AS semantic_score
    FROM items i
    WHERE i.is_active = TRUE
  ),
  fulltext_results AS (
    SELECT 
      i.id, i.name, i.description, i.category, i.price, i.stock_quantity,
      ts_rank_cd(
        to_tsvector('english', i.name || ' ' || COALESCE(i.description, '')),
        plainto_tsquery('english', search_query)
      ) AS fulltext_score
    FROM items i
    WHERE 
      i.is_active = TRUE
      AND to_tsvector('english', i.name || ' ' || COALESCE(i.description, '')) @@ plainto_tsquery('english', search_query)
  )
  SELECT 
    COALESCE(s.id, f.id) as id,
    COALESCE(s.name, f.name) as name,
    COALESCE(s.description, f.description) as description,
    COALESCE(s.category, f.category) as category,
    COALESCE(s.price, f.price) as price,
    COALESCE(s.stock_quantity, f.stock_quantity) as stock_quantity,
    (COALESCE(s.semantic_score, 0) * semantic_weight + 
     COALESCE(f.fulltext_score, 0) * (1 - semantic_weight)) AS combined_score
  FROM semantic_results s
  FULL OUTER JOIN fulltext_results f ON s.id = f.id
  ORDER BY combined_score DESC, stock_quantity DESC
  LIMIT result_limit;
$$;

-- ===================================================================
-- UTILITY FUNCTIONS
-- ===================================================================

-- Smart stock management
CREATE OR REPLACE FUNCTION decrement_stock(
  item_id UUID,
  quantity INT
)
RETURNS JSON
LANGUAGE plpgsql
AS $$
DECLARE
  current_stock INT;
  item_name VARCHAR(255);
  result JSON;
BEGIN
  SELECT stock_quantity, name INTO current_stock, item_name
  FROM items
  WHERE id = item_id;
  
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Item not found');
  END IF;
  
  IF current_stock < quantity THEN
    RETURN json_build_object(
      'success', false, 
      'error', 'Insufficient stock',
      'available', current_stock,
      'requested', quantity
    );
  END IF;
  
  UPDATE items
  SET stock_quantity = stock_quantity - quantity,
      updated_at = NOW()
  WHERE id = item_id;
  
  RETURN json_build_object(
    'success', true,
    'item_name', item_name,
    'new_stock', current_stock - quantity
  );
END;
$$;

-- Auto-generated order numbers
CREATE OR REPLACE FUNCTION generate_order_number()
RETURNS VARCHAR(50)
LANGUAGE plpgsql
AS $$
DECLARE
  new_number VARCHAR(50);
  exists_check INT;
BEGIN
  LOOP
    new_number := 'ORD-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || 
                  LPAD(FLOOR(RANDOM() * 10000)::TEXT, 4, '0');
    
    SELECT COUNT(*) INTO exists_check
    FROM orders
    WHERE order_number = new_number;
    
    EXIT WHEN exists_check = 0;
  END LOOP;
  
  RETURN new_number;
END;
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

-- Apply to all tables
CREATE TRIGGER update_items_updated_at 
  BEFORE UPDATE ON items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_conversations_updated_at 
  BEFORE UPDATE ON conversations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_orders_updated_at 
  BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_profiles_updated_at 
  BEFORE UPDATE ON user_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ===================================================================
-- SAMPLE DATA (Optional)
-- ===================================================================

INSERT INTO items (sku, name, description, category, subcategory, price, stock_quantity, brand, is_prescription) VALUES
('MED001', 'Paracetamol 500mg', 'Pain relief and fever reducer tablets', 'medicine', 'pain-relief', 5.99, 100, 'PharmaCorp', false),
('MED002', 'Ibuprofen 200mg', 'Anti-inflammatory pain relief', 'medicine', 'pain-relief', 7.50, 75, 'MediCare', false),
('MED003', 'Amoxicillin 500mg', 'Antibiotic for bacterial infections', 'medicine', 'antibiotics', 15.99, 50, 'AntiBio', true),
('VIT001', 'Vitamin C 1000mg', 'Immune system support', 'vitamins', 'immune', 12.99, 200, 'VitaMax', false),
('SUP001', 'Omega-3 Fish Oil', 'Heart and brain health supplement', 'supplements', 'heart-health', 19.99, 80, 'NutriPlus', false);

-- Generate sample embeddings (you'll need to update these with real embeddings)
-- UPDATE items SET embedding = (SELECT ARRAY(SELECT random() FROM generate_series(1, 1536)));

COMMIT;
