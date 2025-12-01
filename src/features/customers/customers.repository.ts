import { eq, and, isNull } from 'drizzle-orm';
import { db } from '../../core/database';
import { customerProfiles, customerAddresses } from '../../core/database/schema/customers.schema';
import {
  CreateCustomerProfileDto,
  UpdateCustomerProfileDto,
  CreateCustomerAddressDto,
  UpdateCustomerAddressDto,
} from './customers.interface';
import { AppError } from '../../core/errors';

export class CustomersRepository {
  // Customer Profile Operations
  async findProfileByUserId(userId: string) {
    try {
      const result = await db
        .select()
        .from(customerProfiles)
        .where(eq(customerProfiles.userId, userId));
      return result[0] || null;
    } catch (error) {
      throw new AppError('Failed to fetch customer profile', 500, 'DB_ERROR', { userId, error });
    }
  }

  async createProfile(data: CreateCustomerProfileDto) {
    try {
      const result = await db
        .insert(customerProfiles)
        .values(data)
        .returning();
      return result[0];
    } catch (error) {
      throw new AppError('Failed to create customer profile', 500, 'DB_ERROR', { data, error });
    }
  }

  async updateProfile(userId: string, data: UpdateCustomerProfileDto) {
    try {
      const result = await db
        .update(customerProfiles)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(customerProfiles.userId, userId))
        .returning();

      if (!result[0]) {
        throw new AppError('Customer profile not found', 404, 'NOT_FOUND', { userId });
      }

      return result[0];
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError('Failed to update customer profile', 500, 'DB_ERROR', { userId, data, error });
    }
  }

  async deleteProfile(userId: string) {
    try {
      const result = await db
        .delete(customerProfiles)
        .where(eq(customerProfiles.userId, userId))
        .returning();

      if (!result[0]) {
        throw new AppError('Customer profile not found', 404, 'NOT_FOUND', { userId });
      }

      return result[0];
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError('Failed to delete customer profile', 500, 'DB_ERROR', { userId, error });
    }
  }

  // Customer Address Operations
  async findAddressesByUserId(userId: string) {
    try {
      return await db
        .select()
        .from(customerAddresses)
        .where(and(
          eq(customerAddresses.userId, userId),
          eq(customerAddresses.isActive, true)
        ))
        .orderBy(customerAddresses.isDefault);
    } catch (error) {
      throw new AppError('Failed to fetch customer addresses', 500, 'DB_ERROR', { userId, error });
    }
  }

  async findAddressById(id: string, userId: string) {
    try {
      const result = await db
        .select()
        .from(customerAddresses)
        .where(and(
          eq(customerAddresses.id, id),
          eq(customerAddresses.userId, userId),
          eq(customerAddresses.isActive, true)
        ));
      return result[0] || null;
    } catch (error) {
      throw new AppError('Failed to fetch customer address', 500, 'DB_ERROR', { id, userId, error });
    }
  }

  async createAddress(data: CreateCustomerAddressDto & { userId: string }) {
    try {
      // If this is set as default, unset other defaults first
      if (data.isDefault) {
        await db
          .update(customerAddresses)
          .set({ isDefault: false })
          .where(eq(customerAddresses.userId, data.userId));
      }

      const result = await db
        .insert(customerAddresses)
        .values(data)
        .returning();
      return result[0];
    } catch (error) {
      throw new AppError('Failed to create customer address', 500, 'DB_ERROR', { data, error });
    }
  }

  async updateAddress(id: string, userId: string, data: UpdateCustomerAddressDto) {
    try {
      // If this is set as default, unset other defaults first
      if (data.isDefault) {
        await db
          .update(customerAddresses)
          .set({ isDefault: false })
          .where(eq(customerAddresses.userId, userId));
      }

      const result = await db
        .update(customerAddresses)
        .set({ ...data, updatedAt: new Date() })
        .where(and(
          eq(customerAddresses.id, id),
          eq(customerAddresses.userId, userId)
        ))
        .returning();

      if (!result[0]) {
        throw new AppError('Customer address not found', 404, 'NOT_FOUND', { id, userId });
      }

      return result[0];
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError('Failed to update customer address', 500, 'DB_ERROR', { id, userId, data, error });
    }
  }

  async deleteAddress(id: string, userId: string) {
    try {
      // Soft delete by setting isActive to false
      const result = await db
        .update(customerAddresses)
        .set({ isActive: false, updatedAt: new Date() })
        .where(and(
          eq(customerAddresses.id, id),
          eq(customerAddresses.userId, userId)
        ))
        .returning();

      if (!result[0]) {
        throw new AppError('Customer address not found', 404, 'NOT_FOUND', { id, userId });
      }

      return result[0];
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError('Failed to delete customer address', 500, 'DB_ERROR', { id, userId, error });
    }
  }

  async getDefaultAddress(userId: string) {
    try {
      const result = await db
        .select()
        .from(customerAddresses)
        .where(and(
          eq(customerAddresses.userId, userId),
          eq(customerAddresses.isDefault, true),
          eq(customerAddresses.isActive, true)
        ));
      return result[0] || null;
    } catch (error) {
      throw new AppError('Failed to fetch default address', 500, 'DB_ERROR', { userId, error });
    }
  }

  // Order Operations
  async findOrdersByUserId(userId: string, params: { page: number; limit: number }) {
    try {
      const { orders } = await import('../../core/database/schema/orders.schema');
      const { desc, sql } = await import('drizzle-orm');

      const { page, limit } = params;
      const offset = (page - 1) * limit;

      // Get total count
      const countResult = await db
        .select({ count: sql<number>`count(*)` })
        .from(orders)
        .where(eq(orders.userId, userId));

      const total = Number(countResult[0]?.count || 0);

      // Get orders
      const result = await db
        .select()
        .from(orders)
        .where(eq(orders.userId, userId))
        .orderBy(desc(orders.createdAt))
        .limit(limit)
        .offset(offset);

      return { orders: result, total, page, limit };
    } catch (error) {
      throw new AppError('Failed to fetch customer orders', 500, 'DB_ERROR', { userId, error });
    }
  }
}

export const customersRepository = new CustomersRepository();
