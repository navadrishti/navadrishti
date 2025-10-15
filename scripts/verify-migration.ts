// Migration Verification Script
// Verifies data integrity after migration from MySQL to PostgreSQL

import mysql from 'mysql2/promise';
import { config } from 'dotenv';
import { join } from 'path';

// Load environment variables from .env.local
config({ path: join(process.cwd(), '.env.local') });

interface VerificationResult {
  table: string;
  mysqlCount: number;
  postgresCount: number;
  match: boolean;
  sampleCheck: boolean;
  errors: string[];
}

class MigrationVerifier {
  private mysqlConnection: mysql.Connection | null = null;
  private supabaseClient: any = null;

  constructor(private config: any) {}

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
      console.log('✅ Connected to Supabase for verification');
    } catch (error) {
      throw new Error('Please install @supabase/supabase-js: npm install @supabase/supabase-js');
    }
  }

  async verifyTable(tableName: string): Promise<VerificationResult> {
    const result: VerificationResult = {
      table: tableName,
      mysqlCount: 0,
      postgresCount: 0,
      match: false,
      sampleCheck: false,
      errors: []
    };

    try {
      // Count records in MySQL
      const [mysqlResult] = await this.mysqlConnection!.execute(
        `SELECT COUNT(*) as count FROM ${tableName}`
      );
      result.mysqlCount = (mysqlResult as any)[0].count;

      // Count records in PostgreSQL
      const { count: postgresCount, error: countError } = await this.supabaseClient
        .from(tableName)
        .select('*', { count: 'exact', head: true });

      if (countError) {
        result.errors.push(`PostgreSQL count error: ${countError.message}`);
        return result;
      }

      result.postgresCount = postgresCount || 0;
      result.match = result.mysqlCount === result.postgresCount;

      // Sample verification (check first 5 records)
      if (result.match && result.mysqlCount > 0) {
        result.sampleCheck = await this.verifySampleData(tableName);
      }

    } catch (error: any) {
      result.errors.push(`Verification error: ${error.message}`);
    }

    return result;
  }

  async verifySampleData(tableName: string): Promise<boolean> {
    try {
      // Get first 5 records from MySQL
      const [mysqlRows] = await this.mysqlConnection!.execute(
        `SELECT * FROM ${tableName} ORDER BY id LIMIT 5`
      );

      // Get same records from PostgreSQL
      const { data: postgresRows, error } = await this.supabaseClient
        .from(tableName)
        .select('*')
        .order('id')
        .limit(5);

      if (error || !postgresRows) {
        return false;
      }

      // Compare key fields
      const mysqlData = mysqlRows as any[];
      
      for (let i = 0; i < Math.min(mysqlData.length, postgresRows.length); i++) {
        const mysqlRow = mysqlData[i];
        const postgresRow = postgresRows[i];

        // Check ID match
        if (mysqlRow.id !== postgresRow.id) {
          return false;
        }

        // Check other key fields exist
        const keyFields = ['email', 'title', 'name'];
        for (const field of keyFields) {
          if (mysqlRow[field] && !postgresRow[field]) {
            return false;
          }
        }
      }

      return true;
    } catch {
      return false;
    }
  }

  async runFullVerification(): Promise<VerificationResult[]> {
    const tables = [
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

    const results: VerificationResult[] = [];

    console.log('🔍 Starting migration verification...\n');

    for (const table of tables) {
      console.log(`Verifying ${table}...`);
      const result = await this.verifyTable(table);
      results.push(result);

      if (result.match && result.sampleCheck) {
        console.log(`  ✅ ${table}: ${result.postgresCount} records - Perfect match`);
      } else if (result.match) {
        console.log(`  ⚠️ ${table}: ${result.postgresCount} records - Count match, sample check failed`);
      } else {
        console.log(`  ❌ ${table}: MySQL ${result.mysqlCount} ≠ PostgreSQL ${result.postgresCount}`);
      }

      if (result.errors.length > 0) {
        console.log(`     Errors: ${result.errors.join(', ')}`);
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
export async function verifyMigration() {
  const config = {
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

  const verifier = new MigrationVerifier(config);

  try {
    await verifier.initialize();
    const results = await verifier.runFullVerification();

    // Summary
    console.log('\n📊 Verification Summary:');
    console.log('========================');

    const totalTables = results.length;
    const perfectMatches = results.filter(r => r.match && r.sampleCheck).length;
    const countMatches = results.filter(r => r.match).length;
    const failures = results.filter(r => !r.match).length;

    console.log(`Total tables: ${totalTables}`);
    console.log(`Perfect matches: ${perfectMatches}`);
    console.log(`Count matches: ${countMatches}`);
    console.log(`Failures: ${failures}`);

    if (failures === 0) {
      console.log('\n🎉 All data verified successfully!');
      console.log('✅ Safe to switch to PostgreSQL');
    } else {
      console.log('\n⚠️ Some tables have mismatched data');
      console.log('❌ Do not switch to PostgreSQL yet');
      
      console.log('\nFailed tables:');
      results.filter(r => !r.match).forEach(result => {
        console.log(`  ${result.table}: MySQL ${result.mysqlCount} ≠ PostgreSQL ${result.postgresCount}`);
      });
    }

    return results;

  } catch (error) {
    console.error('\n💥 Verification failed:', error);
    throw error;
  } finally {
    await verifier.close();
  }
}

// CLI usage
if (require.main === module) {
  verifyMigration()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}