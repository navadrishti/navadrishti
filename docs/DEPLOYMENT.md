# Deployment Guide

## 🚀 Overview

This guide covers deployment strategies for Navdrishti across different environments and platforms. The application is optimized for serverless deployment but can also run on traditional servers.

## 🏗️ Build Process

### Prerequisites
- Node.js 18.0.0 or higher
- npm or yarn package manager
- Git for version control

### Local Build
```bash
# Install dependencies
npm install

# Build for production
npm run build

# Test production build locally
npm run start
```

### Build Scripts
```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "build:analyze": "ANALYZE=true npm run build",
    "build:vercel": "npm run build && npm run lint"
  }
}
```

## 🌐 Vercel Deployment (Recommended)

### Quick Deploy
```bash
# Install Vercel CLI
npm i -g vercel

# Login to Vercel
vercel login

# Deploy to preview
vercel

# Deploy to production
vercel --prod
```

### Vercel Configuration
Create `vercel.json` in project root:

```json
{
  "framework": "nextjs",
  "buildCommand": "npm run build",
  "devCommand": "npm run dev",
  "installCommand": "npm install",
  "functions": {
    "app/api/**/*.ts": {
      "maxDuration": 30
    }
  },
  "regions": ["bom1", "hkg1"],
  "env": {
    "NODE_ENV": "production"
  },
  "build": {
    "env": {
      "NEXT_TELEMETRY_DISABLED": "1"
    }
  },
  "headers": [
    {
      "source": "/api/(.*)",
      "headers": [
        {
          "key": "Access-Control-Allow-Origin",
          "value": "https://your-domain.com"
        },
        {
          "key": "Access-Control-Allow-Methods",
          "value": "GET,OPTIONS,PATCH,DELETE,POST,PUT"
        }
      ]
    }
  ]
}
```

### Environment Variables Setup
1. Go to Vercel Dashboard → Project → Settings → Environment Variables
2. Add all required environment variables from `.env.example`
3. Set different values for Preview and Production environments

**Critical Variables for Production:**
```env
# Database
NEXT_PUBLIC_SUPABASE_URL=your_production_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_production_service_key

# Security
JWT_SECRET=production_jwt_secret_32_chars_minimum
SESSION_SECRET=production_session_secret_32_chars

# Services
CLOUDINARY_CLOUD_NAME=production_cloud_name
RAZORPAY_KEY_ID=rzp_live_production_key
```

### Vercel Deployment Workflow
```bash
# Development workflow
git checkout -b feature/new-feature
# ... make changes
git commit -m "Add new feature"
git push origin feature/new-feature
# Creates preview deployment automatically

# Production deployment
git checkout main
git merge feature/new-feature
git push origin main
# Deploys to production automatically
```

## 🐳 Docker Deployment

### Dockerfile
```dockerfile
# Use the official Node.js image as base
FROM node:18-alpine AS base

# Install dependencies only when needed
FROM base AS deps
# Check https://github.com/nodejs/docker-node/tree/b4117f9333da4138b03a546ec926ef50a31506c3#nodealpine to understand why libc6-compat might be needed.
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Install dependencies based on the preferred package manager
COPY package.json package-lock.json* ./
RUN npm ci --only=production

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build the application
RUN npm run build

# Production image, copy all the files and run next
FROM base AS runner
WORKDIR /app

ENV NODE_ENV production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public

# Automatically leverage output traces to reduce image size
# https://nextjs.org/docs/advanced-features/output-file-tracing
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

ENV PORT 3000

CMD ["node", "server.js"]
```

### Docker Compose
```yaml
version: '3.8'

services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
    env_file:
      - .env.production
    depends_on:
      - redis
      
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
      - ./ssl:/etc/nginx/ssl
    depends_on:
      - app

volumes:
  redis_data:
```

### Docker Commands
```bash
# Build the Docker image
docker build -t navdrishti .

# Run the container
docker run -p 3000:3000 --env-file .env.production navdrishti

# Using Docker Compose
docker-compose up -d

# Check logs
docker-compose logs -f app

# Stop containers
docker-compose down
```

## ☁️ AWS Deployment

### AWS App Runner
```yaml
# apprunner.yaml
version: 1.0
runtime: nodejs18
build:
  commands:
    build:
      - npm install
      - npm run build
run:
  runtime-version: 18
  command: npm start
  network:
    port: 3000
    env: PORT
  env:
    - name: NODE_ENV
      value: production
```

### AWS ECS with Fargate
1. **Create ECR Repository**
```bash
aws ecr create-repository --repository-name navdrishti
```

2. **Build and Push Image**
```bash
# Build and tag image
docker build -t navdrishti .
docker tag navdrishti:latest {account}.dkr.ecr.{region}.amazonaws.com/navdrishti:latest

# Push to ECR
aws ecr get-login-password --region {region} | docker login --username AWS --password-stdin {account}.dkr.ecr.{region}.amazonaws.com
docker push {account}.dkr.ecr.{region}.amazonaws.com/navdrishti:latest
```

3. **ECS Task Definition**
```json
{
  "family": "navdrishti-task",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "512",
  "memory": "1024",
  "executionRoleArn": "arn:aws:iam::{account}:role/ecsTaskExecutionRole",
  "containerDefinitions": [
    {
      "name": "navdrishti",
      "image": "{account}.dkr.ecr.{region}.amazonaws.com/navdrishti:latest",
      "portMappings": [
        {
          "containerPort": 3000,
          "protocol": "tcp"
        }
      ],
      "environment": [
        {
          "name": "NODE_ENV",
          "value": "production"
        }
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/navdrishti",
          "awslogs-region": "{region}",
          "awslogs-stream-prefix": "ecs"
        }
      }
    }
  ]
}
```

## 📱 Mobile App Deployment (Future)

### React Native Setup
```bash
# Install React Native CLI
npm install -g @react-native-community/cli

# Create mobile app
npx react-native init NavdrishtiMobile --template react-native-template-typescript

# Install dependencies
cd NavdrishtiMobile
npm install @react-native-async-storage/async-storage react-native-keychain
```

### App Configuration
```javascript
// config/api.js
const API_CONFIG = {
  development: 'http://localhost:3000/api',
  production: 'https://navdrishti.com/api',
  staging: 'https://staging.navdrishti.com/api'
};

export const API_BASE_URL = API_CONFIG[process.env.NODE_ENV || 'development'];
```

## 🔄 CI/CD Pipeline

### GitHub Actions Workflow
```yaml
# .github/workflows/deploy.yml
name: Deploy to Production

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

env:
  VERCEL_ORG_ID: ${{ secrets.VERCEL_ORG_ID }}
  VERCEL_PROJECT_ID: ${{ secrets.VERCEL_PROJECT_ID }}

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci
        
      - name: Run linting
        run: npm run lint
        
      - name: Run type check
        run: npm run type-check
        
      - name: Run tests
        run: npm run test
        
  deploy-preview:
    if: github.event_name == 'pull_request'
    runs-on: ubuntu-latest
    needs: test
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'npm'
          
      - name: Install Vercel CLI
        run: npm install --global vercel@latest
        
      - name: Pull Vercel Environment Information
        run: vercel pull --yes --environment=preview --token=${{ secrets.VERCEL_TOKEN }}
        
      - name: Build Project Artifacts
        run: vercel build --token=${{ secrets.VERCEL_TOKEN }}
        
      - name: Deploy Project Artifacts to Vercel
        run: vercel deploy --prebuilt --token=${{ secrets.VERCEL_TOKEN }}

  deploy-production:
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    needs: test
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'npm'
          
      - name: Install Vercel CLI
        run: npm install --global vercel@latest
        
      - name: Pull Vercel Environment Information
        run: vercel pull --yes --environment=production --token=${{ secrets.VERCEL_TOKEN }}
        
      - name: Build Project Artifacts
        run: vercel build --prod --token=${{ secrets.VERCEL_TOKEN }}
        
      - name: Deploy Project Artifacts to Vercel
        run: vercel deploy --prebuilt --prod --token=${{ secrets.VERCEL_TOKEN }}
        
      - name: Run post-deployment tests
        run: npm run test:e2e
```

### GitLab CI/CD
```yaml
# .gitlab-ci.yml
stages:
  - test
  - build
  - deploy

variables:
  NODE_VERSION: "18"
  DOCKER_DRIVER: overlay2

cache:
  paths:
    - node_modules/

test:
  stage: test
  image: node:$NODE_VERSION
  script:
    - npm ci
    - npm run lint
    - npm run test
    - npm run type-check

build:
  stage: build
  image: docker:latest
  services:
    - docker:dind
  script:
    - docker build -t $CI_REGISTRY_IMAGE:$CI_COMMIT_SHA .
    - docker push $CI_REGISTRY_IMAGE:$CI_COMMIT_SHA
  only:
    - main

deploy_production:
  stage: deploy
  image: alpine:latest
  script:
    - apk add --no-cache curl
    - 'curl -X POST -H "Authorization: Bearer $VERCEL_TOKEN" -H "Content-Type: application/json" -d "{\"name\":\"navdrishti\",\"gitSource\":{\"type\":\"github\",\"repoId\":\"$CI_PROJECT_ID\",\"ref\":\"$CI_COMMIT_SHA\"}}" "https://api.vercel.com/v13/deployments"'
  only:
    - main
  when: manual
```

## 🔍 Monitoring & Health Checks

### Health Check Endpoints
```javascript
// app/api/health/route.ts
export async function GET() {
  const healthCheck = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: process.env.npm_package_version,
    environment: process.env.NODE_ENV,
    memory: process.memoryUsage(),
    checks: {
      database: await checkDatabase(),
      external_services: await checkExternalServices()
    }
  };
  
  return Response.json(healthCheck);
}

async function checkDatabase() {
  try {
    const { data, error } = await supabase.from('users').select('id').limit(1);
    return { status: 'healthy', response_time: 'fast' };
  } catch (error) {
    return { status: 'unhealthy', error: error.message };
  }
}
```

### Monitoring Setup
```javascript
// lib/monitoring.js
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/next';

// Error tracking
export function trackError(error, context) {
  if (process.env.NODE_ENV === 'production') {
    // Send to error tracking service (Sentry, LogRocket, etc.)
    console.error('Application Error:', error, context);
  }
}

// Performance monitoring
export function trackPerformance(metric, value) {
  if (process.env.NODE_ENV === 'production') {
    // Send to analytics service
    console.log('Performance Metric:', metric, value);
  }
}
```

## 🛠️ Troubleshooting

### Common Deployment Issues

#### Build Failures
```bash
# Clear cache and rebuild
npm run clean
rm -rf .next node_modules package-lock.json
npm install
npm run build
```

#### Environment Variable Issues
```bash
# Verify environment variables are loaded
node -e "console.log(process.env.NEXT_PUBLIC_SUPABASE_URL)"

# Check for missing required variables
npm run validate-env
```

#### Database Connection Issues
```bash
# Test database connectivity
node -e "
const { supabase } = require('./lib/db');
supabase.from('users').select('id').limit(1)
  .then(result => console.log('DB Connected:', result.data ? 'Success' : 'Failed'))
  .catch(err => console.error('DB Error:', err.message));
"
```

### Performance Optimization

#### Bundle Analysis
```bash
# Analyze bundle size
ANALYZE=true npm run build

# Check for large dependencies
npx bundle-analyzer .next/static/chunks/*.js
```

#### Image Optimization
```javascript
// next.config.mjs
/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    domains: ['res.cloudinary.com'],
    formats: ['image/webp', 'image/avif'],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
  },
  compress: true,
  poweredByHeader: false,
  generateEtags: false,
};

export default nextConfig;
```

### Security Checklist

#### Pre-deployment Security
- [ ] Environment variables secured and not exposed
- [ ] API endpoints protected with proper authentication
- [ ] Input validation implemented on all forms
- [ ] HTTPS enforced in production
- [ ] CORS configured correctly
- [ ] Rate limiting enabled
- [ ] SQL injection protection in place
- [ ] XSS protection implemented
- [ ] File upload restrictions configured

#### Post-deployment Verification
```bash
# Security headers check
curl -I https://your-domain.com

# SSL certificate verification
openssl s_client -connect your-domain.com:443

# API endpoint testing
curl -X GET https://your-domain.com/api/health
```

## 🔄 Rollback Strategy

### Vercel Rollback
```bash
# List deployments
vercel ls

# Rollback to previous deployment
vercel rollback [deployment-url]
```

### Docker Rollback
```bash
# List running containers
docker ps

# Stop current container
docker stop navdrishti-current

# Start previous version
docker run -d --name navdrishti-rollback navdrishti:previous-tag
```

### Database Migration Rollback
```sql
-- Check migration history
SELECT * FROM schema_migrations ORDER BY version DESC;

-- Rollback specific migration
-- (Implement rollback scripts for each migration)
```

This comprehensive deployment guide covers all major deployment scenarios and provides troubleshooting steps for common issues.