# Navadrishti

A comprehensive platform connecting NGOs, individuals, and companies for social impact through service requests, service offerings, and a collaborative marketplace.

## Features

### For NGOs
- **Service Requests**: Post volunteer opportunities and assistance needs
- **Service Offerings**: Offer professional services to individuals and companies
- **Volunteer Management**: Track and manage volunteer applications
- **Client Management**: Handle service hire requests and client relationships

### For Individuals & Companies
- **Volunteer Opportunities**: Browse and apply for NGO service requests
- **Professional Services**: Hire NGO services for specialized needs
- **Marketplace**: Buy and sell products within the community
- **Impact Tracking**: Monitor contributions and community involvement

### For Everyone
- **Unified Dashboard**: Personalized view of activities and opportunities
- **Secure Authentication**: Multi-tier user verification system
- **Real-time Updates**: Live notifications and status tracking
- **Mobile Responsive**: Seamless experience across all devices

## Technology Stack

### Frontend
- **Next.js 15**: React-based framework with App Router
- **TypeScript**: Type-safe development
- **Tailwind CSS**: Utility-first styling
- **shadcn/ui**: Modern component library
- **React Hook Form**: Form management with validation

### Backend & Database
- **Development**: Supabase PostgreSQL (Free Tier)
- **Production**: Railway MySQL (Planned)
- **Authentication**: Supabase Auth + Custom JWT
- **File Storage**: Supabase Storage
- **Real-time**: Supabase Realtime subscriptions

### Deployment
- **Development**: Vercel (Free Tier)
- **Production**: Railway (Planned)
- **CI/CD**: GitHub Actions with Vercel integration
- **Domain**: Custom domain with HTTPS

## Quick Start

### Prerequisites
- Node.js 18+ 
- npm or pnpm
- Git

### Development Setup
```bash
# Clone the repository
git clone https://github.com/yourusername/Navadrishti.git
cd Navadrishti

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env.local
# Edit .env.local with your Supabase credentials

# Run development server
npm run dev
```

Visit `http://localhost:3000` to see the application.

## Project Structure

```
Navadrishti/
├── app/                    # Next.js App Router
│   ├── api/               # API routes
│   ├── (auth)/            # Authentication pages
│   ├── marketplace/       # Marketplace features
│   ├── service-requests/  # Service request management
│   ├── service-offers/    # Service offer management
│   └── layout.tsx         # Root layout
├── components/            # Reusable UI components
├── lib/                   # Utility functions and configs
├── hooks/                 # Custom React hooks
├── public/               # Static assets
└── styles/               # Global styles
```

## Environment Variables

Create a `.env.local` file with the following variables:

```bash
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Application Configuration
NODE_ENV=development
APP_NAME=Navadrishti
APP_URL=http://localhost:3000

# JWT Configuration
JWT_SECRET=your_jwt_secret
JWT_EXPIRES_IN=7d
```

## Database Schema

The application uses a PostgreSQL database with the following main tables:

- **users**: User profiles and authentication data
- **service_requests**: NGO volunteer and assistance requests
- **service_offers**: NGO professional service offerings
- **service_volunteers**: Volunteer application tracking
- **service_hires**: Service hire request tracking
- **marketplace_items**: Community marketplace listings
- **marketplace_transactions**: Purchase and sale records

## API Documentation

### Authentication Endpoints
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `POST /api/auth/logout` - User logout
- `GET /api/auth/user` - Get current user

### Service Management
- `GET /api/service-requests` - List service requests
- `POST /api/service-requests` - Create service request
- `GET /api/service-requests/[id]` - Get service request details
- `PUT /api/service-requests/[id]` - Update service request
- `DELETE /api/service-requests/[id]` - Delete service request

### Marketplace
- `GET /api/marketplace` - List marketplace items
- `POST /api/marketplace` - Create marketplace listing
- `GET /api/marketplace/[id]` - Get item details
- `PUT /api/marketplace/[id]` - Update listing
- `DELETE /api/marketplace/[id]` - Delete listing

## Testing

```bash
# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- **NGO Community**: For inspiring the vision of digital social impact
- **Open Source**: Built on the shoulders of amazing open source projects
- **Contributors**: Everyone who helps make this platform better

## Support

- **GitHub Issues**: Report bugs and request features
- **Documentation**: Check the `/docs` folder for detailed guides
- **Community**: Join our discussions in GitHub Discussions

---

**Building bridges between compassion and action**
