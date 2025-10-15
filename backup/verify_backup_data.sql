-- Quick verification that your backup contains data
-- Run this in MySQL to check what was backed up

USE navdrishti;

-- Check table counts
SELECT 
  TABLE_NAME,
  TABLE_ROWS as 'Estimated Rows'
FROM 
  information_schema.TABLES 
WHERE 
  TABLE_SCHEMA = 'navdrishti' 
  AND TABLE_TYPE = 'BASE TABLE'
ORDER BY TABLE_ROWS DESC;

-- Check actual counts for key tables
SELECT 'users' as table_name, COUNT(*) as actual_count FROM users
UNION ALL
SELECT 'marketplace_items', COUNT(*) FROM marketplace_items
UNION ALL  
SELECT 'service_requests', COUNT(*) FROM service_requests
UNION ALL
SELECT 'service_offers', COUNT(*) FROM service_offers
UNION ALL
SELECT 'cart', COUNT(*) FROM cart
UNION ALL
SELECT 'orders', COUNT(*) FROM orders;