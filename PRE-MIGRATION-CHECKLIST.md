# Pre-Migration Checklist

## ✅ Before You Start

### 1. Backup Your MySQL Database
```bash
# Create a full backup (REQUIRED!)
mysqldump -u navdrishti_user -p navdrishti > backup/navdrishti_full_backup.sql

# Verify backup file exists and has content
ls -la backup/navdrishti_full_backup.sql
```

### 2. Install Required Dependencies
```bash
# Install Supabase client
npm install @supabase/supabase-js

# Install MySQL client for migration
npm install mysql2

# Install TypeScript execution
npm install -g tsx
```

### 3. Set Up Supabase Schema
1. Open Supabase SQL Editor: https://supabase.com/dashboard/project/xkmnkxznjemfwuhbnhyj/sql/new
2. Copy and paste the content from `supabase-schema.sql`
3. Execute the script
4. Verify all tables are created

### 4. Test Your Environment
```bash
# Verify your .env.local has all required variables
cat .env.local

# Test MySQL connection
npm run dev
# Check if your app connects to MySQL successfully
```

## 🔄 Migration Process

### Step 1: Run Safe Migration
```bash
# This uses UPSERT operations to prevent data loss
npm run migrate:safe
```

### Step 2: Verify Migration
```bash
# This checks if all data was migrated correctly
npm run migrate:verify
```

### Step 3: Update Database Configuration
Only after verification passes:

1. Update `lib/db.ts` to use Supabase instead of MySQL
2. Update all API endpoints to use Supabase client
3. Test the application thoroughly

## 🚨 Emergency Rollback

If something goes wrong:

```bash
# Restore from backup
mysql -u navdrishti_user -p navdrishti < backup/navdrishti_full_backup.sql

# Revert code changes
git checkout -- lib/db.ts
```

## ⚠️ Important Notes

1. **NEVER delete your MySQL data until everything is working**
2. **The migration script uses UPSERT** - it won't overwrite existing data
3. **Run verification multiple times** to ensure consistency
4. **Test your application thoroughly** before going live
5. **Keep your MySQL backup safe** for at least 30 days

## 🔍 What the Migration Script Does

- ✅ Connects to both MySQL and PostgreSQL
- ✅ Uses UPSERT (INSERT ... ON CONFLICT UPDATE) 
- ✅ Converts data types automatically
- ✅ Preserves all relationships
- ✅ Provides detailed progress reports
- ✅ Continues on errors (doesn't stop entire migration)
- ✅ Verifies data integrity after migration

## 📞 If You Need Help

The migration is designed to be safe, but if you encounter issues:

1. Check the migration logs
2. Run the verification script
3. Check your backup is intact
4. Don't panic - your MySQL data is still there!

Remember: **Better safe than sorry!** 🛡️