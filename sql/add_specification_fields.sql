-- ADD SPECIFICATION FIELDS TO MARKETPLACE_ITEMS TABLE
-- AND PROFILE IMAGE TO USERS TABLE
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

-- Add indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_marketplace_items_brand ON marketplace_items(brand);
CREATE INDEX IF NOT EXISTS idx_marketplace_items_specifications ON marketplace_items USING GIN (specifications);
CREATE INDEX IF NOT EXISTS idx_users_profile_image ON users(profile_image);

-- Add comments for documentation
COMMENT ON COLUMN marketplace_items.brand IS 'Product brand or manufacturer name';
COMMENT ON COLUMN marketplace_items.specifications IS 'Additional product specifications as key-value pairs (JSON)';
COMMENT ON COLUMN marketplace_items.features IS 'Product features array (JSON)';
COMMENT ON COLUMN marketplace_items.weight_kg IS 'Product weight in kilograms';
COMMENT ON COLUMN marketplace_items.dimensions_cm IS 'Product dimensions in centimeters (JSON: {length, width, height})';
COMMENT ON COLUMN users.profile_image IS 'URL to user profile image';

-- Show the updated table structure
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns 
WHERE (table_name = 'marketplace_items' AND column_name IN ('brand', 'specifications', 'features', 'weight_kg', 'dimensions_cm'))
   OR (table_name = 'users' AND column_name = 'profile_image')
ORDER BY table_name, column_name;