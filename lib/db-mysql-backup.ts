// Database connection utility
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

// Create MySQL connection pool
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306'),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'navdrishti',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Helper function to execute SQL queries
export async function executeQuery({ query, values = [] }: { query: string; values?: any[] }) {
  try {
    // Use .query() instead of .execute() to avoid prepared statement issues
    const [results] = await pool.query(query, values);
    return results;
  } catch (error) {
    console.error('Database query error:', error);
    throw error;
  }
}

// Helper function to execute SQL queries silently (for migrations that may fail)
async function executeSilentQuery({ query, values = [] }: { query: string; values?: any[] }) {
  try {
    const [results] = await pool.query(query, values);
    return results;
  } catch (error: any) {
    // Only throw if it's not a duplicate column error
    if (error.code !== 'ER_DUP_FIELDNAME') {
      console.error('Database query error:', error);
      throw error;
    }
    // Silently ignore duplicate column errors
    return null;
  }
}

// Initialize database tables if they don't exist
export async function initializeDatabase() {
  try {
    // Create users table
    await executeQuery({
      query: `CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        email VARCHAR(255) NOT NULL UNIQUE,
        password VARCHAR(255) NOT NULL,
        user_type ENUM('individual', 'ngo', 'company') NOT NULL,
        name VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX (email),
        INDEX (user_type)
      )`
    });

    // Create user_profiles table for additional info based on user type
    await executeQuery({
      query: `CREATE TABLE IF NOT EXISTS user_profiles (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        profile_data JSON NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )`
    });

    // Create marketplace_items table
    await executeQuery({
      query: `CREATE TABLE IF NOT EXISTS marketplace_items (
        id INT AUTO_INCREMENT PRIMARY KEY,
        seller_id INT NOT NULL,
        seller_type ENUM('individual', 'ngo', 'company') NOT NULL,
        title VARCHAR(255) NOT NULL,
        description TEXT NOT NULL,
        category VARCHAR(100) NOT NULL,
        subcategory VARCHAR(100),
        brand VARCHAR(100),
        tags JSON,
        price DECIMAL(10,2) NOT NULL,
        compare_price DECIMAL(10,2),
        quantity INT DEFAULT 1,
        condition_type ENUM('new', 'like_new', 'good', 'fair', 'poor') DEFAULT 'good',
        location VARCHAR(255),
        contact_info JSON,
        images JSON,
        weight_kg DECIMAL(5,2) DEFAULT 1.0,
        dimensions_cm JSON,
        variants JSON,
        specifications JSON,
        features JSON,
        warranty_months INT DEFAULT 0,
        return_policy_days INT DEFAULT 7,
        status ENUM('active', 'sold', 'paused', 'removed') DEFAULT 'active',
        featured BOOLEAN DEFAULT FALSE,
        rating_average DECIMAL(2,1) DEFAULT 0,
        rating_count INT DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_seller_id (seller_id),
        INDEX idx_category (category),
        INDEX idx_subcategory (subcategory),
        INDEX idx_brand (brand),
        INDEX idx_status (status),
        INDEX idx_price (price),
        INDEX idx_featured (featured),
        INDEX idx_rating_average (rating_average),
        INDEX idx_created_at (created_at),
        FOREIGN KEY (seller_id) REFERENCES users(id) ON DELETE CASCADE
      )`
    });

    // Create orders table
    await executeQuery({
      query: `CREATE TABLE IF NOT EXISTS orders (
        id INT AUTO_INCREMENT PRIMARY KEY,
        order_number VARCHAR(50) NOT NULL UNIQUE,
        buyer_id INT NOT NULL,
        seller_id INT NOT NULL,
        total_amount DECIMAL(10,2) NOT NULL,
        shipping_amount DECIMAL(10,2) DEFAULT 0,
        tax_amount DECIMAL(10,2) DEFAULT 0,
        discount_amount DECIMAL(10,2) DEFAULT 0,
        final_amount DECIMAL(10,2) NOT NULL,
        status ENUM('pending', 'payment_pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded') DEFAULT 'pending',
        shipping_address JSON NOT NULL,
        billing_address JSON,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_order_number (order_number),
        INDEX idx_buyer_id (buyer_id),
        INDEX idx_seller_id (seller_id),
        INDEX idx_status (status),
        INDEX idx_created_at (created_at),
        FOREIGN KEY (buyer_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (seller_id) REFERENCES users(id) ON DELETE CASCADE
      )`
    });

    // Create order_items table
    await executeQuery({
      query: `CREATE TABLE IF NOT EXISTS order_items (
        id INT AUTO_INCREMENT PRIMARY KEY,
        order_id INT NOT NULL,
        marketplace_item_id INT NOT NULL,
        quantity INT NOT NULL DEFAULT 1,
        unit_price DECIMAL(10,2) NOT NULL,
        total_price DECIMAL(10,2) NOT NULL,
        item_snapshot JSON NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_order_id (order_id),
        INDEX idx_marketplace_item_id (marketplace_item_id),
        FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
        FOREIGN KEY (marketplace_item_id) REFERENCES marketplace_items(id) ON DELETE CASCADE
      )`
    });

    // Create payments table
    await executeQuery({
      query: `CREATE TABLE IF NOT EXISTS payments (
        id INT AUTO_INCREMENT PRIMARY KEY,
        order_id INT NOT NULL,
        payment_id VARCHAR(100) NOT NULL UNIQUE,
        razorpay_payment_id VARCHAR(100),
        razorpay_order_id VARCHAR(100),
        amount DECIMAL(10,2) NOT NULL,
        currency VARCHAR(3) DEFAULT 'INR',
        status ENUM('created', 'attempted', 'captured', 'failed', 'cancelled', 'refunded') DEFAULT 'created',
        payment_method VARCHAR(50),
        gateway_response JSON,
        failure_reason TEXT,
        captured_at TIMESTAMP NULL,
        refunded_at TIMESTAMP NULL,
        refund_amount DECIMAL(10,2) DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_order_id (order_id),
        INDEX idx_payment_id (payment_id),
        INDEX idx_razorpay_payment_id (razorpay_payment_id),
        INDEX idx_status (status),
        INDEX idx_created_at (created_at),
        FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
      )`
    });

    // Create shipping_details table
    await executeQuery({
      query: `CREATE TABLE IF NOT EXISTS shipping_details (
        id INT AUTO_INCREMENT PRIMARY KEY,
        order_id INT NOT NULL,
        delhivery_waybill VARCHAR(100),
        delhivery_order_id VARCHAR(100),
        pickup_date TIMESTAMP NULL,
        expected_delivery TIMESTAMP NULL,
        actual_delivery TIMESTAMP NULL,
        tracking_status VARCHAR(50),
        tracking_updates JSON,
        courier_partner VARCHAR(100),
        weight_kg DECIMAL(5,2),
        dimensions_cm JSON,
        pickup_address JSON,
        delivery_address JSON,
        charges_breakdown JSON,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_order_id (order_id),
        INDEX idx_delhivery_waybill (delhivery_waybill),
        INDEX idx_tracking_status (tracking_status),
        INDEX idx_pickup_date (pickup_date),
        INDEX idx_expected_delivery (expected_delivery),
        FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
      )`
    });

    // Create order_status_history table
    await executeQuery({
      query: `CREATE TABLE IF NOT EXISTS order_status_history (
        id INT AUTO_INCREMENT PRIMARY KEY,
        order_id INT NOT NULL,
        previous_status VARCHAR(50),
        new_status VARCHAR(50) NOT NULL,
        changed_by INT,
        reason TEXT,
        metadata JSON,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_order_id (order_id),
        INDEX idx_created_at (created_at),
        FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
        FOREIGN KEY (changed_by) REFERENCES users(id) ON DELETE SET NULL
      )`
    });

    // Create product_reviews table
    await executeQuery({
      query: `CREATE TABLE IF NOT EXISTS product_reviews (
        id INT AUTO_INCREMENT PRIMARY KEY,
        marketplace_item_id INT NOT NULL,
        user_id INT NOT NULL,
        order_id INT,
        rating INT NOT NULL CHECK (rating >= 1 AND rating <= 5),
        title VARCHAR(255),
        review_text TEXT,
        images JSON,
        verified_purchase BOOLEAN DEFAULT FALSE,
        helpful_count INT DEFAULT 0,
        status ENUM('pending', 'approved', 'rejected') DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_marketplace_item_id (marketplace_item_id),
        INDEX idx_user_id (user_id),
        INDEX idx_rating (rating),
        INDEX idx_status (status),
        INDEX idx_created_at (created_at),
        FOREIGN KEY (marketplace_item_id) REFERENCES marketplace_items(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL,
        UNIQUE KEY unique_user_product_review (user_id, marketplace_item_id)
      )`
    });

    // Create product_questions table
    await executeQuery({
      query: `CREATE TABLE IF NOT EXISTS product_questions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        marketplace_item_id INT NOT NULL,
        user_id INT NOT NULL,
        question TEXT NOT NULL,
        answer TEXT,
        answered_by INT,
        status ENUM('pending', 'answered', 'closed') DEFAULT 'pending',
        helpful_count INT DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        answered_at TIMESTAMP NULL,
        INDEX idx_marketplace_item_id (marketplace_item_id),
        INDEX idx_user_id (user_id),
        INDEX idx_status (status),
        INDEX idx_created_at (created_at),
        FOREIGN KEY (marketplace_item_id) REFERENCES marketplace_items(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (answered_by) REFERENCES users(id) ON DELETE SET NULL
      )`
    });

    // Create wishlists table
    await executeQuery({
      query: `CREATE TABLE IF NOT EXISTS wishlists (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        marketplace_item_id INT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_user_id (user_id),
        INDEX idx_marketplace_item_id (marketplace_item_id),
        INDEX idx_created_at (created_at),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (marketplace_item_id) REFERENCES marketplace_items(id) ON DELETE CASCADE,
        UNIQUE KEY unique_user_wishlist (user_id, marketplace_item_id)
      )`
    });

    // Create cart table
    await executeQuery({
      query: `CREATE TABLE IF NOT EXISTS cart (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        marketplace_item_id INT NOT NULL,
        quantity INT NOT NULL DEFAULT 1,
        variant_selection JSON,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_user_id (user_id),
        INDEX idx_marketplace_item_id (marketplace_item_id),
        INDEX idx_created_at (created_at),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (marketplace_item_id) REFERENCES marketplace_items(id) ON DELETE CASCADE
      )`
    });

    // Create notifications table
    await executeQuery({
      query: `CREATE TABLE IF NOT EXISTS notifications (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        title VARCHAR(255) NOT NULL,
        message TEXT NOT NULL,
        type ENUM('info', 'success', 'warning', 'error') DEFAULT 'info',
        category ENUM('order', 'payment', 'shipping', 'system', 'marketplace') DEFAULT 'system',
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
      )`
    });

    // Create individual_verifications table
    await executeQuery({
      query: `CREATE TABLE IF NOT EXISTS individual_verifications (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        aadhaar_number VARCHAR(12),
        aadhaar_verified BOOLEAN DEFAULT FALSE,
        aadhaar_verification_date TIMESTAMP NULL,
        pan_number VARCHAR(10),
        pan_verified BOOLEAN DEFAULT FALSE,
        pan_verification_date TIMESTAMP NULL,
        digilocker_token TEXT,
        verification_status ENUM('unverified', 'pending', 'verified', 'rejected') DEFAULT 'unverified',
        verification_level ENUM('basic', 'advanced') DEFAULT 'basic',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_user_id (user_id),
        INDEX idx_verification_status (verification_status),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE KEY unique_user_verification (user_id)
      )`
    });

    // Create company_verifications table
    await executeQuery({
      query: `CREATE TABLE IF NOT EXISTS company_verifications (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        company_name VARCHAR(255),
        gst_number VARCHAR(15),
        gst_verified BOOLEAN DEFAULT FALSE,
        gst_verification_date TIMESTAMP NULL,
        pan_number VARCHAR(10),
        pan_verified BOOLEAN DEFAULT FALSE,
        pan_verification_date TIMESTAMP NULL,
        cin_number VARCHAR(21),
        cin_verified BOOLEAN DEFAULT FALSE,
        cin_verification_date TIMESTAMP NULL,
        verification_status ENUM('unverified', 'pending', 'verified', 'rejected') DEFAULT 'unverified',
        verification_level ENUM('basic', 'advanced') DEFAULT 'basic',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_user_id (user_id),
        INDEX idx_verification_status (verification_status),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE KEY unique_company_verification (user_id)
      )`
    });

    // Create ngo_verifications table
    await executeQuery({
      query: `CREATE TABLE IF NOT EXISTS ngo_verifications (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        ngo_name VARCHAR(255),
        registration_number VARCHAR(50),
        registration_verified BOOLEAN DEFAULT FALSE,
        registration_verification_date TIMESTAMP NULL,
        pan_number VARCHAR(10),
        pan_verified BOOLEAN DEFAULT FALSE,
        pan_verification_date TIMESTAMP NULL,
        fcra_number VARCHAR(20),
        fcra_verified BOOLEAN DEFAULT FALSE,
        fcra_verification_date TIMESTAMP NULL,
        verification_status ENUM('unverified', 'pending', 'verified', 'rejected') DEFAULT 'unverified',
        verification_level ENUM('basic', 'advanced') DEFAULT 'basic',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_user_id (user_id),
        INDEX idx_verification_status (verification_status),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE KEY unique_ngo_verification (user_id)
      )`
    });

    // Create user portfolios table
    await executeSilentQuery({
      query: `CREATE TABLE IF NOT EXISTS user_portfolios (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        description TEXT,
        certifications TEXT,
        project_photos JSON,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_user_id (user_id),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE KEY unique_user_portfolio (user_id)
      )`
    });

    // Add verification columns to users table if they don't exist
    await executeSilentQuery({
      query: `ALTER TABLE users 
        ADD COLUMN verification_status ENUM('unverified', 'pending', 'verified', 'rejected') DEFAULT 'unverified'`
    });

    await executeSilentQuery({
      query: `ALTER TABLE users 
        ADD COLUMN verification_level ENUM('basic', 'advanced') DEFAULT 'basic'`
    });

    await executeSilentQuery({
      query: `ALTER TABLE users 
        ADD COLUMN verified_at TIMESTAMP NULL`
    });

    await executeSilentQuery({
      query: `ALTER TABLE users 
        ADD COLUMN email_verified BOOLEAN DEFAULT FALSE`
    });

    await executeSilentQuery({
      query: `ALTER TABLE users 
        ADD COLUMN phone_verified BOOLEAN DEFAULT FALSE`
    });

    await executeSilentQuery({
      query: `ALTER TABLE users 
        ADD COLUMN identity_verified BOOLEAN DEFAULT FALSE`
    });

    // Add missing columns to existing tables (migrations)
    await executeSilentQuery({
      query: `ALTER TABLE marketplace_items ADD COLUMN compare_price DECIMAL(10,2) AFTER price`
    });

    console.log('Database tables initialized successfully');
    return true;
  } catch (error) {
    console.error('Failed to initialize database tables:', error);
    return false;
  }
}

export default pool;