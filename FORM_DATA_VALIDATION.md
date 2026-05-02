# Service Offers Frontend - Form Data Validation Checklist

This checklist ensures the create/edit service offer forms send correctly formatted data to the API.

## Required Fields Validation

### Always Required
- [ ] `title`: Non-empty string, max 255 chars
- [ ] `description`: Non-empty string, detailed explanation
- [ ] `offer_type`: One of `financial|material|service|infrastructure`
- [ ] `transaction_type`: Valid for the selected offer_type
- [ ] `impact_area`: Array with at least 1 impact area
- [ ] `price_type`: `free|fixed|negotiable` (auto-set for some types)
- [ ] `price_amount`: Number >= 0 (required for rent/sell transactions)

### Location Fields (Recommended)
- [ ] `city`: String, max 50 chars
- [ ] `state_province`: String
- [ ] `pincode`: String, 5-10 digits
- [ ] `coverage_area`: String

### Optional Fields
- [ ] `tags`: Array of strings or CSV string (converted to array)
- [ ] `requirements`: String or null
- [ ] `offer_details`: Object with type-specific fields

## Offer Type Specific Rules

### Financial Offers
- [ ] `transaction_type`: Must be `donate` or `volunteer`
- [ ] `price_type`: Auto-forced to `free`
- [ ] `price_amount`: Auto-forced to 0
- [ ] `offer_details` structure:
  ```json
  {
    "funding_type": "grant|loan|subsidy|scholarship",
    "budget_amount": number > 0,
    "disbursement_schedule": "one-time|monthly|quarterly|annual",
    "funding_window_start": "ISO date or null",
    "funding_window_end": "ISO date or null",
    "eligibility_conditions": "string or null"
  }
  ```

### Material Offers
- [ ] `transaction_type`: Can be `donate|sell|rent`
- [ ] For `rent`/`sell`: `price_type` and `price_amount` required
- [ ] `offer_details` structure:
  ```json
  {
    "condition": "new|used|refurbished",
    "stock_status": "in_stock|out_of_stock",
    "quantity": number,
    "unit": "pieces|kg|liters|boxes|etc",
    "available_from": "ISO date or null",
    "available_to": "ISO date or null"
  }
  ```

### Service Offers
- [ ] `transaction_type`: Can be `volunteer|rent|sell`
- [ ] For `rent`/`sell`: `price_type` and `price_amount` required
- [ ] `offer_details` structure:
  ```json
  {
    "skills_required": ["array", "of", "skills"],
    "experience_requirements": "string or null",
    "employment_type": "full-time|part-time|contract|temporary",
    "remote_onsite": "remote|onsite|hybrid",
    "wage_info": { "per_day": number } or null,
    "hours_per_day": number or null,
    "duration": "string or null"
  }
  ```

### Infrastructure Offers
- [ ] `transaction_type`: Can be `volunteer|rent|sell`
- [ ] For `rent`/`sell`: `price_type` and `price_amount` required
- [ ] `offer_details` structure:
  ```json
  {
    "infra_type": "machine|building|lab|vehicle|land",
    "capacity": "number or null",
    "facilities": ["array", "of", "facility", "names"],
    "available_from": "ISO date or null",
    "available_to": "ISO date or null"
  }
  ```

## Data Format Conversion Rules

### Arrays
- If form sends CSV string → Auto-converted to array
- If form sends array → Validated and sanitized
- If empty → Converted to empty array

### Dates
- Must be ISO format: `YYYY-MM-DD`
- Can be null/empty string (converted to null)

### Numbers
- Must be positive for amounts/quantities
- Converted from string to number
- Empty/invalid values → null

### Strings
- `.trim()` applied to remove whitespace
- Validated against length constraints
- Empty strings → null when appropriate

## API Payload Structure Example

```javascript
{
  "title": "Clean Water Initiative",
  "description": "Providing clean water access to rural communities",
  "offer_type": "material",
  "transaction_type": "donate",
  "impact_area": ["Water & Sanitation", "Community Development"],
  "tags": ["water", "rural", "purification"],
  "requirements": "Delivery to site required",
  "city": "Kolkata",
  "state_province": "West Bengal",
  "pincode": "700001",
  "coverage_area": "Eastern India",
  "price_type": "free",
  "price_amount": 0,
  "offer_details": {
    "condition": "new",
    "stock_status": "in_stock",
    "quantity": 500,
    "unit": "filters",
    "available_from": "2025-06-01",
    "available_to": "2026-06-01"
  }
}
```

## Frontend Form Data Building Checklist

### In `buildOfferDetails()` Function
- [ ] Handle null/empty values properly
- [ ] Convert CSV strings to arrays using `parseCsvToStringArray()`
- [ ] Use `toNullablePositiveNumber()` for numeric fields
- [ ] Don't include null or undefined keys in object

### In `handleSubmit()` Function
- [ ] Call `validateBeforeSubmit()` before API call
- [ ] Handle success response: redirect to `/service-offers?view=my-offers`
- [ ] Handle error response: show error toast with `data.error`
- [ ] Handle partial success: show warning if `data.data.warning` exists
- [ ] Set loading state during request
- [ ] Use proper headers: `"Authorization: Bearer <token>"`

### Error Handling
- [ ] Show user-friendly error messages
- [ ] Log detailed errors to console for debugging
- [ ] Don't expose internal server errors to user

## Testing Form Submissions

### Test Case 1: All Fields Populated
- [ ] Form accepts all inputs
- [ ] No validation errors
- [ ] API responds with 201
- [ ] Capability is created in database

### Test Case 2: Minimal Fields (Required Only)
- [ ] Form allows submission with just required fields
- [ ] Optional fields default properly
- [ ] API accepts minimal payload

### Test Case 3: Transaction Type Mismatch
- [ ] Selecting invalid transaction for offer_type shows error
- [ ] Price fields disabled when not needed
- [ ] Can't submit with mismatched types

### Test Case 4: Missing Impact Area
- [ ] Can't submit without at least one impact area
- [ ] Clear error message displayed
- [ ] API rejects with 400

### Test Case 5: Price Validation
- [ ] `rent` and `sell` require price
- [ ] `donate` and `volunteer` auto-zero price
- [ ] Negative prices rejected
- [ ] Non-numeric prices caught before API call

### Test Case 6: Array Conversion
- [ ] CSV tags converted to array: `"a,b,c"` → `["a","b","c"]`
- [ ] Spaces trimmed: `"a , b"` → `["a","b"]`
- [ ] Empty entries removed: `",,a,,"` → `["a"]`

## Frontend Component Reference

### From `create/page.tsx` and `edit/[id]/page.tsx`
- Import these utilities:
  ```typescript
  import {
    getDefaultTransactionType,
    IMPACT_AREA_OPTIONS,
    isTransactionAllowedForOfferType,
    OFFER_TYPE_OPTIONS,
    OFFER_TYPE_TRANSACTION_MATRIX,
    parseCsvToStringArray,
    toNullablePositiveNumber,
    TRANSACTION_TYPE_OPTIONS
  } from '@/lib/service-offers'
  ```

- Use these helper functions:
  ```typescript
  // Build type-specific details object
  const buildOfferDetails = () => { /* ... */ }
  
  // Validate before submission
  const validateBeforeSubmit = () => { /* ... */ }
  
  // Handle form submission
  const handleSubmit = async (e) => { /* ... */ }
  ```

## Success Indicators

After fix is deployed, confirm:
1. ✅ Service offer creates without 500 error
2. ✅ API response includes `capability_id`
3. ✅ New offer appears in "My Offers" view
4. ✅ Offer details stored correctly in database
5. ✅ Capability record created in `offer_capabilities`
6. ✅ Partial failures gracefully show warning

## Rollback if Issues Persist

If you see errors after deploy:
1. Check server logs for "Step X: ..." messages
2. Verify user is verified before attempting creation
3. Ensure `impact_area` array has at least one value
4. Check database connection is working
5. Verify `offer_capabilities` table exists and has proper schema
