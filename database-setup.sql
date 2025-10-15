-- Run these commands as MySQL root user to set up the database

-- 1. Create the database
CREATE DATABASE IF NOT EXISTS navdrishti 
CHARACTER SET utf8mb4 
COLLATE utf8mb4_unicode_ci;

-- 2. Create the user and grant permissions
CREATE USER IF NOT EXISTS 'navdrishti_user'@'localhost' IDENTIFIED BY 'Shubhendu@0205';
GRANT ALL PRIVILEGES ON navdrishti.* TO 'navdrishti_user'@'localhost';
FLUSH PRIVILEGES;

-- 3. Use the database
USE navdrishti;

-- 4. Create all the required tables
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  user_type ENUM('individual', 'ngo', 'company') NOT NULL,
  name VARCHAR(255) NOT NULL,
  verification_status ENUM('pending', 'verified', 'rejected') DEFAULT 'pending',
  verification_level ENUM('basic', 'advanced') DEFAULT 'basic',
  verified_at TIMESTAMP NULL,
  profile_data JSON,
  last_login TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_email (email),
  INDEX idx_user_type (user_type),
  INDEX idx_verification_status (verification_status)
);

CREATE TABLE IF NOT EXISTS user_sessions (
  id VARCHAR(36) PRIMARY KEY,
  user_id INT NOT NULL,
  user_type ENUM('individual', 'ngo', 'company') NOT NULL,
  session_data JSON NOT NULL,
  ip_address VARCHAR(45),
  user_agent TEXT,
  device_info JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NOT NULL,
  INDEX idx_user_id (user_id),
  INDEX idx_expires_at (expires_at),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS login_history (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  session_id VARCHAR(36),
  ip_address VARCHAR(45),
  user_agent TEXT,
  device_info JSON,
  login_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  status ENUM('success', 'failed') NOT NULL,
  failure_reason VARCHAR(255),
  INDEX idx_user_id (user_id),
  INDEX idx_login_time (login_time),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS individual_verifications (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  aadhaar_number VARCHAR(12),
  pan_number VARCHAR(10),
  verification_status ENUM('pending', 'verified', 'rejected') DEFAULT 'pending',
  aadhaar_verified BOOLEAN DEFAULT FALSE,
  pan_verified BOOLEAN DEFAULT FALSE,
  verification_data JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_user_id (user_id),
  INDEX idx_verification_status (verification_status),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS ngo_verifications (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  organization_name VARCHAR(255),
  registration_number VARCHAR(100),
  registration_type ENUM('80G', '12A', 'FCRA', 'Other') DEFAULT 'Other',
  gst_number VARCHAR(15),
  pan_number VARCHAR(10),
  verification_status ENUM('pending', 'verified', 'rejected') DEFAULT 'pending',
  gst_verified BOOLEAN DEFAULT FALSE,
  pan_verified BOOLEAN DEFAULT FALSE,
  registration_verified BOOLEAN DEFAULT FALSE,
  verification_data JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_user_id (user_id),
  INDEX idx_verification_status (verification_status),
  INDEX idx_registration_number (registration_number),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS company_verifications (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  company_name VARCHAR(255),
  cin_number VARCHAR(21),
  company_type ENUM('Private Limited', 'Public Limited', 'LLP', 'Partnership', 'Sole Proprietorship', 'Other') DEFAULT 'Private Limited',
  gst_number VARCHAR(15),
  pan_number VARCHAR(10),
  verification_status ENUM('pending', 'verified', 'rejected') DEFAULT 'pending',
  gst_verified BOOLEAN DEFAULT FALSE,
  pan_verified BOOLEAN DEFAULT FALSE,
  cin_verified BOOLEAN DEFAULT FALSE,
  verification_data JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_user_id (user_id),
  INDEX idx_verification_status (verification_status),
  INDEX idx_cin_number (cin_number),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS service_offers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  ngo_id INT NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  category VARCHAR(100) NOT NULL,
  tags JSON,
  price_type ENUM('free', 'fixed', 'donation', 'negotiable') DEFAULT 'free',
  price_amount DECIMAL(10,2) DEFAULT 0,
  duration_hours INT,
  location VARCHAR(255),
  requirements JSON,
  status ENUM('active', 'paused', 'completed', 'cancelled') DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_ngo_id (ngo_id),
  INDEX idx_category (category),
  INDEX idx_status (status),
  INDEX idx_created_at (created_at),
  FOREIGN KEY (ngo_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS service_requests (
  id INT AUTO_INCREMENT PRIMARY KEY,
  ngo_id INT NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  category VARCHAR(100) NOT NULL,
  tags JSON,
  urgency_level ENUM('low', 'medium', 'high', 'critical') DEFAULT 'medium',
  volunteers_needed INT DEFAULT 1,
  duration_hours INT,
  location VARCHAR(255),
  requirements JSON,
  status ENUM('active', 'in_progress', 'completed', 'cancelled') DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_ngo_id (ngo_id),
  INDEX idx_category (category),
  INDEX idx_status (status),
  INDEX idx_urgency_level (urgency_level),
  INDEX idx_created_at (created_at),
  FOREIGN KEY (ngo_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS service_hires (
  id INT AUTO_INCREMENT PRIMARY KEY,
  service_offer_id INT NOT NULL,
  client_id INT NOT NULL,
  client_type ENUM('individual', 'company') NOT NULL,
  message TEXT,
  status ENUM('pending', 'accepted', 'rejected', 'active', 'completed', 'cancelled') DEFAULT 'pending',
  start_date DATE,
  end_date DATE,
  amount_paid DECIMAL(10,2) DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_service_offer_id (service_offer_id),
  INDEX idx_client_id (client_id),
  INDEX idx_status (status),
  INDEX idx_created_at (created_at),
  FOREIGN KEY (service_offer_id) REFERENCES service_offers(id) ON DELETE CASCADE,
  FOREIGN KEY (client_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS service_volunteers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  service_request_id INT NOT NULL,
  volunteer_id INT NOT NULL,
  volunteer_type ENUM('individual', 'company') NOT NULL,
  message TEXT,
  status ENUM('pending', 'accepted', 'rejected', 'active', 'completed', 'cancelled') DEFAULT 'pending',
  start_date DATE,
  end_date DATE,
  hours_contributed INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_service_request_id (service_request_id),
  INDEX idx_volunteer_id (volunteer_id),
  INDEX idx_status (status),
  INDEX idx_created_at (created_at),
  FOREIGN KEY (service_request_id) REFERENCES service_requests(id) ON DELETE CASCADE,
  FOREIGN KEY (volunteer_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS marketplace_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  seller_id INT NOT NULL,
  seller_type ENUM('individual', 'ngo', 'company') NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  category VARCHAR(100) NOT NULL,
  tags JSON,
  price DECIMAL(10,2) NOT NULL,
  quantity INT DEFAULT 1,
  condition_type ENUM('new', 'like_new', 'good', 'fair', 'poor') DEFAULT 'good',
  location VARCHAR(255),
  contact_info JSON,
  images JSON,
  status ENUM('active', 'sold', 'paused', 'removed') DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_seller_id (seller_id),
  INDEX idx_category (category),
  INDEX idx_status (status),
  INDEX idx_price (price),
  INDEX idx_created_at (created_at),
  FOREIGN KEY (seller_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS marketplace_purchases (
  id INT AUTO_INCREMENT PRIMARY KEY,
  marketplace_item_id INT NOT NULL,
  buyer_id INT NOT NULL,
  buyer_type ENUM('individual', 'ngo', 'company') NOT NULL,
  seller_id INT NOT NULL,
  quantity INT NOT NULL DEFAULT 1,
  unit_price DECIMAL(10,2) NOT NULL,
  total_amount DECIMAL(10,2) NOT NULL,
  shipping_address JSON,
  payment_method ENUM('cash', 'upi', 'card', 'bank_transfer') DEFAULT 'cash',
  status ENUM('pending', 'confirmed', 'shipped', 'delivered', 'cancelled', 'refunded') DEFAULT 'pending',
  order_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  delivery_date TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_marketplace_item_id (marketplace_item_id),
  INDEX idx_buyer_id (buyer_id),
  INDEX idx_seller_id (seller_id),
  INDEX idx_status (status),
  INDEX idx_order_date (order_date),
  FOREIGN KEY (marketplace_item_id) REFERENCES marketplace_items(id) ON DELETE CASCADE,
  FOREIGN KEY (buyer_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (seller_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS notifications (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  type ENUM('info', 'success', 'warning', 'error') DEFAULT 'info',
  category ENUM('system', 'service', 'marketplace', 'verification', 'general') DEFAULT 'general',
  read_status BOOLEAN DEFAULT FALSE,
  action_url VARCHAR(500),
  metadata JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  read_at TIMESTAMP NULL,
  INDEX idx_user_id (user_id),
  INDEX idx_read_status (read_status),
  INDEX idx_type (type),
  INDEX idx_category (category),
  INDEX idx_created_at (created_at),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Insert some sample data to test the system
INSERT INTO users (email, password, user_type, name, verification_status) VALUES
('test@ngo.com', '$2b$10$example', 'ngo', 'Test NGO', 'verified'),
('test@individual.com', '$2b$10$example', 'individual', 'Test Individual', 'verified'),
('test@company.com', '$2b$10$example', 'company', 'Test Company', 'verified');

INSERT INTO service_offers (ngo_id, title, description, category, tags, price_type, location) VALUES
(1, 'Community Education Program', 'Providing basic education to underprivileged children', 'Education & Training', '["education", "children", "community"]', 'free', 'Delhi'),
(1, 'Healthcare Workshop', 'Health awareness and basic medical checkup services', 'Healthcare', '["health", "medical", "awareness"]', 'donation', 'Mumbai');

INSERT INTO service_requests (ngo_id, title, description, category, tags, urgency_level, volunteers_needed, location) VALUES
(1, 'Food Distribution Drive', 'Need volunteers for weekend food distribution in slum areas', 'Community Development', '["food", "volunteers", "distribution"]', 'high', 5, 'Delhi'),
(1, 'Tree Plantation Campaign', 'Environmental initiative requiring volunteers for tree planting', 'Environment', '["environment", "trees", "plantation"]', 'medium', 10, 'Bangalore');

INSERT INTO marketplace_items (seller_id, seller_type, title, description, category, tags, price, location) VALUES
(1, 'ngo', 'Educational Books Set', 'Collection of educational books for primary school students', 'Education', '["books", "education", "children"]', 500.00, 'Delhi'),
(2, 'individual', 'Laptop for Students', 'Used laptop in good condition, suitable for online learning', 'Electronics', '["laptop", "electronics", "education"]', 15000.00, 'Mumbai');

-- Show success message
SELECT 'Database setup completed successfully!' as message;