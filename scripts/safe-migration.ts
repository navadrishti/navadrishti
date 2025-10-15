// Safe MySQL to PostgreSQL Data Migration Script
// This script prevents data loss by using UPSERT operations

import mysql from 'mysql2/promise';
import { config } from 'dotenv';
import { join } from 'path';

// Load environment variables from .env.local
config({ path: join(process.cwd(), '.env.local') });

// Types for safe migration
interface MigrationConfig {
  mysql: {
    host: string;
    user: string;
    password: string;
    database: string;
  };
  supabase: {
    url: string;
    serviceRoleKey: string;
  };
}

interface MigrationResult {
  table: string;
  totalRecords: number;
  migratedRecords: number;
  failedRecords: number;
  errors: string[];
}

class SafeMigration {
  private mysqlConnection: mysql.Connection | null = null;
  private supabaseClient: any = null;

  constructor(private config: MigrationConfig) {}

  async initialize() {
    // Connect to MySQL
    this.mysqlConnection = await mysql.createConnection(this.config.mysql);
    
    // Initialize Supabase client
    try {
      const { createClient } = require('@supabase/supabase-js');
      this.supabaseClient = createClient(
        this.config.supabase.url,
        this.config.supabase.serviceRoleKey
      );
      console.log('✅ Connected to Supabase successfully');
    } catch (error) {
      console.error('❌ Failed to connect to Supabase:', error);
      throw new Error('Please install @supabase/supabase-js: npm install @supabase/supabase-js');
    }
  }

  // Safe UPSERT function that prevents data loss
  async safeUpsert(tableName: string, records: any[]): Promise<MigrationResult> {
    const result: MigrationResult = {
      table: tableName,
      totalRecords: records.length,
      migratedRecords: 0,
      failedRecords: 0,
      errors: []
    };

    if (!this.supabaseClient) {
      throw new Error('Supabase client not initialized');
    }

    console.log(`\n🔄 Migrating ${records.length} records to ${tableName}...`);

    for (let i = 0; i < records.length; i++) {
      const record = records[i];
      
      try {
        // Convert MySQL data types to PostgreSQL compatible format
        const convertedRecord = this.convertDataTypes(record, tableName);
        
        // Use UPSERT (INSERT ... ON CONFLICT UPDATE)
        const { error } = await this.supabaseClient
          .from(tableName)
          .upsert(convertedRecord, { 
            onConflict: 'id',
            ignoreDuplicates: false  // This ensures UPDATE on conflict
          });

        if (error) {
          throw error;
        }

        result.migratedRecords++;
        
        // Progress indicator
        if ((i + 1) % 100 === 0 || i === records.length - 1) {
          console.log(`   📊 Progress: ${i + 1}/${records.length} (${Math.round((i + 1) / records.length * 100)}%)`);
        }

      } catch (error: any) {
        result.failedRecords++;
        result.errors.push(`Record ${i + 1}: ${error.message}`);
        
        // Log error but continue migration
        console.error(`   ❌ Failed to migrate record ${i + 1}:`, error.message);
      }
    }

    return result;
  }

  // Convert MySQL data types to PostgreSQL compatible format
  private convertDataTypes(record: any, tableName: string): any {
    const converted = { ...record };

    // Convert timestamps
    Object.keys(converted).forEach(key => {
      if (converted[key] instanceof Date) {
        converted[key] = converted[key].toISOString();
      }
      
      // Convert MySQL JSON strings to objects if needed
      if (typeof converted[key] === 'string' && 
          (key.includes('data') || key.includes('info') || key.includes('selection'))) {
        try {
          converted[key] = JSON.parse(converted[key]);
        } catch {
          // Not JSON, keep as string
        }
      }
    });

    return converted;
  }

  // Get all data from MySQL table
  async getMySQLData(tableName: string): Promise<any[]> {
    if (!this.mysqlConnection) {
      throw new Error('MySQL connection not initialized');
    }

    const [rows] = await this.mysqlConnection.execute(`SELECT * FROM ${tableName}`);
    return rows as any[];
  }

  // Verify data integrity after migration
  async verifyMigration(tableName: string): Promise<{
    mysqlCount: number;
    postgresCount: number;
    match: boolean;
  }> {
    if (!this.mysqlConnection || !this.supabaseClient) {
      throw new Error('Connections not initialized');
    }

    // Count MySQL records
    const [mysqlResult] = await this.mysqlConnection.execute(
      `SELECT COUNT(*) as count FROM ${tableName}`
    );
    const mysqlCount = (mysqlResult as any)[0].count;

    // Count PostgreSQL records
    const { count: postgresCount, error } = await this.supabaseClient
      .from(tableName)
      .select('*', { count: 'exact', head: true });

    if (error) {
      throw error;
    }

    return {
      mysqlCount,
      postgresCount: postgresCount || 0,
      match: mysqlCount === (postgresCount || 0)
    };
  }

  // Main migration function
  async migrate(): Promise<MigrationResult[]> {
    const results: MigrationResult[] = [];
    
    // Define migration order (respecting foreign key constraints)
    const migrationOrder = [
      'users',
      'user_sessions',
      'login_history',
      'marketplace_items',
      'cart',
      'service_requests',
      'service_offers',
      'service_volunteers',
      'service_clients',
      'orders',
      'order_items',
      'wishlist'
    ];

    console.log('🚀 Starting safe migration...\n');

    for (const tableName of migrationOrder) {
      try {
        console.log(`📋 Processing table: ${tableName}`);
        
        // Get data from MySQL
        const data = await this.getMySQLData(tableName);
        
        if (data.length === 0) {
          console.log(`   ⏭️ No data found in ${tableName}, skipping...`);
          continue;
        }

        // Migrate with UPSERT
        const result = await this.safeUpsert(tableName, data);
        results.push(result);

        // Verify migration
        const verification = await this.verifyMigration(tableName);
        
        if (verification.match) {
          console.log(`   ✅ ${tableName}: ${verification.postgresCount} records migrated successfully`);
        } else {
          console.log(`   ⚠️ ${tableName}: Count mismatch! MySQL: ${verification.mysqlCount}, PostgreSQL: ${verification.postgresCount}`);
        }

      } catch (error: any) {
        console.error(`   ❌ Failed to migrate ${tableName}:`, error.message);
        results.push({
          table: tableName,
          totalRecords: 0,
          migratedRecords: 0,
          failedRecords: 1,
          errors: [error.message]
        });
      }
    }

    return results;
  }

  async close() {
    if (this.mysqlConnection) {
      await this.mysqlConnection.end();
    }
  }
}

// Usage function
export async function runSafeMigration() {
  const config: MigrationConfig = {
    mysql: {
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'navdrishti_user',
      password: process.env.DB_PASS || 'Shubhendu@0205',
      database: process.env.DB_NAME || 'navdrishti'
    },
    supabase: {
      url: process.env.NEXT_PUBLIC_SUPABASE_URL!,
      serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY!
    }
  };

  const migration = new SafeMigration(config);

  try {
    await migration.initialize();
    const results = await migration.migrate();

    // Summary report
    console.log('\n📊 Migration Summary:');
    console.log('========================');
    
    let totalRecords = 0;
    let totalMigrated = 0;
    let totalFailed = 0;

    results.forEach(result => {
      totalRecords += result.totalRecords;
      totalMigrated += result.migratedRecords;
      totalFailed += result.failedRecords;
      
      console.log(`${result.table}: ${result.migratedRecords}/${result.totalRecords} migrated`);
      
      if (result.errors.length > 0) {
        console.log(`  Errors: ${result.errors.slice(0, 3).join(', ')}${result.errors.length > 3 ? '...' : ''}`);
      }
    });

    console.log('========================');
    console.log(`Total: ${totalMigrated}/${totalRecords} records migrated`);
    console.log(`Failed: ${totalFailed} records`);
    console.log(`Success rate: ${totalRecords > 0 ? Math.round(totalMigrated / totalRecords * 100) : 0}%`);

    if (totalFailed === 0) {
      console.log('\n🎉 Migration completed successfully with no data loss!');
    } else {
      console.log('\n⚠️ Migration completed with some errors. Check logs above.');
    }

    return results;

  } catch (error) {
    console.error('\n💥 Migration failed:', error);
    throw error;
  } finally {
    await migration.close();
  }
}

// CLI usage
if (require.main === module) {
  runSafeMigration()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}