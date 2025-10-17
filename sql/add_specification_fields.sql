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

-- Add indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_marketplace_items_brand ON marketplace_items(brand);
CREATE INDEX IF NOT EXISTS idx_marketplace_items_specifications ON marketplace_items USING GIN (specifications);
CREATE INDEX IF NOT EXISTS idx_users_profile_image ON users(profile_image);
CREATE INDEX IF NOT EXISTS idx_individual_verifications_user_id ON individual_verifications(user_id);
CREATE INDEX IF NOT EXISTS idx_individual_verifications_status ON individual_verifications(verification_status);
CREATE INDEX IF NOT EXISTS idx_company_verifications_user_id ON company_verifications(user_id);
CREATE INDEX IF NOT EXISTS idx_ngo_verifications_user_id ON ngo_verifications(user_id);

-- Add comments for documentation
COMMENT ON COLUMN marketplace_items.brand IS 'Product brand or manufacturer name';
COMMENT ON COLUMN marketplace_items.specifications IS 'Additional product specifications as key-value pairs (JSON)';
COMMENT ON COLUMN marketplace_items.features IS 'Product features array (JSON)';
COMMENT ON COLUMN marketplace_items.weight_kg IS 'Product weight in kilograms';
COMMENT ON COLUMN marketplace_items.dimensions_cm IS 'Product dimensions in centimeters (JSON: {length, width, height})';
COMMENT ON COLUMN users.profile_image IS 'URL to user profile image';

COMMENT ON TABLE individual_verifications IS 'Verification records for individual users (Aadhaar & PAN)';
COMMENT ON TABLE company_verifications IS 'Verification records for company users (Registration & GST)';
COMMENT ON TABLE ngo_verifications IS 'Verification records for NGO users (Registration & FCRA)';

-- Show the updated table structure
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns 
WHERE (table_name = 'marketplace_items' AND column_name IN ('brand', 'specifications', 'features', 'weight_kg', 'dimensions_cm'))
   OR (table_name = 'users' AND column_name = 'profile_image')
   OR table_name IN ('individual_verifications', 'company_verifications', 'ngo_verifications')
ORDER BY table_name, column_name;