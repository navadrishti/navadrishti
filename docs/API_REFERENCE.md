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
Create marketplace listing or purchase item.

**Headers:** Authorization required

#### Action: Create Listing

**Request Body:**
```json
{
  "action": "create",
  "title": "Handmade Crafts",
  "description": "Beautiful handmade items by local artisans",
  "price": 25.99,
  "quantity": 10,
  "category": "Handicrafts",
  "condition_type": "new",
  "images": ["https://cloudinary.com/image1.jpg"],
  "who_can_buy": ["ngo", "individual", "company"],
  "tags": ["handmade", "crafts"],
  "location": "Mumbai",
  "shipping_info": {
    "weight": 0.5,
    "dimensions": "10x10x5 cm",
    "shipping_cost": 5.99
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": 123,
    "message": "Marketplace item created successfully"
  }
}
```

**Validation:**
- `who_can_buy` must include at least one of: 'ngo', 'individual', 'company'
- Defaults to all three types if not specified
- `quantity` must be >= 1

#### Action: Purchase Item

**Request Body:**
```json
{
  "action": "purchase",
  "itemId": 123,
  "quantity": 2,
  "shippingAddress": {
    "street": "123 Main St",
    "city": "Mumbai",
    "state": "Maharashtra",
    "pincode": "400001"
  },
  "paymentMethod": "razorpay"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "purchaseId": 456,
    "totalAmount": 51.98,
    "message": "Purchase completed successfully"
  }
}
```

**Eligibility Check:**
- User's `user_type` must be in item's `who_can_buy` array
- Returns 403 if user type not eligible
- Example error: "This item can only be purchased by: NGOs. Your account type (Individual) is not eligible."

**Quantity Management:**
- Automatically reduces item quantity by purchase amount
- If quantity reaches 0:
  - Status set to 'sold'
  - `sold_at` timestamp recorded
  - Item deleted automatically after 1 hour (via cron)

### PUT /api/marketplace/:id
Update marketplace listing.

**Headers:** Authorization required  
**Authorization:** Only item owner can update

**Request Body:**
```json
{
  "title": "Updated Handmade Crafts",
  "description": "Updated description",
  "price": 29.99,
  "quantity": 15,
  "category": "Handicrafts",
  "condition_type": "like_new",
  "images": ["https://cloudinary.com/new-image.jpg"],
  "who_can_buy": ["ngo", "individual"],
  "tags": ["handmade", "artisan"],
  "status": "active"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Listing updated successfully",
  "item_id": 123
}
```

**Notes:**
- All fields are optional (only updated fields need to be sent)
- `who_can_buy` must include at least one eligible buyer type if provided
- Returns 403 if user is not the seller
- Returns 404 if item not found

### GET /api/marketplace/product/:id
Get detailed product information including reviews.

**Headers:** Authorization optional

**Response:**
```json
{
  "success": true,
  "data": {
    "id": 123,
    "title": "Handmade Crafts",
    "description": "Beautiful handmade items",
    "price": 25.99,
    "quantity": 10,
    "category": "Handicrafts",
    "condition_type": "new",
    "images": ["https://cloudinary.com/image1.jpg"],
    "seller": {
      "id": 456,
      "name": "John Doe",
      "avatar": "https://avatar.url"
    },
    "rating_average": 4.5,
    "rating_count": 10,
    "created_at": "2024-01-01T00:00:00Z",
    "reviews": [
      {
        "id": 1,
        "rating": 5,
        "title": "Great product!",
        "review_text": "Really satisfied with this purchase.",
        "verified_purchase": true,
        "helpful_count": 5,
        "reviewer": {
          "id": 789,
          "name": "Jane Smith",
          "avatar": "https://avatar.url"
        },
        "created_at": "2024-01-02T00:00:00Z"
      }
    ]
  }
}
```

**Notes:**
- Only returns published reviews
- Reviews sorted by creation date (newest first)
- `verified_purchase` badge shown for confirmed buyers

### POST /api/marketplace/product/:id
Submit a review for a marketplace item.

**Headers:** Authorization required

**Request Body:**
```json
{
  "action": "review",
  "rating": 5,
  "title": "Great product!",
  "review_text": "Really satisfied with this purchase. Highly recommend!"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "marketplace_item_id": 123,
    "reviewer_id": 789,
    "rating": 5,
    "title": "Great product!",
    "review_text": "Really satisfied with this purchase. Highly recommend!",
    "verified_purchase": true,
    "status": "published",
    "created_at": "2024-01-02T00:00:00Z"
  }
}
```

**Validation:**
- User must be authenticated
- `rating` must be between 1 and 5
- `review_text` is required (max 1000 chars)
- `title` is optional (max 200 chars)
- One review per user per item (UNIQUE constraint)

**Features:**
- Automatic verified purchase detection (checks order history)
- Rating statistics auto-updated on item
- Returns 409 if user already reviewed this item

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

## ⏰ Cron Jobs & Scheduled Tasks

### GET /api/cron/cleanup-sold-items
Automatically delete marketplace items sold more than 1 hour ago.

**Schedule:** Runs every hour at minute 0 (`0 * * * *`)  
**Trigger:** Vercel Cron  
**Headers:** `Authorization: Bearer ${CRON_SECRET}`

**Response:**
```json
{
  "success": true,
  "message": "Deleted 5 sold items",
  "deletedCount": 5,
  "deletedItems": [
    {
      "id": 123,
      "title": "Vintage Camera",
      "seller_id": 45,
      "soldAt": "2026-01-10T10:00:00Z"
    }
  ]
}
```

**Manual Trigger (POST):**
```bash
POST /api/cron/cleanup-sold-items
Content-Type: application/json

{
  "secret": "${CRON_SECRET}"
}
```

**Cleanup Logic:**
1. Finds items where `status = 'sold'` and `sold_at < NOW() - 1 hour`
2. Deletes matching items from database
3. Returns count and details of deleted items

**Configuration:**
```json
// vercel.json
{
  "crons": [
    {
      "path": "/api/cron/cleanup-sold-items",
      "schedule": "0 * * * *"
    }
  ]
}
```

**Environment Variables:**
- `CRON_SECRET`: Secure token for authorizing cron job requests

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