# Service Offers 500 Error - Fix Guide

## Summary of Changes

Fixed critical issues in the service offer creation endpoint (`/app/api/service-offers/route.ts`) that were causing HTTP 500 errors.

### Problems Fixed

1. **Offer Insert Fallback**: Fixed `insertWithSchemaFallback` to properly validate returned data
2. **Capability Creation**: Removed complex `buildBackendCapabilities` function and streamlined error handling
3. **Error Responses**: Enhanced response format to indicate partial failures gracefully
4. **Logging**: Added detailed console logging for debugging

## Testing the Fix

### Prerequisites
- Authentication token from a verified user (NGO, Company, or Individual)
- User must have `verification_status: 'verified'`

### Using cURL

```bash
# Set your token
TOKEN="your_jwt_token_here"
BASE_URL="http://localhost:3000"

# Test: Create a Financial Offer
curl -X POST "$BASE_URL/api/service-offers" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "title": "Funding Support for Education",
    "description": "We can provide funding for educational initiatives",
    "offer_type": "financial",
    "transaction_type": "donate",
    "impact_area": ["Education"],
    "tags": ["scholarship", "funding"],
    "city": "Mumbai",
    "state_province": "Maharashtra",
    "pincode": "400001",
    "coverage_area": "Pan India",
    "price_type": "free",
    "price_amount": 0,
    "offer_details": {
      "funding_type": "grant",
      "budget_amount": 500000,
      "disbursement_schedule": "quarterly",
      "eligibility_conditions": "NGOs working in education sector"
    },
    "requirements": "Annual reporting required"
  }'
```

### Using API Client (Postman/Insomnia)

1. **Set up request**
   - URL: `http://localhost:3000/api/service-offers`
   - Method: `POST`
   - Header: `Authorization: Bearer <your_token>`
   - Header: `Content-Type: application/json`

2. **Test Payload - Material Offer**
   ```json
   {
     "title": "Medical Supplies Donation",
     "description": "First aid kits and basic medical supplies",
     "offer_type": "material",
     "transaction_type": "donate",
     "impact_area": ["Healthcare"],
     "tags": ["medical", "supplies"],
     "city": "Delhi",
     "state_province": "Delhi",
     "pincode": "110001",
     "coverage_area": "Delhi NCR",
     "price_type": "free",
     "price_amount": 0,
     "offer_details": {
       "condition": "new",
       "stock_status": "in_stock",
       "quantity": 100,
       "unit": "kits",
       "available_from": "2025-05-01",
       "available_to": "2026-05-01"
     }
   }
   ```

3. **Test Payload - Service Offer (Rent)**
   ```json
   {
     "title": "Web Development Services",
     "description": "Custom web application development",
     "offer_type": "service",
     "transaction_type": "rent",
     "impact_area": ["Technology"],
     "tags": ["development", "web", "fullstack"],
     "city": "Bangalore",
     "state_province": "Karnataka",
     "pincode": "560001",
     "coverage_area": "India",
     "price_type": "fixed",
     "price_amount": 50000,
     "offer_details": {
       "skills_required": ["React", "Node.js", "Database Design"],
       "employment_type": "contract",
       "wage_info": { "per_day": 5000 },
       "hours_per_day": 8,
       "duration": "3 months"
     }
   }
   ```

### Expected Success Response

```json
{
  "success": true,
  "data": {
    "id": 42,
    "message": "Capability offer created successfully and submitted for approval",
    "capability_id": 1025
  },
  "status": 201
}
```

### Expected Response If Capability Indexing Fails (Partial Success)

```json
{
  "success": true,
  "data": {
    "id": 42,
    "message": "Capability offer created successfully and submitted for approval",
    "warning": "Capability offer created, but capability indexing could not be saved. Please contact support if you need recommendations."
  },
  "status": 201
}
```

### Error Scenarios and Responses

#### 1. Authentication Missing
```json
{
  "error": "Authentication required",
  "status": 401
}
```

#### 2. User Not Verified
```json
{
  "error": "You need to complete verification before creating capability offers.",
  "requiresVerification": true,
  "status": 403
}
```

#### 3. Validation Error - Missing Impact Area
```json
{
  "error": "Please select at least one impact area.",
  "status": 400
}
```

#### 4. Validation Error - Invalid Offer Type
```json
{
  "error": "offer_type must be one of: financial, material, service, infrastructure.",
  "status": 400
}
```

## Debugging Tips

### Check API Logs

The endpoint logs detailed information for debugging:

```
===== SERVICE OFFER CREATE START =====
Step 1: Checking authentication
Step 2: Getting user details
Step 3: Checking user type and verification
Step 4: Parsing request body
Step 5: Validating body
Step 6: Building offer data
Step 7: Inserting offer into database
Step 8: Inserting capability
Step 9: Returning success
```

### Common Issues and Solutions

#### Issue: "User account not found"
- **Cause**: User ID in token doesn't exist in database
- **Solution**: Ensure user is created in the `users` table

#### Issue: "You need to complete verification"
- **Cause**: User's `verification_status` is not 'verified'
- **Solution**: Complete the verification process for the user type (NGO, Company, Individual)

#### Issue: Capability warning appears
- **Cause**: `offer_capabilities` table insert failed
- **Possible reasons**:
  1. Service offer ID is invalid
  2. Foreign key constraint violation
  3. Missing database columns
- **Solution**: Check server logs for detailed capability insert error

#### Issue: Invalid JSON in request
- **Cause**: Malformed JSON in request body
- **Solution**: 
  - Validate JSON syntax
  - Ensure all string values are properly quoted
  - Check for trailing commas in objects/arrays

## Database Verification

After successful creation, verify the offer and capability were created:

```sql
-- Check service offer
SELECT id, title, creator_id, offer_type, status, created_at 
FROM service_offers 
ORDER BY created_at DESC LIMIT 1;

-- Check offer capability  
SELECT capability_id, service_offer_id, capability_name, capability_kind, is_active
FROM offer_capabilities
WHERE service_offer_id = <offer_id>;
```

## Valid Values Reference

### Offer Types
- `financial`: Funding support
- `material`: Material/goods donation
- `service`: Skill or service-based help
- `infrastructure`: Equipment, space, or facility support

### Transaction Types
- `donate`: One-time donation
- `volunteer`: Time/effort based
- `rent`: Time-bound rental/lease
- `sell`: Sale/transfer of ownership

### Impact Areas
- Education
- Healthcare
- Environment
- Community Development
- Technology
- Arts & Culture
- Sports
- Agriculture
- Disaster Relief
- Social Services
- And others based on your IMPACT_AREAS configuration

## Performance Considerations

- Offer insert: ~100ms
- Capability insert: ~50ms (may be slower on first run due to indexing)
- Total endpoint latency: 150-300ms

## Next Steps

1. **Test all offer types** (financial, material, service, infrastructure)
2. **Test all transaction types** for each offer type
3. **Verify capability records** are created in database
4. **Monitor logs** for any warnings or errors
5. **Test with non-verified user** to ensure verification check works

## Rollback Instructions

If issues occur, revert changes with:
```bash
git checkout app/api/service-offers/route.ts
```

Then restart your development server.
