# Environment Configuration

## 🌐 Overview

Navdrishti uses environment variables to manage configuration across different environments (development, staging, production). This document provides a comprehensive guide to setting up and managing these configurations.

## 📁 Environment Files

### File Structure
```
├── .env.example          # Template with all available variables
├── .env.local            # Local development (ignored by git)
├── .env.development      # Development environment
├── .env.staging          # Staging environment  
└── .env.production       # Production environment
```

### Loading Priority
1. `.env.local` (highest priority, local development)
2. `.env.development` / `.env.staging` / `.env.production`
3. `.env` (default fallback)

## 🚀 Quick Setup

### 1. Initial Setup
```bash
# Clone the repository
git clone <repository-url>
cd navdrishti

# Copy environment template
cp .env.example .env.local

# Install dependencies
npm install
```

### 2. Configure Required Variables
Edit `.env.local` with your configuration:

```env
# Supabase (Required)
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

# JWT Secret (Required)
JWT_SECRET=your_jwt_secret_at_least_32_characters_long

# Cloudinary (Required for image uploads)
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
```

### 3. Start Development
```bash
npm run dev
```

## 📝 Environment Variables Reference

### 🔧 Application Configuration

```env
# ===========================================
# APPLICATION CONFIGURATION
# ===========================================

# Environment type - affects logging, error handling, etc.
NODE_ENV=development              # development | staging | production

# Application details
APP_NAME=Navdrishti              # Application name
APP_URL=http://localhost:3000     # Base application URL
FRONTEND_URL=http://localhost:3000 # Frontend URL (same as APP_URL for Next.js)

# Debug and logging
NEXT_PUBLIC_DEBUG=false           # Enable debug mode in frontend
LOG_LEVEL=info                    # error | warn | info | debug
```

### 🗄️ Database Configuration

```env
# ===========================================
# SUPABASE CONFIGURATION (Primary Database)
# ===========================================

# Supabase Project Settings (Required)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...  # Anon public key
SUPABASE_SERVICE_ROLE_KEY=eyJ...      # Service role key (keep secret)

# Database Connection Settings
DATABASE_URL=postgresql://[user]:[pass]@[host]:[port]/[db]  # Optional direct connection
DATABASE_MAX_CONNECTIONS=10       # Connection pool size
DATABASE_SSL=true                 # Use SSL connection

# Migration Settings
RUN_MIGRATIONS_ON_START=false     # Auto-run migrations on startup
```

### 🔐 Authentication & Security

```env
# ===========================================
# AUTHENTICATION & SECURITY
# ===========================================

# JWT Configuration (Required)
JWT_SECRET=your_super_secure_secret_key_minimum_32_characters
JWT_EXPIRES_IN=7d                 # Token expiration (7 days)
JWT_REFRESH_EXPIRES_IN=30d        # Refresh token expiration
JWT_ISSUER=navdrishti             # JWT issuer name
JWT_AUDIENCE=navdrishti-users     # JWT audience

# Session Management
SESSION_SECRET=another_secure_secret_for_sessions_32_chars_min
SESSION_MAX_AGE=604800000         # 7 days in milliseconds
SESSION_SECURE=false              # true for HTTPS only
SESSION_SAME_SITE=lax             # lax | strict | none
SESSION_HTTP_ONLY=true            # Prevent XSS access

# Password Security
BCRYPT_SALT_ROUNDS=12            # Higher = more secure but slower
PASSWORD_MIN_LENGTH=8            # Minimum password length
PASSWORD_REQUIRE_SPECIAL=true    # Require special characters

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000      # 15 minutes
RATE_LIMIT_MAX_REQUESTS=100      # Max requests per window
RATE_LIMIT_SKIP_SUCCESS=true     # Skip rate limit for successful auth

# CSRF Protection
CSRF_SECRET=csrf_secret_key_32_characters_minimum
CSRF_COOKIE_NAME=_csrf           # CSRF token cookie name

# API Security
API_KEY_HEADER=x-api-key         # API key header name
CORS_ORIGIN=http://localhost:3000 # Allowed CORS origins

# Admin Security
ADMIN_SECRET_KEY=admin_secret_key_for_admin_access
CRON_SECRET=optional_cron_job_secret_key
```

### 🎨 File Storage (Cloudinary)

```env
# ===========================================
# CLOUDINARY CONFIGURATION (Image Upload)
# ===========================================

# Cloudinary Account (Required for image uploads)
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=123456789012345
CLOUDINARY_API_SECRET=your_api_secret
CLOUDINARY_UPLOAD_PRESET=your_upload_preset  # Optional preset

# File Upload Settings
MAX_FILE_SIZE=10485760            # 10MB in bytes
ALLOWED_FILE_TYPES=jpg,jpeg,png,gif,mp4,mov  # Comma-separated
IMAGE_QUALITY=auto:good           # Cloudinary quality setting
IMAGE_FORMAT=auto                 # Auto-optimize format

# Storage Folders
CLOUDINARY_FOLDER_POSTS=navdrishti/posts
CLOUDINARY_FOLDER_PROFILES=navdrishti/profiles
CLOUDINARY_FOLDER_MARKETPLACE=navdrishti/marketplace
CLOUDINARY_FOLDER_DOCUMENTS=navdrishti/documents
```

### 📧 Email Configuration

```env
# ===========================================
# EMAIL SERVICE CONFIGURATION
# ===========================================

# SMTP Settings (choose one provider)
# Gmail SMTP
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false                 # true for 465, false for other ports
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password       # Use app password, not regular password

# SendGrid (Alternative)
# SENDGRID_API_KEY=your_sendgrid_api_key

# Email Settings
EMAIL_FROM=noreply@navdrishti.com # From email address
EMAIL_FROM_NAME=Navdrishti        # From name
EMAIL_REPLY_TO=support@navdrishti.com # Reply-to address

# Email Templates
EMAIL_VERIFICATION_SUBJECT=Verify your Navdrishti account
EMAIL_RESET_SUBJECT=Reset your Navdrishti password
EMAIL_WELCOME_SUBJECT=Welcome to Navdrishti

# Email Features
EMAIL_VERIFICATION_REQUIRED=true  # Require email verification
EMAIL_VERIFICATION_EXPIRES=24     # Hours until verification expires
RESET_PASSWORD_EXPIRES=1          # Hours until reset link expires
```

### 📱 SMS & OTP Configuration

```env
# ===========================================
# SMS & OTP CONFIGURATION
# ===========================================

# SMS Provider (Twilio example)
TWILIO_ACCOUNT_SID=your_twilio_account_sid
TWILIO_AUTH_TOKEN=your_twilio_auth_token
TWILIO_PHONE_NUMBER=+1234567890   # Your Twilio phone number

# OTP Settings
OTP_LENGTH=6                      # OTP code length
OTP_EXPIRES_MINUTES=10           # OTP expiration time
OTP_MAX_ATTEMPTS=3               # Max verification attempts
OTP_RATE_LIMIT_MINUTES=5         # Cooldown between OTP requests

# Phone Verification
PHONE_VERIFICATION_REQUIRED=false # Require phone verification
SMS_VERIFICATION_TEMPLATE=Your Navdrishti verification code is: {code}
```

### 💳 Payment Configuration

```env
# ===========================================
# PAYMENT GATEWAY (RAZORPAY)
# ===========================================

# Razorpay Settings (Required for marketplace)
RAZORPAY_KEY_ID=rzp_test_1234567890  # Test key for development
RAZORPAY_KEY_SECRET=your_razorpay_secret
RAZORPAY_WEBHOOK_SECRET=your_webhook_secret

# Payment Settings
DEFAULT_CURRENCY=INR              # Default currency code
MIN_ORDER_AMOUNT=100             # Minimum order amount (in paise for INR)
MAX_ORDER_AMOUNT=10000000        # Maximum order amount
PAYMENT_TIMEOUT=900              # Payment timeout in seconds (15 min)

# Razorpay Features
RAZORPAY_ENABLE_UPI=true         # Enable UPI payments
RAZORPAY_ENABLE_NETBANKING=true  # Enable net banking
RAZORPAY_ENABLE_WALLETS=true     # Enable wallet payments
RAZORPAY_ENABLE_CARDS=true       # Enable card payments
```

### 📊 Analytics & Monitoring

```env
# ===========================================
# ANALYTICS & MONITORING
# ===========================================

# Vercel Analytics (if using Vercel)
NEXT_PUBLIC_VERCEL_ANALYTICS=true

# Google Analytics (Optional)
NEXT_PUBLIC_GA_ID=G-XXXXXXXXXX

# Error Tracking (Sentry example)
SENTRY_DSN=https://your-sentry-dsn
SENTRY_ENVIRONMENT=development
SENTRY_RELEASE=1.0.0

# Performance Monitoring
ENABLE_PERFORMANCE_MONITORING=true
PERFORMANCE_SAMPLE_RATE=0.1      # 10% of requests

# Logging
LOG_FILE_PATH=./logs/app.log
LOG_MAX_SIZE=10m                 # Max log file size
LOG_MAX_FILES=5                  # Max number of log files
```

### 🚀 Deployment Configuration

```env
# ===========================================
# DEPLOYMENT CONFIGURATION
# ===========================================

# Build Settings
NEXT_PUBLIC_BUILD_TIME=2024-01-01T00:00:00Z
NEXT_PUBLIC_VERSION=1.0.0
NEXT_PUBLIC_COMMIT_SHA=abc123def456

# Feature Flags
NEXT_PUBLIC_ENABLE_MARKETPLACE=true
NEXT_PUBLIC_ENABLE_SERVICE_OFFERS=true
NEXT_PUBLIC_ENABLE_SOCIAL_FEED=true
NEXT_PUBLIC_ENABLE_ADMIN_PANEL=true

# CDN Settings
NEXT_PUBLIC_CDN_URL=https://cdn.navdrishti.com
NEXT_PUBLIC_STATIC_URL=https://static.navdrishti.com

# Caching
CACHE_STATIC_ASSETS=true
CACHE_API_RESPONSES=true
CACHE_DURATION_SECONDS=3600      # 1 hour
```

## 💻 Development Setup

### Prerequisites
1. **Node.js** (v18.0.0 or higher)
2. **npm** or **yarn**
3. **Supabase Account**
4. **Cloudinary Account**
5. **Git**

### Step-by-step Setup

1. **Clone and Install**
   ```bash
   git clone <repo-url>
   cd navdrishti
   npm install
   ```

2. **Database Setup**
   ```bash
   # Create Supabase project at supabase.com
   # Copy connection details to .env.local
   # Run initial migrations (if needed)
   npm run db:migrate
   ```

3. **Third-party Services**
   - Create Cloudinary account for image storage
   - Set up email service (Gmail/SendGrid)
   - Configure payment gateway (Razorpay)

4. **Environment Configuration**
   ```bash
   cp .env.example .env.local
   # Edit .env.local with your values
   ```

5. **Start Development**
   ```bash
   npm run dev
   # Visit http://localhost:3000
   ```

### Development Tools

```bash
# Available scripts
npm run dev          # Start development server
npm run build        # Build for production
npm run start        # Start production server
npm run lint         # Run ESLint
npm run type-check   # Run TypeScript checks
npm run db:migrate   # Run database migrations
npm run db:seed      # Seed database with test data
```

## 🏗️ Production Deployment

### Environment Variables Checklist

**Security** ✓
- [ ] Strong JWT_SECRET (32+ characters)
- [ ] Secure SESSION_SECRET
- [ ] HTTPS-only cookies (SESSION_SECURE=true)
- [ ] Strong BCRYPT_SALT_ROUNDS (12+)
- [ ] Proper CORS_ORIGIN settings

**Database** ✓
- [ ] Production Supabase project
- [ ] SSL connections enabled
- [ ] Connection pooling configured
- [ ] Backup strategy in place

**Services** ✓
- [ ] Production Cloudinary account
- [ ] Email service configured and tested
- [ ] Payment gateway in live mode
- [ ] SMS service configured

**Monitoring** ✓
- [ ] Error tracking (Sentry) enabled
- [ ] Analytics configured
- [ ] Performance monitoring active
- [ ] Log aggregation setup

### Deployment Platforms

**Vercel (Recommended)**
```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel --prod

# Set environment variables in Vercel dashboard
```

**Netlify**
```bash
# Build command: npm run build
# Publish directory: out
# Add environment variables in Netlify dashboard
```

**Docker**
```dockerfile
# Use provided Dockerfile
docker build -t navdrishti .
docker run -p 3000:3000 --env-file .env.production navdrishti
```

## 🔒 Security Best Practices

### Environment Security
1. **Never commit `.env.local` or production env files**
2. **Use different secrets for each environment**
3. **Rotate secrets regularly**
4. **Use environment-specific service accounts**
5. **Enable 2FA on all third-party services**

### Secret Management
```bash
# Generate secure secrets
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Use secret management services in production
# - Vercel: Environment Variables dashboard
# - AWS: Parameter Store or Secrets Manager
# - Azure: Key Vault
# - GCP: Secret Manager
```

### Environment Validation
The application validates required environment variables on startup:

```javascript
// lib/env-validation.ts
const requiredEnvVars = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'JWT_SECRET',
  'CLOUDINARY_CLOUD_NAME'
];

requiredEnvVars.forEach(envVar => {
  if (!process.env[envVar]) {
    throw new Error(`Missing required environment variable: ${envVar}`);
  }
});
```

## 🔍 Troubleshooting

### Common Issues

**Database Connection Failed**
```bash
# Check Supabase URL and keys
# Verify network connectivity
# Check SSL settings
```

**Image Upload Errors**
```bash
# Verify Cloudinary credentials
# Check file size limits
# Verify upload preset configuration
```

**Email Not Sending**
```bash
# Test SMTP credentials
# Check firewall settings
# Verify email provider settings
```

**Authentication Issues**
```bash
# Verify JWT_SECRET is set
# Check token expiration settings
# Ensure consistent secret across instances
```

### Debug Mode
```env
# Enable debug logging
NODE_ENV=development
NEXT_PUBLIC_DEBUG=true
LOG_LEVEL=debug

# Check browser console and server logs
```

### Health Checks
The application provides health check endpoints:

- `GET /api/health` - Basic health check
- `GET /api/health/db` - Database connectivity
- `GET /api/health/services` - External services status