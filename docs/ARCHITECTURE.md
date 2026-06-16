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
│   ├── ui/               # Base UI components (shadcn)
│   ├── detail-fields.tsx # Shared DetailField / DetailSection helpers
│   ├── service-card.tsx  # Listing cards + YourCapabilitiesPanel (dashboard)
│   ├── ai-agent-cta.tsx  # Floating Atlas / Catalyst launcher
│   └── header.tsx        # Navigation + AuthBackButton
├── lib/                   # Utility libraries
│   ├── auth.ts           # Authentication utilities
│   ├── server-auth.ts    # JWT user + Navadrishti CA + Company CA auth
│   ├── ai-suite.ts       # Navadrishti AI Suite display names & routes
│   ├── service-request-allocation.ts  # Allocation, funding, fulfillment
│   ├── service-offers.ts # Offer types, dashboard classification, usage records
│   ├── ai-agent-sessions.ts           # Atlas/Catalyst session persistence
│   ├── db.ts             # Database connections
│   ├── utils.ts          # General utilities (currency, urgency, navigation)
│   └── csr-agent/        # Catalyst LLM + Pulse capability search
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
1. **NGO/Individual/Company** creates capability offers (NGOs also create service requests)
2. **Admin** reviews and approves content
3. **Users** browse and apply for services
4. **Offer owner** manages applications and hires
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
- **Service Offers**: Verified NGO, individual, and company capability offerings
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

#### Navadrishti AI Suite

User-facing agents use codenames only (no role subtitles in UI). Routes and API paths are unchanged.

| Codename | Route | Role | Matching (Pulse) |
|----------|-------|------|------------------|
| **Atlas** | `/ngos/ai-agent` | NGO project + need drafting, publish flow | `POST /api/service-requests/recommend` per need |
| **Catalyst** | `/companies/csr-agent` | CSR campaign intake, drafts, publish | `POST /api/csr-agent/get-recommendations`, `POST /api/ngos/score` |
| **Pulse** | *(embedded)* | Rank capability offers and NGO leads | Vector + lexical hybrid; no standalone page |
| **Sentinel** | — | Reserved | Monitoring intelligence (not productized) |
| **Insight** | — | Reserved | Analytics intelligence (not productized) |

Config: `lib/ai-suite.ts`. Session sync: `lib/ai-agent-sessions.ts`, `/api/ai-agent/progress`, `/api/ai-agent/sessions/[id]`.

## 🗄️ Database Design

### Core Tables
- **users**: User profiles and authentication
- **posts**: Social feed content
- **service_requests**: NGO assistance requests
- **service_offers**: Multi-provider capability offerings (NGO/individual/company)
- **service_volunteers**: Volunteer applications and progress

### Relationship Patterns
- **One-to-Many**: User → Posts, User → Service Offers
- **Many-to-Many**: Users ↔ Service Requests
- **Polymorphic**: Notifications → Multiple entity types

## 🔐 Security Architecture

### Authentication & Authorization
- **JWT Tokens**: Stateless authentication
- **Role-based Permissions**: Granular access control
- **Session Management**: Secure session handling
- **Server auth helpers**: `lib/server-auth.ts` (platform JWT, Navadrishti CA, Company CA)

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