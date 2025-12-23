import { contactsRepository } from './contacts.repository';
import {
  CreateContactDto,
  UpdateContactStatusDto,
  ContactListParams,
} from './contacts.interface';
import { NotFoundError } from '../../core/errors';

export class ContactsDomain {
  /**
   * Submit a new contact form
   */
  async submitContact(data: CreateContactDto) {
    return contactsRepository.create(data);
  }

  /**
   * Get all contacts with pagination and filters
   */
  async getContacts(params: ContactListParams) {
    return contactsRepository.findAll(params);
  }

  /**
   * Get a single contact by ID
   */
  async getContactById(id: string) {
    const contact = await contactsRepository.findById(id);
    if (!contact) {
      throw new NotFoundError('Contact');
    }
    return contact;
  }

  /**
   * Update contact status (mark as read/responded)
   */
  async updateContactStatus(id: string, data: UpdateContactStatusDto) {
    // First check if contact exists
    await this.getContactById(id);
    return contactsRepository.updateStatus(id, data);
  }

  /**
   * Get count of unread contacts for notification badge
   */
  async getUnreadCount() {
    return contactsRepository.getUnreadCount();
  }

  /**
   * Delete a contact
   */
  async deleteContact(id: string) {
    // First check if contact exists
    await this.getContactById(id);
    return contactsRepository.delete(id);
  }
}

export const contactsDomain = new ContactsDomain();
