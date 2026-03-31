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

### POST /api/auth/login
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

### GET /api/auth/me
Get the currently authenticated user profile from the token.

**Headers:** Authorization required

**Response:**
```json
{
  "user": {
    "id": 1,
    "name": "John Doe",
    "email": "john@example.com",
    "user_type": "individual",
    "verification_status": "verified",
    "profile_image": "https://example.com/image.jpg"
  }
}
```

## 👥 User Management

### PUT /api/profile/update
Update current user profile.

**Headers:** Authorization required

**Request Body:**
```json
{
  "name": "Updated Name",
  "bio": "Updated bio",
  "profileImageUrl": "https://cloudinary.com/image.jpg",
  "city": "New City",
  "state_province": "State",
  "pincode": "123456",
  "country": "Country",
  "skills": "React, Node.js",
  "interests": "Community development"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Profile updated successfully",
  "user": {}
}
```

### POST /api/profile/update
Legacy profile update endpoint retained for compatibility.

**Headers:** Optional Authorization (endpoint accepts `userId` in body)

**Request Body:**
```json
{
  "userId": 1,
  "name": "Updated Name",
  "bio": "Updated bio",
  "location": "New City, State"
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

### POST /api/posts/{postId}/interact
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
- `offer_type` (string): `financial`, `material`, `service`, `infrastructure`
- `search` (string): Search term
- `view` (string): `all`, `my-offers`, `my-responses` (also accepts `hired` as alias for `my-responses`)

**Headers:** Authorization required for `my-offers` and `my-responses`

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "title": "CSR Field Team Deployment",
      "description": "Rapid field deployment support for short-term projects",
      "category": "Execution Capability",
      "offer_type": "infrastructure",
      "transaction_type": "rent",
      "rent_per_day": 15000,
      "scope": "On-ground project execution",
      "capacity": "2 teams",
      "budget_range": "INR 3L - 8L",
      "provider_name": "Tech for Good NGO",
      "provider_type": "ngo",
      "ngo": {
        "id": 5,
        "name": "Tech for Good NGO",
        "email": "info@techforgood.org",
        "user_type": "ngo",
        "verification_status": "verified",
        "profile_image": "https://example.com/logo.jpg"
      },
      "location": "Bengaluru",
      "price_type": "fixed",
      "price_amount": 15000,
      "price_description": "Rent: INR 15,000 per day",
      "status": "active",
      "admin_status": "approved",
      "applications_count": 4,
      "hires_count": 1,
      "created_at": "2024-01-01T00:00:00Z"
    }
  ]
}
```

### POST /api/service-offers
Create a new capability offer (verified NGO, individual, or company).

**Headers:** Authorization required (verified NGO/individual/company user type)

**Request Body:**
```json
{
  "title": "Emergency Material Logistics",
  "description": "Large-volume material transport and last-mile delivery",
  "offer_type": "material",
  "transaction_type": "sell",
  "sell_amount": 250000,
  "item": "Relief kits",
  "quantity": 1200,
  "delivery_scope": "Karnataka and Telangana",
  "location": "Bengaluru"
}
```

**Required rules:**
- `offer_type` must be one of `financial`, `material`, `service`, `infrastructure`
- `transaction_type` must be one of `sell`, `rent`, `volunteer`
- Offer-specific fields are validated based on `offer_type`
- Pricing fields are validated based on `transaction_type`

### GET /api/service-offers/{id}
Get specific service offer details.

**Response:**
```json
{
  "id": 1,
  "title": "Emergency Material Logistics",
  "description": "Detailed description...",
  "offer_type": "material",
  "transaction_type": "sell",
  "item": "Relief kits",
  "quantity": 1200,
  "delivery_scope": "Karnataka and Telangana",
  "provider_name": "Tech for Good NGO",
  "provider_type": "ngo",
  "status": "active"
}
```

### POST /api/service-offers/{id}/clients
Apply for a service offer (hire the provider).

**Headers:** No authorization header required in current implementation.

**Request Body:**
```json
{
  "client_id": 42,
  "client_type": "company",
  "message": "We would like to hire your services for our project",
  "proposed_amount": 5000,
  "start_date": "2024-02-01",
  "end_date": "2024-05-01"
}
```

**Rules:**
- `client_id`, `client_type`, and `message` are required
- `client_type` is recorded in `response_meta`
- Allowed applicant user types: `individual`, `company`, `ngo`
- Applicant must be `verified`
- Users cannot apply to their own offer

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

## 👤 Profiles & Activity

### GET /api/profile/{userId}
Fetch a public profile summary for a user.

**Headers:** Authorization optional

**Response:**
```json
{
  "success": true,
  "profile": {
    "id": 42,
    "name": "Green Community NGO",
    "user_type": "ngo",
    "verification_status": "verified",
    "profile_image": "https://example.com/avatar.jpg",
    "created_at": "2024-01-01T00:00:00Z",
    "profile_data": {
      "bio": "Community-led environmental work",
      "focus_areas": "Climate, education"
    }
  }
}
```

### GET /api/dashboard/stats
Fetch role-specific dashboard metrics.

**Headers:** Authorization required

**Response:**
```json
{
  "success": true,
  "data": {
    "acceptedServiceRequests": 8,
    "acceptedServiceOffers": 3,
    "serviceRequestsPending": 4,
    "serviceOffersCompleted": 6
  }
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

### POST /api/admin/service-offers/{offerId}/review
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
    "active_service_offers": 27,
    "success_stories": 23
  }
}
```

### GET /api/activity-feed
Fetch user activity feed.

**Query Parameters:**
- `userId` (required): User ID to fetch activities for
- `limit` (number): Number of activities to return (default: 20)

**Response:**
```json
{
  "success": true,
  "activities": [
    {
      "id": 1,
      "user_id": 123,
      "activity_type": "post_created",
      "entity_type": "post",
      "entity_id": 456,
      "activity_data": {},
      "visibility": "public",
      "created_at": "2024-01-01T00:00:00Z"
    }
  ]
}
```

### GET /api/platform-activities
Fetch recent platform-wide activities (last 24 hours).

**Query Parameters:** None

**Response:**
```json
{
  "success": true,
  "activities": [
    {
      "id": "service-request-123",
      "type": "service_request",
      "title": "created a new service request",
      "user": {
        "id": 456,
        "name": "John Doe",
        "profile_image": "https://example.com/image.jpg",
        "user_type": "ngo",
        "verification_status": "verified"
      },
      "timestamp": "2024-01-01T00:00:00Z",
      "metadata": {
        "category": "Education",
        "urgency_level": "medium"
      },
      "link": "/service-requests"
    }
  ]
}
```

**Notes:**
- Cached for 30 seconds
- Returns activities from last 24 hours
- Includes service requests, service offers, posts, users, and verifications

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