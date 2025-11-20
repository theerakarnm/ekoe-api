# Database Schema Design

## Overview

This document describes the comprehensive database schema for the e-commerce platform. The schema is designed to support a full-featured skincare/beauty product store with advanced features for future growth.

## Schema Organization

The database is organized into the following modules:

### 1. **Products Module** (`products.schema.ts`)
Core product catalog and inventory management.

#### Tables:
- **products** - Main product information
  - Basic info: name, slug, description, pricing
  - Product types: single, set, bundle
  - SEO fields, ratings, inventory tracking
  - Status management (draft, active, archived)

- **productVariants** - Product variations (sizes, colors)
  - SKU management
  - Individual pricing per variant
  - Stock quantity tracking
  - Association with product images

- **productImages** - Product image gallery
  - Multiple images per product
  - Optional variant association
  - Sort ordering and primary image flag

- **tags** - Product tags (Vegan, Cruelty Free, etc.)
  - Reusable tag system
  - Many-to-many relationship via `productTags`

- **categories** - Product categorization
  - Hierarchical structure (parent-child)
  - SEO optimization
  - Many-to-many relationship via `productCategories`

- **ingredients** - Product ingredients database
  - Reusable ingredient library
  - Benefits and descriptions
  - Linked via `productIngredients` with key ingredient flag

- **productBenefits** - Product benefits list
  - Ordered list of benefits per product

- **productInstructions** - How to use instructions
  - Step-by-step usage guide
  - Icon support for visual representation

- **productSets** - Bundle/set composition
  - Links multiple products into sets
  - Quantity and ordering support

- **complimentaryGifts** - Free gifts with purchase
  - Gift catalog with conditions
  - Minimum purchase requirements
  - Linked to products via `productGifts`

### 2. **Orders Module** (`orders.schema.ts`)
Complete order management and fulfillment.

#### Tables:
- **orders** - Main order records
  - Order status workflow (pending → processing → shipped → delivered)
  - Payment and fulfillment status tracking
  - Pricing breakdown (subtotal, shipping, tax, discounts)
  - Customer notes and internal notes

- **orderItems** - Line items in orders
  - Product snapshot at time of purchase
  - Quantity and pricing
  - Links to products and variants

- **shippingAddresses** - Delivery addresses
  - Complete address information
  - Phone number for delivery

- **billingAddresses** - Billing addresses
  - Separate from shipping if needed

- **payments** - Payment transactions
  - Multiple payment methods (credit card, PromptPay)
  - Transaction tracking
  - Provider response storage
  - Card information (last 4 digits only)

- **shipments** - Shipping tracking
  - Carrier and tracking information
  - Delivery status and estimates

- **orderStatusHistory** - Audit trail
  - Complete history of status changes
  - Notes and user tracking

- **orderGifts** - Complimentary items included
  - Snapshot of gifts at order time

### 3. **Customers Module** (`customers.schema.ts`)
Customer relationship management.

#### Tables:
- **customerProfiles** - Extended customer information
  - Personal details
  - Marketing preferences (newsletter, SMS)
  - Customer statistics (total orders, total spent)
  - Customer tier/loyalty system
  - Loyalty points

- **customerAddresses** - Saved addresses
  - Multiple addresses per customer
  - Default address flag
  - Address labels (Home, Office)

- **wishlists** - Product wishlist
  - Save products for later

- **reviews** - Product reviews
  - 1-5 star ratings
  - Review text and title
  - Verified purchase flag
  - Approval workflow
  - Helpful vote tracking

- **reviewImages** - Review photos
  - Customer-uploaded images

- **reviewHelpfulVotes** - Review voting
  - Track helpful votes by users/IP

### 4. **Marketing Module** (`marketing.schema.ts`)
Marketing campaigns and promotions.

#### Tables:
- **discountCodes** - Coupon/promo codes
  - Multiple discount types (percentage, fixed, free shipping)
  - Usage limits (total and per customer)
  - Minimum purchase requirements
  - Product/category restrictions
  - Validity periods

- **discountCodeUsage** - Usage tracking
  - Track who used which codes
  - Actual discount amounts applied

- **blogPosts** - Content marketing
  - Full blog system
  - SEO optimization
  - Author attribution
  - View tracking

- **blogCategories** - Blog organization
  - Category management

- **newsletterSubscribers** - Email list
  - Subscription management
  - Source tracking
  - Preference storage

- **emailCampaigns** - Email marketing
  - Campaign management
  - Targeting and segmentation
  - Performance metrics (opens, clicks)

- **promotions** - Banner/promotion management
  - Homepage and product page banners
  - Placement control
  - Scheduling

### 5. **Analytics Module** (`analytics.schema.ts`)
Business intelligence and tracking.

#### Tables:
- **productViews** - Product page views
  - Track product popularity
  - Device and referrer tracking

- **abandonedCarts** - Cart abandonment
  - Recovery email tracking
  - Cart snapshot storage
  - Conversion tracking

- **searchQueries** - Search analytics
  - Popular search terms
  - Result quality tracking

- **userSessions** - Session tracking
  - User journey analysis
  - Device and referrer data

- **pageViews** - Page analytics
  - Time on page tracking
  - Navigation patterns

### 6. **Admin Module** (`admin.schema.ts`)
Administrative functions.

#### Tables:
- **adminRoles** - Role-based access control
  - Permission management
  - Role definitions

- **adminUsers** - Admin user assignments
  - Link users to admin roles

- **activityLogs** - Audit trail
  - Track all admin actions
  - Before/after values
  - IP and user agent tracking

- **systemSettings** - Configuration
  - Key-value settings storage
  - Type hints for frontend

## Key Design Decisions

### 1. **Price Storage**
All prices are stored as integers in cents (e.g., 2590 = ฿25.90) to avoid floating-point precision issues.

### 2. **Soft Deletes**
Most tables use `onDelete: "set null"` or `onDelete: "cascade"` appropriately to maintain data integrity while preserving historical records.

### 3. **Product Snapshots**
Order items store product snapshots to preserve historical data even if products are modified or deleted.

### 4. **Flexible Variants**
Product variants support any type of variation (size, color, etc.) with individual pricing and inventory.

### 5. **Hierarchical Categories**
Categories support parent-child relationships for flexible organization.

### 6. **Multi-Image Support**
Products can have multiple images, with optional variant associations for showing different images per size/color.

### 7. **Comprehensive Tracking**
Analytics tables track user behavior for business intelligence and optimization.

### 8. **Marketing Flexibility**
Discount codes support multiple types and complex conditions for promotional campaigns.

## Future Enhancements

### Potential Additions:
1. **Subscriptions** - Recurring orders for consumable products
2. **Gift Cards** - Digital gift card system
3. **Referral Program** - Customer referral tracking and rewards
4. **Product Bundles** - Dynamic bundle builder
5. **Pre-orders** - Support for upcoming products
6. **Inventory Locations** - Multi-warehouse support
7. **Returns/Refunds** - Return merchandise authorization (RMA)
8. **Product Recommendations** - AI-powered recommendations
9. **Customer Segments** - Advanced customer segmentation
10. **A/B Testing** - Experiment tracking
11. **Internationalization** - Multi-currency and multi-language
12. **Wholesale** - B2B pricing tiers
13. **Product Variants Matrix** - Size + Color combinations
14. **Stock Alerts** - Back-in-stock notifications
15. **Product Questions** - Q&A system

## Relationships Summary

```
users (1) ─── (1) customerProfiles
users (1) ─── (n) customerAddresses
users (1) ─── (n) orders
users (1) ─── (n) reviews
users (1) ─── (n) wishlists

products (1) ─── (n) productVariants
products (1) ─── (n) productImages
products (n) ─── (n) tags (via productTags)
products (n) ─── (n) categories (via productCategories)
products (n) ─── (n) ingredients (via productIngredients)
products (1) ─── (n) productBenefits
products (1) ─── (n) productInstructions
products (n) ─── (n) products (via productSets)
products (n) ─── (n) complimentaryGifts (via productGifts)

orders (1) ─── (n) orderItems
orders (1) ─── (1) shippingAddresses
orders (1) ─── (1) billingAddresses
orders (1) ─── (n) payments
orders (1) ─── (n) shipments
orders (1) ─── (n) orderStatusHistory
orders (1) ─── (n) orderGifts

reviews (1) ─── (n) reviewImages
reviews (1) ─── (n) reviewHelpfulVotes
```

## Indexes Recommendations

For optimal performance, consider adding indexes on:

- `products.slug`, `products.status`, `products.featured`
- `productVariants.productId`, `productVariants.sku`
- `orders.userId`, `orders.orderNumber`, `orders.status`, `orders.createdAt`
- `orderItems.orderId`, `orderItems.productId`
- `reviews.productId`, `reviews.status`
- `discountCodes.code`, `discountCodes.isActive`
- `customerProfiles.userId`
- `productViews.productId`, `productViews.createdAt`
- `searchQueries.query`, `searchQueries.createdAt`

## Migration Strategy

1. Start with core tables: `users`, `products`, `categories`, `tags`
2. Add product relationships: `productVariants`, `productImages`, `productTags`, `productCategories`
3. Implement order system: `orders`, `orderItems`, `shippingAddresses`, `billingAddresses`, `payments`
4. Add customer features: `customerProfiles`, `customerAddresses`, `reviews`, `wishlists`
5. Enable marketing: `discountCodes`, `blogPosts`, `newsletterSubscribers`
6. Implement analytics: `productViews`, `abandonedCarts`, `searchQueries`
7. Add admin features: `adminRoles`, `adminUsers`, `activityLogs`

## Notes

- All timestamps use PostgreSQL `timestamp` type
- JSONB is used for flexible data storage where schema may evolve
- Foreign keys use appropriate cascade/set null strategies
- Boolean flags default to sensible values
- Serial IDs are used for simplicity (consider UUIDs for distributed systems)
