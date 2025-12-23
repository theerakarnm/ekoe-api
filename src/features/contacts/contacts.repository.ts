import { eq, desc, sql, ilike, or } from 'drizzle-orm';
import { db } from '../../core/database';
import { contacts } from '../../core/database/schema/contact.schema';
import {
  CreateContactDto,
  UpdateContactStatusDto,
  ContactListParams,
  ContactResponse,
} from './contacts.interface';
import { AppError } from '../../core/errors';

export class ContactsRepository {
  /**
   * Create a new contact submission
   */
  async create(data: CreateContactDto): Promise<ContactResponse> {
    try {
      const result = await db
        .insert(contacts)
        .values(data)
        .returning();
      return result[0] as ContactResponse;
    } catch (error) {
      throw new AppError('Failed to create contact submission', 500, 'DB_ERROR', { data, error });
    }
  }

  /**
   * Get all contacts with pagination and filters
   */
  async findAll(params: ContactListParams) {
    try {
      const { page = 1, limit = 20, status, search } = params;
      const offset = (page - 1) * limit;

      // Build where conditions
      const conditions = [];

      if (status) {
        conditions.push(eq(contacts.status, status));
      }

      if (search) {
        conditions.push(
          or(
            ilike(contacts.name, `%${search}%`),
            ilike(contacts.email, `%${search}%`),
            ilike(contacts.topic, `%${search}%`)
          )
        );
      }

      // Get total count
      const countQuery = db
        .select({ count: sql<number>`count(*)` })
        .from(contacts);

      if (conditions.length > 0) {
        // @ts-ignore
        countQuery.where(conditions.length === 1 ? conditions[0] : or(...conditions));
      }

      const countResult = await countQuery;
      const total = Number(countResult[0]?.count || 0);

      // Get contacts
      const dataQuery = db
        .select()
        .from(contacts)
        .orderBy(desc(contacts.createdAt))
        .limit(limit)
        .offset(offset);

      if (conditions.length > 0) {
        // @ts-ignore
        dataQuery.where(conditions.length === 1 ? conditions[0] : or(...conditions));
      }

      const data = await dataQuery;

      return {
        contacts: data as ContactResponse[],
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      };
    } catch (error) {
      throw new AppError('Failed to fetch contacts', 500, 'DB_ERROR', { params, error });
    }
  }

  /**
   * Get a single contact by ID
   */
  async findById(id: string): Promise<ContactResponse | null> {
    try {
      const result = await db
        .select()
        .from(contacts)
        .where(eq(contacts.id, id));
      return (result[0] as ContactResponse) || null;
    } catch (error) {
      throw new AppError('Failed to fetch contact', 500, 'DB_ERROR', { id, error });
    }
  }

  /**
   * Update contact status
   */
  async updateStatus(id: string, data: UpdateContactStatusDto): Promise<ContactResponse> {
    try {
      const updateData: any = {
        status: data.status,
        updatedAt: new Date(),
      };

      // Set readAt timestamp when marking as read
      if (data.status === 'read' || data.status === 'responded') {
        updateData.readAt = new Date();
      }

      const result = await db
        .update(contacts)
        .set(updateData)
        .where(eq(contacts.id, id))
        .returning();

      if (!result[0]) {
        throw new AppError('Contact not found', 404, 'NOT_FOUND', { id });
      }

      return result[0] as ContactResponse;
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError('Failed to update contact status', 500, 'DB_ERROR', { id, data, error });
    }
  }

  /**
   * Get count of unread contacts
   */
  async getUnreadCount(): Promise<number> {
    try {
      const result = await db
        .select({ count: sql<number>`count(*)` })
        .from(contacts)
        .where(eq(contacts.status, 'unread'));
      return Number(result[0]?.count || 0);
    } catch (error) {
      throw new AppError('Failed to get unread count', 500, 'DB_ERROR', { error });
    }
  }

  /**
   * Delete a contact
   */
  async delete(id: string): Promise<void> {
    try {
      const result = await db
        .delete(contacts)
        .where(eq(contacts.id, id))
        .returning();

      if (!result[0]) {
        throw new AppError('Contact not found', 404, 'NOT_FOUND', { id });
      }
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError('Failed to delete contact', 500, 'DB_ERROR', { id, error });
    }
  }
}

export const contactsRepository = new ContactsRepository();
