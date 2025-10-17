-- ADD SPECIFICATION FIELDS TO MARKETPLACE_ITEMS TABLE
-- PROFILE IMAGE TO USERS TABLE
-- AND VERIFICATION TABLES
-- Run this in Supabase SQL Editor to add the missing specification and profile fields

-- Add brand and specifications columns to marketplace_items table
DO $$ 
BEGIN
    -- Add brand column
    BEGIN
        ALTER TABLE marketplace_items ADD COLUMN brand VARCHAR(255);
        RAISE NOTICE 'Column brand added successfully';
    EXCEPTION WHEN duplicate_column THEN 
        RAISE NOTICE 'Column brand already exists';
    END;
    
    -- Add specifications column
    BEGIN
        ALTER TABLE marketplace_items ADD COLUMN specifications JSONB;
        RAISE NOTICE 'Column specifications added successfully';
    EXCEPTION WHEN duplicate_column THEN 
        RAISE NOTICE 'Column specifications already exists';
    END;
    
    -- Add features column (if not exists)
    BEGIN
        ALTER TABLE marketplace_items ADD COLUMN features JSONB;
        RAISE NOTICE 'Column features added successfully';
    EXCEPTION WHEN duplicate_column THEN 
        RAISE NOTICE 'Column features already exists';
    END;
    
    -- Add weight and dimensions columns to marketplace_items table
    BEGIN
        ALTER TABLE marketplace_items ADD COLUMN weight_kg DECIMAL(10,2);
        RAISE NOTICE 'Column weight_kg added successfully';
    EXCEPTION WHEN duplicate_column THEN 
        RAISE NOTICE 'Column weight_kg already exists';
    END;
    
    BEGIN
        ALTER TABLE marketplace_items ADD COLUMN dimensions_cm JSONB;
        RAISE NOTICE 'Column dimensions_cm added successfully';
    EXCEPTION WHEN duplicate_column THEN 
        RAISE NOTICE 'Column dimensions_cm already exists';
    END;

    -- Add structured location fields to marketplace_items table (for nearby functionality)
    BEGIN
        ALTER TABLE marketplace_items ADD COLUMN city VARCHAR(100);
        RAISE NOTICE 'Column city added to marketplace_items successfully';
    EXCEPTION WHEN duplicate_column THEN 
        RAISE NOTICE 'Column city already exists in marketplace_items';
    END;
    
    BEGIN
        ALTER TABLE marketplace_items ADD COLUMN state_province VARCHAR(100);
        RAISE NOTICE 'Column state_province added to marketplace_items successfully';
    EXCEPTION WHEN duplicate_column THEN 
        RAISE NOTICE 'Column state_province already exists in marketplace_items';
    END;
    
    BEGIN
        ALTER TABLE marketplace_items ADD COLUMN pincode VARCHAR(20);
        RAISE NOTICE 'Column pincode added to marketplace_items successfully';
    EXCEPTION WHEN duplicate_column THEN 
        RAISE NOTICE 'Column pincode already exists in marketplace_items';
    END;
    
    BEGIN
        ALTER TABLE marketplace_items ADD COLUMN country VARCHAR(100) DEFAULT 'India';
        RAISE NOTICE 'Column country added to marketplace_items successfully';
    EXCEPTION WHEN duplicate_column THEN 
        RAISE NOTICE 'Column country already exists in marketplace_items';
    END;

    -- Add structured location fields to users table
    BEGIN
        ALTER TABLE users ADD COLUMN city VARCHAR(100);
        RAISE NOTICE 'Column city added successfully';
    EXCEPTION WHEN duplicate_column THEN 
        RAISE NOTICE 'Column city already exists';
    END;
    
    BEGIN
        ALTER TABLE users ADD COLUMN state_province VARCHAR(100);
        RAISE NOTICE 'Column state_province added successfully';
    EXCEPTION WHEN duplicate_column THEN 
        RAISE NOTICE 'Column state_province already exists';
    END;
    
    BEGIN
        ALTER TABLE users ADD COLUMN pincode VARCHAR(20);
        RAISE NOTICE 'Column pincode added successfully';
    EXCEPTION WHEN duplicate_column THEN 
        RAISE NOTICE 'Column pincode already exists';
    END;
    
    BEGIN
        ALTER TABLE users ADD COLUMN country VARCHAR(100) DEFAULT 'India';
        RAISE NOTICE 'Column country added successfully';
    EXCEPTION WHEN duplicate_column THEN 
        RAISE NOTICE 'Column country already exists';
    END;
    
    -- Add profile_image column to users table
    BEGIN
        ALTER TABLE users ADD COLUMN profile_image TEXT;
        RAISE NOTICE 'Column profile_image added successfully';
    EXCEPTION WHEN duplicate_column THEN 
        RAISE NOTICE 'Column profile_image already exists';
    END;
END $$;

-- Create individual_verifications table if it doesn't exist
CREATE TABLE IF NOT EXISTS individual_verifications (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    aadhaar_number VARCHAR(12),
    aadhaar_verified BOOLEAN DEFAULT FALSE,
    aadhaar_verification_date TIMESTAMP,
    pan_number VARCHAR(10),
    pan_verified BOOLEAN DEFAULT FALSE,
    pan_verification_date TIMESTAMP,
    verification_status VARCHAR(20) DEFAULT 'unverified',
    verification_date TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(user_id)
);

-- Create company_verifications table if it doesn't exist
CREATE TABLE IF NOT EXISTS company_verifications (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    company_name VARCHAR(255),
    registration_number VARCHAR(50),
    gst_number VARCHAR(15),
    verification_status VARCHAR(20) DEFAULT 'unverified',
    verification_date TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(user_id)
);

-- Create ngo_verifications table if it doesn't exist
CREATE TABLE IF NOT EXISTS ngo_verifications (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    ngo_name VARCHAR(255),
    registration_number VARCHAR(50),
    registration_type VARCHAR(50),
    fcra_number VARCHAR(50),
    verification_status VARCHAR(20) DEFAULT 'unverified',
    verification_date TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(user_id)
);

-- Create wishlist table if it doesn't exist
CREATE TABLE IF NOT EXISTS wishlist (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    marketplace_item_id INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (marketplace_item_id) REFERENCES marketplace_items(id) ON DELETE CASCADE,
    UNIQUE(user_id, marketplace_item_id)
);

-- Add indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_marketplace_items_brand ON marketplace_items(brand);
CREATE INDEX IF NOT EXISTS idx_marketplace_items_specifications ON marketplace_items USING GIN (specifications);
CREATE INDEX IF NOT EXISTS idx_marketplace_items_city ON marketplace_items(city);
CREATE INDEX IF NOT EXISTS idx_marketplace_items_state_province ON marketplace_items(state_province);
CREATE INDEX IF NOT EXISTS idx_marketplace_items_pincode ON marketplace_items(pincode);
CREATE INDEX IF NOT EXISTS idx_users_profile_image ON users(profile_image);
CREATE INDEX IF NOT EXISTS idx_users_city ON users(city);
CREATE INDEX IF NOT EXISTS idx_users_state_province ON users(state_province);
CREATE INDEX IF NOT EXISTS idx_users_pincode ON users(pincode);
CREATE INDEX IF NOT EXISTS idx_individual_verifications_user_id ON individual_verifications(user_id);
CREATE INDEX IF NOT EXISTS idx_individual_verifications_status ON individual_verifications(verification_status);
CREATE INDEX IF NOT EXISTS idx_company_verifications_user_id ON company_verifications(user_id);
CREATE INDEX IF NOT EXISTS idx_ngo_verifications_user_id ON ngo_verifications(user_id);
CREATE INDEX IF NOT EXISTS idx_wishlist_user_id ON wishlist(user_id);
CREATE INDEX IF NOT EXISTS idx_wishlist_marketplace_item_id ON wishlist(marketplace_item_id);

-- Add comments for documentation
COMMENT ON COLUMN marketplace_items.brand IS 'Product brand or manufacturer name';
COMMENT ON COLUMN marketplace_items.specifications IS 'Additional product specifications as key-value pairs (JSON)';
COMMENT ON COLUMN marketplace_items.features IS 'Product features array (JSON)';
COMMENT ON COLUMN marketplace_items.weight_kg IS 'Product weight in kilograms';
COMMENT ON COLUMN marketplace_items.dimensions_cm IS 'Product dimensions in centimeters (JSON: {length, width, height})';
COMMENT ON COLUMN marketplace_items.city IS 'Item location city for nearby matching';
COMMENT ON COLUMN marketplace_items.state_province IS 'Item location state or province';
COMMENT ON COLUMN marketplace_items.pincode IS 'Item location postal/pin code';
COMMENT ON COLUMN marketplace_items.country IS 'Item location country';
COMMENT ON COLUMN users.profile_image IS 'URL to user profile image';
COMMENT ON COLUMN users.city IS 'User city for location-based matching';
COMMENT ON COLUMN users.state_province IS 'User state or province';
COMMENT ON COLUMN users.pincode IS 'User postal/pin code';
COMMENT ON COLUMN users.country IS 'User country';

COMMENT ON TABLE individual_verifications IS 'Verification records for individual users (Aadhaar & PAN)';
COMMENT ON TABLE company_verifications IS 'Verification records for company users (Registration & GST)';
COMMENT ON TABLE ngo_verifications IS 'Verification records for NGO users (Registration & FCRA)';
COMMENT ON TABLE wishlist IS 'User wishlist for saving favorite marketplace items';

-- Create verified test accounts for demonstration purposes
-- This section adds verification records for the first 3 users (assuming they are test accounts)

DO $$
DECLARE
    test_user_record RECORD;
BEGIN
    -- Get the first 3 users for verification (test accounts)
    FOR test_user_record IN 
        SELECT id, user_type FROM users ORDER BY id LIMIT 3
    LOOP
        -- Verify individual users
        IF test_user_record.user_type = 'individual' THEN
            INSERT INTO individual_verifications (
                user_id, 
                aadhaar_number, 
                aadhaar_verified, 
                aadhaar_verification_date,
                pan_number, 
                pan_verified, 
                pan_verification_date,
                verification_status, 
                verification_date
            ) VALUES (
                test_user_record.id,
                '123456789012', -- Test Aadhaar number
                TRUE,
                NOW(),
                'ABCDE1234F', -- Test PAN number
                TRUE,
                NOW(),
                'verified',
                NOW()
            ) ON CONFLICT (user_id) DO UPDATE SET
                aadhaar_verified = TRUE,
                aadhaar_verification_date = NOW(),
                pan_verified = TRUE,
                pan_verification_date = NOW(),
                verification_status = 'verified',
                verification_date = NOW();
                
            RAISE NOTICE 'Individual user % verified successfully', test_user_record.id;

        -- Verify company users
        ELSIF test_user_record.user_type = 'company' THEN
            INSERT INTO company_verifications (
                user_id,
                company_name,
                registration_number,
                gst_number,
                verification_status,
                verification_date
            ) VALUES (
                test_user_record.id,
                'Test Company Ltd.',
                'CIN12345678901234',
                '12ABCDE3456F1Z5', -- Test GST number
                'verified',
                NOW()
            ) ON CONFLICT (user_id) DO UPDATE SET
                verification_status = 'verified',
                verification_date = NOW();
                
            RAISE NOTICE 'Company user % verified successfully', test_user_record.id;

        -- Verify NGO users
        ELSIF test_user_record.user_type = 'ngo' THEN
            INSERT INTO ngo_verifications (
                user_id,
                ngo_name,
                registration_number,
                registration_type,
                fcra_number,
                verification_status,
                verification_date
            ) VALUES (
                test_user_record.id,
                'Test NGO Foundation',
                'NGO123456789',
                'Society',
                'FCRA231670001', -- Test FCRA number
                'verified',
                NOW()
            ) ON CONFLICT (user_id) DO UPDATE SET
                verification_status = 'verified',
                verification_date = NOW();
                
            RAISE NOTICE 'NGO user % verified successfully', test_user_record.id;
        END IF;
    END LOOP;
    
    RAISE NOTICE 'Test account verification completed successfully';
END $$;

-- Show the updated table structure
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns 
WHERE (table_name = 'marketplace_items' AND column_name IN ('brand', 'specifications', 'features', 'weight_kg', 'dimensions_cm', 'city', 'state_province', 'pincode', 'country'))
   OR (table_name = 'users' AND column_name IN ('profile_image', 'city', 'state_province', 'pincode', 'country'))
   OR table_name IN ('individual_verifications', 'company_verifications', 'ngo_verifications', 'wishlist')
ORDER BY table_name, column_name;