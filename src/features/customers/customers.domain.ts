import { customersRepository } from './customers.repository';
import { wishlistsRepository } from './wishlists.repository';
import {
  CreateCustomerProfileDto,
  UpdateCustomerProfileDto,
  LinkGoogleAccountDto,
  CustomerProfileResponse,
} from './customers.interface';
import { ConflictError, NotFoundError } from '../../core/errors';

export class CustomersDomain {
  /**
   * Create a new customer profile
   * Used when a user registers via email/password or OAuth
   */
  async createCustomerProfile(data: CreateCustomerProfileDto) {
    // Check if profile already exists
    const existingProfile = await customersRepository.findProfileByUserId(data.userId);
    if (existingProfile) {
      throw new ConflictError('Customer profile already exists', { userId: data.userId });
    }

    return customersRepository.createProfile(data);
  }

  /**
   * Get customer profile by user ID
   * Returns the profile or null if not found
   */
  async getCustomerProfile(userId: string): Promise<CustomerProfileResponse> {
    const profile = await customersRepository.findProfileByUserId(userId);
    if (!profile) {
      throw new NotFoundError('Customer profile');
    }

    const addresses = await customersRepository.findAddressesByUserId(userId);

    return {
      profile,
      addresses,
    };
  }

  /**
   * Update customer profile
   * Only updates provided fields
   */
  async updateCustomerProfile(userId: string, data: UpdateCustomerProfileDto) {
    // Ensure profile exists
    const existingProfile = await customersRepository.findProfileByUserId(userId);
    if (!existingProfile) {
      throw new NotFoundError('Customer profile');
    }

    return customersRepository.updateProfile(userId, data);
  }

  /**
   * Link Google account to customer profile
   * Creates profile if it doesn't exist, using Google data
   */
  async linkGoogleAccount(userId: string, googleData: LinkGoogleAccountDto) {
    // Check if profile exists
    let profile = await customersRepository.findProfileByUserId(userId);

    if (!profile) {
      // Create new profile with Google data
      const nameParts = googleData.name?.split(' ') || [];
      const firstName = nameParts[0] || '';
      const lastName = nameParts.slice(1).join(' ') || '';

      profile = await customersRepository.createProfile({
        userId,
        firstName: firstName || undefined,
        lastName: lastName || undefined,
        newsletterSubscribed: false,
        smsSubscribed: false,
        language: 'th',
      });
    }

    return profile;
  }

  /**
   * Get customer profile or create if doesn't exist
   * Useful for ensuring profile exists before operations
   */
  async getOrCreateProfile(userId: string, defaultData?: Partial<CreateCustomerProfileDto>) {
    let profile = await customersRepository.findProfileByUserId(userId);

    if (!profile) {
      profile = await customersRepository.createProfile({
        userId,
        ...defaultData,
        newsletterSubscribed: defaultData?.newsletterSubscribed ?? false,
        smsSubscribed: defaultData?.smsSubscribed ?? false,
        language: defaultData?.language ?? 'th',
      });
    }

    return profile;
  }

  /**
   * Add product to wishlist
   */
  async addToWishlist(userId: string, productId: string) {
    return wishlistsRepository.addToWishlist(userId, productId);
  }

  /**
   * Remove product from wishlist
   */
  async removeFromWishlist(userId: string, productId: string) {
    return wishlistsRepository.removeFromWishlist(userId, productId);
  }

  /**
   * Get user's wishlist
   */
  async getWishlist(userId: string) {
    return wishlistsRepository.getWishlist(userId);
  }

  /**
   * Clear user's wishlist
   */
  async clearWishlist(userId: string) {
    return wishlistsRepository.clearWishlist(userId);
  }
}

export const customersDomain = new CustomersDomain();
