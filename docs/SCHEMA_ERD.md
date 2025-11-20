# Entity Relationship Diagram

## Core E-commerce Schema

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           PRODUCTS & CATALOG                                 │
└─────────────────────────────────────────────────────────────────────────────┘

┌──────────────┐         ┌──────────────────┐         ┌──────────────┐
│  categories  │◄───┐    │    products      │    ┌───►│     tags     │
├──────────────┤    │    ├──────────────────┤    │    ├──────────────┤
│ id (PK)      │    │    │ id (PK)          │    │    │ id (PK)      │
│ name         │    │    │ name             │    │    │ name         │
│ slug         │    │    │ slug             │    │    │ slug         │
│ parent_id    │    │    │ subtitle         │    │    │ description  │
│ description  │    │    │ description      │    │    └──────────────┘
│ image_url    │    │    │ base_price       │    │           ▲
└──────────────┘    │    │ product_type     │    │           │
                    │    │ status           │    │           │
                    │    │ featured         │    │    ┌──────────────┐
                    │    │ rating           │    │    │ product_tags │
                    │    │ review_count     │    │    ├──────────────┤
                    │    └──────────────────┘    │    │ id (PK)      │
                    │            │               │    │ product_id   │
                    │            │               └────┤ tag_id       │
                    │            │                    └──────────────┘
                    │            │
         ┌──────────┴────────────┴──────────┬──────────────┬──────────────┐
         │                                   │              │              │
         ▼                                   ▼              ▼              ▼
┌─────────────────┐              ┌──────────────────┐  ┌─────────────┐  ┌──────────────────┐
│product_variants │              │ product_images   │  │ingredients  │  │product_benefits  │
├─────────────────┤              ├──────────────────┤  ├─────────────┤  ├──────────────────┤
│ id (PK)         │              │ id (PK)          │  │ id (PK)     │  │ id (PK)          │
│ product_id (FK) │              │ product_id (FK)  │  │ name        │  │ product_id (FK)  │
│ name            │              │ url              │  │ description │  │ benefit          │
│ value           │              │ alt_text         │  │ benefits    │  │ sort_order       │
│ price           │              │ variant_id (FK)  │  └─────────────┘  └──────────────────┘
│ stock_quantity  │              │ sort_order       │         │
└─────────────────┘              │ is_primary       │         │
                                 └──────────────────┘         │
                                                              │
                                                    ┌─────────┴──────────┐
                                                    │product_ingredients │
                                                    ├────────────────────┤
                                                    │ id (PK)            │
                                                    │ product_id (FK)    │
                                                    │ ingredient_id (FK) │
                                                    │ is_key_ingredient  │
                                                    └────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                           ORDERS & FULFILLMENT                               │
└─────────────────────────────────────────────────────────────────────────────┘

┌──────────────┐         ┌──────────────────┐         ┌──────────────────┐
│    users     │         │     orders       │         │   order_items    │
├──────────────┤         ├──────────────────┤         ├──────────────────┤
│ id (PK)      │◄────────┤ id (PK)          │◄────────┤ id (PK)          │
│ email        │         │ order_number     │         │ order_id (FK)    │
│ password     │         │ user_id (FK)     │         │ product_id (FK)  │
└──────────────┘         │ email            │         │ variant_id (FK)  │
       │                 │ status           │         │ product_name     │
       │                 │ payment_status   │         │ unit_price       │
       │                 │ subtotal         │         │ quantity         │
       │                 │ total_amount     │         │ subtotal         │
       │                 └──────────────────┘         └──────────────────┘
       │                         │
       │                         ├──────────────┬──────────────┬──────────────┐
       │                         │              │              │              │
       │                         ▼              ▼              ▼              ▼
       │              ┌──────────────────┐  ┌─────────┐  ┌──────────┐  ┌──────────────┐
       │              │shipping_addresses│  │payments │  │shipments │  │order_gifts   │
       │              ├──────────────────┤  ├─────────┤  ├──────────┤  ├──────────────┤
       │              │ id (PK)          │  │ id (PK) │  │ id (PK)  │  │ id (PK)      │
       │              │ order_id (FK)    │  │ order_id│  │ order_id │  │ order_id (FK)│
       │              │ first_name       │  │ amount  │  │ carrier  │  │ gift_name    │
       │              │ last_name        │  │ method  │  │ tracking │  │ gift_value   │
       │              │ address_line1    │  │ status  │  │ status   │  └──────────────┘
       │              │ city             │  └─────────┘  └──────────┘
       │              │ province         │
       │              │ postal_code      │
       │              └──────────────────┘
       │
       │
       ▼
┌──────────────────┐
│customer_profiles │
├──────────────────┤
│ id (PK)          │
│ user_id (FK)     │
│ first_name       │
│ last_name        │
│ phone            │
│ total_orders     │
│ total_spent      │
│ customer_tier    │
│ loyalty_points   │
└──────────────────┘
       │
       ├──────────────┬──────────────┬──────────────┐
       │              │              │              │
       ▼              ▼              ▼              ▼
┌─────────────┐  ┌─────────┐  ┌─────────────┐  ┌─────────────────┐
│customer_    │  │wishlists│  │   reviews   │  │review_images    │
│addresses    │  ├─────────┤  ├─────────────┤  ├─────────────────┤
├─────────────┤  │ id (PK) │  │ id (PK)     │  │ id (PK)         │
│ id (PK)     │  │ user_id │  │ product_id  │  │ review_id (FK)  │
│ user_id (FK)│  │ prod_id │  │ user_id (FK)│  │ image_url       │
│ label       │  └─────────┘  │ rating      │  └─────────────────┘
│ address     │               │ comment     │
│ is_default  │               │ status      │
└─────────────┘               └─────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                        MARKETING & PROMOTIONS                                │
└─────────────────────────────────────────────────────────────────────────────┘

┌──────────────────┐         ┌──────────────────────┐
│ discount_codes   │         │discount_code_usage   │
├──────────────────┤         ├──────────────────────┤
│ id (PK)          │◄────────┤ id (PK)              │
│ code             │         │ discount_code_id (FK)│
│ title            │         │ order_id (FK)        │
│ discount_type    │         │ user_id (FK)         │
│ discount_value   │         │ discount_amount      │
│ min_purchase     │         └──────────────────────┘
│ usage_limit      │
│ is_active        │
│ starts_at        │
│ expires_at       │
└──────────────────┘

┌──────────────────┐         ┌──────────────────┐
│   blog_posts     │         │ blog_categories  │
├──────────────────┤         ├──────────────────┤
│ id (PK)          │         │ id (PK)          │
│ title            │         │ name             │
│ slug             │         │ slug             │
│ content          │         │ description      │
│ author_id (FK)   │         └──────────────────┘
│ category_id (FK) │────────►
│ status           │
│ view_count       │
└──────────────────┘

┌──────────────────────┐         ┌──────────────────┐
│newsletter_subscribers│         │ email_campaigns  │
├──────────────────────┤         ├──────────────────┤
│ id (PK)              │         │ id (PK)          │
│ email                │         │ name             │
│ status               │         │ subject          │
│ source               │         │ html_content     │
│ subscribed_at        │         │ status           │
└──────────────────────┘         │ sent_count       │
                                 │ open_count       │
                                 └──────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                              ANALYTICS                                       │
└─────────────────────────────────────────────────────────────────────────────┘

┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐
│ product_views    │    │abandoned_carts   │    │ search_queries   │
├──────────────────┤    ├──────────────────┤    ├──────────────────┤
│ id (PK)          │    │ id (PK)          │    │ id (PK)          │
│ product_id       │    │ user_id          │    │ query            │
│ user_id          │    │ session_id       │    │ result_count     │
│ session_id       │    │ cart_data        │    │ user_id          │
│ ip_address       │    │ total_value      │    │ session_id       │
│ created_at       │    │ is_recovered     │    │ created_at       │
└──────────────────┘    └──────────────────┘    └──────────────────┘

┌──────────────────┐    ┌──────────────────┐
│ user_sessions    │    │   page_views     │
├──────────────────┤    ├──────────────────┤
│ id (PK)          │◄───┤ id (PK)          │
│ session_id       │    │ session_id       │
│ user_id          │    │ path             │
│ ip_address       │    │ title            │
│ landing_page     │    │ time_on_page     │
│ page_views       │    │ created_at       │
└──────────────────┘    └──────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                           ADMIN & SYSTEM                                     │
└─────────────────────────────────────────────────────────────────────────────┘

┌──────────────┐         ┌──────────────┐         ┌──────────────────┐
│ admin_roles  │         │ admin_users  │         │  activity_logs   │
├──────────────┤         ├──────────────┤         ├──────────────────┤
│ id (PK)      │◄────────┤ id (PK)      │         │ id (PK)          │
│ name         │         │ user_id (FK) │         │ user_id (FK)     │
│ permissions  │         │ role_id (FK) │         │ action           │
└──────────────┘         │ is_active    │         │ entity           │
                         └──────────────┘         │ entity_id        │
                                                  │ description      │
                                                  │ old_values       │
                                                  │ new_values       │
                                                  └──────────────────┘

┌──────────────────┐
│ system_settings  │
├──────────────────┤
│ id (PK)          │
│ key              │
│ value            │
│ value_type       │
│ updated_by (FK)  │
└──────────────────┘
```

## Relationship Types

- `◄───` One-to-Many relationship
- `◄──►` Many-to-Many relationship (through junction table)
- `(PK)` Primary Key
- `(FK)` Foreign Key

## Key Relationships

1. **Products → Variants**: One product can have multiple size/color variants
2. **Products → Images**: One product can have multiple images, images can be linked to specific variants
3. **Products ↔ Tags**: Many-to-many through `product_tags`
4. **Products ↔ Categories**: Many-to-many through `product_categories`
5. **Products ↔ Ingredients**: Many-to-many through `product_ingredients`
6. **Orders → Order Items**: One order contains multiple line items
7. **Orders → Addresses**: One order has one shipping and one billing address
8. **Orders → Payments**: One order can have multiple payment attempts
9. **Users → Customer Profile**: One-to-one relationship
10. **Users → Orders**: One user can have multiple orders
11. **Users → Reviews**: One user can write multiple reviews
12. **Products → Reviews**: One product can have multiple reviews
