-- PostgreSQL Schema for Supabase (Safe Migration)
-- This creates the same structure as your MySQL database but with PostgreSQL syntax
-- RUN THIS IN SUPABASE SQL EDITOR: https://supabase.com/dashboard/project/xkmnkxznjemfwuhbnhyj/sql/new

-- Enable UUID extension for better ID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create ENUM types first (PostgreSQL requires this)
CREATE TYPE user_type_enum AS ENUM ('individual', 'ngo', 'company');
CREATE TYPE verification_status_enum AS ENUM ('pending', 'verified', 'rejected');
CREATE TYPE verification_level_enum AS ENUM ('basic', 'advanced');
CREATE TYPE item_status_enum AS ENUM ('active', 'inactive', 'sold', 'draft');
CREATE TYPE order_status_enum AS ENUM ('pending', 'confirmed', 'shipped', 'delivered', 'cancelled');
CREATE TYPE application_status_enum AS ENUM ('pending', 'accepted', 'rejected');

-- 1. Users table
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  user_type user_type_enum NOT NULL,
  name VARCHAR(255) NOT NULL,
  verification_status verification_status_enum DEFAULT 'pending',
  verification_level verification_level_enum DEFAULT 'basic',
  verified_at TIMESTAMPTZ,
  profile_data JSONB,
  last_login TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for users
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_user_type ON users(user_type);
CREATE INDEX IF NOT EXISTS idx_users_verification_status ON users(verification_status);

-- 2. User sessions table
CREATE TABLE IF NOT EXISTS user_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_type user_type_enum NOT NULL,
  session_data JSONB NOT NULL,
  ip_address INET,
  user_agent TEXT,
  device_info JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_expires_at ON user_sessions(expires_at);

-- 3. Login history table
CREATE TABLE IF NOT EXISTS login_history (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ip_address INET,
  user_agent TEXT,
  login_method VARCHAR(50) DEFAULT 'email',
  success BOOLEAN DEFAULT true,
  failure_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_login_history_user_id ON login_history(user_id);
CREATE INDEX IF NOT EXISTS idx_login_history_created_at ON login_history(created_at);

-- 4. Marketplace items table
CREATE TABLE IF NOT EXISTS marketplace_items (
  id SERIAL PRIMARY KEY,
  seller_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  price DECIMAL(10,2) NOT NULL,
  compare_price DECIMAL(10,2),
  category VARCHAR(100) NOT NULL,
  subcategory VARCHAR(100),
  tags TEXT,
  images JSONB,
  weight_kg DECIMAL(5,2) DEFAULT 1.0,
  dimensions_cm JSONB,
  variants JSONB,
  stock_quantity INTEGER DEFAULT 1,
  status item_status_enum DEFAULT 'active',
  rating_average DECIMAL(2,1) DEFAULT 0,
  rating_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_marketplace_items_seller_id ON marketplace_items(seller_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_items_category ON marketplace_items(category);
CREATE INDEX IF NOT EXISTS idx_marketplace_items_status ON marketplace_items(status);
CREATE INDEX IF NOT EXISTS idx_marketplace_items_price ON marketplace_items(price);

-- 5. Cart table
CREATE TABLE IF NOT EXISTS cart (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  marketplace_item_id INTEGER NOT NULL REFERENCES marketplace_items(id) ON DELETE CASCADE,
  quantity INTEGER DEFAULT 1,
  variant_selection JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, marketplace_item_id, variant_selection)
);

CREATE INDEX IF NOT EXISTS idx_cart_user_id ON cart(user_id);
CREATE INDEX IF NOT EXISTS idx_cart_marketplace_item_id ON cart(marketplace_item_id);

-- 6. Service requests table
CREATE TABLE IF NOT EXISTS service_requests (
  id SERIAL PRIMARY KEY,
  requester_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  category VARCHAR(100) NOT NULL,
  required_skills JSONB,
  timeline VARCHAR(255),
  contact_info JSONB,
  location VARCHAR(255),
  urgency VARCHAR(50) DEFAULT 'medium',
  status VARCHAR(50) DEFAULT 'open',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_service_requests_requester_id ON service_requests(requester_id);
CREATE INDEX IF NOT EXISTS idx_service_requests_category ON service_requests(category);
CREATE INDEX IF NOT EXISTS idx_service_requests_status ON service_requests(status);

-- 7. Service offers table
CREATE TABLE IF NOT EXISTS service_offers (
  id SERIAL PRIMARY KEY,
  ngo_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  category VARCHAR(100) NOT NULL,
  skills_offered JSONB,
  pricing_info JSONB,
  availability JSONB,
  location VARCHAR(255),
  status VARCHAR(50) DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_service_offers_ngo_id ON service_offers(ngo_id);
CREATE INDEX IF NOT EXISTS idx_service_offers_category ON service_offers(category);
CREATE INDEX IF NOT EXISTS idx_service_offers_status ON service_offers(status);

-- 8. Service volunteers table (for volunteer applications)
CREATE TABLE IF NOT EXISTS service_volunteers (
  id SERIAL PRIMARY KEY,
  service_request_id INTEGER NOT NULL REFERENCES service_requests(id) ON DELETE CASCADE,
  volunteer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  application_message TEXT,
  status application_status_enum DEFAULT 'pending',
  applied_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(service_request_id, volunteer_id)
);

CREATE INDEX IF NOT EXISTS idx_service_volunteers_service_request_id ON service_volunteers(service_request_id);
CREATE INDEX IF NOT EXISTS idx_service_volunteers_volunteer_id ON service_volunteers(volunteer_id);

-- 9. Service clients table (for hire applications)
CREATE TABLE IF NOT EXISTS service_clients (
  id SERIAL PRIMARY KEY,
  service_offer_id INTEGER NOT NULL REFERENCES service_offers(id) ON DELETE CASCADE,
  client_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message TEXT,
  proposed_amount DECIMAL(10,2),
  proposed_start_date DATE,
  status application_status_enum DEFAULT 'pending',
  applied_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(service_offer_id, client_id)
);

CREATE INDEX IF NOT EXISTS idx_service_clients_service_offer_id ON service_clients(service_offer_id);
CREATE INDEX IF NOT EXISTS idx_service_clients_client_id ON service_clients(client_id);

-- 10. Orders table
CREATE TABLE IF NOT EXISTS orders (
  id SERIAL PRIMARY KEY,
  order_number VARCHAR(50) UNIQUE NOT NULL,
  buyer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  total_amount DECIMAL(10,2) NOT NULL,
  status order_status_enum DEFAULT 'pending',
  shipping_address JSONB,
  payment_info JSONB,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_orders_buyer_id ON orders(buyer_id);
CREATE INDEX IF NOT EXISTS idx_orders_order_number ON orders(order_number);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);

-- 11. Order items table
CREATE TABLE IF NOT EXISTS order_items (
  id SERIAL PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  marketplace_item_id INTEGER NOT NULL REFERENCES marketplace_items(id),
  quantity INTEGER NOT NULL,
  unit_price DECIMAL(10,2) NOT NULL,
  variant_selection JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_marketplace_item_id ON order_items(marketplace_item_id);

-- 12. Wishlist table
CREATE TABLE IF NOT EXISTS wishlist (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  marketplace_item_id INTEGER NOT NULL REFERENCES marketplace_items(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, marketplace_item_id)
);

CREATE INDEX IF NOT EXISTS idx_wishlist_user_id ON wishlist(user_id);
CREATE INDEX IF NOT EXISTS idx_wishlist_marketplace_item_id ON wishlist(marketplace_item_id);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Add updated_at triggers to all tables that need them
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_marketplace_items_updated_at BEFORE UPDATE ON marketplace_items FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_cart_updated_at BEFORE UPDATE ON cart FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_service_requests_updated_at BEFORE UPDATE ON service_requests FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_service_offers_updated_at BEFORE UPDATE ON service_offers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_service_volunteers_updated_at BEFORE UPDATE ON service_volunteers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_service_clients_updated_at BEFORE UPDATE ON service_clients FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_orders_updated_at BEFORE UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Enable Row Level Security (RLS) for basic security
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketplace_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_volunteers ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

-- Basic RLS policies (you can customize these later)
CREATE POLICY "Users can view their own data" ON users FOR ALL USING (auth.uid()::text = id::text);
CREATE POLICY "Marketplace items are viewable by everyone" ON marketplace_items FOR SELECT USING (true);
CREATE POLICY "Service requests are viewable by everyone" ON service_requests FOR SELECT USING (true);
CREATE POLICY "Service offers are viewable by everyone" ON service_offers FOR SELECT USING (true);

-- Success message
SELECT 'PostgreSQL schema created successfully! Ready for safe data migration.' as status;