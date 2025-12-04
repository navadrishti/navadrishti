# Navdrishti - Project Documentation

**Navdrishti** is a comprehensive social impact platform that connects NGOs, individuals, and companies to facilitate meaningful community engagement through service requests, professional services, and marketplace transactions.

## 🌟 Platform Overview

Navdrishti serves as a bridge between those who need help and those who can provide it, creating a sustainable ecosystem for social impact and community development.

### Key Features
- **Service Requests**: NGOs post volunteer opportunities and community projects
- **Service Offers**: NGOs showcase professional services to get hired
- **Social Feed**: Community engagement through posts, likes, and interactions
- **Marketplace**: Buy/sell platform for community commerce
- **Multi-tier Authentication**: Separate user types with role-based permissions
- **Real-time Notifications**: Keep users engaged with activity updates
- **Admin Dashboard**: Content moderation and platform management

### User Types
1. **NGOs** - Create service requests, offer professional services, manage projects
2. **Individuals** - Volunteer for causes, hire NGO services, participate in marketplace
3. **Companies** - Partner with NGOs, hire services, support community initiatives
4. **Admins** - Platform moderation, user verification, content management

## 📚 Documentation Structure

| File | Purpose |
|------|--------|
| [ARCHITECTURE.md](./ARCHITECTURE.md) | System architecture, tech stack, and component interactions |
| [API_REFERENCE.md](./API_REFERENCE.md) | Complete API documentation with endpoints and examples |
| [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md) | Database tables, relationships, and data models |
| [ENVIRONMENT.md](./ENVIRONMENT.md) | Environment variables, configuration, and setup |
| [VERIFICATION_FLOW.md](./VERIFICATION_FLOW.md) | User verification process and compliance |
| [DEPLOYMENT.md](./DEPLOYMENT.md) | Deployment guides for development and production |
| [CONTRIBUTING.md](./CONTRIBUTING.md) | Development guidelines and contribution process |

## 🚀 Quick Start

1. **Setup Environment**
   ```bash
   cp .env.example .env.local
   # Configure your environment variables
   ```

2. **Install Dependencies**
   ```bash
   npm install
   ```

3. **Start Development**
   ```bash
   npm run dev
   ```

4. **Access Platform**
   - Frontend: http://localhost:3000
   - Admin Panel: http://localhost:3000/admin

## 🛠️ Technology Stack

- **Framework**: Next.js 15.5.6 (React 19.2.0)
- **Database**: Supabase PostgreSQL
- **Authentication**: JWT + Custom Auth System
- **Styling**: Tailwind CSS + Radix UI
- **File Storage**: Cloudinary
- **Payments**: Razorpay Integration
- **Email**: Nodemailer
- **Deployment**: Vercel-ready

## 📖 For Developers

This documentation is designed to help developers at all levels understand and contribute to Navdrishti:

- **New Team Members**: Start with [ARCHITECTURE.md](./ARCHITECTURE.md) to understand the system design
- **Backend Developers**: Focus on [API_REFERENCE.md](./API_REFERENCE.md) and [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md)
- **Frontend Developers**: Review component structure and API integration patterns
- **DevOps Engineers**: Check [DEPLOYMENT.md](./DEPLOYMENT.md) for infrastructure setup
- **Contributors**: Read [CONTRIBUTING.md](./CONTRIBUTING.md) for development workflows

## 🎯 Project Goals

- **Social Impact**: Facilitate meaningful connections between helpers and those in need
- **Scalability**: Support growing communities with robust infrastructure
- **User Experience**: Intuitive interface for all user types
- **Transparency**: Clear processes for verification and trust-building
- **Sustainability**: Economic models that support long-term platform viability