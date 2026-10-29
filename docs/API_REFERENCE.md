# API Reference

## Base URL
```
Development: http://localhost:3000/api
Production: https://your-domain.com/api
```

## Authentication

### JWT Token Authentication
Platform sessions use an httpOnly `token` cookie set at login. API routes also accept `Authorization: Bearer <jwt>` from the in-memory copy the browser keeps for the tab. The JWT is not persisted in localStorage.

```javascript
Headers: {
  'Authorization': 'Bearer <jwt_token>',
  'Content-Type': 'application/json'
}
Cookies: {
  'token': '<platform_jwt>'
}
```

### Admin Authentication
Admin endpoints require admin token cookie:

```javascript
Cookies: {
  'admin-token': '<admin_jwt_token>'
}
```

## Response Format

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

## Authentication Endpoints

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

## User Management

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

## Platform newsletter

### GET /api/platform-newsletter
Public activity stream for the home page (joins, verifications, published needs/offers/campaigns). Not a social post API.

**Query Parameters:**
- `limit` (number): Max items (server-capped)

**Response:** JSON array of newsletter items (`kind`, actor fields, `title`, `summary`, timestamps).

## Service Offers

### GET /api/service-offers
Fetch service offers.

**Query Parameters:**
- `category` (string): Filter by impact area
- `location` (string): Filter by location
- `offer_type` (string): `financial`, `material`, `service`, `infrastructure`
- `transaction_type` (string): `volunteer`, `donate`, `rent` (`sell` is treated as rent)
- `search` (string): Search term
- `view` (string): `all`, `my-offers`, `my-responses` (also accepts `hired` as alias for `my-responses`)
- `include_expired` (boolean): Keep expired rows on owner/applicant views

**Headers:** Authorization required for `my-offers` and `my-responses`

**Public `view=all` rules:** `status=active`, unused, `is_listed` is not `false`, `admin_status` is not `rejected`, not expired, creator `verification_status=verified`, and Razorpay payout connected. Nested `ngo` never includes email, phone, or payout/bank `profile_data`.

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
        "user_type": "ngo",
        "verification_status": "verified",
        "profile_image": "https://example.com/logo.jpg"
      },
      "is_listed": true,
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
- Publisher must be a verified NGO, company, or individual with an active Razorpay payout. NGOs also need Trust, Society, or Section 8 on the verified profile.
- `offer_type` must be one of `financial`, `material`, `service`, `infrastructure`
- `transaction_type` must be one of `donate`, `rent`, `volunteer` (`sell` is stored as rent)
- New rows post live: `status=active`, `admin_status=approved`, `is_listed=true`
- Offer-specific fields are validated based on `offer_type`
- Pricing fields are validated based on `transaction_type`

### GET /api/service-offers/{id}
Get specific service offer details. Guests only receive publicly visible offers (`status=active`, listed, not rejected). Provider `email` and payout/bank `profile_data` are omitted for non-owners.

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
Apply for a service offer. Only verified NGOs with Trust/Society/Section 8 may apply. CSR-1 is not required.

**Headers:** Authorization required

**Request Body:**
```json
{
  "message": "We would like to use this capability against our need",
  "selected_need_ids": [31],
  "proposed_amount": 5000
}
```

**Rules:**
- Applicant must be a verified NGO (not the offer owner)
- `selected_need_ids` must include one active need
- Offer must be open (`status=active`, not unlisted, not rejected, not expired)
- `client_type` is recorded in `response_meta`

## Service Requests

### GET /api/service-requests
Fetch service requests (volunteer opportunities).

**Query Parameters:**
- `category` (string): Filter by category
- `location` (string): Filter by location
- `request_type` (string): Filter by need type
- `urgency` (string): Filter by urgency level
- `view` (string): omitted/`all` (public browse), `my-requests` (NGO owner), `my-responses` (volunteer applications; `volunteering` is an alias)

**Public browse (default and `view=all`):** open, unassigned, unexpired needs with remaining capacity. Required need `contact_info` is returned to every viewer (list and detail). Account email/phone on `requester` are omitted. `my-requests` and `my-responses` require a session.

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
      "location": "Pune",
      "volunteers_needed": 10,
      "urgency_level": "medium",
      "contact_info": "Volunteer desk, 98765 43210",
      "requester": {
        "id": 12,
        "name": "Green Community NGO",
        "user_type": "ngo",
        "verification_status": "verified"
      },
      "created_at": "2024-01-01T00:00:00Z"
    }
  ]
}
```

### GET /api/service-requests/{id}
Need detail. Public. `contact_info` is always included. `requester` email/phone are omitted unless the viewer is the owning NGO.

### POST /api/service-requests
Create a standalone need. Verified NGOs only.

**Headers:** Authorization required

**Required body:** `title`, `description`, `location`, `timeline`, `budget`, `contactInfo`, `impact_description`, `request_type`, `project_category` (or `category`), `beneficiary_count` > 0.

`contactInfo` is required (enough detail to reach the NGO, same rule as the create form). It is stored on `service_requests.contact_info` and in `requirements.contactInfo`, and it is shown on public list and detail.

Do not send `projectId` / `project`; needs are standalone.

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

## Profiles & Activity

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

## Admin Endpoints

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

## Health

### GET /api/health
Public liveness probe. Returns `status`, `timestamp`, and coarse `checks` (`database`, `core_config`, `external_services`). Production responses do not list which secrets or integrations are configured.

## NGO Network

### GET /api/ngos/network
Public NGO directory. Anonymous callers do not receive `email` or `phone`. Signed-in callers still receive contact details so companies and individuals can pay or message an NGO.

## Navadrishti AI Suite

User-facing names: **Atlas** (NGO), **Catalyst** (Company), **Pulse** (embedded matching). See `lib/ai-agent-sessions.ts`.

### POST /api/ai-agent/progress
Persist or load Atlas/Catalyst session state.

**Query:** `agent=ngo` (Atlas) or `agent=csr` (Catalyst)

**Body (POST):**
```json
{
  "agent": "ngo",
  "data": { "sessions": [], "activeSessionId": "..." }
}
```

### DELETE /api/ai-agent/sessions/[id]
Archive or delete a session. **Query:** `agent=ngo|csr`

### Catalyst — `/api/csr-agent/*`

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/csr-agent/generate-campaigns` | Gemini campaign drafts |
| POST | `/api/csr-agent/get-recommendations` | **Pulse** capability matches for campaign |
| POST | `/api/csr-agent/publish-campaign` | Publish after lead NGO accepted |
| POST | `/api/csr-agent/lead-ngo-invites` | Lead NGO invite sync |
| POST | `/api/csr-agent/update-campaign` | Update draft |

### Pulse — matching

| Method | Path | Used by |
|--------|------|---------|
| POST | `/api/service-requests/recommend` | Atlas, manual need create |
| POST | `/api/csr-agent/get-recommendations` | Catalyst, manual campaign create |
| POST | `/api/ngos/score` | Catalyst and manual campaign lead NGO ranking |

**Recommend request (abbreviated):**
```json
{
  "request_type": "Material Need",
  "title": "School supplies",
  "description": "...",
  "limit": 8
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "recommendations": [{ "id": 1, "title": "...", "score": 82 }],
    "suggested_set": []
  }
}
```

## Error Codes

| Code | Status | Description |
|------|--------|-----------|
| `UNAUTHORIZED` | 401 | Invalid or missing authentication |
| `FORBIDDEN` | 403 | Insufficient permissions |
| `NOT_FOUND` | 404 | Resource not found |
| `VALIDATION_ERROR` | 422 | Invalid request data |
| `RATE_LIMIT_EXCEEDED` | 429 | Too many requests |
| `SERVER_ERROR` | 500 | Internal server error |

## Rate Limits

- **Authentication**: 10 requests per minute
- **API Requests**: 100 requests per minute per user
- **File Uploads**: 20 requests per minute
- **Search**: 50 requests per minute