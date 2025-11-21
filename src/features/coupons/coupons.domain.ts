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

  async getCouponById(id: number) {
    return await couponsRepository.findById(id);
  }

  async createCoupon(data: CreateCouponInput) {
    return await couponsRepository.create(data);
  }

  async updateCoupon(id: number, data: UpdateCouponInput) {
    return await couponsRepository.update(id, data);
  }

  async deactivateCoupon(id: number) {
    return await couponsRepository.deactivate(id);
  }

  async getCouponUsageStats(id: number) {
    return await couponsRepository.getUsageStats(id);
  }
}

export const couponsDomain = new CouponsDomain();
