# Navdrishti Development Deployment Guide

## 📋 **Development Environment Overview**
- **Project Name**: Navdrishti - Development Environment
- **Frontend**: Vercel (Free Tier)
- **Database**: Supabase PostgreSQL (Free Tier)
- **Authentication**: Supabase Auth + Custom JWT
- **Cost**: $0/month (100% Free)
- **Purpose**: Development, Testing, Beta User Feedback

---

## 🆓 **Free Tier Benefits**

### **Vercel Free Tier**
- ✅ **Unlimited** personal projects
- ✅ **100GB** bandwidth per month
- ✅ **Automatic HTTPS** with custom domains
- ✅ **Preview deployments** for every branch
- ✅ **Edge network** for fast global access
- ✅ **No sleep time** - always active

### **Supabase Free Tier**
- ✅ **500MB** database storage
- ✅ **2** active projects
- ✅ **50,000** monthly active users
- ✅ **Built-in authentication**
- ✅ **Real-time subscriptions**
- ✅ **Auto-generated APIs**
- ✅ **Database dashboard** with SQL editor

---

## 🚀 **Step-by-Step Development Setup**

### **Phase 1: Supabase Database Setup**

#### **1. Create Supabase Account**
1. Go to [supabase.com](https://supabase.com)  
2. **Sign up** with GitHub account  
3. **Create new project**:
   - Project name: `navdrishti-dev`
   - Database password: Generate strong password
   - Region: Choose closest to your location

#### **2. Get Supabase Credentials**
After project creation, go to **Settings** → **API**:
```bash
# Note these values for environment variables
Project URL: https://your-project-id.supabase.co
anon/public key: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
service_role key: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

#### **3. Create Database Schema**
Go to **SQL Editor** in Supabase dashboard and run:

```sql
-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create custom types
CREATE TYPE user_type AS ENUM ('individual', 'ngo', 'company');
CREATE TYPE verification_status AS ENUM ('pending', 'verified', 'rejected');
CREATE TYPE service_status AS ENUM ('active', 'paused', 'completed', 'cancelled');
CREATE TYPE priority_level AS ENUM ('low', 'medium', 'high', 'urgent');
CREATE TYPE price_type AS ENUM ('fixed', 'negotiable', 'project_based', 'hourly');

-- Users table (extends Supabase auth.users)
CREATE TABLE public.users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  user_type user_type NOT NULL,
  verification_status verification_status DEFAULT 'pending',
  profile_data JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW())
);

-- Create indexes for users
CREATE INDEX idx_users_email ON public.users(email);
CREATE INDEX idx_users_user_type ON public.users(user_type);
CREATE INDEX idx_users_verification_status ON public.users(verification_status);

-- Service offers table
CREATE TABLE public.service_offers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ngo_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  category VARCHAR(100) NOT NULL,
  location VARCHAR(255),
  price_type price_type DEFAULT 'negotiable',
  price_amount DECIMAL(10,2),
  price_description VARCHAR(255),
  tags JSONB DEFAULT '[]',
  image_url VARCHAR(500),
  status service_status DEFAULT 'active',
  max_simultaneous_clients INTEGER DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW())
);

-- Create indexes for service offers
CREATE INDEX idx_service_offers_category ON public.service_offers(category);
CREATE INDEX idx_service_offers_status ON public.service_offers(status);
CREATE INDEX idx_service_offers_ngo_id ON public.service_offers(ngo_id);
CREATE INDEX idx_service_offers_created_at ON public.service_offers(created_at);

-- Service requests table
CREATE TABLE public.service_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ngo_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  category VARCHAR(100) NOT NULL,
  location VARCHAR(255),
  priority priority_level DEFAULT 'medium',
  deadline DATE,
  budget_range VARCHAR(100),
  deliverables JSONB DEFAULT '[]',
  volunteer_requirements TEXT,
  tags JSONB DEFAULT '[]',
  status service_status DEFAULT 'active',
  max_volunteers INTEGER DEFAULT 5,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW())
);

-- Create indexes for service requests
CREATE INDEX idx_service_requests_category ON public.service_requests(category);
CREATE INDEX idx_service_requests_priority ON public.service_requests(priority);
CREATE INDEX idx_service_requests_status ON public.service_requests(status);
CREATE INDEX idx_service_requests_ngo_id ON public.service_requests(ngo_id);

-- Marketplace items table
CREATE TABLE public.marketplace_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  seller_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  category VARCHAR(100) NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  quantity INTEGER DEFAULT 1,
  condition_type VARCHAR(50) DEFAULT 'good',
  location VARCHAR(255),
  images JSONB DEFAULT '[]',
  tags JSONB DEFAULT '[]',
  status VARCHAR(50) DEFAULT 'available',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW())
);

-- Create indexes for marketplace
CREATE INDEX idx_marketplace_category ON public.marketplace_items(category);
CREATE INDEX idx_marketplace_status ON public.marketplace_items(status);
CREATE INDEX idx_marketplace_seller_id ON public.marketplace_items(seller_id);
CREATE INDEX idx_marketplace_price ON public.marketplace_items(price);

-- Service volunteers tracking
CREATE TABLE public.service_volunteers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  service_request_id UUID NOT NULL REFERENCES public.service_requests(id) ON DELETE CASCADE,
  volunteer_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  volunteer_type user_type NOT NULL,
  status VARCHAR(50) DEFAULT 'applied',
  message TEXT,
  applied_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW())
);

-- Create unique constraint and indexes
ALTER TABLE public.service_volunteers 
ADD CONSTRAINT unique_volunteer_service UNIQUE (service_request_id, volunteer_id);

CREATE INDEX idx_service_volunteers_status ON public.service_volunteers(status);
CREATE INDEX idx_service_volunteers_volunteer_id ON public.service_volunteers(volunteer_id);

-- Service hires tracking
CREATE TABLE public.service_hires (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  service_offer_id UUID NOT NULL REFERENCES public.service_offers(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  client_type user_type NOT NULL,
  status VARCHAR(50) DEFAULT 'requested',
  message TEXT,
  hired_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW())
);

-- Create unique constraint and indexes
ALTER TABLE public.service_hires 
ADD CONSTRAINT unique_hire_service UNIQUE (service_offer_id, client_id);

CREATE INDEX idx_service_hires_status ON public.service_hires(status);
CREATE INDEX idx_service_hires_client_id ON public.service_hires(client_id);

-- Marketplace transactions
CREATE TABLE public.marketplace_transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  item_id UUID NOT NULL REFERENCES public.marketplace_items(id) ON DELETE CASCADE,
  buyer_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  seller_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL,
  total_price DECIMAL(10,2) NOT NULL,
  status VARCHAR(50) DEFAULT 'pending',
  transaction_date TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW())
);

-- Create indexes for transactions
CREATE INDEX idx_transactions_buyer_id ON public.marketplace_transactions(buyer_id);
CREATE INDEX idx_transactions_seller_id ON public.marketplace_transactions(seller_id);
CREATE INDEX idx_transactions_status ON public.marketplace_transactions(status);

-- Enable Row Level Security
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketplace_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_volunteers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_hires ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketplace_transactions ENABLE ROW LEVEL SECURITY;

-- Create basic RLS policies (you can modify these as needed)
-- Users policy
CREATE POLICY "Users can view all profiles" ON public.users
  FOR SELECT USING (true);

CREATE POLICY "Users can update own profile" ON public.users
  FOR UPDATE USING (auth.uid() = id);

-- Service offers policies
CREATE POLICY "Anyone can view active service offers" ON public.service_offers
  FOR SELECT USING (status = 'active');

CREATE POLICY "NGOs can manage their own service offers" ON public.service_offers
  FOR ALL USING (auth.uid() = ngo_id);

-- Service requests policies
CREATE POLICY "Anyone can view active service requests" ON public.service_requests
  FOR SELECT USING (status = 'active');

CREATE POLICY "NGOs can manage their own service requests" ON public.service_requests
  FOR ALL USING (auth.uid() = ngo_id);

-- Marketplace policies
CREATE POLICY "Anyone can view available marketplace items" ON public.marketplace_items
  FOR SELECT USING (status = 'available');

CREATE POLICY "Users can manage their own marketplace items" ON public.marketplace_items
  FOR ALL USING (auth.uid() = seller_id);

-- Create updated_at triggers
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = TIMEZONE('utc'::text, NOW());
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply triggers to tables
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON public.users 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_service_offers_updated_at BEFORE UPDATE ON public.service_offers 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_service_requests_updated_at BEFORE UPDATE ON public.service_requests 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_marketplace_items_updated_at BEFORE UPDATE ON public.marketplace_items 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

---

### **Phase 2: Code Adaptation for Supabase**

#### **1. Install Supabase Client**
```bash
npm install @supabase/supabase-js
```

#### **2. Create Supabase Client**
Create `lib/supabase.ts`:
```typescript
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// For server-side operations that need elevated permissions
export const supabaseAdmin = createClient(
  supabaseUrl,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
```

#### **3. Update Database Helper**
Create `lib/supabase-db.ts`:
```typescript
import { supabase, supabaseAdmin } from './supabase'

// Generic query function
export async function executeSupabaseQuery(
  table: string, 
  operation: 'select' | 'insert' | 'update' | 'delete',
  options: any = {}
) {
  try {
    let query = supabase.from(table)
    
    switch (operation) {
      case 'select':
        if (options.select) query = query.select(options.select)
        if (options.where) query = query.match(options.where)
        if (options.order) query = query.order(options.order.column, { ascending: options.order.ascending })
        if (options.limit) query = query.limit(options.limit)
        break
        
      case 'insert':
        query = query.insert(options.data)
        break
        
      case 'update':
        query = query.update(options.data)
        if (options.where) query = query.match(options.where)
        break
        
      case 'delete':
        if (options.where) query = query.delete().match(options.where)
        break
    }
    
    const { data, error } = await query
    
    if (error) throw error
    return data
    
  } catch (error) {
    console.error('Supabase query error:', error)
    throw error
  }
}

// Authentication helpers
export async function signUpUser(email: string, password: string, userData: any) {
  try {
    // Create auth user
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
    })
    
    if (authError) throw authError
    
    // Create profile in public.users table
    if (authData.user) {
      const { error: profileError } = await supabase
        .from('users')
        .insert({
          id: authData.user.id,
          email: authData.user.email,
          ...userData
        })
      
      if (profileError) throw profileError
    }
    
    return authData
  } catch (error) {
    console.error('Sign up error:', error)
    throw error
  }
}

export async function signInUser(email: string, password: string) {
  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })
    
    if (error) throw error
    return data
  } catch (error) {
    console.error('Sign in error:', error)
    throw error
  }
}

export async function getCurrentUser() {
  try {
    const { data: { user }, error } = await supabase.auth.getUser()
    
    if (error) throw error
    
    if (user) {
      // Get additional user data from public.users table
      const { data: profile, error: profileError } = await supabase
        .from('users')
        .select('*')
        .eq('id', user.id)
        .single()
      
      if (profileError) throw profileError
      
      return { ...user, ...profile }
    }
    
    return null
  } catch (error) {
    console.error('Get user error:', error)
    throw error
  }
}
```

#### **4. Update Auth Context**
Update `lib/auth-context.tsx`:
```typescript
'use client'

import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { supabase } from './supabase'
import { User as SupabaseUser } from '@supabase/supabase-js'

export interface User {
  id: string
  email: string
  name: string
  user_type: 'individual' | 'ngo' | 'company'
  verification_status?: string
  profile_data?: Record<string, any>
}

interface AuthContextType {
  user: User | null
  loading: boolean
  error: string | null
  login: (email: string, password: string) => Promise<void>
  signup: (userData: SignupData) => Promise<void>
  logout: () => void
  clearError: () => void
}

interface SignupData {
  email: string
  password: string
  name: string
  user_type: 'individual' | 'ngo' | 'company'
  profile_data?: Record<string, any>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Listen for auth changes
  useEffect(() => {
    const getInitialSession = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      
      if (session?.user) {
        await fetchUserProfile(session.user.id)
      }
      
      setLoading(false)
    }

    getInitialSession()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (session?.user) {
          await fetchUserProfile(session.user.id)
        } else {
          setUser(null)
        }
        setLoading(false)
      }
    )

    return () => subscription.unsubscribe()
  }, [])

  const fetchUserProfile = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .single()

      if (error) throw error
      setUser(data)
    } catch (err) {
      console.error('Error fetching user profile:', err)
      setError('Failed to fetch user profile')
    }
  }

  const signup = async (userData: SignupData) => {
    try {
      setLoading(true)
      setError(null)

      // Create auth user
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: userData.email,
        password: userData.password,
      })

      if (authError) throw authError

      // Create profile
      if (authData.user) {
        const { error: profileError } = await supabase
          .from('users')
          .insert({
            id: authData.user.id,
            email: userData.email,
            name: userData.name,
            user_type: userData.user_type,
            profile_data: userData.profile_data || {}
          })

        if (profileError) throw profileError
      }

    } catch (err: any) {
      setError(err.message)
      throw err
    } finally {
      setLoading(false)
    }
  }

  const login = async (email: string, password: string) => {
    try {
      setLoading(true)
      setError(null)

      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (error) throw error

    } catch (err: any) {
      setError(err.message)
      throw err
    } finally {
      setLoading(false)
    }
  }

  const logout = async () => {
    await supabase.auth.signOut()
    setUser(null)
  }

  const clearError = () => setError(null)

  return (
    <AuthContext.Provider value={{
      user,
      loading,
      error,
      login,
      signup,
      logout,
      clearError
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
```

---

### **Phase 3: Environment Variables Setup**

#### **Create `.env.local` for Development**
```bash
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here

# Application Configuration
NODE_ENV=development
APP_NAME=Navdrishti Dev
APP_URL=http://localhost:3000
FRONTEND_URL=http://localhost:3000

# JWT Configuration (for compatibility)
JWT_SECRET=dev-jwt-secret-key
JWT_EXPIRES_IN=7d

# Email Configuration (optional for dev)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-dev-email@gmail.com
SMTP_PASS=your-app-password

# Government API Configuration (for testing)
DIGILOCKER_CLIENT_ID=your_dev_digilocker_client_id
DIGILOCKER_CLIENT_SECRET=your_dev_digilocker_secret
DIGILOCKER_REDIRECT_URI=http://localhost:3000/api/auth/digilocker/callback

ENTITYLOCKER_CLIENT_ID=your_dev_entitylocker_client_id
ENTITYLOCKER_CLIENT_SECRET=your_dev_entitylocker_secret
ENTITYLOCKER_REDIRECT_URI=http://localhost:3000/api/auth/entitylocker/callback
```

---

### **Phase 4: Vercel Deployment**

#### **1. Install Vercel CLI**
```bash
npm install -g vercel
```

#### **2. Login to Vercel**
```bash
vercel login
# Follow the authentication process
```

#### **3. Deploy Project**
```bash
# From your project root
vercel

# Answer the prompts:
# ? Set up and deploy "~/path/to/your-project"? [Y/n] y
# ? Which scope do you want to deploy to? Your Account
# ? Link to existing project? [y/N] n
# ? What's your project's name? navdrishti-dev
# ? In which directory is your code located? ./
```

#### **4. Configure Environment Variables in Vercel**
Go to Vercel dashboard → Your Project → Settings → Environment Variables

Add these variables:
```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
NODE_ENV=production
APP_NAME=Navdrishti Dev
APP_URL=https://your-project.vercel.app
FRONTEND_URL=https://your-project.vercel.app
JWT_SECRET=your-production-jwt-secret
```

#### **5. Deploy to Production**
```bash
vercel --prod
```

---

## 🔄 **API Adaptation Guide**

### **Update API Routes for Supabase**

#### **Example: Service Offers API**
Update `app/api/service-offers/route.ts`:
```typescript
import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const category = searchParams.get('category')
    const search = searchParams.get('search')

    let query = supabase
      .from('service_offers')
      .select(`
        *,
        ngo:users!ngo_id (name, email)
      `)
      .eq('status', 'active')

    if (category && category !== 'All Categories') {
      query = query.eq('category', category)
    }

    if (search) {
      query = query.or(`title.ilike.%${search}%,description.ilike.%${search}%`)
    }

    const { data, error } = await query
    
    if (error) throw error

    return NextResponse.json({
      success: true,
      data: data || []
    })

  } catch (error) {
    console.error('Error fetching service offers:', error)
    return NextResponse.json(
      { error: 'Failed to fetch service offers' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    
    // Get current user from Supabase
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    // Verify user is NGO
    const { data: userProfile, error: profileError } = await supabase
      .from('users')
      .select('user_type')
      .eq('id', user.id)
      .single()

    if (profileError || userProfile?.user_type !== 'ngo') {
      return NextResponse.json({ error: 'Only NGOs can create service offers' }, { status: 403 })
    }

    const { data, error } = await supabase
      .from('service_offers')
      .insert({
        ngo_id: user.id,
        title: body.title,
        description: body.description,
        category: body.category,
        location: body.location,
        price_type: body.pricing > 0 ? 'fixed' : 'negotiable',
        price_amount: body.pricing || 0,
        price_description: `${body.availability} | Delivery: ${body.deliveryTime}`,
        tags: body.skills || []
      })
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({
      success: true,
      data: { id: data.id, message: 'Service offer created successfully' }
    })

  } catch (error) {
    console.error('Error creating service offer:', error)
    return NextResponse.json(
      { error: 'Failed to create service offer' },
      { status: 500 }
    )
  }
}
```

---

## 🔧 **Development Workflow**

### **Local Development**
```bash
# Start local development
npm run dev

# Your app runs on http://localhost:3000
# Connected to Supabase PostgreSQL database
```

### **Deploy Changes**
```bash
# Commit your changes
git add .
git commit -m "Feature: Add new functionality"
git push origin main

# Vercel auto-deploys from main branch
# Preview deployments for feature branches
```

### **Database Management**
- **Supabase Dashboard**: Visual table editor
- **SQL Editor**: Run custom queries
- **Real-time**: View live data changes
- **API**: Auto-generated REST API
- **Auth**: Built-in user management

---

## 📊 **Free Tier Monitoring**

### **Supabase Usage Tracking**
Monitor in Supabase Dashboard → Settings → Usage:
- **Database size**: 500MB limit
- **Monthly Active Users**: 50,000 limit
- **API requests**: 2 million/month
- **Bandwidth**: 5GB/month

### **Vercel Usage Tracking**
Monitor in Vercel Dashboard → Usage:
- **Bandwidth**: 100GB/month
- **Build executions**: 6,000/month
- **Serverless function invocations**: 125,000/month

### **Usage Optimization Tips**
- **Optimize images**: Use Next.js Image component
- **Implement caching**: Reduce API calls
- **Database indexes**: Fast query performance
- **Clean test data**: Regularly remove test records

---

## 🚀 **Testing & QA Process**

### **Development Testing Checklist**
- [ ] **User Registration**: All user types (Individual/NGO/Company)
- [ ] **Authentication**: Login/logout functionality
- [ ] **Service Management**: Create/edit/delete service offers & requests
- [ ] **Marketplace**: List/browse/search items
- [ ] **Dashboard**: Statistics and user data display
- [ ] **Mobile Responsiveness**: Test on mobile devices
- [ ] **Performance**: Page load times under 3 seconds

### **Beta User Testing**
1. **Create test accounts** for each user type
2. **Share development URL** with beta users
3. **Collect feedback** via form or email
4. **Monitor Supabase dashboard** for errors
5. **Track user behavior** through Vercel analytics

### **Pre-Production Checklist**
- [ ] All features working as expected
- [ ] No critical bugs or errors
- [ ] Performance meets requirements
- [ ] Security measures implemented
- [ ] Data integrity maintained
- [ ] User feedback incorporated

---

## 🔄 **Migration to Production**

### **When Ready for Production**
1. **Export data from Supabase**:
   ```sql
   -- Export users
   COPY (SELECT * FROM users) TO '/tmp/users.csv' CSV HEADER;
   
   -- Export service offers
   COPY (SELECT * FROM service_offers) TO '/tmp/service_offers.csv' CSV HEADER;
   
   -- Export other tables...
   ```

2. **Set up Railway production environment** (as per DEPLOYMENT.md)

3. **Import data to MySQL**:
   ```sql
   -- Convert PostgreSQL UUIDs to MySQL format if needed
   -- Import data with proper type conversions
   ```

4. **Update production environment variables**
5. **Switch DNS/domain to production**
6. **Monitor migration for 24-48 hours**

---

## 🆘 **Troubleshooting Guide**

### **Common Issues & Solutions**

#### **Supabase Connection Issues**
```bash
# Error: Invalid API key
# Solution: Check NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local

# Error: Database connection failed  
# Solution: Verify NEXT_PUBLIC_SUPABASE_URL format

# Error: RLS policy violation
# Solution: Update Row Level Security policies in Supabase
```

#### **Vercel Deployment Issues**
```bash
# Error: Build failed
# Solution: Check build logs, verify environment variables

# Error: Function timeout
# Solution: Optimize API routes, add caching

# Error: Environment variable not found
# Solution: Add variables in Vercel dashboard
```

#### **Authentication Problems**
```bash
# Error: User not found after signup
# Solution: Check users table creation and triggers

# Error: Session not persisting
# Solution: Verify Supabase client configuration

# Error: Permission denied
# Solution: Update RLS policies for user access
```

### **Debug Mode**
Enable debug logging in development:
```typescript
// lib/supabase.ts
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    debug: process.env.NODE_ENV === 'development'
  }
})
```

---

## 📈 **Performance Optimization**

### **Database Optimization**
```sql
-- Add indexes for frequently queried columns
CREATE INDEX IF NOT EXISTS idx_service_offers_category_status 
ON service_offers(category, status);

CREATE INDEX IF NOT EXISTS idx_service_requests_category_priority 
ON service_requests(category, priority);

CREATE INDEX IF NOT EXISTS idx_marketplace_category_price 
ON marketplace_items(category, price);

-- Enable database statistics
ANALYZE;
```

### **Frontend Optimization**
```typescript
// Use Next.js Image optimization
import Image from 'next/image'

// Implement proper caching
export const revalidate = 300 // 5 minutes

// Use Suspense for better loading states
import { Suspense } from 'react'

function Page() {
  return (
    <Suspense fallback={<Loading />}>
      <DataComponent />
    </Suspense>
  )
}
```

### **API Optimization**
```typescript
// Implement response caching
const cache = new Map()

export async function getCachedData(key: string, fetchFn: Function) {
  if (cache.has(key)) {
    const { data, timestamp } = cache.get(key)
    if (Date.now() - timestamp < 300000) { // 5 minutes
      return data
    }
  }
  
  const data = await fetchFn()
  cache.set(key, { data, timestamp: Date.now() })
  return data
}
```

---

## 💰 **Cost Transition Planning**

### **Free Tier Limits**
- **Development Phase**: $0/month (Free tiers)
- **Beta Testing**: $0/month (Still within limits)
- **Pre-Launch**: $0/month (Optimize before launch)

### **When to Upgrade**
- **Supabase**: >400MB database or >40K MAU
- **Vercel**: >80GB bandwidth or need team features
- **Timeline**: Usually 3-6 months into active use

### **Upgrade Path**
1. **Supabase Pro**: $25/month (8GB database, 100K MAU)
2. **Vercel Pro**: $20/month (100GB bandwidth, analytics)
3. **Total**: $45/month → Transition to Railway at $36/month

---

## 📋 **Development Launch Checklist**

### **Pre-Launch (Day -1)**
- [ ] Database schema finalized
- [ ] All API endpoints tested
- [ ] Authentication flows working
- [ ] User interfaces responsive
- [ ] Test data populated
- [ ] Environment variables configured
- [ ] Supabase RLS policies set

### **Launch Day**
- [ ] Deploy to Vercel
- [ ] Test all user flows
- [ ] Monitor Supabase dashboard
- [ ] Check Vercel deployment logs
- [ ] Test from different devices/browsers
- [ ] Share with beta users
- [ ] Monitor for errors

### **Post-Launch (Day +1)**
- [ ] Collect user feedback
- [ ] Monitor usage metrics
- [ ] Check performance metrics
- [ ] Review error logs
- [ ] Plan feature improvements
- [ ] Document lessons learned

---

## 🎯 **Success Metrics**

### **Technical KPIs**
- **Page Load Time**: <3 seconds
- **API Response Time**: <500ms
- **Uptime**: >99% (Vercel + Supabase reliability)
- **Error Rate**: <2% of requests

### **User Engagement KPIs**
- **User Registrations**: Track by user type
- **Feature Usage**: Service offers/requests creation
- **Session Duration**: Average time spent
- **Return Rate**: Users coming back

### **Development KPIs**
- **Time to Feature**: Days from idea to deployment
- **Bug Resolution**: Time to fix issues
- **Test Coverage**: Percentage of features tested
- **User Feedback**: Satisfaction scores

---

## 📞 **Support Resources**

### **Documentation Links**
- **Supabase Docs**: [supabase.com/docs](https://supabase.com/docs)
- **Vercel Docs**: [vercel.com/docs](https://vercel.com/docs)
- **Next.js Docs**: [nextjs.org/docs](https://nextjs.org/docs)

### **Community Support**
- **Supabase Discord**: Active community support
- **Vercel Discord**: Developer community
- **GitHub Issues**: For project-specific problems

### **Emergency Contacts**
- **Supabase Support**: support@supabase.io
- **Vercel Support**: Free tier has community support
- **Development Team**: Your team contact info

---

**Document Version**: 1.0  
**Created**: October 13, 2025  
**Purpose**: Free development environment setup  
**Next Phase**: Production deployment via DEPLOYMENT.md  

---

**Total Setup Time**: 2-3 hours  
**Monthly Cost**: $0 (100% free)  
**User Capacity**: 50,000 monthly active users  
**Storage**: 500MB database + 100GB bandwidth  
**Perfect for**: Development, testing, beta launch, MVP validation  

**Ready to launch your free development environment!** 🚀