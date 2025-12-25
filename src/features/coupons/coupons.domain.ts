import { couponsRepository } from './coupons.repository';
import type { CreateCouponInput, UpdateCouponInput } from './coupons.interface';

export class CouponsDomain {
  async getAllCoupons(params: {
    page: number;
    limit: number;
    search?: string;
    status?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }) {
    return await couponsRepository.findAll(params);
  }

  async getCouponById(id: string) {
    return await couponsRepository.findById(id);
  }

  async createCoupon(data: CreateCouponInput) {
    return await couponsRepository.create(data);
  }

  async updateCoupon(id: string, data: UpdateCouponInput) {
    return await couponsRepository.update(id, data);
  }

  async deactivateCoupon(id: string) {
    return await couponsRepository.deactivate(id);
  }

  async getCouponUsageStats(id: string) {
    return await couponsRepository.getUsageStats(id);
  }

  /**
   * Get the featured coupon for welcome popup
   */
  async getFeaturedCoupon() {
    return await couponsRepository.findFeatured();
  }

  /**
   * Get coupons linked to a specific product
   */
  async getCouponsByProductId(productId: string) {
    return await couponsRepository.findByProductId(productId);
  }
}

export const couponsDomain = new CouponsDomain();
