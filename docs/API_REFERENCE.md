# API Reference

## 🔗 Base URL
```
Development: http://localhost:3000/api
Production: https://your-domain.com/api
```

## 🔐 Authentication

### JWT Token Authentication
Most endpoints require authentication via Bearer token:

```javascript
Headers: {
  'Authorization': 'Bearer <jwt_token>',
  'Content-Type': 'application/json'
}
```

### Admin Authentication
Admin endpoints require admin token cookie:

```javascript
Cookies: {
  'admin-token': '<admin_jwt_token>'
}
```

## 📝 Response Format

### Success Response
```json
{
  "success": true,
  "data": {},
  "message": "Optional success message"
}
```

### Error Response
```json
{
  "error": "Error message",
  "details": "Additional error details",
  "code": "ERROR_CODE"
}
```

## 🔑 Authentication Endpoints

### POST /api/auth/signup
Register a new user account.

**Request Body:**
```json
{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "securepassword",
  "user_type": "individual", // "ngo", "individual", "company"
  "phone": "+1234567890",
  "profile_data": {
    "organization_name": "My NGO", // for NGOs
    "company_name": "My Company"   // for companies
  }
}
```

**Response:**
```json
{
  "success": true,
  "user": {
    "id": 1,
    "name": "John Doe",
    "email": "john@example.com",
    "user_type": "individual"
  },
  "token": "jwt_token_here"
}
```

### POST /api/auth/signin
Authenticate existing user.

**Request Body:**
```json
{
  "email": "john@example.com",
  "password": "securepassword"
}
```

**Response:**
```json
{
  "success": true,
  "user": {
    "id": 1,
    "name": "John Doe",
    "email": "john@example.com",
    "user_type": "individual",
    "verification_status": "verified"
  },
  "token": "jwt_token_here"
}
```

### POST /api/auth/verify-token
Validate JWT token and get user info.

**Headers:** Authorization required

**Response:**
```json
{
  "valid": true,
  "user": {
    "id": 1,
    "name": "John Doe",
    "email": "john@example.com",
    "user_type": "individual"
  }
}
```

## 👥 User Management

### GET /api/users/profile
Get current user profile.

**Headers:** Authorization required

**Response:**
```json
{
  "success": true,
  "user": {
    "id": 1,
    "name": "John Doe",
    "email": "john@example.com",
    "user_type": "individual",
    "profile_image": "https://example.com/image.jpg",
    "bio": "User bio",
    "location": "City, State",
    "verification_status": "verified",
    "created_at": "2024-01-01T00:00:00Z"
  }
}
```

### PUT /api/users/profile
Update user profile.

**Headers:** Authorization required

**Request Body:**
```json
{
  "name": "Updated Name",
  "bio": "Updated bio",
  "location": "New City, State",
  "profile_image": "https://cloudinary.com/image.jpg"
}
```

## 📱 Social Feed

### GET /api/posts
Fetch social feed posts.

**Query Parameters:**
- `page` (number): Page number (default: 1)
- `limit` (number): Posts per page (default: 10)
- `user_id` (number): Filter by user ID
- `hashtag` (string): Filter by hashtag

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "content": "Post content here",
      "media_url": "https://example.com/image.jpg",
      "hashtags": ["#community", "#help"],
      "author": {
        "id": 1,
        "name": "John Doe",
        "profile_image": "https://example.com/avatar.jpg",
        "user_type": "individual",
        "verified": true
      },
      "stats": {
        "likes": 25,
        "comments": 5,
        "shares": 2,
        "views": 150
      },
      "user_interaction": {
        "has_liked": false,
        "has_shared": false
      },
      "created_at": "2024-01-01T00:00:00Z"
    }
  ],
  "pagination": {
    "current_page": 1,
    "total_pages": 10,
    "total_count": 95
  }
}
```

### POST /api/posts
Create a new post.

**Headers:** Authorization required

**Request Body:**
```json
{
  "content": "Post content with #hashtags",
  "media_url": "https://cloudinary.com/image.jpg",
  "media_type": "image", // "image", "video", null
  "visibility": "public" // "public", "followers", "private"
}
```

### POST /api/posts/{id}/interact
Interact with a post (like, share, view).

**Headers:** Authorization required

**Request Body:**
```json
{
  "action": "like" // "like", "share", "view"
}
```

## 🎯 Service Offers

### GET /api/service-offers
Fetch service offers.

**Query Parameters:**
- `category` (string): Filter by category
- `location` (string): Filter by location
- `employment_type` (string): Filter by employment type
- `search` (string): Search term
- `view` (string): "all", "my-offers", "public"

**Headers:** Authorization required for "my-offers" view

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "title": "Web Development Services",
      "description": "Professional web development for NGOs",
      "category": "Technology",
      "ngo": {
        "id": 5,
        "name": "Tech for Good NGO",
        "email": "info@techforgood.org",
        "verified": true,
        "profile_image": "https://example.com/logo.jpg"
      },
      "location": {
        "state": "California",
        "city": "San Francisco",
        "area": "Downtown"
      },
      "wage_info": {
        "type": "hourly",
        "min_amount": 50,
        "max_amount": 100,
        "currency": "USD"
      },
      "employment_type": "contract",
      "duration": "3-6 months",
      "experience_requirements": "3+ years in web development",
      "skills_required": ["JavaScript", "React", "Node.js"],
      "admin_status": "approved",
      "created_at": "2024-01-01T00:00:00Z"
    }
  ]
}
```

### POST /api/service-offers
Create a new service offer (NGOs only).

**Headers:** Authorization required (NGO user type)

**Request Body:**
```json
{
  "title": "Web Development Services",
  "description": "Professional web development for organizations",
  "category": "Technology",
  "location": {
    "state": "California",
    "city": "San Francisco",
    "area": "Downtown"
  },
  "wage_info": {
    "type": "hourly",
    "min_amount": 50,
    "max_amount": 100,
    "currency": "USD"
  },
  "employment_type": "contract",
  "duration": {
    "type": "fixed",
    "duration_months": "6"
  },
  "experience_requirements": {
    "level": "Advanced expertise with multiple certifications"
  },
  "skills_required": ["JavaScript", "React", "Node.js"],
  "benefits": ["Flexible Hours", "Remote Work"],
  "application_deadline": "2024-06-01",
  "contact_preferences": {
    "email": true,
    "phone": false
  }
}
```

### GET /api/service-offers/{id}
Get specific service offer details.

**Response:**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "title": "Web Development Services",
    "description": "Detailed description...",
    "ngo": {
      "id": 5,
      "name": "Tech for Good NGO",
      "profile_image": "https://example.com/logo.jpg",
      "verified": true
    },
    "application_count": 12,
    "hire_count": 3,
    "status": "active"
  }
}
```

### POST /api/service-offers/{id}/clients
Apply for a service offer (hire the NGO).

**Headers:** Authorization required

**Request Body:**
```json
{
  "message": "We would like to hire your services for our project",
  "proposed_amount": 5000,
  "start_date": "2024-02-01",
  "end_date": "2024-05-01"
}
```

## 🙋 Service Requests

### GET /api/service-requests
Fetch service requests (volunteer opportunities).

**Query Parameters:**
- `category` (string): Filter by category
- `location` (string): Filter by location
- `urgency` (string): Filter by urgency level
- `view` (string): "all", "my-requests", "public"

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "title": "Community Garden Volunteer",
      "description": "Help maintain our community garden",
      "category": "Environment",
      "location": "San Francisco, CA",
      "volunteers_needed": 10,
      "volunteers_registered": 7,
      "urgency_level": "medium",
      "ngo": {
        "name": "Green Community NGO",
        "verified": true
      },
      "created_at": "2024-01-01T00:00:00Z"
    }
  ]
}
```

### POST /api/service-requests/{id}/volunteers
Volunteer for a service request.

**Headers:** Authorization required

**Request Body:**
```json
{
  "message": "I'd like to help with this project",
  "availability": "weekends",
  "experience": "Previous gardening experience"
}
```

## 🛒 Marketplace

### GET /api/marketplace
Fetch marketplace items.

**Query Parameters:**
- `category` (string): Filter by category
- `price_min` (number): Minimum price
- `price_max` (number): Maximum price
- `location` (string): Filter by location
- `condition` (string): "new", "used", "refurbished"

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "title": "Handmade Crafts",
      "description": "Beautiful handmade items",
      "price": 25.99,
      "category": "Handicrafts",
      "condition": "new",
      "images": ["https://example.com/image1.jpg"],
      "seller": {
        "id": 3,
        "name": "Artisan NGO",
        "user_type": "ngo",
        "verified": true
      },
      "location": "Mumbai, India",
      "created_at": "2024-01-01T00:00:00Z"
    }
  ]
}
```

### POST /api/marketplace
Create marketplace listing.

**Headers:** Authorization required

**Request Body:**
```json
{
  "title": "Handmade Crafts",
  "description": "Beautiful handmade items by local artisans",
  "price": 25.99,
  "category": "Handicrafts",
  "condition": "new",
  "images": ["https://cloudinary.com/image1.jpg"],
  "stock_quantity": 50,
  "shipping_info": {
    "weight": 0.5,
    "dimensions": "10x10x5 cm",
    "shipping_cost": 5.99
  }
}
```

## 🛍️ Orders & Cart

### GET /api/cart
Get user's cart items.

**Headers:** Authorization required

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "quantity": 2,
      "marketplace_item": {
        "id": 5,
        "title": "Handmade Crafts",
        "price": 25.99,
        "images": ["https://example.com/image.jpg"]
      },
      "created_at": "2024-01-01T00:00:00Z"
    }
  ],
  "total_items": 2,
  "total_amount": 51.98
}
```

### POST /api/cart
Add item to cart.

**Headers:** Authorization required

**Request Body:**
```json
{
  "marketplace_item_id": 5,
  "quantity": 2
}
```

### POST /api/orders
Create order from cart.

**Headers:** Authorization required

**Request Body:**
```json
{
  "shipping_address": {
    "name": "John Doe",
    "address_line_1": "123 Main St",
    "city": "San Francisco",
    "state": "CA",
    "postal_code": "94102",
    "country": "USA"
  },
  "payment_method": "razorpay"
}
```

## 👑 Admin Endpoints

### GET /api/admin/service-offers
Get all service offers for admin review.

**Headers:** Admin authentication required

**Response:**
```json
{
  "success": true,
  "offers": [
    {
      "id": 1,
      "title": "Web Development Services",
      "organization": {
        "name": "Tech NGO",
        "email": "info@techngo.org"
      },
      "admin_status": "pending",
      "created_at": "2024-01-01T00:00:00Z"
    }
  ]
}
```

### POST /api/admin/service-offers/{id}/review
Review and approve/reject service offer.

**Headers:** Admin authentication required

**Request Body:**
```json
{
  "action": "approve", // "approve" or "reject"
  "comments": "Looks good, approved for publication"
}
```

## 📊 Analytics

### GET /api/stats
Get platform statistics.

**Response:**
```json
{
  "success": true,
  "data": {
    "total_users": 1250,
    "active_service_requests": 45,
    "total_volunteers": 320,
    "marketplace_items": 156,
    "total_orders": 89,
    "success_stories": 23
  }
}
```

## 🚫 Error Codes

| Code | Status | Description |
|------|--------|-----------|
| `UNAUTHORIZED` | 401 | Invalid or missing authentication |
| `FORBIDDEN` | 403 | Insufficient permissions |
| `NOT_FOUND` | 404 | Resource not found |
| `VALIDATION_ERROR` | 422 | Invalid request data |
| `RATE_LIMIT_EXCEEDED` | 429 | Too many requests |
| `SERVER_ERROR` | 500 | Internal server error |

## 📋 Rate Limits

- **Authentication**: 10 requests per minute
- **API Requests**: 100 requests per minute per user
- **File Uploads**: 20 requests per minute
- **Search**: 50 requests per minute