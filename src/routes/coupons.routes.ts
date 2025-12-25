import { Hono } from 'hono';
import { couponsDomain } from '../features/coupons/coupons.domain';

const couponsRoutes = new Hono();

/**
 * Get the featured coupon for welcome popup
 * GET /coupons/featured
 */
couponsRoutes.get('/featured', async (c) => {
  const coupon = await couponsDomain.getFeaturedCoupon();

  if (!coupon) {
    return c.json({ success: true, data: null });
  }

  // Return only public-safe fields
  return c.json({
    success: true,
    data: {
      code: coupon.code,
      title: coupon.title,
      description: coupon.description,
      discountType: coupon.discountType,
      discountValue: coupon.discountValue,
      minPurchaseAmount: coupon.minPurchaseAmount,
    }
  });
});

/**
 * Get coupons linked to a specific product
 * GET /coupons/by-product/:productId
 */
couponsRoutes.get('/by-product/:productId', async (c) => {
  const productId = c.req.param('productId');
  const coupons = await couponsDomain.getCouponsByProductId(productId);

  // Return only public-safe fields
  const publicCoupons = coupons.map(coupon => ({
    code: coupon.code,
    title: coupon.title,
    description: coupon.description,
    discountType: coupon.discountType,
    discountValue: coupon.discountValue,
    minPurchaseAmount: coupon.minPurchaseAmount,
  }));

  return c.json({ success: true, data: publicCoupons });
});

export default couponsRoutes;
