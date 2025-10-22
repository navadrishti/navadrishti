-- PostgreSQL Schema for Supabase (Safe Migration)
-- This creates the same structure as your MySQL database but with PostgreSQL syntax
-- RUN THIS IN SUPABASE SQL EDITOR: https://supabase.com/dashboard/project/xkmnkxznjemfwuhbnhyj/sql/new

-- Enable UUID extension for better ID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create ENUM types first (PostgreSQL requires this)
CREATE TYPE user_type_enum AS ENUM ('individual', 'ngo', 'company');
CREATE TYPE verification_status_enum AS ENUM ('pending', 'verified', 'rejected', 'unverified');
CREATE TYPE verification_level_enum AS ENUM ('basic', 'advanced');
CREATE TYPE item_status_enum AS ENUM ('active', 'inactive', 'sold', 'draft');
CREATE TYPE condition_type_enum AS ENUM ('new', 'like_new', 'good', 'fair', 'poor');
CREATE TYPE item_type_enum AS ENUM ('single', 'bundle');
CREATE TYPE order_status_enum AS ENUM ('pending', 'confirmed', 'shipped', 'delivered', 'cancelled');
CREATE TYPE application_status_enum AS ENUM ('pending', 'accepted', 'rejected');
CREATE TYPE urgency_level_enum AS ENUM ('low', 'medium', 'high', 'urgent');
CREATE TYPE priority_enum AS ENUM ('low', 'medium', 'high', 'urgent');
CREATE TYPE service_status_enum AS ENUM ('active', 'inactive', 'completed', 'cancelled');
CREATE TYPE account_status_enum AS ENUM ('pending_verification', 'active', 'suspended', 'deleted');

-- 1. Enhanced Users table with all fields from your schema
CREATE TABLE IF NOT EXISTS users (
  -- Core identity fields
  instance_id UUID,
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  
  -- Auth fields
  aud VARCHAR(255),
  role VARCHAR(255),
  user_type user_type_enum NOT NULL,
  
  -- Profile information
  name VARCHAR(255) NOT NULL,
  phone VARCHAR(20),
  encrypted_password VARCHAR(255),
  email_confirmed_at TIMESTAMPTZ,
  location VARCHAR(255),
  verified BOOLEAN DEFAULT FALSE,
  invited_at TIMESTAMPTZ,
  confirmation_token VARCHAR(255),
  confirmation_sent_at TIMESTAMPTZ,
  email_verified BOOLEAN DEFAULT FALSE,
  recovery_token VARCHAR(255),
  recovery_sent_at TIMESTAMPTZ,
  phone_verified BOOLEAN DEFAULT FALSE,
  email_change_token_new VARCHAR(255),
  two_factor_enabled BOOLEAN DEFAULT FALSE,
  two_factor_secret VARCHAR(255),
  email_change VARCHAR(255),
  account_status account_status_enum DEFAULT 'pending_verification',
  email_change_sent_at TIMESTAMPTZ,
  last_login TIMESTAMPTZ,
  last_sign_in_at TIMESTAMPTZ,
  login_attempts INTEGER DEFAULT 0,
  raw_app_meta_data JSONB,
  locked_until TIMESTAMPTZ,
  raw_user_meta_data JSONB,
  is_super_admin BOOLEAN,
  timezone VARCHAR(50) DEFAULT 'UTC',
  preferences JSONB,
  privacy_settings JSONB,
  verification_status verification_status_enum DEFAULT 'unverified',
  verification_level verification_level_enum DEFAULT 'basic',
  phone_confirmed_at TIMESTAMPTZ,
  phone_change TEXT DEFAULT '',
  verified_at TIMESTAMPTZ,
  identity_verified BOOLEAN DEFAULT FALSE,
  phone_change_token VARCHAR(255) DEFAULT '',
  phone_change_sent_at TIMESTAMPTZ,
  profile_image TEXT,
  city VARCHAR(100),
  confirmed_at TIMESTAMPTZ,
  email_change_token_current VARCHAR(255) DEFAULT '',
  state_province VARCHAR(100),
  email_change_confirm_status SMALLINT DEFAULT 0,
  pincode VARCHAR(20),
  banned_until TIMESTAMPTZ,
  country VARCHAR(100) DEFAULT 'India',
  reauthentication_token VARCHAR(255) DEFAULT '',
  email_verified_at TIMESTAMP,
  reauthentication_sent_at TIMESTAMPTZ,
  phone_verified_at TIMESTAMP,
  is_sso_user BOOLEAN NOT NULL DEFAULT FALSE,
  deleted_at TIMESTAMPTZ,
  is_anonymous BOOLEAN NOT NULL DEFAULT FALSE,
  
  -- Timestamps
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
-- 4. Enhanced Marketplace items table with all fields from your schema
CREATE TABLE IF NOT EXISTS marketplace_items (
  id SERIAL PRIMARY KEY,
  seller_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  category VARCHAR(100) NOT NULL,
  subcategory VARCHAR(100),
  condition_type condition_type_enum NOT NULL,
  item_type item_type_enum NOT NULL,
  quantity INTEGER DEFAULT 1,
  price NUMERIC(10,2) NOT NULL,
  compare_price NUMERIC(10,2),
  original_price NUMERIC(10,2),
  tags JSONB,
  location VARCHAR(255),
  images JSONB,
  weight_kg NUMERIC(5,2) DEFAULT 1.00,
  dimensions_cm JSONB,
  status item_status_enum DEFAULT 'active',
  rating_average NUMERIC(3,2) DEFAULT 0.0,
  rating_count INTEGER DEFAULT 0,
  is_negotiable BOOLEAN DEFAULT TRUE,
  contact_info JSONB,
  views_count INTEGER DEFAULT 0,
  featured BOOLEAN DEFAULT FALSE,
  brand VARCHAR(255),
  specifications JSONB,
  features JSONB,
  city VARCHAR(100),
  state_province VARCHAR(100),
  pincode VARCHAR(20),
  country VARCHAR(100) DEFAULT 'India',
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
-- 6. Enhanced Service requests table with all fields from your schema
CREATE TABLE IF NOT EXISTS service_requests (
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
  timeline VARCHAR(255),
  contact_info TEXT,
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

-- 13. Cart table for shopping functionality
CREATE TABLE IF NOT EXISTS cart (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  marketplace_item_id INTEGER NOT NULL REFERENCES marketplace_items(id) ON DELETE CASCADE,
  quantity INTEGER DEFAULT 1,
  variant_selection JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, marketplace_item_id)
);

CREATE INDEX IF NOT EXISTS idx_cart_user_id ON cart(user_id);
CREATE INDEX IF NOT EXISTS idx_cart_marketplace_item_id ON cart(marketplace_item_id);

-- 14. User addresses table
CREATE TABLE IF NOT EXISTS user_addresses (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  address_line_1 TEXT NOT NULL,
  address_line_2 TEXT,
  city VARCHAR(100) NOT NULL,
  state VARCHAR(100) NOT NULL,
  pincode VARCHAR(10) NOT NULL,
  country VARCHAR(100) DEFAULT 'India',
  phone VARCHAR(15) NOT NULL,
  address_type VARCHAR(20) DEFAULT 'home',
  is_default BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_addresses_user_id ON user_addresses(user_id);
CREATE INDEX IF NOT EXISTS idx_user_addresses_is_default ON user_addresses(is_default);

-- 15. Enhanced ecommerce orders table
CREATE TABLE IF NOT EXISTS ecommerce_orders (
  id BIGSERIAL PRIMARY KEY,
  order_number VARCHAR(50) NOT NULL UNIQUE,
  buyer_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  seller_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  total_amount NUMERIC(10,2) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  shipping_address JSONB NOT NULL,
  billing_address JSONB,
  order_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ecommerce_orders_buyer_id ON ecommerce_orders(buyer_id);
CREATE INDEX IF NOT EXISTS idx_ecommerce_orders_seller_id ON ecommerce_orders(seller_id);
CREATE INDEX IF NOT EXISTS idx_ecommerce_orders_order_number ON ecommerce_orders(order_number);
CREATE INDEX IF NOT EXISTS idx_ecommerce_orders_status ON ecommerce_orders(status);

-- 16. Enhanced ecommerce order items
CREATE TABLE IF NOT EXISTS ecommerce_order_items (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES ecommerce_orders(id) ON DELETE CASCADE,
  marketplace_item_id BIGINT NOT NULL REFERENCES marketplace_items(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL,
  unit_price NUMERIC(10,2) NOT NULL,
  total_price NUMERIC(10,2) NOT NULL,
  item_snapshot JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ecommerce_order_items_order_id ON ecommerce_order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_ecommerce_order_items_marketplace_item_id ON ecommerce_order_items(marketplace_item_id);

-- 17. Enhanced payments table for ecommerce
CREATE TABLE IF NOT EXISTS ecommerce_payments (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES ecommerce_orders(id) ON DELETE CASCADE,
  amount NUMERIC(10,2) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  payment_method VARCHAR(50),
  razorpay_order_id VARCHAR(100),
  razorpay_payment_id VARCHAR(100),
  razorpay_signature VARCHAR(255),
  captured_at TIMESTAMPTZ,
  refunded_at TIMESTAMPTZ,
  refund_amount NUMERIC(10,2),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ecommerce_payments_order_id ON ecommerce_payments(order_id);
CREATE INDEX IF NOT EXISTS idx_ecommerce_payments_status ON ecommerce_payments(status);
CREATE INDEX IF NOT EXISTS idx_ecommerce_payments_razorpay_order_id ON ecommerce_payments(razorpay_order_id);

-- 18. Enhanced shipping details
CREATE TABLE IF NOT EXISTS ecommerce_shipping_details (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES ecommerce_orders(id) ON DELETE CASCADE,
  tracking_status VARCHAR(50) DEFAULT 'pending',
  courier_partner VARCHAR(50),
  delhivery_waybill VARCHAR(100),
  tracking_number VARCHAR(100),
  shipped_at TIMESTAMPTZ,
  expected_delivery TIMESTAMPTZ,
  actual_delivery TIMESTAMPTZ,
  delivery_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ecommerce_shipping_details_order_id ON ecommerce_shipping_details(order_id);
CREATE INDEX IF NOT EXISTS idx_ecommerce_shipping_details_tracking_status ON ecommerce_shipping_details(tracking_status);
CREATE INDEX IF NOT EXISTS idx_ecommerce_shipping_details_tracking_number ON ecommerce_shipping_details(tracking_number);

-- 19. Login history for security tracking
CREATE TABLE IF NOT EXISTS login_history (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ip_address INET,
  user_agent TEXT,
  login_method VARCHAR(50) DEFAULT 'email',
  success BOOLEAN DEFAULT TRUE,
  failure_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_login_history_user_id ON login_history(user_id);
CREATE INDEX IF NOT EXISTS idx_login_history_success ON login_history(success);
CREATE INDEX IF NOT EXISTS idx_login_history_created_at ON login_history(created_at);

-- 20. OTP verifications for phone/email verification
CREATE TABLE IF NOT EXISTS otp_verifications (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  contact VARCHAR(255) NOT NULL,
  otp_code VARCHAR(6) NOT NULL,
  verification_type VARCHAR(10) NOT NULL,
  is_verified BOOLEAN DEFAULT FALSE,
  attempts INTEGER DEFAULT 0,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  verified_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_otp_verifications_user_id ON otp_verifications(user_id);
CREATE INDEX IF NOT EXISTS idx_otp_verifications_contact ON otp_verifications(contact);
CREATE INDEX IF NOT EXISTS idx_otp_verifications_expires_at ON otp_verifications(expires_at);

-- 21. Company verifications
CREATE TABLE IF NOT EXISTS company_verifications (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company_name VARCHAR(255),
  registration_number VARCHAR(50),
  gst_number VARCHAR(15),
  verification_status VARCHAR(20) DEFAULT 'unverified',
  verification_date TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_company_verifications_user_id ON company_verifications(user_id);
CREATE INDEX IF NOT EXISTS idx_company_verifications_status ON company_verifications(verification_status);

-- 22. NGO verifications
CREATE TABLE IF NOT EXISTS ngo_verifications (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ngo_name VARCHAR(255),
  registration_number VARCHAR(50),
  registration_type VARCHAR(50),
  fcra_number VARCHAR(50),
  verification_status VARCHAR(20) DEFAULT 'unverified',
  verification_date TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ngo_verifications_user_id ON ngo_verifications(user_id);
CREATE INDEX IF NOT EXISTS idx_ngo_verifications_status ON ngo_verifications(verification_status);

-- 23. Individual verifications (enhanced)
CREATE TABLE IF NOT EXISTS individual_verifications (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  aadhaar_number VARCHAR(12),
  aadhaar_verified BOOLEAN DEFAULT FALSE,
  aadhaar_verification_date TIMESTAMP,
  pan_number VARCHAR(10),
  pan_verified BOOLEAN DEFAULT FALSE,
  pan_verification_date TIMESTAMP,
  verification_status VARCHAR(20) DEFAULT 'unverified',
  verification_date TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_individual_verifications_user_id ON individual_verifications(user_id);
CREATE INDEX IF NOT EXISTS idx_individual_verifications_status ON individual_verifications(verification_status);
CREATE INDEX IF NOT EXISTS idx_individual_verifications_aadhaar_verified ON individual_verifications(aadhaar_verified);
CREATE INDEX IF NOT EXISTS idx_individual_verifications_pan_verified ON individual_verifications(pan_verified);

-- 24. Service clients (for service offers)
CREATE TABLE IF NOT EXISTS service_clients (
  id SERIAL PRIMARY KEY,
  service_offer_id INTEGER NOT NULL REFERENCES service_offers(id) ON DELETE CASCADE,
  client_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message TEXT,
  proposed_amount NUMERIC(10,2),
  proposed_start_date DATE,
  status VARCHAR(50) DEFAULT 'pending',
  applied_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_service_clients_service_offer_id ON service_clients(service_offer_id);
CREATE INDEX IF NOT EXISTS idx_service_clients_client_id ON service_clients(client_id);
CREATE INDEX IF NOT EXISTS idx_service_clients_status ON service_clients(status);

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
CREATE TRIGGER update_user_addresses_updated_at BEFORE UPDATE ON user_addresses FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_ecommerce_orders_updated_at BEFORE UPDATE ON ecommerce_orders FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_ecommerce_payments_updated_at BEFORE UPDATE ON ecommerce_payments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_ecommerce_shipping_details_updated_at BEFORE UPDATE ON ecommerce_shipping_details FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_company_verifications_updated_at BEFORE UPDATE ON company_verifications FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_ngo_verifications_updated_at BEFORE UPDATE ON ngo_verifications FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_individual_verifications_updated_at BEFORE UPDATE ON individual_verifications FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

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

-- ========================================
-- ADMIN SYSTEM TABLES
-- ========================================
-- Added: Admin panel tables for Navdrishti platform management

-- 25. Admin users table
CREATE TABLE IF NOT EXISTS admin_users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    role VARCHAR(50) DEFAULT 'admin' CHECK (role IN ('super_admin', 'admin', 'moderator', 'analyst')),
    permissions JSONB DEFAULT '[]'::jsonb,
    is_active BOOLEAN DEFAULT true,
    last_login TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for admin_users
CREATE INDEX IF NOT EXISTS idx_admin_users_email ON admin_users(email);
CREATE INDEX IF NOT EXISTS idx_admin_users_role ON admin_users(role);
CREATE INDEX IF NOT EXISTS idx_admin_users_is_active ON admin_users(is_active);

-- 26. Admin sessions table
CREATE TABLE IF NOT EXISTS admin_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_user_id INTEGER NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
    session_token VARCHAR(255) NOT NULL UNIQUE,
    ip_address INET,
    user_agent TEXT,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for admin_sessions
CREATE INDEX IF NOT EXISTS idx_admin_sessions_token ON admin_sessions(session_token);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_admin_user_id ON admin_sessions(admin_user_id);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_expires_at ON admin_sessions(expires_at);

-- 27. Audit logs table for tracking admin actions
CREATE TABLE IF NOT EXISTS audit_logs (
    id SERIAL PRIMARY KEY,
    admin_user_id INTEGER REFERENCES admin_users(id) ON DELETE SET NULL,
    admin_email VARCHAR(255),
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(50) NOT NULL,
    resource_id VARCHAR(50),
    old_values JSONB,
    new_values JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for audit_logs
CREATE INDEX IF NOT EXISTS idx_audit_logs_admin_user_id ON audit_logs(admin_user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_resource_type ON audit_logs(resource_type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);

-- 28. Content moderation table
CREATE TABLE IF NOT EXISTS content_moderation (
    id SERIAL PRIMARY KEY,
    content_type VARCHAR(50) NOT NULL CHECK (content_type IN ('product', 'service_request', 'service_offer', 'user_profile', 'review')),
    content_id INTEGER NOT NULL,
    user_id VARCHAR(255), -- User identifier without foreign key constraint
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'flagged')),
    admin_user_id INTEGER REFERENCES admin_users(id) ON DELETE SET NULL,
    admin_notes TEXT,
    flagged_reason VARCHAR(255),
    action_required BOOLEAN DEFAULT false,
    priority VARCHAR(20) DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
    reviewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for content_moderation
CREATE INDEX IF NOT EXISTS idx_content_moderation_content_type ON content_moderation(content_type);
CREATE INDEX IF NOT EXISTS idx_content_moderation_status ON content_moderation(status);
CREATE INDEX IF NOT EXISTS idx_content_moderation_user_id ON content_moderation(user_id);
CREATE INDEX IF NOT EXISTS idx_content_moderation_created_at ON content_moderation(created_at);
CREATE INDEX IF NOT EXISTS idx_content_moderation_action_required ON content_moderation(action_required);

-- 29. Platform settings table
CREATE TABLE IF NOT EXISTS platform_settings (
    id SERIAL PRIMARY KEY,
    setting_key VARCHAR(100) NOT NULL UNIQUE,
    setting_value JSONB NOT NULL,
    description TEXT,
    category VARCHAR(50) DEFAULT 'general',
    is_public BOOLEAN DEFAULT false,
    admin_user_id INTEGER REFERENCES admin_users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for platform_settings
CREATE INDEX IF NOT EXISTS idx_platform_settings_key ON platform_settings(setting_key);
CREATE INDEX IF NOT EXISTS idx_platform_settings_category ON platform_settings(category);
CREATE INDEX IF NOT EXISTS idx_platform_settings_is_public ON platform_settings(is_public);

-- 30. System notifications table
CREATE TABLE IF NOT EXISTS system_notifications (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    type VARCHAR(50) DEFAULT 'info' CHECK (type IN ('info', 'warning', 'error', 'success')),
    target_audience VARCHAR(50) DEFAULT 'all' CHECK (target_audience IN ('all', 'users', 'companies', 'ngos', 'admins')),
    is_active BOOLEAN DEFAULT true,
    start_date TIMESTAMPTZ DEFAULT NOW(),
    end_date TIMESTAMPTZ,
    admin_user_id INTEGER REFERENCES admin_users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for system_notifications
CREATE INDEX IF NOT EXISTS idx_system_notifications_type ON system_notifications(type);
CREATE INDEX IF NOT EXISTS idx_system_notifications_target_audience ON system_notifications(target_audience);
CREATE INDEX IF NOT EXISTS idx_system_notifications_is_active ON system_notifications(is_active);
CREATE INDEX IF NOT EXISTS idx_system_notifications_dates ON system_notifications(start_date, end_date);

-- Add updated_at triggers for admin tables
CREATE TRIGGER update_admin_users_updated_at BEFORE UPDATE ON admin_users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_content_moderation_updated_at BEFORE UPDATE ON content_moderation FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_platform_settings_updated_at BEFORE UPDATE ON platform_settings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_system_notifications_updated_at BEFORE UPDATE ON system_notifications FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Enable Row Level Security for admin tables
ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_moderation ENABLE ROW LEVEL SECURITY;  
ALTER TABLE platform_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_notifications ENABLE ROW LEVEL SECURITY;

-- RLS Policies for admin tables (allow admin operations)
CREATE POLICY "Admin users management" ON admin_users FOR ALL USING (true);
CREATE POLICY "Admin sessions management" ON admin_sessions FOR ALL USING (true);
CREATE POLICY "Admin can read audit logs" ON audit_logs FOR SELECT USING (true);
CREATE POLICY "System can write audit logs" ON audit_logs FOR INSERT WITH CHECK (true);
CREATE POLICY "Admin can manage content moderation" ON content_moderation FOR ALL USING (true);
CREATE POLICY "Admin can manage platform settings" ON platform_settings FOR ALL USING (true);
CREATE POLICY "Admin can manage system notifications" ON system_notifications FOR ALL USING (true);

-- Admin analytics view
CREATE OR REPLACE VIEW admin_dashboard_stats AS
SELECT 
    -- Safe queries that won't fail if tables don't exist
    1 as total_users, -- Placeholder - will be updated by API
    0 as new_users_month,
    0 as active_products,
    0 as open_service_requests,
    0 as active_service_offers,
    (SELECT COUNT(*) FROM content_moderation WHERE status = 'pending') as pending_moderation,
    0 as pending_verifications;

-- Admin utility functions
CREATE OR REPLACE FUNCTION cleanup_expired_admin_sessions()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM admin_sessions WHERE expires_at < NOW();
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION log_admin_action(
    p_admin_user_id INTEGER,
    p_admin_email VARCHAR(255),
    p_action VARCHAR(100),
    p_resource_type VARCHAR(50),
    p_resource_id VARCHAR(50) DEFAULT NULL,
    p_old_values JSONB DEFAULT NULL,
    p_new_values JSONB DEFAULT NULL,
    p_ip_address INET DEFAULT NULL,
    p_user_agent TEXT DEFAULT NULL
)
RETURNS INTEGER AS $$
DECLARE
    log_id INTEGER;
BEGIN
    INSERT INTO audit_logs (
        admin_user_id, admin_email, action, resource_type, resource_id,
        old_values, new_values, ip_address, user_agent
    ) VALUES (
        p_admin_user_id, p_admin_email, p_action, p_resource_type, p_resource_id,
        p_old_values, p_new_values, p_ip_address, p_user_agent
    ) RETURNING id INTO log_id;
    
    RETURN log_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Insert default platform settings
INSERT INTO platform_settings (setting_key, setting_value, description, category, is_public) VALUES
    ('maintenance_mode', '{"enabled": false, "message": "Site under maintenance"}', 'System maintenance mode settings', 'system', false),
    ('featured_items_limit', '{"max_featured": 10, "auto_expire_days": 30}', 'Featured items configuration', 'marketplace', false),
    ('auto_moderation', '{"enabled": true, "keywords": ["spam", "fraud"], "auto_flag": true}', 'Automatic content moderation settings', 'moderation', false),
    ('user_verification', '{"require_email": true, "require_phone": false, "require_documents": true}', 'User verification requirements', 'users', true),
    ('notification_settings', '{"email_enabled": true, "sms_enabled": false, "push_enabled": true}', 'Platform notification settings', 'notifications', false)
ON CONFLICT (setting_key) DO NOTHING;

-- Create default admin user (password: admin123)
-- Note: In production, change this password immediately after first login
INSERT INTO admin_users (email, password_hash, name, role, permissions) VALUES 
(
    'admin@navdrishti.com',
    '$2b$12$eoOzJcPwfmyskuNV5FPgKO3b4lk7E8ixVXhCcONcbVAH8.o2cSRrG', -- bcrypt hash of 'admin123'
    'Super Admin',
    'super_admin',
    '["users.read", "users.write", "marketplace.read", "marketplace.write", "marketplace.moderate", "services.read", "services.write", "services.moderate", "analytics.read", "settings.read", "settings.write", "audit.read", "system.admin"]'::jsonb
)
ON CONFLICT (email) DO NOTHING;

-- Insert sample moderation items for testing
INSERT INTO content_moderation (content_type, content_id, user_id, status, flagged_reason, action_required) VALUES
    ('product', 1, 'user123', 'pending', 'Inappropriate content', true),
    ('service_request', 1, 'user456', 'flagged', 'Spam detected', true),
    ('user_profile', 1, 'user789', 'approved', NULL, false)
ON CONFLICT DO NOTHING;

-- Success message
SELECT 'PostgreSQL schema created successfully! Ready for safe data migration. Admin system included!' as status;

