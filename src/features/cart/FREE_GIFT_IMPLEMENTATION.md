# Free Gift Eligibility Implementation

## Overview

This document describes the implementation of free gift eligibility logic for the cart and checkout system.

## Components Implemented

### 1. Repository Layer (`cart.repository.ts`)

**Method: `getEligibleGifts(subtotal: number, productIds: string[])`**

This method queries the database to find eligible free gifts based on two criteria:
- **Subtotal threshold**: Gifts with `minPurchaseAmount <= subtotal`
- **Product association**: Gifts associated with specific products in the cart via the `productGifts` junction table

The implementation:
1. Queries gifts eligible by subtotal
2. Queries gifts associated with products in the cart
3. Combines and deduplicates the results
4. Fetches product associations for each gift
5. Returns a list of `FreeGift` objects with all relevant information

### 2. Domain Layer (`cart.domain.ts`)

**Method: `getEligibleFreeGifts(items: CartItemInput[], subtotal: number)`**

This is a simple wrapper that:
1. Extracts product IDs from cart items
2. Calls the repository method
3. Returns the list of eligible gifts

The domain layer handles the business logic coordination, while the repository handles data access.

### 3. API Endpoint (`cart.routes.ts`)

**Endpoint: `GET /api/cart/gifts`**

Query parameters:
- `subtotal` (number): The cart subtotal in cents
- `productIds` (string): Comma-separated list of product IDs

Response:
```json
{
  "success": true,
  "data": [
    {
      "id": "gift-uuid",
      "name": "Free Sample",
      "description": "Free gift description",
      "imageUrl": "https://...",
      "value": 500,
      "minPurchaseAmount": 10000,
      "associatedProductIds": ["product-uuid-1", "product-uuid-2"]
    }
  ],
  "meta": {
    "timestamp": "2024-01-01T00:00:00Z"
  }
}
```

## Property-Based Tests

Four property-based tests were implemented to verify correctness:

### Property 6: Free gift eligibility by subtotal
Verifies that gifts are eligible if and only if the subtotal meets the minimum purchase amount OR the gift is associated with a product in the cart.

### Property 7: Multiple free gifts application
Verifies that all gifts meeting the eligibility criteria are returned, with no duplicates.

### Property 8: Free gift removal on threshold drop
Verifies that when the cart subtotal decreases below a gift's threshold, the gift is no longer eligible (unless it's product-specific and the product remains in cart).

### Property 9: Product-specific free gift eligibility
Verifies that product-specific gifts are only eligible when their associated products are in the cart, OR when the subtotal threshold is met.

## Database Schema

The implementation uses two tables:

### `complimentary_gifts`
- `id`: Gift identifier
- `name`: Gift name
- `description`: Gift description
- `imageUrl`: Gift image URL
- `value`: Gift value in cents
- `minPurchaseAmount`: Minimum purchase amount in cents for eligibility
- `isActive`: Whether the gift is currently active

### `product_gifts` (junction table)
- `id`: Association identifier
- `productId`: Reference to product
- `giftId`: Reference to gift

This allows gifts to be:
1. **Universal**: Eligible based on subtotal alone (no product associations)
2. **Product-specific**: Eligible when specific products are in cart
3. **Hybrid**: Eligible by subtotal OR product association

## Usage Example

```typescript
// Frontend: Get eligible gifts for current cart
const response = await fetch(
  `/api/cart/gifts?subtotal=${cartSubtotal}&productIds=${productIds.join(',')}`
);
const { data: gifts } = await response.json();

// Display gifts to user
gifts.forEach(gift => {
  console.log(`You're eligible for: ${gift.name} (value: ${gift.value / 100} THB)`);
});
```

## Requirements Validated

- ✅ Requirement 2.1: Free gift eligibility by subtotal
- ✅ Requirement 2.2: Multiple free gifts application
- ✅ Requirement 2.3: Gift removal on threshold drop
- ✅ Requirement 2.4: Product-specific gift eligibility

## Testing Notes

The property-based tests require a running PostgreSQL database. They:
1. Create test products, variants, and gifts
2. Run 100 iterations with random cart configurations
3. Verify all correctness properties hold
4. Clean up test data after completion

To run the tests:
```bash
bun test api/src/features/cart/__tests__/cart.property.test.ts --run
```

Note: Ensure `DATABASE_URL` is configured and the database is running before executing tests.
