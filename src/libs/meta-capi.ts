/**
 * Meta Conversions API (CAPI) Service
 *
 * ส่ง server-side events ไปยัง Facebook/Meta เพื่อแก้ปัญหา iOS 14+
 * ใช้ร่วมกับ browser pixel โดย deduplication ด้วย event_id
 */

import crypto from "crypto";

interface UserData {
  email?: string;
  phone?: string;
  firstName?: string;
  lastName?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  country?: string;
  clientIpAddress?: string;
  clientUserAgent?: string;
  fbp?: string; // Facebook Browser ID (from _fbp cookie)
  fbc?: string; // Facebook Click ID (from _fbc cookie)
}

interface CustomData {
  content_ids?: string[];
  content_name?: string;
  content_type?: string;
  value?: number;
  currency?: string;
  num_items?: number;
  order_id?: string;
}

interface CAPIEvent {
  event_name: string;
  event_time: number;
  event_id?: string; // For deduplication with browser pixel
  event_source_url?: string;
  user_data: UserData;
  custom_data?: CustomData;
  action_source:
  | "website"
  | "email"
  | "app"
  | "phone_call"
  | "chat"
  | "physical_store"
  | "other";
}

interface CAPIResponse {
  events_received?: number;
  messages?: string[];
  fbtrace_id?: string;
  error?: {
    message: string;
    type: string;
    code: number;
  };
}

export class MetaCAPIService {
  private pixelId: string;
  private accessToken: string;
  private apiVersion = "v18.0"; // Latest stable version

  constructor() {
    this.pixelId = process.env.FB_PIXEL_ID || "";
    this.accessToken = process.env.FB_ACCESS_TOKEN || "";
  }

  /**
   * Check if CAPI is configured properly
   */
  isConfigured(): boolean {
    return !!(this.pixelId && this.accessToken);
  }

  /**
   * Hash a value using SHA256 (Meta requirement)
   */
  private hash(value: string): string {
    return crypto
      .createHash("sha256")
      .update(value.toLowerCase().trim())
      .digest("hex");
  }

  /**
   * Hash all user data according to Meta requirements
   */
  private hashUserData(userData: UserData): Record<string, string | undefined> {
    const hashed: Record<string, string | undefined> = {};

    if (userData.email) hashed.em = this.hash(userData.email);
    if (userData.phone) hashed.ph = this.hash(userData.phone.replace(/\D/g, "")); // Remove non-digits
    if (userData.firstName) hashed.fn = this.hash(userData.firstName);
    if (userData.lastName) hashed.ln = this.hash(userData.lastName);
    if (userData.city) hashed.ct = this.hash(userData.city);
    if (userData.state) hashed.st = this.hash(userData.state);
    if (userData.zipCode) hashed.zp = this.hash(userData.zipCode);
    if (userData.country) hashed.country = this.hash(userData.country);

    // These don't need hashing
    if (userData.clientIpAddress)
      hashed.client_ip_address = userData.clientIpAddress;
    if (userData.clientUserAgent)
      hashed.client_user_agent = userData.clientUserAgent;
    if (userData.fbp) hashed.fbp = userData.fbp;
    if (userData.fbc) hashed.fbc = userData.fbc;

    return hashed;
  }

  /**
   * Send event to Meta CAPI
   */
  async sendEvent(event: CAPIEvent): Promise<CAPIResponse | null> {
    if (!this.isConfigured()) {
      console.warn("[Meta CAPI] Missing FB_PIXEL_ID or FB_ACCESS_TOKEN");
      return null;
    }

    const url = `https://graph.facebook.com/${this.apiVersion}/${this.pixelId}/events`;

    const payload: Record<string, unknown> = {
      data: [
        {
          event_name: event.event_name,
          event_time: event.event_time,
          event_id: event.event_id,
          event_source_url: event.event_source_url,
          action_source: event.action_source,
          user_data: this.hashUserData(event.user_data),
          custom_data: event.custom_data,
        },
      ],
      access_token: this.accessToken,
    };

    // Add test event code for development/testing
    if (
      process.env.NODE_ENV !== "production" &&
      process.env.FB_TEST_EVENT_CODE
    ) {
      payload.test_event_code = process.env.FB_TEST_EVENT_CODE;
    }

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const result = (await response.json()) as CAPIResponse;

      if (!response.ok || result.error) {
        console.error("[Meta CAPI] Error:", result.error || result);
        return result;
      }

      console.log(
        `[Meta CAPI] ${event.event_name} sent successfully:`,
        result.events_received,
        "events received"
      );
      return result;
    } catch (error) {
      console.error("[Meta CAPI] Request failed:", error);
      return null;
    }
  }

  /**
   * Track Purchase event - ส่งเมื่อลูกค้าสั่งซื้อสำเร็จ
   */
  async trackPurchase(params: {
    orderId: string;
    orderNumber: string;
    email: string;
    phone?: string;
    firstName?: string;
    lastName?: string;
    city?: string;
    zipCode?: string;
    country?: string;
    totalAmount: number; // in cents
    items: Array<{ productId: string; quantity: number }>;
    eventSourceUrl?: string;
    clientIpAddress?: string;
    clientUserAgent?: string;
    fbp?: string;
    fbc?: string;
  }): Promise<CAPIResponse | null> {
    return this.sendEvent({
      event_name: "Purchase",
      event_time: Math.floor(Date.now() / 1000),
      event_id: `purchase-${params.orderId}`, // Must match browser eventId for deduplication
      event_source_url: params.eventSourceUrl,
      action_source: "website",
      user_data: {
        email: params.email,
        phone: params.phone,
        firstName: params.firstName,
        lastName: params.lastName,
        city: params.city,
        zipCode: params.zipCode,
        country: params.country || "TH",
        clientIpAddress: params.clientIpAddress,
        clientUserAgent: params.clientUserAgent,
        fbp: params.fbp,
        fbc: params.fbc,
      },
      custom_data: {
        content_ids: params.items.map((i) => i.productId),
        content_type: "product",
        value: params.totalAmount / 100, // Convert cents to THB
        currency: "THB",
        num_items: params.items.reduce((sum, i) => sum + i.quantity, 0),
        order_id: params.orderNumber,
      },
    });
  }
}

// Singleton instance
export const metaCAPI = new MetaCAPIService();
