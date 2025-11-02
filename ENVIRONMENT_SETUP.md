# 🌍 Environment Setup Guide

This guide will help you set up the environment variables for the Navdrishti platform.

## 📋 Quick Setup

1. **Copy the template:**
   ```bash
   cp .env.example .env
   ```

2. **Fill in your credentials** in the `.env` file (see sections below)

3. **Start the development server:**
   ```bash
   npm run dev
   ```

## 🔧 Required Services

### 🗄️ **Supabase (Database) - REQUIRED**
1. Go to [supabase.com](https://supabase.com)
2. Create a new project
3. Go to Settings → API
4. Copy your:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`

### ☁️ **Cloudinary (Image Upload) - REQUIRED**
1. Go to [cloudinary.com](https://cloudinary.com)
2. Create a free account
3. Go to Dashboard
4. Copy your:
   - `CLOUDINARY_CLOUD_NAME`
   - `CLOUDINARY_API_KEY`
   - `CLOUDINARY_API_SECRET`

## 🔧 Optional Services (Add Later)

### 📧 **Email Service (SMTP)**
**Option 1: Gmail (Easiest)**
1. Enable 2-Factor Authentication on your Gmail
2. Generate an App Password
3. Use your Gmail credentials in `.env`

**Option 2: Professional Email Services**
- [SendGrid](https://sendgrid.com)
- [Mailgun](https://mailgun.com)
- [Amazon SES](https://aws.amazon.com/ses/)

### 💳 **Payment Processing (Razorpay)**
1. Go to [razorpay.com](https://razorpay.com)
2. Create a business account
3. Get your API keys from Dashboard
4. Use test keys for development, live keys for production

### 📱 **SMS/OTP Service**
1. [MSG91](https://msg91.com)
2. [Twilio](https://twilio.com)
3. [AWS SNS](https://aws.amazon.com/sns/)

## 🎯 Development vs Production

### 🔧 Development Setup (Minimum Required)
```env
# Only these are needed to start development
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=your-api-key
CLOUDINARY_API_SECRET=your-api-secret
JWT_SECRET=your-secure-jwt-secret
```

### 🚀 Production Setup
- All development settings +
- SMTP email configuration
- Razorpay payment keys
- SSL certificates
- Production domain setup

## 🔐 Security Guidelines

### ✅ **DO:**
- Use strong, unique secrets for JWT and sessions
- Use app passwords for Gmail SMTP
- Keep your `.env` file private
- Use test keys for development
- Use live keys only for production

### ❌ **DON'T:**
- Commit `.env` file to GitHub
- Share your service role keys
- Use live payment keys in development
- Use weak or default secrets

## 🚨 Troubleshooting

### Database Connection Issues
- Check your Supabase URL and keys
- Ensure your project is not paused
- Verify API key permissions

### Image Upload Issues
- Check Cloudinary credentials
- Verify upload preset exists
- Check file size and type limits

### Email Not Working
- Verify SMTP credentials
- Check Gmail app password
- Ensure 2FA is enabled for Gmail

## 📞 Support

If you need help setting up:
1. Check this guide first
2. Look at error messages in console
3. Verify your environment variables
4. Contact the development team

---

**Note:** The `.env.example` file is safe to share and commit to GitHub, but never commit your actual `.env` file with real credentials!