import { eq, and } from 'drizzle-orm';
import { db } from '../../core/database';
import { wishlists } from '../../core/database/schema/customers.schema';
import { products, productVariants } from '../../core/database/schema/products.schema';
import { AppError } from '../../core/errors';

export class WishlistsRepository {
  async addToWishlist(userId: string, productId: string) {
    try {
      // Check if already in wishlist
      const existing = await db
        .select()
        .from(wishlists)
        .where(and(
          eq(wishlists.userId, userId),
          eq(wishlists.productId, productId)
        ));

      if (existing.length > 0) {
        return existing[0];
      }

      const result = await db
        .insert(wishlists)
        .values({
          userId,
          productId,
        })
        .returning();

      return result[0];
    } catch (error) {
      throw new AppError('Failed to add to wishlist', 500, 'DB_ERROR', { userId, productId, error });
    }
  }

  async removeFromWishlist(userId: string, productId: string) {
    try {
      await db
        .delete(wishlists)
        .where(and(
          eq(wishlists.userId, userId),
          eq(wishlists.productId, productId)
        ));
      return true;
    } catch (error) {
      throw new AppError('Failed to remove from wishlist', 500, 'DB_ERROR', { userId, productId, error });
    }
  }

  async getWishlist(userId: string) {
    try {
      const items = await db
        .select({
          id: wishlists.id,
          addedAt: wishlists.createdAt,
          product: products
        })
        .from(wishlists)
        .innerJoin(products, eq(wishlists.productId, products.id))
        .where(eq(wishlists.userId, userId))
        .orderBy(wishlists.createdAt);

      return items;
    } catch (error) {
      throw new AppError('Failed to fetch wishlist', 500, 'DB_ERROR', { userId, error });
    }
  }

  async clearWishlist(userId: string) {
    try {
      await db
        .delete(wishlists)
        .where(eq(wishlists.userId, userId));
      return true;
    } catch (error) {
      throw new AppError('Failed to clear wishlist', 500, 'DB_ERROR', { userId, error });
    }
  }
}

export const wishlistsRepository = new WishlistsRepository();
