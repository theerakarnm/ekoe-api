# Cart & Checkout Logic

This module implements the cart and checkout functionality for the e-commerce platform.

## Components

### Interface (`cart.interface.ts`)
Defines TypeScript types and Zod schemas for:
- Cart item validation
- Cart pricing calculations
- Discount code validation
- Free gift eligibility
- Shipping methods

### Repository (`cart.repository.ts`)
Data access layer for:
- Product and variant validation
- Free gift queries
- Discount code lookups
- Usage tracking

### Domain (`cart.domain.ts`)
Business logic for:
- Cart validation with stock checks
- Pricing calculations (subtotal, shipping, tax, discounts)
- Discount code validation and application
- Free gift eligibility determination
- Shipping cost calculation

### Routes (`cart.routes.ts`)
API endpoints:
- `POST /api/cart/validate` - Validate cart items
- `POST /api/cart/calculate` - Calculate cart totals
- `GET /api/cart/gifts` - Get eligible free gifts
- `POST /api/cart/discount/validate` - Validate discount code

## Property-Based Tests

The module includes comprehensive property-based tests using fast-check:

### Property 1: Cart item storage completeness
Validates that cart items contain all required fields (product ID, variant ID, quantity, pricing).

### Property 2: Subtotal calculation accuracy
Verifies that subtotals are calculated correctly as sum of (unit price × quantity).

### Property 3: Cart item removal consistency
Ensures that removing items updates the cart state and recalculates subtotals correctly.

## Running Tests

**Important:** The property-based tests require a running PostgreSQL database.

1. Ensure your database is running and `DATABASE_URL` is configured in `.env`
2. Run the tests:
   ```bash
   bun test api/src/features/cart/__tests__/cart.property.test.ts
   ```

If the database is not available, the tests will fail with a connection error. The tests will automatically skip if the database connection cannot be established.

## Implementation Status

✅ Cart interface and types
✅ Cart repository with database queries
✅ Cart domain with business logic
✅ Cart API routes
✅ Property-based tests (requires database to run)

## Next Steps

The following tasks from the implementation plan are pending:
- Cart validation API enhancements
- Free gift eligibility logic
- Discount code validation and application
- Shipping method selection
- Order creation enhancements
- Payment integration
- Frontend cart store
- Checkout flow UI components
