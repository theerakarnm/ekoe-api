import { db } from "../src/core/database";
import { products, productVariants, productImages } from "../src/core/database/schema/products.schema";
import { orders, orderItems, shippingAddresses, payments } from "../src/core/database/schema/orders.schema";
import { users } from "../src/core/database/schema/auth-schema";
import { customerProfiles } from "../src/core/database/schema/customers.schema";
import { auth } from "../src/libs/auth";
import { uuidv7 } from "uuidv7";
import { eq } from "drizzle-orm";

// Sample product data
const SAMPLE_PRODUCTS = [
  {
    name: "Hydrating Facial Serum",
    slug: "hydrating-facial-serum",
    subtitle: "Deep moisture for all skin types",
    description: "A lightweight, fast-absorbing serum that delivers intense hydration.",
    shortDescription: "Hydrating serum with hyaluronic acid",
    basePrice: 129000, // 1,290 THB in cents
    compareAtPrice: 159000,
    productType: "single",
    status: "active",
    featured: true,
    variants: [
      { name: "30ml", value: "30ml", price: 129000, stockQuantity: 50 },
      { name: "50ml", value: "50ml", price: 189000, stockQuantity: 30 },
    ],
  },
  {
    name: "Brightening Vitamin C Cream",
    slug: "brightening-vitamin-c-cream",
    subtitle: "Radiant glow formula",
    description: "A powerful cream with vitamin C to brighten and even skin tone.",
    shortDescription: "Vitamin C brightening cream",
    basePrice: 159000,
    compareAtPrice: 199000,
    productType: "single",
    status: "active",
    featured: true,
    variants: [
      { name: "50g", value: "50g", price: 159000, stockQuantity: 40 },
    ],
  },
  {
    name: "Anti-Aging Night Cream",
    slug: "anti-aging-night-cream",
    subtitle: "Overnight renewal",
    description: "Intensive night cream with retinol to reduce fine lines.",
    shortDescription: "Night cream with retinol",
    basePrice: 239000,
    compareAtPrice: 289000,
    productType: "single",
    status: "active",
    featured: false,
    variants: [
      { name: "50g", value: "50g", price: 239000, stockQuantity: 25 },
    ],
  },
  {
    name: "Gentle Cleansing Foam",
    slug: "gentle-cleansing-foam",
    subtitle: "Soft cleanse for sensitive skin",
    description: "A gentle foam cleanser that removes impurities without stripping.",
    shortDescription: "Gentle foam cleanser",
    basePrice: 59000,
    compareAtPrice: null,
    productType: "single",
    status: "active",
    featured: false,
    variants: [
      { name: "150ml", value: "150ml", price: 59000, stockQuantity: 100 },
      { name: "300ml", value: "300ml", price: 99000, stockQuantity: 60 },
    ],
  },
  {
    name: "Premium Skincare Set",
    slug: "premium-skincare-set",
    subtitle: "Complete skincare routine",
    description: "The full skincare set for radiant, healthy skin.",
    shortDescription: "Complete skincare bundle",
    basePrice: 399000,
    compareAtPrice: 499000,
    productType: "set",
    status: "active",
    featured: true,
    variants: [
      { name: "Full Set", value: "full", price: 399000, stockQuantity: 15 },
    ],
  },
];

// Sample customer names
const CUSTOMER_NAMES = [
  { firstName: "Somchai", lastName: "Wongsakorn", email: "somchai@example.com" },
  { firstName: "Nattaya", lastName: "Suksan", email: "nattaya@example.com" },
  { firstName: "Piyapong", lastName: "Tanaka", email: "piyapong@example.com" },
  { firstName: "Siriporn", lastName: "Chaiyasit", email: "siriporn@example.com" },
  { firstName: "Anong", lastName: "Rattana", email: "anong@example.com" },
  { firstName: "Wichai", lastName: "Somboon", email: "wichai@example.com" },
  { firstName: "Pranee", lastName: "Thongchai", email: "pranee@example.com" },
  { firstName: "Sakchai", lastName: "Narin", email: "sakchai@example.com" },
  { firstName: "Malai", lastName: "Phetcharat", email: "malai@example.com" },
  { firstName: "Supachai", lastName: "Wongsawan", email: "supachai@example.com" },
  { firstName: "Ladda", lastName: "Kittisak", email: "ladda@example.com" },
  { firstName: "Prasit", lastName: "Boonmee", email: "prasit@example.com" },
];

// Order statuses and payment statuses
const ORDER_STATUSES = ["pending", "processing", "shipped", "delivered", "cancelled"];
const PAYMENT_STATUSES = ["pending", "paid", "failed"];

// Helper functions
function randomFromArray<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function generateOrderNumber(): string {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `ORD-${timestamp}-${random}`;
}

function getRandomDate(daysBack: number): Date {
  const date = new Date();
  date.setDate(date.getDate() - randomInt(0, daysBack));
  date.setHours(randomInt(8, 22), randomInt(0, 59), randomInt(0, 59));
  return date;
}

async function seedDashboardData() {
  console.log("🌱 Starting dashboard data seeding...\n");

  try {
    // ==============================
    // Step 1: Create Sample Products
    // ==============================
    console.log("📦 Creating products...");
    const createdProducts: Array<{ id: string; name: string; variantId: string; price: number }> = [];

    for (const productData of SAMPLE_PRODUCTS) {
      // Check if product exists
      const existing = await db.query.products.findFirst({
        where: eq(products.slug, productData.slug),
      });

      if (existing) {
        console.log(`  ⏭️  Product "${productData.name}" already exists, skipping...`);
        // Get variant for later use
        const variant = await db.query.productVariants.findFirst({
          where: eq(productVariants.productId, existing.id),
        });
        if (variant) {
          createdProducts.push({
            id: existing.id,
            name: existing.name,
            variantId: variant.id,
            price: variant.price,
          });
        }
        continue;
      }

      const [product] = await db.insert(products).values({
        name: productData.name,
        slug: productData.slug,
        subtitle: productData.subtitle,
        description: productData.description,
        shortDescription: productData.shortDescription,
        basePrice: productData.basePrice,
        compareAtPrice: productData.compareAtPrice,
        productType: productData.productType,
        status: productData.status,
        featured: productData.featured,
      }).returning();

      // Create variants
      for (const variantData of productData.variants) {
        const [variant] = await db.insert(productVariants).values({
          productId: product.id,
          name: variantData.name,
          variantType: "Size",
          value: variantData.value,
          price: variantData.price,
          stockQuantity: variantData.stockQuantity,
          isActive: true,
        }).returning();

        createdProducts.push({
          id: product.id,
          name: product.name,
          variantId: variant.id,
          price: variant.price,
        });
      }

      // Create a placeholder image
      await db.insert(productImages).values({
        productId: product.id,
        url: `https://placehold.co/600x600/e9d5ff/6b21a8?text=${encodeURIComponent(product.name.split(' ')[0])}`,
        altText: product.name,
        isPrimary: true,
        sortOrder: 0,
      });

      console.log(`  ✅ Created product: ${product.name}`);
    }

    console.log(`\n📦 Total products available for orders: ${createdProducts.length}\n`);

    // ==============================
    // Step 2: Create Sample Customers
    // ==============================
    console.log("👥 Creating customers...");
    const createdCustomers: Array<{ id: string; email: string; firstName: string; lastName: string }> = [];

    for (const customerData of CUSTOMER_NAMES) {
      // Check if user exists
      const existing = await db.query.users.findFirst({
        where: eq(users.email, customerData.email),
      });

      if (existing) {
        console.log(`  ⏭️  Customer "${customerData.email}" already exists, skipping...`);
        createdCustomers.push({
          id: existing.id,
          email: existing.email,
          firstName: customerData.firstName,
          lastName: customerData.lastName,
        });
        continue;
      }

      // Create user via Better Auth
      const user = await auth.api.signUpEmail({
        body: {
          email: customerData.email,
          password: "password123",
          name: `${customerData.firstName} ${customerData.lastName}`,
        }
      });

      if (!user) {
        console.log(`  ❌ Failed to create customer: ${customerData.email}`);
        continue;
      }

      // Create customer profile
      await db.insert(customerProfiles).values({
        userId: user.user.id,
        firstName: customerData.firstName,
        lastName: customerData.lastName,
        phone: `08${randomInt(10000000, 99999999)}`,
      }).onConflictDoNothing();

      createdCustomers.push({
        id: user.user.id,
        email: customerData.email,
        firstName: customerData.firstName,
        lastName: customerData.lastName,
      });

      console.log(`  ✅ Created customer: ${customerData.firstName} ${customerData.lastName}`);
    }

    console.log(`\n👥 Total customers: ${createdCustomers.length}\n`);

    // ==============================
    // Step 3: Create Sample Orders
    // ==============================
    console.log("🛒 Creating orders...");
    let orderCount = 0;
    const targetOrders = 35;

    for (let i = 0; i < targetOrders; i++) {
      const customer = randomFromArray(createdCustomers);
      const orderDate = getRandomDate(60); // Random date in last 60 days

      // Generate 1-3 items per order
      const numItems = randomInt(1, 3);
      const orderProductItems: Array<{ product: typeof createdProducts[0]; quantity: number }> = [];

      for (let j = 0; j < numItems; j++) {
        const productItem = randomFromArray(createdProducts);
        const existingItem = orderProductItems.find(item => item.product.variantId === productItem.variantId);
        if (existingItem) {
          existingItem.quantity += randomInt(1, 2);
        } else {
          orderProductItems.push({
            product: productItem,
            quantity: randomInt(1, 3),
          });
        }
      }

      // Calculate totals
      const subtotal = orderProductItems.reduce(
        (sum, item) => sum + item.product.price * item.quantity,
        0
      );
      const shippingCost = subtotal > 100000 ? 0 : 5000; // Free shipping over 1000 THB
      const totalAmount = subtotal + shippingCost;

      // Determine status - weight towards 'paid' and 'delivered' for better metrics
      const statusRand = Math.random();
      let orderStatus: string;
      let paymentStatus: string;

      if (statusRand < 0.5) {
        // 50% are delivered and paid
        orderStatus = "delivered";
        paymentStatus = "paid";
      } else if (statusRand < 0.7) {
        // 20% are shipped and paid
        orderStatus = "shipped";
        paymentStatus = "paid";
      } else if (statusRand < 0.85) {
        // 15% are processing and paid
        orderStatus = "processing";
        paymentStatus = "paid";
      } else if (statusRand < 0.9) {
        // 5% are pending payment
        orderStatus = "pending";
        paymentStatus = "pending";
      } else if (statusRand < 0.95) {
        // 5% are cancelled
        orderStatus = "cancelled";
        paymentStatus = "failed";
      } else {
        // 5% are pending
        orderStatus = "pending";
        paymentStatus = "pending";
      }

      // Create order
      const [order] = await db.insert(orders).values({
        orderNumber: generateOrderNumber(),
        userId: customer.id,
        email: customer.email,
        status: orderStatus,
        paymentStatus: paymentStatus,
        fulfillmentStatus: orderStatus === "delivered" ? "fulfilled" : (orderStatus === "shipped" ? "partial" : "unfulfilled"),
        subtotal: subtotal,
        shippingCost: shippingCost,
        taxAmount: 0,
        discountAmount: 0,
        totalAmount: totalAmount,
        currency: "THB",
        createdAt: orderDate,
        updatedAt: orderDate,
        paidAt: paymentStatus === "paid" ? orderDate : null,
        deliveredAt: orderStatus === "delivered" ? new Date(orderDate.getTime() + 3 * 24 * 60 * 60 * 1000) : null,
      }).returning();

      // Create order items
      for (const item of orderProductItems) {
        await db.insert(orderItems).values({
          orderId: order.id,
          productId: item.product.id,
          variantId: item.product.variantId,
          productName: item.product.name,
          variantName: "", // Could be filled in
          unitPrice: item.product.price,
          quantity: item.quantity,
          subtotal: item.product.price * item.quantity,
        });
      }

      // Create shipping address
      await db.insert(shippingAddresses).values({
        orderId: order.id,
        firstName: customer.firstName,
        lastName: customer.lastName,
        addressLine1: `${randomInt(1, 999)} ถนนสุขุมวิท`,
        city: "กรุงเทพมหานคร",
        province: "กรุงเทพมหานคร",
        postalCode: `10${randomInt(100, 999)}`,
        country: "Thailand",
        phone: `08${randomInt(10000000, 99999999)}`,
      });

      // Create payment record for paid orders
      if (paymentStatus === "paid") {
        await db.insert(payments).values({
          orderId: order.id,
          paymentMethod: randomFromArray(["credit_card", "promptpay", "bank_transfer"]),
          paymentProvider: "stripe",
          amount: totalAmount,
          currency: "THB",
          status: "completed",
          transactionId: `txn_${uuidv7().replace(/-/g, "").substring(0, 24)}`,
          createdAt: orderDate,
          completedAt: orderDate,
        });
      }

      orderCount++;
      if (orderCount % 10 === 0) {
        console.log(`  📝 Created ${orderCount} orders...`);
      }
    }

    console.log(`  ✅ Created ${orderCount} orders\n`);

    // ==============================
    // Summary
    // ==============================
    console.log("═══════════════════════════════════════");
    console.log("✨ Dashboard data seeding completed!");
    console.log("═══════════════════════════════════════");
    console.log(`  📦 Products: ${SAMPLE_PRODUCTS.length}`);
    console.log(`  👥 Customers: ${createdCustomers.length}`);
    console.log(`  🛒 Orders: ${orderCount}`);
    console.log("═══════════════════════════════════════\n");

    console.log("🚀 You can now view the dashboard at: http://localhost:5173/admin/dashboard");

    process.exit(0);
  } catch (error) {
    console.error("❌ Seeding failed:", error);
    process.exit(1);
  }
}

seedDashboardData();
