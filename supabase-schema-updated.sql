-- Updated PostgreSQL Schema to Match Your Actual MySQL Structure
-- RUN THIS IN SUPABASE SQL EDITOR to replace the previous schema

-- First, drop existing tables if they exist (in reverse order due to foreign keys)
DROP TABLE IF EXISTS wishlist CASCADE;
DROP TABLE IF EXISTS order_items CASCADE;
DROP TABLE IF EXISTS orders CASCADE;
DROP TABLE IF EXISTS service_clients CASCADE;
DROP TABLE IF EXISTS service_volunteers CASCADE;
DROP TABLE IF EXISTS service_offers CASCADE;
DROP TABLE IF EXISTS service_requests CASCADE;
DROP TABLE IF EXISTS cart CASCADE;
DROP TABLE IF EXISTS marketplace_items CASCADE;
DROP TABLE IF EXISTS login_history CASCADE;
DROP TABLE IF EXISTS user_sessions CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- Drop existing enum types
DROP TYPE IF EXISTS user_type_enum CASCADE;
DROP TYPE IF EXISTS verification_status_enum CASCADE;
DROP TYPE IF EXISTS verification_level_enum CASCADE;
DROP TYPE IF EXISTS item_status_enum CASCADE;
DROP TYPE IF EXISTS order_status_enum CASCADE;
DROP TYPE IF EXISTS application_status_enum CASCADE;
DROP TYPE IF EXISTS account_status_enum CASCADE;
DROP TYPE IF EXISTS condition_type_enum CASCADE;
DROP TYPE IF EXISTS item_type_enum CASCADE;
DROP TYPE IF EXISTS urgency_level_enum CASCADE;
DROP TYPE IF EXISTS priority_enum CASCADE;
DROP TYPE IF EXISTS service_status_enum CASCADE;

-- Create ENUM types that match your MySQL structure
CREATE TYPE user_type_enum AS ENUM ('individual', 'ngo', 'company');
CREATE TYPE account_status_enum AS ENUM ('active', 'suspended', 'banned', 'pending_verification');
CREATE TYPE verification_status_enum AS ENUM ('unverified', 'pending', 'verified', 'rejected');
CREATE TYPE verification_level_enum AS ENUM ('basic', 'advanced');
CREATE TYPE condition_type_enum AS ENUM ('new', 'like_new', 'good', 'fair', 'poor');
CREATE TYPE item_type_enum AS ENUM ('single', 'bulk');
CREATE TYPE item_status_enum AS ENUM ('active', 'sold', 'reserved', 'cancelled');
CREATE TYPE urgency_level_enum AS ENUM ('low', 'medium', 'high', 'critical');
CREATE TYPE priority_enum AS ENUM ('low', 'medium', 'high', 'urgent');
CREATE TYPE service_status_enum AS ENUM ('active', 'in_progress', 'completed', 'cancelled');

-- 1. Users table (matching your MySQL structure)
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  user_type user_type_enum NOT NULL,
  name VARCHAR(255) NOT NULL,
  phone VARCHAR(20),
  location VARCHAR(255),
  verified BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  email_verified BOOLEAN DEFAULT false,
  phone_verified BOOLEAN DEFAULT false,
  two_factor_enabled BOOLEAN DEFAULT false,
  two_factor_secret VARCHAR(255),
  account_status account_status_enum DEFAULT 'pending_verification',
  last_login TIMESTAMPTZ,
  login_attempts INTEGER DEFAULT 0,
  locked_until TIMESTAMPTZ,
  timezone VARCHAR(50) DEFAULT 'UTC',
  preferences JSONB,
  privacy_settings JSONB,
  verification_status verification_status_enum DEFAULT 'unverified',
  verification_level verification_level_enum DEFAULT 'basic',
  verified_at TIMESTAMPTZ,
  identity_verified BOOLEAN DEFAULT false
);

-- Create indexes for users
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_user_type ON users(user_type);
CREATE INDEX idx_users_verification_status ON users(verification_status);
CREATE INDEX idx_users_account_status ON users(account_status);

-- 2. User sessions table (simplified structure)
CREATE TABLE user_sessions (
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

CREATE INDEX idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX idx_user_sessions_expires_at ON user_sessions(expires_at);

-- 3. Login history table
CREATE TABLE login_history (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ip_address INET,
  user_agent TEXT,
  login_method VARCHAR(50) DEFAULT 'email',
  success BOOLEAN DEFAULT true,
  failure_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_login_history_user_id ON login_history(user_id);
CREATE INDEX idx_login_history_created_at ON login_history(created_at);

-- 4. Marketplace items table (matching your MySQL structure)
CREATE TABLE marketplace_items (
  id SERIAL PRIMARY KEY,
  seller_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  category VARCHAR(100) NOT NULL,
  subcategory VARCHAR(100),
  condition_type condition_type_enum NOT NULL,
  item_type item_type_enum NOT NULL,
  quantity INTEGER DEFAULT 1,
  price DECIMAL(10,2) NOT NULL,
  compare_price DECIMAL(10,2),
  original_price DECIMAL(10,2),
  tags JSONB,
  location VARCHAR(255),
  images JSONB,
  weight_kg DECIMAL(5,2) DEFAULT 1.00,
  dimensions_cm JSONB,
  status item_status_enum DEFAULT 'active',
  rating_average DECIMAL(2,1) DEFAULT 0.0,
  rating_count INTEGER DEFAULT 0,
  is_negotiable BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_marketplace_items_seller_id ON marketplace_items(seller_id);
CREATE INDEX idx_marketplace_items_category ON marketplace_items(category);
CREATE INDEX idx_marketplace_items_status ON marketplace_items(status);
CREATE INDEX idx_marketplace_items_item_type ON marketplace_items(item_type);

-- 5. Cart table (simplified for now)
CREATE TABLE cart (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  marketplace_item_id INTEGER NOT NULL REFERENCES marketplace_items(id) ON DELETE CASCADE,
  quantity INTEGER DEFAULT 1,
  variant_selection JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, marketplace_item_id)
);

CREATE INDEX idx_cart_user_id ON cart(user_id);
CREATE INDEX idx_cart_marketplace_item_id ON cart(marketplace_item_id);

-- 6. Service requests table (matching your MySQL structure)
CREATE TABLE service_requests (
  id SERIAL PRIMARY KEY,
  ngo_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  category VARCHAR(100) NOT NULL,
  tags JSONB,
  urgency_level urgency_level_enum DEFAULT 'medium',
  volunteers_needed INTEGER DEFAULT 1,
  priority priority_enum DEFAULT 'medium',
  deadline DATE,
  location VARCHAR(255),
  requirements JSONB,
  image_url VARCHAR(500),
  status service_status_enum DEFAULT 'active',
  volunteer_limit INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  timeline VARCHAR(255),
  contact_info TEXT
);

CREATE INDEX idx_service_requests_ngo_id ON service_requests(ngo_id);
CREATE INDEX idx_service_requests_category ON service_requests(category);
CREATE INDEX idx_service_requests_status ON service_requests(status);
CREATE INDEX idx_service_requests_deadline ON service_requests(deadline);

-- 7. Service offers table (basic structure for now)
CREATE TABLE service_offers (
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

CREATE INDEX idx_service_offers_ngo_id ON service_offers(ngo_id);
CREATE INDEX idx_service_offers_category ON service_offers(category);
CREATE INDEX idx_service_offers_status ON service_offers(status);

-- 8. Service volunteers table (for volunteer applications)
CREATE TABLE service_volunteers (
  id SERIAL PRIMARY KEY,
  service_request_id INTEGER NOT NULL REFERENCES service_requests(id) ON DELETE CASCADE,
  volunteer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  application_message TEXT,
  status VARCHAR(50) DEFAULT 'pending',
  applied_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(service_request_id, volunteer_id)
);

CREATE INDEX idx_service_volunteers_service_request_id ON service_volunteers(service_request_id);
CREATE INDEX idx_service_volunteers_volunteer_id ON service_volunteers(volunteer_id);

-- 9. Service clients table (for hire applications)
CREATE TABLE service_clients (
  id SERIAL PRIMARY KEY,
  service_offer_id INTEGER NOT NULL REFERENCES service_offers(id) ON DELETE CASCADE,
  client_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message TEXT,
  proposed_amount DECIMAL(10,2),
  proposed_start_date DATE,
  status VARCHAR(50) DEFAULT 'pending',
  applied_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(service_offer_id, client_id)
);

CREATE INDEX idx_service_clients_service_offer_id ON service_clients(service_offer_id);
CREATE INDEX idx_service_clients_client_id ON service_clients(client_id);

-- 10. Orders table (basic structure)
CREATE TABLE orders (
  id SERIAL PRIMARY KEY,
  order_number VARCHAR(50) UNIQUE NOT NULL,
  buyer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  total_amount DECIMAL(10,2) NOT NULL,
  status VARCHAR(50) DEFAULT 'pending',
  shipping_address JSONB,
  payment_info JSONB,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_orders_buyer_id ON orders(buyer_id);
CREATE INDEX idx_orders_order_number ON orders(order_number);
CREATE INDEX idx_orders_status ON orders(status);

-- 11. Order items table
CREATE TABLE order_items (
  id SERIAL PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  marketplace_item_id INTEGER NOT NULL REFERENCES marketplace_items(id),
  quantity INTEGER NOT NULL,
  unit_price DECIMAL(10,2) NOT NULL,
  variant_selection JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_order_items_order_id ON order_items(order_id);
CREATE INDEX idx_order_items_marketplace_item_id ON order_items(marketplace_item_id);

-- 12. Wishlist table (renamed from wishlists to match your expected table name)
CREATE TABLE wishlist (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  marketplace_item_id INTEGER NOT NULL REFERENCES marketplace_items(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, marketplace_item_id)
);

CREATE INDEX idx_wishlist_user_id ON wishlist(user_id);
CREATE INDEX idx_wishlist_marketplace_item_id ON wishlist(marketplace_item_id);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Add updated_at triggers to tables that need them
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_marketplace_items_updated_at BEFORE UPDATE ON marketplace_items FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_cart_updated_at BEFORE UPDATE ON cart FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_service_requests_updated_at BEFORE UPDATE ON service_requests FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_service_offers_updated_at BEFORE UPDATE ON service_offers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_service_volunteers_updated_at BEFORE UPDATE ON service_volunteers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_service_clients_updated_at BEFORE UPDATE ON service_clients FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_orders_updated_at BEFORE UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Success message
SELECT 'Updated PostgreSQL schema created successfully! Ready for migration with correct structure.' as status;