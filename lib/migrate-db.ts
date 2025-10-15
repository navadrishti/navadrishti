import { executeQuery } from '@/lib/db';

export async function migrateDatabase() {
  try {
    console.log('Starting database migration...');

    // Add missing columns to marketplace_items table
    const migrations = [
      {
        name: 'Add compare_price column',
        query: 'ALTER TABLE marketplace_items ADD COLUMN compare_price DECIMAL(10,2) AFTER price'
      },
      {
        name: 'Add subcategory column',
        query: 'ALTER TABLE marketplace_items ADD COLUMN subcategory VARCHAR(100) AFTER category'
      },
      {
        name: 'Add rating_average column',
        query: 'ALTER TABLE marketplace_items ADD COLUMN rating_average DECIMAL(2,1) DEFAULT 0 AFTER status'
      },
      {
        name: 'Add rating_count column',
        query: 'ALTER TABLE marketplace_items ADD COLUMN rating_count INT DEFAULT 0 AFTER rating_average'
      },
      {
        name: 'Add variants column',
        query: 'ALTER TABLE marketplace_items ADD COLUMN variants JSON AFTER dimensions_cm'
      },
      {
        name: 'Add weight_kg column',
        query: 'ALTER TABLE marketplace_items ADD COLUMN weight_kg DECIMAL(5,2) DEFAULT 1.0 AFTER images'
      },
      {
        name: 'Add dimensions_cm column',
        query: 'ALTER TABLE marketplace_items ADD COLUMN dimensions_cm JSON AFTER weight_kg'
      }
    ];

    for (const migration of migrations) {
      try {
        await executeQuery({ query: migration.query });
        console.log(`✅ ${migration.name} - Success`);
      } catch (error: any) {
        if (error.code === 'ER_DUP_FIELDNAME') {
          console.log(`⚠️ ${migration.name} - Column already exists`);
        } else {
          console.error(`❌ ${migration.name} - Error:`, error.message);
        }
      }
    }

    // Ensure cart table has proper structure
    try {
      await executeQuery({
        query: `CREATE TABLE IF NOT EXISTS cart (
          id INT AUTO_INCREMENT PRIMARY KEY,
          user_id INT NOT NULL,
          marketplace_item_id INT NOT NULL,
          quantity INT DEFAULT 1,
          variant_selection JSON,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          INDEX idx_user_id (user_id),
          INDEX idx_marketplace_item_id (marketplace_item_id),
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
          FOREIGN KEY (marketplace_item_id) REFERENCES marketplace_items(id) ON DELETE CASCADE,
          UNIQUE KEY unique_user_item_variant (user_id, marketplace_item_id, variant_selection(255))
        )`
      });
      console.log('✅ Cart table structure verified');
    } catch (error) {
      console.error('❌ Cart table error:', error);
    }

    console.log('Database migration completed!');
    return { success: true };

  } catch (error) {
    console.error('Migration failed:', error);
    return { success: false, error };
  }
}