# System Architecture

## 🏗️ Overview

Navdrishti follows a modern full-stack architecture built on Next.js with a PostgreSQL database, designed for scalability and maintainability.

## 📐 Architecture Patterns

### Frontend Architecture
- **Framework**: Next.js 15 with App Router
- **Rendering**: Server-side rendering (SSR) + Client-side rendering (CSR)
- **State Management**: React Context + Local State
- **Component Library**: Radix UI + Custom Components
- **Styling**: Tailwind CSS with CSS Variables

### Backend Architecture
- **API Layer**: Next.js API Routes
- **Database**: Supabase PostgreSQL
- **Authentication**: JWT-based with Role-based Access Control (RBAC)
- **File Storage**: Cloudinary CDN
- **Email Service**: Nodemailer

## 🗂️ Folder Structure

```
├── app/                    # Next.js App Router
│   ├── (auth)/            # Authentication routes
│   ├── admin/             # Admin dashboard
│   ├── api/               # API endpoints
│   │   ├── auth/          # Authentication APIs
│   │   ├── posts/         # Social feed APIs
│   │   ├── service-*      # Service-related APIs
│   │   ├── dashboard/     # Dashboard and stats APIs
│   │   └── admin/         # Admin APIs
│   ├── ca/                # CA verification console
│   ├── service-offers/    # Service offers pages
│   ├── service-requests/  # Service requests pages
│   └── [user-pages]/     # User-facing pages
├── components/            # Reusable components
│   ├── ui/               # Base UI components
│   └── [feature-components] # Feature-specific components
├── lib/                   # Utility libraries
│   ├── auth.ts           # Authentication utilities
│   ├── db.ts             # Database connections
│   ├── utils.ts          # General utilities
│   └── [service-libs]    # Service-specific libraries
├── hooks/                # Custom React hooks
├── styles/               # Global styles
└── docs/                 # Documentation
```

## 🔄 Data Flow

### User Authentication Flow
1. **Login Request** → JWT Token Generation → User Context Update
2. **Protected Routes** → Token Verification → Role-based Access
3. **API Requests** → Bearer Token → Route Authorization

### Service Management Flow
1. **NGO** creates service request/offer
2. **Admin** reviews and approves content
3. **Users** browse and apply for services
4. **NGO** manages applications and hires
5. **Platform** tracks engagement and analytics

### Social Feed Flow
1. **User** creates post with content/media
2. **System** processes hashtags and mentions
3. **Feed Algorithm** distributes to relevant users
4. **Users** interact (like, comment, share)
5. **Analytics** track engagement metrics

## 🏛️ Component Architecture

### Core Components

#### Authentication System
- **JWT Management**: Token generation, validation, refresh
- **Role-based Access**: NGO, Individual, Company, Admin permissions
- **Session Management**: Secure session handling
- **Verification System**: Multi-step user verification

#### Service Management
- **Service Requests**: NGO volunteer/assistance requests
- **Service Offers**: NGO professional service offerings
- **Application Tracking**: User applications and hire management
- **Admin Moderation**: Content approval and review system

#### Social Platform
- **Post Creation**: Rich text, media upload, hashtags
- **Feed Algorithm**: Personalized content delivery
- **Interaction System**: Likes, comments, shares, reactions
- **Real-time Features**: Live updates and notifications

#### Verification & Compliance
- **CA Console**: Chartered Accountant review workflow for NGO and company verification
- **Document Review**: Structured case handling with uploaded evidence
- **Audit Trail**: Verification decisions and case lifecycle tracking
- **Status Management**: Assignment, review, clarification, approval, and rejection flows

## 🗄️ Database Design

### Core Tables
- **users**: User profiles and authentication
- **posts**: Social feed content
- **service_requests**: NGO assistance requests
- **service_offers**: NGO service offerings
- **service_volunteers**: Volunteer applications and progress
- **service_clients**: Client engagements for offered services

### Relationship Patterns
- **One-to-Many**: User → Posts, NGO → Service Offers
- **Many-to-Many**: Users ↔ Service Applications
- **Polymorphic**: Notifications → Multiple entity types

## 🔐 Security Architecture

### Authentication & Authorization
- **JWT Tokens**: Stateless authentication
- **Role-based Permissions**: Granular access control
- **Session Management**: Secure session handling
- **CSRF Protection**: Request validation

### Data Protection
- **Input Validation**: Server-side validation with Zod
- **SQL Injection Prevention**: Parameterized queries
- **XSS Protection**: Content sanitization
- **File Upload Security**: Type validation and scanning

## 🚀 Performance Architecture

### Frontend Optimizations
- **Server-side Rendering**: Improved SEO and initial load
- **Image Optimization**: Next.js Image component + Cloudinary
- **Code Splitting**: Dynamic imports and lazy loading
- **Caching Strategy**: Static generation where possible

### Backend Optimizations
- **Database Indexing**: Optimized query performance
- **Connection Pooling**: Efficient database connections
- **API Caching**: Response caching for static data
- **CDN Integration**: Global content delivery

## 🔧 Integration Points

### External Services
- **Supabase**: Primary database and real-time features
- **Cloudinary**: Image/video storage and optimization
- **Email Service**: Transactional email delivery
- **SMS Gateway**: OTP and notifications

### API Integration Patterns
- **RESTful Design**: Consistent endpoint structure
- **Error Handling**: Standardized error responses
- **Rate Limiting**: API protection and fair usage
- **Versioning Strategy**: Future-proof API evolution

## 🔄 Deployment Architecture

### Environment Structure
- **Development**: Local development with hot reload
- **Staging**: Pre-production testing environment
- **Production**: Optimized build with monitoring

### CI/CD Pipeline
- **Version Control**: Git-based workflow
- **Automated Testing**: Unit and integration tests
- **Build Process**: Optimized production builds
- **Deployment**: Automated deployment to Vercel

## 📈 Scalability Considerations

### Horizontal Scaling
- **Stateless Architecture**: Easy horizontal scaling
- **Database Scaling**: Read replicas and connection pooling
- **CDN Usage**: Global content distribution
- **Microservices Ready**: Modular component design

### Performance Monitoring
- **Error Tracking**: Application error monitoring
- **Performance Metrics**: Response time and throughput
- **User Analytics**: Usage patterns and optimization
- **Database Monitoring**: Query performance and optimization