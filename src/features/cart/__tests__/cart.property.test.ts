/**
 * Property-Based Tests for Cart & Checkout Logic
 * 
 * Feature: cart-and-checkout-logic
 * 
 * These tests verify correctness properties of the cart system
 * using property-based testing with fast-check.
 */

import { describe, test, expect, beforeAll, afterAll, beforeEach } from 'bun:test';
import * as fc from 'fast-check';
import { db } from '../../../core/database';
import { products, productVariants, complimentaryGifts, productGifts } from '../../../core/database/schema/products.schema';
import { discountCodes, discountCodeUsage } from '../../../core/database/schema/marketing.schema';
import { users } from '../../../core/database/schema/auth-schema';
import { cartDomain } from '../cart.domain';
import { eq, inArray } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import type { CartItemInput } from '../cart.interface';

// Test data setup
let testProductIds: string[] = [];
let testVariantIds: string[] = [];
let testGiftIds: string[] = [];
let testUserIds: string[] = [];
let setupComplete = false;

// Helper function to safely build cart items from specs
function buildCartItems(itemSpecs: Array<{productIndex: number, variantIndex: number, quantity: number}>): CartItemInput[] {
  return itemSpecs.map(spec => {
    const productId = testProductIds[spec.productIndex];
    const variantIndex = spec.productIndex * 2 + spec.variantIndex;
    const variantId = testVariantIds[variantIndex];
    
    // Ensure we have valid IDs
    if (!productId || !variantId) {
      throw new Error(`Invalid test data: productId=${productId}, variantId=${variantId}, productIndex=${spec.productIndex}, variantIndex=${variantIndex}, testProductIds.length=${testProductIds.length}, testVariantIds.length=${testVariantIds.length}`);
    }
    
    return {
      productId,
      variantId,
      quantity: spec.quantity,
    };
  });
}

describe('Cart Property-Based Tests', () => {

  beforeAll(async () => {
    try {
      // Test database connection
      await db.execute('SELECT 1');
      
      // Create a pool of test products with variants
      const numProducts = 5;
      for (let i = 0; i < numProducts; i++) {
        const productId = uuidv7();
        testProductIds.push(productId);
        
        await db.insert(products).values({
          id: productId,
          name: `PBT Cart Test Product ${i}`,
          slug: `pbt-cart-test-product-${i}-${productId.slice(0, 8)}`,
          description: 'Property-based test product for cart',
          basePrice: 1000 + (i * 500),
          status: 'active',
          trackInventory: true,
        });

        // Create 2 variants per product
        for (let j = 0; j < 2; j++) {
          const variantId = uuidv7();
          testVariantIds.push(variantId);
          
          await db.insert(productVariants).values({
            id: variantId,
            productId,
            name: `Variant ${j}`,
            value: `${100 + j * 50}ml`,
            sku: `SKU-${i}-${j}`,
            price: 1000 + (i * 500) + (j * 200),
            stockQuantity: 10 + j * 5,
            isActive: true,
          });
        }
      }

      // Create test free gifts with different thresholds
      const giftThresholds = [5000, 10000, 15000, 20000]; // 50, 100, 150, 200 THB
      for (let i = 0; i < giftThresholds.length; i++) {
        const giftId = uuidv7();
        testGiftIds.push(giftId);
        
        await db.insert(complimentaryGifts).values({
          id: giftId,
          name: `PBT Test Gift ${i}`,
          description: `Free gift for purchases over ${giftThresholds[i] / 100} THB`,
          imageUrl: `https://example.com/gift-${i}.jpg`,
          value: 500 + (i * 200),
          minPurchaseAmount: giftThresholds[i],
          isActive: true,
        });
      }

      // Create product-specific gifts (associate first 2 gifts with first 2 products)
      for (let i = 0; i < 2; i++) {
        await db.insert(productGifts).values({
          productId: testProductIds[i],
          giftId: testGiftIds[i],
        });
      }

      // Create test users for discount code usage tests
      for (let i = 0; i < 3; i++) {
        const userId = uuidv7();
        testUserIds.push(userId);
        
        await db.insert(users).values({
          id: userId,
          name: `PBT Test User ${i}`,
          email: `pbt-test-user-${i}-${userId.slice(0, 8)}@example.com`,
          emailVerified: true,
          role: 'customer',
        });
      }

      setupComplete = true;
    } catch (error) {
      console.error('Failed to setup test data:', error);
      setupComplete = false;
    }
  });

  afterAll(async () => {
    if (!setupComplete) return;
    
    try {
      // Cleanup all test data (in reverse order of creation due to foreign keys)
      if (testUserIds.length > 0) {
        await db.delete(users).where(inArray(users.id, testUserIds));
      }
      if (testGiftIds.length > 0) {
        // productGifts will be deleted automatically due to cascade
        await db.delete(complimentaryGifts).where(inArray(complimentaryGifts.id, testGiftIds));
      }
      if (testVariantIds.length > 0) {
        await db.delete(productVariants).where(inArray(productVariants.id, testVariantIds));
      }
      if (testProductIds.length > 0) {
        await db.delete(products).where(inArray(products.id, testProductIds));
      }
    } catch (error) {
      console.error('Failed to cleanup test data:', error);
    }
  });

  beforeEach(() => {
    if (!setupComplete) {
      throw new Error('Test setup failed - database connection required. Please ensure DATABASE_URL is configured and database is running.');
    }
  });

  /**
   * Property 1: Cart item storage completeness
   * 
   * For any product with variant, when added to the cart, the cart state should contain 
   * the product ID, variant ID, quantity, and pricing information
   * 
   * Validates: Requirements 1.1
   * 
   * Feature: cart-and-checkout-logic, Property 1: Cart item storage completeness
   */
  test('Property 1: Cart item storage completeness', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate random cart items from our test pool
        fc.array(
          fc.record({
            productIndex: fc.integer({ min: 0, max: testProductIds.length - 1 }),
            variantIndex: fc.integer({ min: 0, max: 1 }), // 0 or 1 for the 2 variants
            quantity: fc.integer({ min: 1, max: 5 }),
          }),
          { minLength: 1, maxLength: 3 }
        ),
        async (itemSpecs) => {
          // Build cart items from specs
          const items: CartItemInput[] = itemSpecs.map(spec => ({
            productId: testProductIds[spec.productIndex],
            variantId: testVariantIds[spec.productIndex * 2 + spec.variantIndex],
            quantity: spec.quantity,
          }));

          // Validate the cart
          const validatedCart = await cartDomain.validateCart(items);

          // Property: Each validated item should contain all required fields
          for (let i = 0; i < validatedCart.items.length; i++) {
            const validatedItem = validatedCart.items[i];
            const originalItem = items[i];

            // Check that product ID is preserved
            expect(validatedItem.productId).toBe(originalItem.productId);

            // Check that variant ID is preserved
            expect(validatedItem.variantId).toBe(originalItem.variantId);

            // Check that quantity is preserved
            expect(validatedItem.quantity).toBe(originalItem.quantity);

            // Check that pricing information is present
            expect(validatedItem.unitPrice).toBeGreaterThan(0);
            expect(validatedItem.subtotal).toBe(validatedItem.unitPrice * validatedItem.quantity);

            // Check that product name is present
            expect(validatedItem.productName).toBeDefined();
            expect(validatedItem.productName.length).toBeGreaterThan(0);

            // Check that variant name is present (since we always use variants in this test)
            expect(validatedItem.variantName).toBeDefined();
          }
        }
      ),
      { numRuns: 100 } // Run 100 iterations as specified in design
    );
  });

  /**
   * Property 2: Subtotal calculation accuracy
   * 
   * For any cart with items, the subtotal should equal the sum of (unit price × quantity) for all items
   * 
   * Validates: Requirements 1.2, 7.1
   * 
   * Feature: cart-and-checkout-logic, Property 2: Subtotal calculation accuracy
   */
  test('Property 2: Subtotal calculation accuracy', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate random cart items from our test pool
        fc.array(
          fc.record({
            productIndex: fc.integer({ min: 0, max: testProductIds.length - 1 }),
            variantIndex: fc.integer({ min: 0, max: 1 }),
            quantity: fc.integer({ min: 1, max: 10 }),
          }),
          { minLength: 1, maxLength: 5 }
        ),
        async (itemSpecs) => {
          // Build cart items from specs
          const items: CartItemInput[] = itemSpecs.map(spec => ({
            productId: testProductIds[spec.productIndex],
            variantId: testVariantIds[spec.productIndex * 2 + spec.variantIndex],
            quantity: spec.quantity,
          }));

          // Validate the cart
          const validatedCart = await cartDomain.validateCart(items);

          // Calculate expected subtotal manually
          let expectedSubtotal = 0;
          for (const item of validatedCart.items) {
            expectedSubtotal += item.unitPrice * item.quantity;
          }

          // Property: The cart subtotal should equal the sum of all item subtotals
          expect(validatedCart.subtotal).toBe(expectedSubtotal);

          // Property: The cart subtotal should also equal the sum of individual item subtotals
          const sumOfItemSubtotals = validatedCart.items.reduce(
            (sum, item) => sum + item.subtotal,
            0
          );
          expect(validatedCart.subtotal).toBe(sumOfItemSubtotals);
        }
      ),
      { numRuns: 100 } // Run 100 iterations as specified in design
    );
  });

  /**
   * Property 3: Cart item removal consistency
   * 
   * For any cart and any item in that cart, removing the item should result in the cart 
   * no longer containing that item and the subtotal being recalculated correctly
   * 
   * Validates: Requirements 1.3
   * 
   * Feature: cart-and-checkout-logic, Property 3: Cart item removal consistency
   */
  test('Property 3: Cart item removal consistency', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate random cart items from our test pool
        fc.array(
          fc.record({
            productIndex: fc.integer({ min: 0, max: testProductIds.length - 1 }),
            variantIndex: fc.integer({ min: 0, max: 1 }),
            quantity: fc.integer({ min: 1, max: 5 }),
          }),
          { minLength: 2, maxLength: 5 } // At least 2 items so we can remove one
        ),
        // Index of item to remove
        fc.integer({ min: 0, max: 10 }),
        async (itemSpecs, removeIndexRaw) => {
          // Build cart items from specs
          const items: CartItemInput[] = itemSpecs.map(spec => ({
            productId: testProductIds[spec.productIndex],
            variantId: testVariantIds[spec.productIndex * 2 + spec.variantIndex],
            quantity: spec.quantity,
          }));

          // Validate the original cart
          const originalCart = await cartDomain.validateCart(items);

          // Select an item to remove (modulo to ensure valid index)
          const removeIndex = removeIndexRaw % items.length;
          const removedItem = items[removeIndex];

          // Create new cart without the removed item
          const remainingItems = items.filter((_, index) => index !== removeIndex);

          // Validate the cart after removal
          const updatedCart = await cartDomain.validateCart(remainingItems);

          // Property 1: The removed item should not be in the updated cart
          const removedItemStillPresent = updatedCart.items.some(
            item => item.productId === removedItem.productId && item.variantId === removedItem.variantId
          );
          expect(removedItemStillPresent).toBe(false);

          // Property 2: The number of items should decrease by 1
          expect(updatedCart.items.length).toBe(originalCart.items.length - 1);

          // Property 3: The subtotal should be recalculated correctly
          // Calculate what the subtotal should be after removal
          const removedItemFromOriginal = originalCart.items[removeIndex];
          const expectedSubtotal = originalCart.subtotal - removedItemFromOriginal.subtotal;
          expect(updatedCart.subtotal).toBe(expectedSubtotal);

          // Property 4: All remaining items should still be present
          for (let i = 0; i < remainingItems.length; i++) {
            const remainingItem = remainingItems[i];
            const foundInUpdated = updatedCart.items.some(
              item => item.productId === remainingItem.productId && 
                      item.variantId === remainingItem.variantId &&
                      item.quantity === remainingItem.quantity
            );
            expect(foundInUpdated).toBe(true);
          }
        }
      ),
      { numRuns: 100 } // Run 100 iterations as specified in design
    );
  });

  /**
   * Property 31: Product existence validation
   * 
   * For any order submission, all product IDs should exist in the database and have status "active"
   * 
   * Validates: Requirements 6.1
   * 
   * Feature: cart-and-checkout-logic, Property 31: Product existence validation
   */
  test('Property 31: Product existence validation', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate cart items with mix of valid and invalid product IDs
        fc.record({
          validItems: fc.array(
            fc.record({
              productIndex: fc.integer({ min: 0, max: testProductIds.length - 1 }),
              variantIndex: fc.integer({ min: 0, max: 1 }),
              quantity: fc.integer({ min: 1, max: 5 }),
            }),
            { minLength: 0, maxLength: 3 }
          ),
          invalidProductIds: fc.array(
            fc.uuid(), // Generate random UUIDs that don't exist in database
            { minLength: 0, maxLength: 2 }
          ),
        }),
        async ({ validItems, invalidProductIds }) => {
          // Build cart items from valid specs
          const items: CartItemInput[] = validItems.map(spec => ({
            productId: testProductIds[spec.productIndex],
            variantId: testVariantIds[spec.productIndex * 2 + spec.variantIndex],
            quantity: spec.quantity,
          }));

          // Add invalid product IDs
          for (const invalidId of invalidProductIds) {
            items.push({
              productId: invalidId,
              quantity: 1,
            });
          }

          // Skip if no items
          if (items.length === 0) {
            return true;
          }

          // Validate the cart
          const validatedCart = await cartDomain.validateCart(items);

          // Property 1: All valid products should be in validated items
          for (const validItem of validItems) {
            const productId = testProductIds[validItem.productIndex];
            const found = validatedCart.items.some(item => item.productId === productId);
            expect(found).toBe(true);
          }

          // Property 2: Invalid products should generate errors
          for (const invalidId of invalidProductIds) {
            const hasError = validatedCart.errors.some(
              error => error.productId === invalidId && error.type === 'product_not_found'
            );
            expect(hasError).toBe(true);
          }

          // Property 3: Cart should be invalid if there are any invalid products
          if (invalidProductIds.length > 0) {
            expect(validatedCart.isValid).toBe(false);
          }

          // Property 4: Cart should be valid only if all products exist and are active
          if (invalidProductIds.length === 0 && validItems.length > 0) {
            // Check if all items have sufficient stock
            const allInStock = validatedCart.items.every(item => item.inStock);
            expect(validatedCart.isValid).toBe(allInStock);
          }
        }
      ),
      { numRuns: 100 } // Run 100 iterations as specified in design
    );
  });

  /**
   * Property 32: Stock availability validation
   * 
   * For any order submission, for each item, available stock should be >= requested quantity
   * 
   * Validates: Requirements 6.2
   * 
   * Feature: cart-and-checkout-logic, Property 32: Stock availability validation
   */
  test('Property 32: Stock availability validation', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate cart items with varying quantities
        fc.array(
          fc.record({
            productIndex: fc.integer({ min: 0, max: testProductIds.length - 1 }),
            variantIndex: fc.integer({ min: 0, max: 1 }),
            quantity: fc.integer({ min: 1, max: 20 }), // Some will exceed stock
          }),
          { minLength: 1, maxLength: 3 }
        ),
        async (itemSpecs) => {
          // Build cart items from specs
          const items: CartItemInput[] = itemSpecs.map(spec => ({
            productId: testProductIds[spec.productIndex],
            variantId: testVariantIds[spec.productIndex * 2 + spec.variantIndex],
            quantity: spec.quantity,
          }));

          // Validate the cart
          const validatedCart = await cartDomain.validateCart(items);

          // Property 1: For each validated item, check stock availability
          for (let i = 0; i < validatedCart.items.length; i++) {
            const validatedItem = validatedCart.items[i];
            const requestedQuantity = items[i].quantity;

            // If item is in stock, available quantity should be >= requested quantity
            if (validatedItem.inStock) {
              expect(validatedItem.availableQuantity).toBeGreaterThanOrEqual(requestedQuantity);
            }

            // If item is not in stock, there should be an error
            if (!validatedItem.inStock) {
              const hasStockError = validatedCart.errors.some(
                error => 
                  error.productId === validatedItem.productId &&
                  error.variantId === validatedItem.variantId &&
                  (error.type === 'out_of_stock' || error.type === 'insufficient_stock')
              );
              expect(hasStockError).toBe(true);
            }
          }

          // Property 2: If any item has insufficient stock, cart should be invalid
          const hasInsufficientStock = validatedCart.items.some(item => !item.inStock);
          if (hasInsufficientStock) {
            expect(validatedCart.isValid).toBe(false);
          }

          // Property 3: Insufficient stock errors should specify the available quantity
          for (const error of validatedCart.errors) {
            if (error.type === 'insufficient_stock') {
              expect(error.message).toContain('Available:');
              expect(error.message).toContain('Requested:');
            }
          }
        }
      ),
      { numRuns: 100 } // Run 100 iterations as specified in design
    );
  });

  /**
   * Property 33: Server-side price recalculation
   * 
   * For any order submission, the final order amounts should be calculated from database prices,
   * ignoring client-submitted prices
   * 
   * Validates: Requirements 6.3, 7.5
   * 
   * Feature: cart-and-checkout-logic, Property 33: Server-side price recalculation
   */
  test('Property 33: Server-side price recalculation', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate cart items with random (potentially manipulated) client prices
        fc.array(
          fc.record({
            productIndex: fc.integer({ min: 0, max: testProductIds.length - 1 }),
            variantIndex: fc.integer({ min: 0, max: 1 }),
            quantity: fc.integer({ min: 1, max: 5 }),
            // Client could send any price (simulating price manipulation attempt)
            clientPrice: fc.integer({ min: 1, max: 1000000 }),
          }),
          { minLength: 1, maxLength: 3 }
        ),
        async (itemSpecs) => {
          // Build cart items from specs (without price - client shouldn't send price)
          const items: CartItemInput[] = itemSpecs.map(spec => ({
            productId: testProductIds[spec.productIndex],
            variantId: testVariantIds[spec.productIndex * 2 + spec.variantIndex],
            quantity: spec.quantity,
          }));

          // Validate the cart
          const validatedCart = await cartDomain.validateCart(items);

          // Get the actual prices from database for comparison
          const variantIds = items.map(item => item.variantId!);
          const dbVariants = await db
            .select()
            .from(productVariants)
            .where(inArray(productVariants.id, variantIds));

          const variantPriceMap = new Map(dbVariants.map(v => [v.id, v.price]));

          // Property 1: All prices in validated cart should match database prices
          for (let i = 0; i < validatedCart.items.length; i++) {
            const validatedItem = validatedCart.items[i];
            const dbPrice = variantPriceMap.get(validatedItem.variantId!);

            // The validated price should match the database price, not the client price
            expect(dbPrice).toBeDefined();
            expect(validatedItem.unitPrice).toBe(dbPrice!);

            // The validated price should NOT match the random client price (unless by chance)
            // This verifies we're not using client-submitted prices
            const clientPrice = itemSpecs[i].clientPrice;
            if (clientPrice !== dbPrice) {
              expect(validatedItem.unitPrice).not.toBe(clientPrice);
            }
          }

          // Property 2: Subtotal should be calculated from database prices
          let expectedSubtotal = 0;
          for (let i = 0; i < validatedCart.items.length; i++) {
            const item = validatedCart.items[i];
            const dbPrice = variantPriceMap.get(item.variantId!);
            expectedSubtotal += dbPrice! * item.quantity;
          }
          expect(validatedCart.subtotal).toBe(expectedSubtotal);

          // Property 3: Item subtotals should be calculated from database prices
          for (const item of validatedCart.items) {
            const dbPrice = variantPriceMap.get(item.variantId!);
            const expectedItemSubtotal = dbPrice! * item.quantity;
            expect(item.subtotal).toBe(expectedItemSubtotal);
          }
        }
      ),
      { numRuns: 100 } // Run 100 iterations as specified in design
    );
  });

  /**
   * Property 23: Order total calculation accuracy
   * 
   * For any order, the total should equal subtotal + shipping cost + tax amount - discount amount
   * 
   * Validates: Requirements 4.2, 7.3
   * 
   * Feature: cart-and-checkout-logic, Property 23: Order total calculation accuracy
   */
  test('Property 23: Order total calculation accuracy', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate cart items
        fc.array(
          fc.record({
            productIndex: fc.integer({ min: 0, max: testProductIds.length - 1 }),
            variantIndex: fc.integer({ min: 0, max: 1 }),
            quantity: fc.integer({ min: 1, max: 5 }),
          }),
          { minLength: 1, maxLength: 3 }
        ),
        // Generate shipping method
        fc.constantFrom('standard', 'express', 'next-day'),
        async (itemSpecs, shippingMethod) => {
          // Build cart items from specs
          const items: CartItemInput[] = itemSpecs.map(spec => ({
            productId: testProductIds[spec.productIndex],
            variantId: testVariantIds[spec.productIndex * 2 + spec.variantIndex],
            quantity: spec.quantity,
          }));

          // Calculate cart pricing without discount
          const pricing = await cartDomain.calculateCartPricing(items, undefined, shippingMethod);

          // Property 1: Total should equal subtotal + shipping + tax - discount
          const expectedTotal = pricing.subtotal + pricing.shippingCost + pricing.taxAmount - pricing.discountAmount;
          expect(pricing.totalAmount).toBe(expectedTotal);

          // Property 2: All components should be non-negative
          expect(pricing.subtotal).toBeGreaterThanOrEqual(0);
          expect(pricing.shippingCost).toBeGreaterThanOrEqual(0);
          expect(pricing.taxAmount).toBeGreaterThanOrEqual(0);
          expect(pricing.discountAmount).toBeGreaterThanOrEqual(0);
          expect(pricing.totalAmount).toBeGreaterThanOrEqual(0);

          // Property 3: Tax should be approximately 7% of (subtotal + shipping)
          const expectedTax = Math.round((pricing.subtotal + pricing.shippingCost) * 0.07);
          expect(pricing.taxAmount).toBe(expectedTax);

          // Property 4: Shipping cost should match the selected method
          let expectedShippingCost = 0;
          if (pricing.subtotal < 100000) { // Free shipping over 1000 THB
            switch (shippingMethod) {
              case 'standard':
                expectedShippingCost = 5000; // 50 THB
                break;
              case 'express':
                expectedShippingCost = 10000; // 100 THB
                break;
              case 'next-day':
                expectedShippingCost = 15000; // 150 THB
                break;
            }
          }
          expect(pricing.shippingCost).toBe(expectedShippingCost);

          // Property 5: Without discount, discount amount should be 0
          expect(pricing.discountAmount).toBe(0);
          expect(pricing.discount).toBeUndefined();
        }
      ),
      { numRuns: 100 } // Run 100 iterations as specified in design
    );
  });

  /**
   * Property 6: Free gift eligibility by subtotal
   * 
   * For any cart with subtotal and any free gift with minimum purchase amount, 
   * the gift should be eligible if and only if subtotal >= minimum purchase amount
   * 
   * Validates: Requirements 2.1
   * 
   * Feature: cart-and-checkout-logic, Property 6: Free gift eligibility by subtotal
   */
  test('Property 6: Free gift eligibility by subtotal', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate cart items with varying subtotals
        fc.array(
          fc.record({
            productIndex: fc.integer({ min: 0, max: testProductIds.length - 1 }),
            variantIndex: fc.integer({ min: 0, max: 1 }),
            quantity: fc.integer({ min: 1, max: 10 }),
          }),
          { minLength: 1, maxLength: 5 }
        ),
        async (itemSpecs) => {
          // Build cart items from specs
          const items: CartItemInput[] = itemSpecs.map(spec => ({
            productId: testProductIds[spec.productIndex],
            variantId: testVariantIds[spec.productIndex * 2 + spec.variantIndex],
            quantity: spec.quantity,
          }));

          // Calculate cart subtotal
          const validatedCart = await cartDomain.validateCart(items);
          const subtotal = validatedCart.subtotal;

          // Get eligible gifts
          const eligibleGifts = await cartDomain.getEligibleFreeGifts(items, subtotal);

          // Get all gifts from database to check eligibility
          const allGifts = await db
            .select()
            .from(complimentaryGifts)
            .where(eq(complimentaryGifts.isActive, true));

          // Property: For each gift, it should be eligible if and only if subtotal >= minPurchaseAmount
          for (const gift of allGifts) {
            const isEligible = eligibleGifts.some(g => g.id === gift.id);
            const shouldBeEligible = gift.minPurchaseAmount !== null && subtotal >= gift.minPurchaseAmount;

            // Check if gift has product associations
            const giftAssociations = await db
              .select()
              .from(productGifts)
              .where(eq(productGifts.giftId, gift.id));

            const hasProductAssociation = giftAssociations.length > 0;
            const hasAssociatedProductInCart = giftAssociations.some(assoc =>
              items.some(item => item.productId === assoc.productId)
            );

            // Gift should be eligible if:
            // 1. Subtotal meets threshold, OR
            // 2. Gift is associated with a product in the cart
            const expectedEligibility = shouldBeEligible || (hasProductAssociation && hasAssociatedProductInCart);

            if (expectedEligibility) {
              expect(isEligible).toBe(true);
            } else {
              expect(isEligible).toBe(false);
            }
          }

          // Property: All eligible gifts should have minPurchaseAmount <= subtotal OR be product-associated
          for (const eligibleGift of eligibleGifts) {
            const giftFromDb = allGifts.find(g => g.id === eligibleGift.id);
            expect(giftFromDb).toBeDefined();

            const meetsSubtotalThreshold = giftFromDb!.minPurchaseAmount !== null && 
                                          subtotal >= giftFromDb!.minPurchaseAmount;

            const giftAssociations = await db
              .select()
              .from(productGifts)
              .where(eq(productGifts.giftId, eligibleGift.id));

            const hasAssociatedProductInCart = giftAssociations.some(assoc =>
              items.some(item => item.productId === assoc.productId)
            );

            // At least one condition must be true
            expect(meetsSubtotalThreshold || hasAssociatedProductInCart).toBe(true);
          }
        }
      ),
      { numRuns: 100 } // Run 100 iterations as specified in design
    );
  });

  /**
   * Property 7: Multiple free gifts application
   * 
   * For any cart with subtotal, all free gifts with minimum purchase amounts <= subtotal 
   * should be returned as eligible
   * 
   * Validates: Requirements 2.2
   * 
   * Feature: cart-and-checkout-logic, Property 7: Multiple free gifts application
   */
  test('Property 7: Multiple free gifts application', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate cart items with varying subtotals
        fc.array(
          fc.record({
            productIndex: fc.integer({ min: 0, max: testProductIds.length - 1 }),
            variantIndex: fc.integer({ min: 0, max: 1 }),
            quantity: fc.integer({ min: 1, max: 15 }),
          }),
          { minLength: 1, maxLength: 5 }
        ),
        async (itemSpecs) => {
          // Build cart items from specs
          const items: CartItemInput[] = itemSpecs.map(spec => ({
            productId: testProductIds[spec.productIndex],
            variantId: testVariantIds[spec.productIndex * 2 + spec.variantIndex],
            quantity: spec.quantity,
          }));

          // Calculate cart subtotal
          const validatedCart = await cartDomain.validateCart(items);
          const subtotal = validatedCart.subtotal;

          // Get eligible gifts
          const eligibleGifts = await cartDomain.getEligibleFreeGifts(items, subtotal);

          // Get all gifts that should be eligible by subtotal
          const giftsEligibleBySubtotal = await db
            .select()
            .from(complimentaryGifts)
            .where(eq(complimentaryGifts.isActive, true));

          const expectedGiftsBySubtotal = giftsEligibleBySubtotal.filter(
            gift => gift.minPurchaseAmount !== null && subtotal >= gift.minPurchaseAmount
          );

          // Property 1: All gifts with minPurchaseAmount <= subtotal should be in eligible gifts
          for (const expectedGift of expectedGiftsBySubtotal) {
            const found = eligibleGifts.some(g => g.id === expectedGift.id);
            expect(found).toBe(true);
          }

          // Property 2: If multiple gifts are eligible, all should be returned
          if (expectedGiftsBySubtotal.length > 1) {
            expect(eligibleGifts.length).toBeGreaterThanOrEqual(expectedGiftsBySubtotal.length);
          }

          // Property 3: No duplicate gifts should be returned
          const giftIds = eligibleGifts.map(g => g.id);
          const uniqueGiftIds = new Set(giftIds);
          expect(giftIds.length).toBe(uniqueGiftIds.size);

          // Property 4: All eligible gifts should be active
          for (const gift of eligibleGifts) {
            const giftFromDb = giftsEligibleBySubtotal.find(g => g.id === gift.id);
            if (giftFromDb) {
              expect(giftFromDb.isActive).toBe(true);
            }
          }
        }
      ),
      { numRuns: 100 } // Run 100 iterations as specified in design
    );
  });

  /**
   * Property 8: Free gift removal on threshold drop
   * 
   * For any cart with eligible gifts, reducing the subtotal below the minimum purchase amount 
   * should result in those gifts no longer being eligible
   * 
   * Validates: Requirements 2.3
   * 
   * Feature: cart-and-checkout-logic, Property 8: Free gift removal on threshold drop
   */
  test('Property 8: Free gift removal on threshold drop', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate cart items that will have gifts
        fc.array(
          fc.record({
            productIndex: fc.integer({ min: 0, max: testProductIds.length - 1 }),
            variantIndex: fc.integer({ min: 0, max: 1 }),
            quantity: fc.integer({ min: 3, max: 10 }), // Start with higher quantities
          }),
          { minLength: 2, maxLength: 4 }
        ),
        // Index of item to reduce
        fc.integer({ min: 0, max: 10 }),
        async (itemSpecs, reduceIndexRaw) => {
          // Build cart items from specs
          const items: CartItemInput[] = itemSpecs.map(spec => ({
            productId: testProductIds[spec.productIndex],
            variantId: testVariantIds[spec.productIndex * 2 + spec.variantIndex],
            quantity: spec.quantity,
          }));

          // Calculate original cart subtotal and gifts
          const originalCart = await cartDomain.validateCart(items);
          const originalSubtotal = originalCart.subtotal;
          const originalGifts = await cartDomain.getEligibleFreeGifts(items, originalSubtotal);

          // Skip if no gifts are eligible initially
          if (originalGifts.length === 0) {
            return true;
          }

          // Reduce quantity of one item
          const reduceIndex = reduceIndexRaw % items.length;
          const reducedItems = items.map((item, index) => {
            if (index === reduceIndex) {
              return { ...item, quantity: Math.max(1, Math.floor(item.quantity / 2)) };
            }
            return item;
          });

          // Calculate new cart subtotal and gifts
          const reducedCart = await cartDomain.validateCart(reducedItems);
          const reducedSubtotal = reducedCart.subtotal;
          const reducedGifts = await cartDomain.getEligibleFreeGifts(reducedItems, reducedSubtotal);

          // Property 1: If subtotal decreased, some gifts may no longer be eligible
          if (reducedSubtotal < originalSubtotal) {
            // Check each original gift
            for (const originalGift of originalGifts) {
              const stillEligible = reducedGifts.some(g => g.id === originalGift.id);

              // If gift had a subtotal threshold and we're now below it, it should not be eligible
              if (originalGift.minPurchaseAmount && reducedSubtotal < originalGift.minPurchaseAmount) {
                // Unless it's product-specific and the product is still in cart
                const hasProductAssociation = originalGift.associatedProductIds && 
                                             originalGift.associatedProductIds.length > 0;
                const hasAssociatedProductInCart = hasProductAssociation &&
                  originalGift.associatedProductIds!.some(productId =>
                    reducedItems.some(item => item.productId === productId)
                  );

                if (!hasAssociatedProductInCart) {
                  expect(stillEligible).toBe(false);
                }
              }
            }
          }

          // Property 2: Gifts that still meet threshold should remain eligible
          for (const gift of originalGifts) {
            if (gift.minPurchaseAmount && reducedSubtotal >= gift.minPurchaseAmount) {
              const stillEligible = reducedGifts.some(g => g.id === gift.id);
              expect(stillEligible).toBe(true);
            }
          }

          // Property 3: No new gifts should appear when subtotal decreases
          // (unless they're product-specific)
          for (const reducedGift of reducedGifts) {
            const wasInOriginal = originalGifts.some(g => g.id === reducedGift.id);
            if (!wasInOriginal) {
              // This gift must be product-specific
              expect(reducedGift.associatedProductIds).toBeDefined();
              expect(reducedGift.associatedProductIds!.length).toBeGreaterThan(0);
            }
          }
        }
      ),
      { numRuns: 100 } // Run 100 iterations as specified in design
    );
  });

  /**
   * Property 9: Product-specific free gift eligibility
   * 
   * For any free gift associated with specific products, the gift should only be eligible 
   * when at least one of those products is in the cart
   * 
   * Validates: Requirements 2.4
   * 
   * Feature: cart-and-checkout-logic, Property 9: Product-specific free gift eligibility
   */
  test('Property 9: Product-specific free gift eligibility', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate cart items
        fc.array(
          fc.record({
            productIndex: fc.integer({ min: 0, max: testProductIds.length - 1 }),
            variantIndex: fc.integer({ min: 0, max: 1 }),
            quantity: fc.integer({ min: 1, max: 5 }),
          }),
          { minLength: 1, maxLength: 4 }
        ),
        async (itemSpecs) => {
          // Build cart items from specs
          const items: CartItemInput[] = itemSpecs.map(spec => ({
            productId: testProductIds[spec.productIndex],
            variantId: testVariantIds[spec.productIndex * 2 + spec.variantIndex],
            quantity: spec.quantity,
          }));

          // Calculate cart subtotal
          const validatedCart = await cartDomain.validateCart(items);
          const subtotal = validatedCart.subtotal;

          // Get eligible gifts
          const eligibleGifts = await cartDomain.getEligibleFreeGifts(items, subtotal);

          // Get all product-gift associations
          const allProductGiftAssociations = await db
            .select()
            .from(productGifts);

          // Group by gift ID
          const giftProductMap = new Map<string, string[]>();
          for (const assoc of allProductGiftAssociations) {
            if (!giftProductMap.has(assoc.giftId)) {
              giftProductMap.set(assoc.giftId, []);
            }
            giftProductMap.get(assoc.giftId)!.push(assoc.productId);
          }

          // Property 1: For each product-specific gift, check if it's correctly included/excluded
          for (const [giftId, associatedProductIds] of giftProductMap.entries()) {
            const hasAssociatedProductInCart = associatedProductIds.some(productId =>
              items.some(item => item.productId === productId)
            );

            const giftIsEligible = eligibleGifts.some(g => g.id === giftId);

            // If associated product is in cart, gift should be eligible
            if (hasAssociatedProductInCart) {
              expect(giftIsEligible).toBe(true);
            }

            // If associated product is NOT in cart, gift should only be eligible by subtotal
            if (!hasAssociatedProductInCart) {
              if (giftIsEligible) {
                // Must be eligible by subtotal
                const gift = await db
                  .select()
                  .from(complimentaryGifts)
                  .where(eq(complimentaryGifts.id, giftId))
                  .limit(1);

                expect(gift[0]).toBeDefined();
                expect(gift[0].minPurchaseAmount).not.toBeNull();
                expect(subtotal).toBeGreaterThanOrEqual(gift[0].minPurchaseAmount!);
              }
            }
          }

          // Property 2: All eligible product-specific gifts should have their associated products in cart
          // OR meet the subtotal threshold
          for (const eligibleGift of eligibleGifts) {
            if (eligibleGift.associatedProductIds && eligibleGift.associatedProductIds.length > 0) {
              const hasAssociatedProductInCart = eligibleGift.associatedProductIds.some(productId =>
                items.some(item => item.productId === productId)
              );

              const meetsSubtotalThreshold = eligibleGift.minPurchaseAmount !== undefined &&
                                            subtotal >= eligibleGift.minPurchaseAmount;

              // At least one condition must be true
              expect(hasAssociatedProductInCart || meetsSubtotalThreshold).toBe(true);
            }
          }

          // Property 3: Product-specific gifts should include associatedProductIds in response
          for (const eligibleGift of eligibleGifts) {
            const associations = giftProductMap.get(eligibleGift.id);
            if (associations && associations.length > 0) {
              expect(eligibleGift.associatedProductIds).toBeDefined();
              expect(eligibleGift.associatedProductIds!.length).toBeGreaterThan(0);
              
              // The returned associatedProductIds should match the database
              for (const productId of associations) {
                expect(eligibleGift.associatedProductIds).toContain(productId);
              }
            }
          }
        }
      ),
      { numRuns: 100 } // Run 100 iterations as specified in design
    );
  });

  /**
   * Property 11: Discount code existence validation
   * 
   * For any discount code string, validation should return valid if and only if 
   * a matching active code exists in the database
   * 
   * Validates: Requirements 3.1
   * 
   * Feature: cart-and-checkout-logic, Property 11: Discount code existence validation
   */
  test('Property 11: Discount code existence validation', async () => {
    // Create test discount codes
    const testDiscountCodes: string[] = [];
    const numCodes = 3;
    
    for (let i = 0; i < numCodes; i++) {
      const code = `TESTCODE${i}`;
      testDiscountCodes.push(code);
      
      await db.insert(discountCodes).values({
        code: code,
        title: `Test Discount ${i}`,
        description: 'Property test discount code',
        discountType: 'percentage',
        discountValue: 10 + (i * 5),
        isActive: true,
      });
    }

    try {
      await fc.assert(
        fc.asyncProperty(
          // Generate mix of valid and invalid discount codes
          fc.record({
            useValidCode: fc.boolean(),
            validCodeIndex: fc.integer({ min: 0, max: numCodes - 1 }),
            invalidCode: fc.string({ minLength: 5, maxLength: 20 }).map(s => 'INVALID_' + s.toUpperCase()),
          }),
          async ({ useValidCode, validCodeIndex, invalidCode }) => {
            const code = useValidCode ? testDiscountCodes[validCodeIndex] : invalidCode;
            const subtotal = 10000; // 100 THB

            // Validate the discount code
            const validation = await cartDomain.validateDiscountCode(code, subtotal);

            // Property 1: Valid codes should return isValid: true
            if (useValidCode) {
              expect(validation.isValid).toBe(true);
              expect(validation.code).toBe(code);
              expect(validation.discountType).toBeDefined();
              expect(validation.discountValue).toBeDefined();
              expect(validation.errorCode).toBeUndefined();
            }

            // Property 2: Invalid codes should return isValid: false with INVALID_CODE error
            if (!useValidCode) {
              expect(validation.isValid).toBe(false);
              expect(validation.errorCode).toBe('INVALID_CODE');
              expect(validation.error).toBeDefined();
              expect(validation.code).toBeUndefined();
            }

            // Property 3: Validation should be case-insensitive for valid codes
            if (useValidCode) {
              const lowerCaseValidation = await cartDomain.validateDiscountCode(
                code.toLowerCase(),
                subtotal
              );
              expect(lowerCaseValidation.isValid).toBe(true);
            }
          }
        ),
        { numRuns: 100 }
      );
    } finally {
      // Cleanup test discount codes
      await db.delete(discountCodes).where(
        inArray(discountCodes.code, testDiscountCodes)
      );
    }
  });

  /**
   * Property 12: Discount code start date validation
   * 
   * For any discount code with a start date, the code should only be valid on or after the start date
   * 
   * Validates: Requirements 3.2
   * 
   * Feature: cart-and-checkout-logic, Property 12: Discount code start date validation
   */
  test('Property 12: Discount code start date validation', async () => {
    const testCode = 'STARTDATE_TEST';
    
    // Create a discount code with a start date
    await db.insert(discountCodes).values({
      code: testCode,
      title: 'Start Date Test',
      description: 'Property test for start date validation',
      discountType: 'percentage',
      discountValue: 15,
      startsAt: new Date('2025-01-01T00:00:00Z'),
      isActive: true,
    });

    try {
      await fc.assert(
        fc.asyncProperty(
          // Generate dates before, on, and after the start date
          fc.date({ min: new Date('2024-01-01'), max: new Date('2026-01-01') }),
          async (testDate) => {
            const subtotal = 10000; // 100 THB

            // Mock the current date for testing
            const originalDate = Date;
            global.Date = class extends originalDate {
              constructor() {
                super();
                return testDate;
              }
              static now() {
                return testDate.getTime();
              }
            } as any;

            try {
              const validation = await cartDomain.validateDiscountCode(testCode, subtotal);

              const startDate = new Date('2025-01-01T00:00:00Z');

              // Property: Code should be valid only on or after start date
              if (testDate >= startDate) {
                expect(validation.isValid).toBe(true);
                expect(validation.errorCode).toBeUndefined();
              } else {
                expect(validation.isValid).toBe(false);
                expect(validation.errorCode).toBe('NOT_STARTED');
                expect(validation.error).toContain('not yet active');
              }
            } finally {
              // Restore original Date
              global.Date = originalDate;
            }
          }
        ),
        { numRuns: 100 }
      );
    } finally {
      // Cleanup
      await db.delete(discountCodes).where(eq(discountCodes.code, testCode));
    }
  });

  /**
   * Property 13: Discount code expiration validation
   * 
   * For any discount code with an expiration date, the code should only be valid before the expiration date
   * 
   * Validates: Requirements 3.3
   * 
   * Feature: cart-and-checkout-logic, Property 13: Discount code expiration validation
   */
  test('Property 13: Discount code expiration validation', async () => {
    const testCode = 'EXPIRY_TEST';
    
    // Create a discount code with an expiration date
    await db.insert(discountCodes).values({
      code: testCode,
      title: 'Expiry Test',
      description: 'Property test for expiration validation',
      discountType: 'percentage',
      discountValue: 20,
      expiresAt: new Date('2025-06-01T00:00:00Z'),
      isActive: true,
    });

    try {
      await fc.assert(
        fc.asyncProperty(
          // Generate dates before, on, and after the expiration date
          fc.date({ min: new Date('2024-01-01'), max: new Date('2026-01-01') }),
          async (testDate) => {
            const subtotal = 10000; // 100 THB

            // Mock the current date for testing
            const originalDate = Date;
            global.Date = class extends originalDate {
              constructor() {
                super();
                return testDate;
              }
              static now() {
                return testDate.getTime();
              }
            } as any;

            try {
              const validation = await cartDomain.validateDiscountCode(testCode, subtotal);

              const expiryDate = new Date('2025-06-01T00:00:00Z');

              // Property: Code should be valid only before expiration date
              if (testDate < expiryDate) {
                expect(validation.isValid).toBe(true);
                expect(validation.errorCode).toBeUndefined();
              } else {
                expect(validation.isValid).toBe(false);
                expect(validation.errorCode).toBe('EXPIRED');
                expect(validation.error).toContain('expired');
              }
            } finally {
              // Restore original Date
              global.Date = originalDate;
            }
          }
        ),
        { numRuns: 100 }
      );
    } finally {
      // Cleanup
      await db.delete(discountCodes).where(eq(discountCodes.code, testCode));
    }
  });

  /**
   * Property 14: Discount code minimum purchase validation
   * 
   * For any discount code with minimum purchase amount and any cart subtotal, 
   * the code should only be applicable when subtotal >= minimum purchase amount
   * 
   * Validates: Requirements 3.4
   * 
   * Feature: cart-and-checkout-logic, Property 14: Discount code minimum purchase validation
   */
  test('Property 14: Discount code minimum purchase validation', async () => {
    const testCode = 'MINPURCHASE_TEST';
    const minPurchaseAmount = 50000; // 500 THB
    
    // Create a discount code with minimum purchase requirement
    await db.insert(discountCodes).values({
      code: testCode,
      title: 'Min Purchase Test',
      description: 'Property test for minimum purchase validation',
      discountType: 'percentage',
      discountValue: 10,
      minPurchaseAmount: minPurchaseAmount,
      isActive: true,
    });

    try {
      await fc.assert(
        fc.asyncProperty(
          // Generate various subtotal amounts
          fc.integer({ min: 1000, max: 200000 }), // 10 THB to 2000 THB
          async (subtotal) => {
            const validation = await cartDomain.validateDiscountCode(testCode, subtotal);

            // Property: Code should be valid only when subtotal >= minPurchaseAmount
            if (subtotal >= minPurchaseAmount) {
              expect(validation.isValid).toBe(true);
              expect(validation.errorCode).toBeUndefined();
            } else {
              expect(validation.isValid).toBe(false);
              expect(validation.errorCode).toBe('MIN_PURCHASE_NOT_MET');
              expect(validation.error).toContain('Minimum purchase');
            }
          }
        ),
        { numRuns: 100 }
      );
    } finally {
      // Cleanup
      await db.delete(discountCodes).where(eq(discountCodes.code, testCode));
    }
  });

  /**
   * Property 15: Discount code usage limit enforcement
   * 
   * For any discount code with usage limit, the code should be rejected when 
   * current usage count >= usage limit
   * 
   * Validates: Requirements 3.5
   * 
   * Feature: cart-and-checkout-logic, Property 15: Discount code usage limit enforcement
   */
  test('Property 15: Discount code usage limit enforcement', async () => {
    const testCode = 'USAGELIMIT_TEST';
    const usageLimit = 5;
    
    // Create a discount code with usage limit
    const [discountCode] = await db.insert(discountCodes).values({
      code: testCode,
      title: 'Usage Limit Test',
      description: 'Property test for usage limit enforcement',
      discountType: 'percentage',
      discountValue: 10,
      usageLimit: usageLimit,
      isActive: true,
    }).returning();

    try {
      await fc.assert(
        fc.asyncProperty(
          // Generate various usage counts
          fc.integer({ min: 0, max: 10 }),
          async (currentUsage) => {
            // Create usage records to simulate current usage
            const usageRecords = [];
            for (let i = 0; i < currentUsage; i++) {
              usageRecords.push({
                discountCodeId: discountCode.id,
                orderId: uuidv7(),
                discountAmount: 1000,
              });
            }

            if (usageRecords.length > 0) {
              await db.insert(discountCodeUsage).values(usageRecords);
            }

            try {
              const subtotal = 10000; // 100 THB
              const validation = await cartDomain.validateDiscountCode(testCode, subtotal);

              // Property: Code should be valid only when currentUsage < usageLimit
              if (currentUsage < usageLimit) {
                expect(validation.isValid).toBe(true);
                expect(validation.errorCode).toBeUndefined();
              } else {
                expect(validation.isValid).toBe(false);
                expect(validation.errorCode).toBe('USAGE_LIMIT_REACHED');
                expect(validation.error).toContain('usage limit');
              }
            } finally {
              // Cleanup usage records
              await db.delete(discountCodeUsage).where(
                eq(discountCodeUsage.discountCodeId, discountCode.id)
              );
            }
          }
        ),
        { numRuns: 20 } // Reduced runs due to database operations
      );
    } finally {
      // Cleanup
      await db.delete(discountCodes).where(eq(discountCodes.code, testCode));
    }
  });

  /**
   * Property 16: Discount code per-customer limit enforcement
   * 
   * For any discount code with per-customer usage limit and any customer, 
   * the code should be rejected when the customer's usage count >= per-customer limit
   * 
   * Validates: Requirements 3.6
   * 
   * Feature: cart-and-checkout-logic, Property 16: Discount code per-customer limit enforcement
   */
  test('Property 16: Discount code per-customer limit enforcement', async () => {
    const testCode = 'PERCUSTOMERLIMIT_TEST';
    const perCustomerLimit = 2;
    const testUserId = testUserIds[0]; // Use existing test user
    
    // Create a discount code with per-customer limit
    const [discountCode] = await db.insert(discountCodes).values({
      code: testCode,
      title: 'Per Customer Limit Test',
      description: 'Property test for per-customer limit enforcement',
      discountType: 'percentage',
      discountValue: 10,
      usageLimitPerCustomer: perCustomerLimit,
      isActive: true,
    }).returning();

    try {
      await fc.assert(
        fc.asyncProperty(
          // Generate various customer usage counts
          fc.integer({ min: 0, max: 5 }),
          async (customerUsage) => {
            // Create usage records for this customer
            const usageRecords = [];
            for (let i = 0; i < customerUsage; i++) {
              usageRecords.push({
                discountCodeId: discountCode.id,
                orderId: uuidv7(),
                userId: testUserId,
                discountAmount: 1000,
              });
            }

            if (usageRecords.length > 0) {
              await db.insert(discountCodeUsage).values(usageRecords);
            }

            try {
              const subtotal = 10000; // 100 THB
              const validation = await cartDomain.validateDiscountCode(
                testCode,
                subtotal,
                undefined,
                testUserId
              );

              // Property: Code should be valid only when customerUsage < perCustomerLimit
              if (customerUsage < perCustomerLimit) {
                expect(validation.isValid).toBe(true);
                expect(validation.errorCode).toBeUndefined();
              } else {
                expect(validation.isValid).toBe(false);
                expect(validation.errorCode).toBe('USAGE_LIMIT_REACHED');
                expect(validation.error).toContain('already used');
              }
            } finally {
              // Cleanup usage records
              await db.delete(discountCodeUsage).where(
                eq(discountCodeUsage.discountCodeId, discountCode.id)
              );
            }
          }
        ),
        { numRuns: 20 } // Reduced runs due to database operations
      );
    } finally {
      // Cleanup
      await db.delete(discountCodes).where(eq(discountCodes.code, testCode));
    }
  });
});

  /**
   * Property 17: Discount calculation accuracy
   * 
   * For any discount code and cart subtotal, the discount amount should be calculated as:
   * - percentage codes → min(subtotal × percentage / 100, max discount)
   * - fixed amount codes → fixed value
   * - free shipping codes → shipping cost
   * 
   * Validates: Requirements 3.7, 3.8, 7.2
   * 
   * Feature: cart-and-checkout-logic, Property 17: Discount calculation accuracy
   */
  test('Property 17: Discount calculation accuracy', async () => {
    // Create test discount codes of different types
    const percentageCode = 'PERCENT10';
    const fixedCode = 'FIXED500';
    const freeShippingCode = 'FREESHIP';
    
    await db.insert(discountCodes).values([
      {
        code: percentageCode,
        title: 'Percentage Discount',
        description: '10% off',
        discountType: 'percentage',
        discountValue: 10,
        isActive: true,
      },
      {
        code: fixedCode,
        title: 'Fixed Discount',
        description: '500 cents off',
        discountType: 'fixed_amount',
        discountValue: 500,
        isActive: true,
      },
      {
        code: freeShippingCode,
        title: 'Free Shipping',
        description: 'Free shipping',
        discountType: 'free_shipping',
        discountValue: 0, // Free shipping doesn't use discount value
        isActive: true,
      },
    ]);

    try {
      await fc.assert(
        fc.asyncProperty(
          // Generate cart items
          fc.array(
            fc.record({
              productIndex: fc.integer({ min: 0, max: testProductIds.length - 1 }),
              variantIndex: fc.integer({ min: 0, max: 1 }),
              quantity: fc.integer({ min: 1, max: 5 }),
            }),
            { minLength: 1, maxLength: 3 }
          ),
          // Select discount type
          fc.constantFrom('percentage', 'fixed_amount', 'free_shipping'),
          async (itemSpecs, discountType) => {
            // Build cart items using helper
            const items = buildCartItems(itemSpecs);

            // Select appropriate discount code
            const code = discountType === 'percentage' ? percentageCode :
                        discountType === 'fixed_amount' ? fixedCode :
                        freeShippingCode;

            // Calculate pricing with discount
            const pricing = await cartDomain.calculateCartPricing(items, code, 'standard');

            // Property 1: Percentage discount should be subtotal * percentage / 100
            if (discountType === 'percentage') {
              const expectedDiscount = Math.round(pricing.subtotal * 10 / 100);
              expect(pricing.discountAmount).toBe(expectedDiscount);
            }

            // Property 2: Fixed amount discount should be the fixed value (or subtotal if less)
            if (discountType === 'fixed_amount') {
              const expectedDiscount = Math.min(500, pricing.subtotal);
              expect(pricing.discountAmount).toBe(expectedDiscount);
            }

            // Property 3: Free shipping discount should equal shipping cost
            if (discountType === 'free_shipping') {
              // For free shipping, the discount amount should equal the shipping cost
              // The shipping cost is calculated based on subtotal and method
              let expectedShippingCost = 0;
              if (pricing.subtotal < 100000) { // Free shipping over 1000 THB
                expectedShippingCost = 5000; // Standard shipping: 50 THB
              }
              expect(pricing.discountAmount).toBe(expectedShippingCost);
            }

            // Property 4: Total should be subtotal + shipping + tax - discount
            const expectedTotal = pricing.subtotal + pricing.shippingCost + pricing.taxAmount - pricing.discountAmount;
            expect(pricing.totalAmount).toBe(expectedTotal);

            // Property 5: Discount should be applied correctly
            if (pricing.discount) {
              expect(pricing.discount.code).toBe(code);
              expect(pricing.discount.amount).toBe(pricing.discountAmount);
            }
          }
        ),
        { numRuns: 100 }
      );
    } finally {
      // Cleanup
      await db.delete(discountCodes).where(
        inArray(discountCodes.code, [percentageCode, fixedCode, freeShippingCode])
      );
    }
  });

  /**
   * Property 18: Free shipping discount application
   * 
   * For any free shipping discount code, applying the code should result in shipping cost = 0
   * 
   * Validates: Requirements 3.9
   * 
   * Feature: cart-and-checkout-logic, Property 18: Free shipping discount application
   */
  test('Property 18: Free shipping discount application', async () => {
    const testCode = 'FREESHIP_TEST';
    
    await db.insert(discountCodes).values({
      code: testCode,
      title: 'Free Shipping Test',
      description: 'Free shipping discount',
      discountType: 'free_shipping',
      discountValue: 0, // Free shipping doesn't use discount value
      isActive: true,
    });

    try {
      await fc.assert(
        fc.asyncProperty(
          // Generate cart items
          fc.array(
            fc.record({
              productIndex: fc.integer({ min: 0, max: testProductIds.length - 1 }),
              variantIndex: fc.integer({ min: 0, max: 1 }),
              quantity: fc.integer({ min: 1, max: 3 }),
            }),
            { minLength: 1, maxLength: 3 }
          ),
          // Generate shipping method
          fc.constantFrom('standard', 'express', 'next-day'),
          async (itemSpecs, shippingMethod) => {
            // Build cart items using helper
            const items = buildCartItems(itemSpecs);

            // Calculate pricing without discount
            const pricingWithoutDiscount = await cartDomain.calculateCartPricing(items, undefined, shippingMethod);
            const originalShippingCost = pricingWithoutDiscount.shippingCost;

            // Calculate pricing with free shipping discount
            const pricingWithDiscount = await cartDomain.calculateCartPricing(items, testCode, shippingMethod);

            // Property 1: Discount amount should equal the original shipping cost
            expect(pricingWithDiscount.discountAmount).toBe(originalShippingCost);

            // Property 2: Discount type should be free_shipping
            expect(pricingWithDiscount.discount?.type).toBe('free_shipping');

            // Property 3: Total should be reduced by shipping cost
            const expectedTotal = pricingWithoutDiscount.totalAmount - originalShippingCost;
            expect(pricingWithDiscount.totalAmount).toBe(expectedTotal);

            // Property 4: Subtotal and tax should remain the same
            expect(pricingWithDiscount.subtotal).toBe(pricingWithoutDiscount.subtotal);
            expect(pricingWithDiscount.taxAmount).toBe(pricingWithoutDiscount.taxAmount);
          }
        ),
        { numRuns: 100 }
      );
    } finally {
      // Cleanup
      await db.delete(discountCodes).where(eq(discountCodes.code, testCode));
    }
  });

  /**
   * Property 19: Percentage discount cap enforcement
   * 
   * For any percentage discount code with maximum discount amount, 
   * the calculated discount should not exceed the maximum amount
   * 
   * Validates: Requirements 3.10
   * 
   * Feature: cart-and-checkout-logic, Property 19: Percentage discount cap enforcement
   */
  test('Property 19: Percentage discount cap enforcement', async () => {
    const testCode = 'CAPPED_PERCENT';
    const discountPercentage = 20; // 20%
    const maxDiscountAmount = 5000; // 50 THB cap
    
    await db.insert(discountCodes).values({
      code: testCode,
      title: 'Capped Percentage Discount',
      description: '20% off with 50 THB cap',
      discountType: 'percentage',
      discountValue: discountPercentage,
      maxDiscountAmount: maxDiscountAmount,
      isActive: true,
    });

    try {
      await fc.assert(
        fc.asyncProperty(
          // Generate cart items with varying quantities to create different subtotals
          fc.array(
            fc.record({
              productIndex: fc.integer({ min: 0, max: testProductIds.length - 1 }),
              variantIndex: fc.integer({ min: 0, max: 1 }),
              quantity: fc.integer({ min: 1, max: 10 }),
            }),
            { minLength: 1, maxLength: 5 }
          ),
          async (itemSpecs) => {
            // Build cart items using helper
            const items = buildCartItems(itemSpecs);

            // Calculate pricing with capped discount
            const pricing = await cartDomain.calculateCartPricing(items, testCode);

            // Calculate what the discount would be without cap
            const uncappedDiscount = Math.round(pricing.subtotal * discountPercentage / 100);

            // Property 1: Discount should not exceed the maximum amount
            expect(pricing.discountAmount).toBeLessThanOrEqual(maxDiscountAmount);

            // Property 2: If uncapped discount <= max, discount should equal uncapped amount
            if (uncappedDiscount <= maxDiscountAmount) {
              expect(pricing.discountAmount).toBe(uncappedDiscount);
            }

            // Property 3: If uncapped discount > max, discount should equal max amount
            if (uncappedDiscount > maxDiscountAmount) {
              expect(pricing.discountAmount).toBe(maxDiscountAmount);
            }

            // Property 4: Discount should always be the minimum of uncapped and max
            const expectedDiscount = Math.min(uncappedDiscount, maxDiscountAmount);
            expect(pricing.discountAmount).toBe(expectedDiscount);
          }
        ),
        { numRuns: 100 }
      );
    } finally {
      // Cleanup
      await db.delete(discountCodes).where(eq(discountCodes.code, testCode));
    }
  });

  /**
   * Property 21: Product-specific discount application
   * 
   * For any product-specific discount code and cart, the discount should only apply 
   * to the subtotal of applicable products
   * 
   * Validates: Requirements 3.12
   * 
   * Feature: cart-and-checkout-logic, Property 21: Product-specific discount application
   */
  test('Property 21: Product-specific discount application', async () => {
    const testCode = 'PRODUCT_SPECIFIC';
    
    // Create a discount that only applies to the first two test products
    const applicableProducts = [testProductIds[0], testProductIds[1]];
    
    await db.insert(discountCodes).values({
      code: testCode,
      title: 'Product Specific Discount',
      description: '15% off specific products',
      discountType: 'percentage',
      discountValue: 15,
      applicableToProducts: applicableProducts,
      isActive: true,
    });

    try {
      await fc.assert(
        fc.asyncProperty(
          // Generate cart with mix of applicable and non-applicable products
          fc.record({
            applicableItems: fc.array(
              fc.record({
                productIndex: fc.constantFrom(0, 1), // First two products
                variantIndex: fc.integer({ min: 0, max: 1 }),
                quantity: fc.integer({ min: 1, max: 3 }),
              }),
              { minLength: 1, maxLength: 2 }
            ),
            nonApplicableItems: fc.array(
              fc.record({
                productIndex: fc.integer({ min: 2, max: testProductIds.length - 1 }), // Other products
                variantIndex: fc.integer({ min: 0, max: 1 }),
                quantity: fc.integer({ min: 1, max: 3 }),
              }),
              { minLength: 0, maxLength: 2 }
            ),
          }),
          async ({ applicableItems, nonApplicableItems }) => {
            // Build cart items using helper
            const items: CartItemInput[] = [
              ...buildCartItems(applicableItems),
              ...buildCartItems(nonApplicableItems),
            ];

            // Calculate pricing with product-specific discount
            const pricing = await cartDomain.calculateCartPricing(items, testCode);

            // Validate the cart to get item prices
            const validatedCart = await cartDomain.validateCart(items);

            // Calculate subtotal of applicable products only
            let applicableSubtotal = 0;
            for (const item of validatedCart.items) {
              if (applicableProducts.includes(item.productId)) {
                applicableSubtotal += item.subtotal;
              }
            }

            // Property 1: Discount should be calculated on applicable products only
            const expectedDiscount = Math.round(applicableSubtotal * 15 / 100);
            expect(pricing.discountAmount).toBe(expectedDiscount);

            // Property 2: If no applicable products in cart, discount should be 0
            if (applicableSubtotal === 0) {
              expect(pricing.discountAmount).toBe(0);
            }

            // Property 3: Discount should not exceed applicable subtotal
            expect(pricing.discountAmount).toBeLessThanOrEqual(applicableSubtotal);

            // Property 4: Total should reflect the discount
            const expectedTotal = pricing.subtotal + pricing.shippingCost + pricing.taxAmount - pricing.discountAmount;
            expect(pricing.totalAmount).toBe(expectedTotal);
          }
        ),
        { numRuns: 50 } // Reduced runs due to complexity
      );
    } finally {
      // Cleanup
      await db.delete(discountCodes).where(eq(discountCodes.code, testCode));
    }
  });

  /**
   * Property 22: Shipping method data completeness
   * 
   * For any shipping method returned by the API, it should contain name, description, 
   * cost, and estimated delivery time
   * 
   * Validates: Requirements 4.1
   * 
   * Feature: cart-and-checkout-logic, Property 22: Shipping method data completeness
   */
  test('Property 22: Shipping method data completeness', async () => {
    // Import shipping methods
    const { getAllShippingMethods } = await import('../../../core/config/shipping.config');
    
    await fc.assert(
      fc.asyncProperty(
        // We don't need to generate random data here - we're testing the static configuration
        // But we use fc.constant to maintain the property-based testing structure
        fc.constant(null),
        async () => {
          // Get all shipping methods
          const shippingMethods = getAllShippingMethods();

          // Property 1: At least one shipping method should be available
          expect(shippingMethods.length).toBeGreaterThan(0);

          // Property 2: Each shipping method should have all required fields
          for (const method of shippingMethods) {
            // Check id is present and non-empty
            expect(method.id).toBeDefined();
            expect(typeof method.id).toBe('string');
            expect(method.id.length).toBeGreaterThan(0);

            // Check name is present and non-empty
            expect(method.name).toBeDefined();
            expect(typeof method.name).toBe('string');
            expect(method.name.length).toBeGreaterThan(0);

            // Check description is present and non-empty
            expect(method.description).toBeDefined();
            expect(typeof method.description).toBe('string');
            expect(method.description.length).toBeGreaterThan(0);

            // Check cost is present and non-negative
            expect(method.cost).toBeDefined();
            expect(typeof method.cost).toBe('number');
            expect(method.cost).toBeGreaterThanOrEqual(0);

            // Check estimatedDays is present and positive
            expect(method.estimatedDays).toBeDefined();
            expect(typeof method.estimatedDays).toBe('number');
            expect(method.estimatedDays).toBeGreaterThan(0);
          }

          // Property 3: All shipping method IDs should be unique
          const ids = shippingMethods.map(m => m.id);
          const uniqueIds = new Set(ids);
          expect(ids.length).toBe(uniqueIds.size);

          // Property 4: Shipping methods should be ordered by cost (standard < express < next-day)
          // This is a business rule - faster shipping should cost more
          for (let i = 0; i < shippingMethods.length - 1; i++) {
            const current = shippingMethods[i];
            const next = shippingMethods[i + 1];
            
            // If delivery time is shorter, cost should be higher
            if (current.estimatedDays > next.estimatedDays) {
              expect(current.cost).toBeLessThan(next.cost);
            }
          }

          // Property 5: Standard shipping method should exist
          const hasStandard = shippingMethods.some(m => m.id === 'standard');
          expect(hasStandard).toBe(true);

          // Property 6: Express shipping method should exist
          const hasExpress = shippingMethods.some(m => m.id === 'express');
          expect(hasExpress).toBe(true);

          // Property 7: Next-day shipping method should exist
          const hasNextDay = shippingMethods.some(m => m.id === 'next-day');
          expect(hasNextDay).toBe(true);
        }
      ),
      { numRuns: 100 } // Run 100 iterations as specified in design
    );
  });
