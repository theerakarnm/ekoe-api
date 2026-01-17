import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { config } from '../config';
import { logger } from '../logger';
import { readFileSync } from 'fs';
import { join } from 'path';

class EmailService {
  private transporter: Transporter | null = null;
  private isConfigured: boolean = false;

  constructor() {
    this.initialize();
  }

  private initialize() {
    // Check if SMTP is configured
    if (!config.email.smtp.host || !config.email.smtp.user || !config.email.smtp.password) {
      logger.warn('SMTP not configured. Email sending will be disabled.');
      this.isConfigured = false;
      return;
    }

    try {
      this.transporter = nodemailer.createTransport({
        host: config.email.smtp.host,
        port: config.email.smtp.port,
        secure: config.email.smtp.port === 465, // true for 465, false for other ports
        auth: {
          user: config.email.smtp.user,
          pass: config.email.smtp.password,
        },
      });

      this.isConfigured = true;
      logger.info('Email service initialized successfully');
    } catch (error) {
      logger.error({ error }, 'Failed to initialize email service');
      this.isConfigured = false;
    }
  }

  async sendEmail(to: string, subject: string, html: string, cc?: string | string[]): Promise<boolean> {
    if (!this.isConfigured || !this.transporter) {
      logger.warn({ to, subject }, 'Email not sent - SMTP not configured');
      return false;
    }

    try {
      const mailOptions: any = {
        from: config.email.from,
        to,
        subject,
        html,
      };

      // Add CC if provided
      if (cc) {
        mailOptions.cc = cc;
      }

      const info = await this.transporter.sendMail(mailOptions);

      logger.info({ messageId: info.messageId, to, cc, subject }, 'Email sent successfully');
      return true;
    } catch (error) {
      logger.error({ error, to, cc, subject }, 'Failed to send email');
      return false;
    }
  }

  /**
   * Get the admin CC email from configuration
   */
  getAdminCcEmail(): string {
    return config.email.adminCc;
  }

  async sendVerificationEmail(email: string, name: string, verificationUrl: string): Promise<boolean> {
    const subject = 'Verify your email address';
    const html = this.getVerificationEmailTemplate(name, verificationUrl);
    return this.sendEmail(email, subject, html);
  }

  async sendPasswordResetEmail(email: string, name: string, resetUrl: string): Promise<boolean> {
    const subject = 'Reset your password';
    const html = this.getPasswordResetEmailTemplate(name, resetUrl);
    return this.sendEmail(email, subject, html);
  }

  private getVerificationEmailTemplate(name: string, verificationUrl: string): string {
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Verify Your Email</title>
        </head>
        <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f4f4f4;">
          <table role="presentation" style="width: 100%; border-collapse: collapse;">
            <tr>
              <td align="center" style="padding: 40px 0;">
                <table role="presentation" style="width: 600px; border-collapse: collapse; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                  <!-- Header -->
                  <tr>
                    <td style="padding: 40px 40px 20px 40px; text-align: center;">
                      <h1 style="margin: 0; color: #333333; font-size: 24px; font-weight: bold;">Verify Your Email Address</h1>
                    </td>
                  </tr>
                  
                  <!-- Content -->
                  <tr>
                    <td style="padding: 20px 40px;">
                      <p style="margin: 0 0 20px 0; color: #666666; font-size: 16px; line-height: 1.5;">
                        Hi ${name},
                      </p>
                      <p style="margin: 0 0 20px 0; color: #666666; font-size: 16px; line-height: 1.5;">
                        Thank you for registering! Please verify your email address by clicking the button below:
                      </p>
                      
                      <!-- Button -->
                      <table role="presentation" style="margin: 30px 0;">
                        <tr>
                          <td align="center">
                            <a href="${verificationUrl}" style="display: inline-block; padding: 14px 40px; background-color: #007bff; color: #ffffff; text-decoration: none; border-radius: 4px; font-size: 16px; font-weight: bold;">Verify Email</a>
                          </td>
                        </tr>
                      </table>
                      
                      <p style="margin: 20px 0 0 0; color: #666666; font-size: 14px; line-height: 1.5;">
                        If the button doesn't work, copy and paste this link into your browser:
                      </p>
                      <p style="margin: 10px 0 0 0; color: #007bff; font-size: 14px; word-break: break-all;">
                        ${verificationUrl}
                      </p>
                    </td>
                  </tr>
                  
                  <!-- Footer -->
                  <tr>
                    <td style="padding: 30px 40px; border-top: 1px solid #eeeeee;">
                      <p style="margin: 0; color: #999999; font-size: 12px; line-height: 1.5;">
                        If you didn't create an account, you can safely ignore this email.
                      </p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </body>
      </html>
    `;
  }

  private getPasswordResetEmailTemplate(name: string, resetUrl: string): string {
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Reset Your Password</title>
        </head>
        <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f4f4f4;">
          <table role="presentation" style="width: 100%; border-collapse: collapse;">
            <tr>
              <td align="center" style="padding: 40px 0;">
                <table role="presentation" style="width: 600px; border-collapse: collapse; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                  <!-- Header -->
                  <tr>
                    <td style="padding: 40px 40px 20px 40px; text-align: center;">
                      <h1 style="margin: 0; color: #333333; font-size: 24px; font-weight: bold;">Reset Your Password</h1>
                    </td>
                  </tr>
                  
                  <!-- Content -->
                  <tr>
                    <td style="padding: 20px 40px;">
                      <p style="margin: 0 0 20px 0; color: #666666; font-size: 16px; line-height: 1.5;">
                        Hi ${name},
                      </p>
                      <p style="margin: 0 0 20px 0; color: #666666; font-size: 16px; line-height: 1.5;">
                        We received a request to reset your password. Click the button below to create a new password:
                      </p>
                      
                      <!-- Button -->
                      <table role="presentation" style="margin: 30px 0;">
                        <tr>
                          <td align="center">
                            <a href="${resetUrl}" style="display: inline-block; padding: 14px 40px; background-color: #dc3545; color: #ffffff; text-decoration: none; border-radius: 4px; font-size: 16px; font-weight: bold;">Reset Password</a>
                          </td>
                        </tr>
                      </table>
                      
                      <p style="margin: 20px 0 0 0; color: #666666; font-size: 14px; line-height: 1.5;">
                        If the button doesn't work, copy and paste this link into your browser:
                      </p>
                      <p style="margin: 10px 0 0 0; color: #007bff; font-size: 14px; word-break: break-all;">
                        ${resetUrl}
                      </p>
                      
                      <p style="margin: 30px 0 0 0; color: #666666; font-size: 14px; line-height: 1.5;">
                        This link will expire in 1 hour for security reasons.
                      </p>
                    </td>
                  </tr>
                  
                  <!-- Footer -->
                  <tr>
                    <td style="padding: 30px 40px; border-top: 1px solid #eeeeee;">
                      <p style="margin: 0; color: #999999; font-size: 12px; line-height: 1.5;">
                        If you didn't request a password reset, you can safely ignore this email. Your password will not be changed.
                      </p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </body>
      </html>
    `;
  }

  isEnabled(): boolean {
    return this.isConfigured;
  }

  /**
   * Send order processing email
   */
  async sendOrderProcessingEmail(
    email: string,
    orderNumber: string,
    orderDate: string,
    orderDetailsUrl: string,
    cc?: string
  ): Promise<boolean> {
    try {
      const subject = `Order Processing - ${orderNumber}`;
      const html = this.getOrderProcessingTemplate(orderNumber, orderDate, orderDetailsUrl);
      return await this.sendEmail(email, subject, html, cc);
    } catch (error) {
      logger.error({ error, email, orderNumber }, 'Failed to send order processing email');
      return false;
    }
  }

  /**
   * Send order shipped email
   */
  async sendOrderShippedEmail(
    email: string,
    orderNumber: string,
    trackingNumber: string,
    carrier: string,
    estimatedDelivery: string,
    trackingUrl: string,
    orderDetailsUrl: string,
    cc?: string
  ): Promise<boolean> {
    try {
      const subject = `Order Shipped - ${orderNumber}`;
      const html = this.getOrderShippedTemplate(
        orderNumber,
        trackingNumber,
        carrier,
        estimatedDelivery,
        trackingUrl,
        orderDetailsUrl
      );
      return await this.sendEmail(email, subject, html, cc);
    } catch (error) {
      logger.error({ error, email, orderNumber }, 'Failed to send order shipped email');
      return false;
    }
  }

  /**
   * Send order delivered email
   */
  async sendOrderDeliveredEmail(
    email: string,
    orderNumber: string,
    deliveryDate: string,
    deliveryAddress: string,
    orderDetailsUrl: string
  ): Promise<boolean> {
    try {
      const subject = `Order Delivered - ${orderNumber}`;
      const html = this.getOrderDeliveredTemplate(
        orderNumber,
        deliveryDate,
        deliveryAddress,
        orderDetailsUrl
      );
      return await this.sendEmail(email, subject, html);
    } catch (error) {
      logger.error({ error, email, orderNumber }, 'Failed to send order delivered email');
      return false;
    }
  }

  /**
   * Send order cancelled email
   */
  async sendOrderCancelledEmail(
    email: string,
    orderNumber: string,
    cancellationReason: string,
    orderDetailsUrl: string
  ): Promise<boolean> {
    try {
      const subject = `Order Cancelled - ${orderNumber}`;
      const html = this.getOrderCancelledTemplate(orderNumber, cancellationReason, orderDetailsUrl);
      return await this.sendEmail(email, subject, html);
    } catch (error) {
      logger.error({ error, email, orderNumber }, 'Failed to send order cancelled email');
      return false;
    }
  }

  /**
   * Send order refunded email
   */
  async sendOrderRefundedEmail(
    email: string,
    orderNumber: string,
    refundAmount: number,
    currency: string,
    refundReason: string,
    orderDetailsUrl: string
  ): Promise<boolean> {
    try {
      const subject = `Order Refunded - ${orderNumber}`;
      const html = this.getOrderRefundedTemplate(
        orderNumber,
        refundAmount,
        currency,
        refundReason,
        orderDetailsUrl
      );
      return await this.sendEmail(email, subject, html);
    } catch (error) {
      logger.error({ error, email, orderNumber }, 'Failed to send order refunded email');
      return false;
    }
  }

  /**
   * Get order processing email template
   */
  private getOrderProcessingTemplate(
    orderNumber: string,
    orderDate: string,
    orderDetailsUrl: string
  ): string {
    try {
      const templatePath = join(__dirname, 'templates', 'order-processing.html');
      let template = readFileSync(templatePath, 'utf-8');

      template = template
        .replace(/\{\{ORDER_NUMBER\}\}/g, orderNumber)
        .replace(/\{\{ORDER_DATE\}\}/g, orderDate)
        .replace(/\{\{ORDER_DETAILS_URL\}\}/g, orderDetailsUrl);

      return template;
    } catch (error) {
      logger.warn({ error }, 'Failed to load order processing template');
      throw error;
    }
  }

  /**
   * Get order shipped email template
   */
  private getOrderShippedTemplate(
    orderNumber: string,
    trackingNumber: string,
    carrier: string,
    estimatedDelivery: string,
    trackingUrl: string,
    orderDetailsUrl: string
  ): string {
    try {
      const templatePath = join(__dirname, 'templates', 'order-shipped.html');
      let template = readFileSync(templatePath, 'utf-8');

      template = template
        .replace(/\{\{ORDER_NUMBER\}\}/g, orderNumber)
        .replace(/\{\{TRACKING_NUMBER\}\}/g, trackingNumber)
        .replace(/\{\{CARRIER\}\}/g, carrier)
        .replace(/\{\{ESTIMATED_DELIVERY\}\}/g, estimatedDelivery)
        .replace(/\{\{TRACKING_URL\}\}/g, trackingUrl)
        .replace(/\{\{ORDER_DETAILS_URL\}\}/g, orderDetailsUrl);

      return template;
    } catch (error) {
      logger.warn({ error }, 'Failed to load order shipped template');
      throw error;
    }
  }

  /**
   * Get order delivered email template
   */
  private getOrderDeliveredTemplate(
    orderNumber: string,
    deliveryDate: string,
    deliveryAddress: string,
    orderDetailsUrl: string
  ): string {
    try {
      const templatePath = join(__dirname, 'templates', 'order-delivered.html');
      let template = readFileSync(templatePath, 'utf-8');

      template = template
        .replace(/\{\{ORDER_NUMBER\}\}/g, orderNumber)
        .replace(/\{\{DELIVERY_DATE\}\}/g, deliveryDate)
        .replace(/\{\{DELIVERY_ADDRESS\}\}/g, deliveryAddress)
        .replace(/\{\{ORDER_DETAILS_URL\}\}/g, orderDetailsUrl);

      return template;
    } catch (error) {
      logger.warn({ error }, 'Failed to load order delivered template');
      throw error;
    }
  }

  /**
   * Get order cancelled email template
   */
  private getOrderCancelledTemplate(
    orderNumber: string,
    cancellationReason: string,
    orderDetailsUrl: string
  ): string {
    try {
      const templatePath = join(__dirname, 'templates', 'order-cancelled.html');
      let template = readFileSync(templatePath, 'utf-8');

      template = template
        .replace(/\{\{ORDER_NUMBER\}\}/g, orderNumber)
        .replace(/\{\{CANCELLATION_REASON\}\}/g, cancellationReason)
        .replace(/\{\{ORDER_DETAILS_URL\}\}/g, orderDetailsUrl);

      return template;
    } catch (error) {
      logger.warn({ error }, 'Failed to load order cancelled template');
      throw error;
    }
  }

  /**
   * Get order refunded email template
   */
  private getOrderRefundedTemplate(
    orderNumber: string,
    refundAmount: number,
    currency: string,
    refundReason: string,
    orderDetailsUrl: string
  ): string {
    try {
      const templatePath = join(__dirname, 'templates', 'order-refunded.html');
      let template = readFileSync(templatePath, 'utf-8');

      const formattedAmount = (refundAmount / 100).toFixed(2);

      template = template
        .replace(/\{\{ORDER_NUMBER\}\}/g, orderNumber)
        .replace(/\{\{REFUND_AMOUNT\}\}/g, formattedAmount)
        .replace(/\{\{CURRENCY\}\}/g, currency)
        .replace(/\{\{REFUND_REASON\}\}/g, refundReason)
        .replace(/\{\{ORDER_DETAILS_URL\}\}/g, orderDetailsUrl);

      return template;
    } catch (error) {
      logger.warn({ error }, 'Failed to load order refunded template');
      throw error;
    }
  }

  /**
   * Send payment confirmation email
   */
  async sendPaymentConfirmationEmail(
    email: string,
    orderNumber: string,
    paymentAmount: number,
    currency: string,
    paymentMethod: string,
    transactionId: string | null
  ): Promise<boolean> {
    try {
      const subject = `Payment Confirmation - Order ${orderNumber}`;
      const html = this.getPaymentConfirmationTemplate(
        orderNumber,
        paymentAmount,
        currency,
        paymentMethod,
        transactionId
      );
      return await this.sendEmail(email, subject, html);
    } catch (error) {
      logger.error({ error, email, orderNumber }, 'Failed to send payment confirmation email');
      return false;
    }
  }

  /**
   * Send payment failed email
   */
  async sendPaymentFailedEmail(
    email: string,
    orderNumber: string,
    paymentAmount: number,
    currency: string,
    paymentMethod: string,
    failureReason: string
  ): Promise<boolean> {
    try {
      const subject = `Payment Failed - Order ${orderNumber}`;
      const html = this.getPaymentFailedTemplate(
        orderNumber,
        paymentAmount,
        currency,
        paymentMethod,
        failureReason
      );
      return await this.sendEmail(email, subject, html);
    } catch (error) {
      logger.error({ error, email, orderNumber }, 'Failed to send payment failed email');
      return false;
    }
  }

  /**
   * Get payment confirmation email template
   */
  private getPaymentConfirmationTemplate(
    orderNumber: string,
    paymentAmount: number,
    currency: string,
    paymentMethod: string,
    transactionId: string | null
  ): string {
    try {
      // Try to load template file
      const templatePath = join(__dirname, 'templates', 'payment-confirmation.html');
      let template = readFileSync(templatePath, 'utf-8');

      // Format amount (convert from cents to currency)
      const formattedAmount = (paymentAmount / 100).toFixed(2);

      // Format payment method
      const formattedPaymentMethod = paymentMethod
        .replace('_', ' ')
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');

      // Build order details URL
      const orderDetailsUrl = `${config.web.url}/order-success/${orderNumber}`;

      // Replace placeholders
      template = template
        .replace(/\{\{ORDER_NUMBER\}\}/g, orderNumber)
        .replace(/\{\{PAYMENT_AMOUNT\}\}/g, formattedAmount)
        .replace(/\{\{CURRENCY\}\}/g, currency)
        .replace(/\{\{PAYMENT_METHOD\}\}/g, formattedPaymentMethod)
        .replace(/\{\{TRANSACTION_ID\}\}/g, transactionId || 'N/A')
        .replace(/\{\{ORDER_DETAILS_URL\}\}/g, orderDetailsUrl);

      return template;
    } catch (error) {
      logger.warn({ error }, 'Failed to load payment confirmation template, using fallback');
      // Fallback to inline template
      return this.getFallbackPaymentConfirmationTemplate(
        orderNumber,
        paymentAmount,
        currency,
        paymentMethod,
        transactionId
      );
    }
  }

  /**
   * Get payment failed email template
   */
  private getPaymentFailedTemplate(
    orderNumber: string,
    paymentAmount: number,
    currency: string,
    paymentMethod: string,
    failureReason: string
  ): string {
    try {
      // Try to load template file
      const templatePath = join(__dirname, 'templates', 'payment-failed.html');
      let template = readFileSync(templatePath, 'utf-8');

      // Format amount (convert from cents to currency)
      const formattedAmount = (paymentAmount / 100).toFixed(2);

      // Format payment method
      const formattedPaymentMethod = paymentMethod
        .replace('_', ' ')
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');

      // Build URLs
      const orderDetailsUrl = `${config.web.url}/order-success/${orderNumber}`;
      const retryPaymentUrl = `${config.web.url}/order-success/${orderNumber}`;

      // Replace placeholders
      template = template
        .replace(/\{\{ORDER_NUMBER\}\}/g, orderNumber)
        .replace(/\{\{PAYMENT_AMOUNT\}\}/g, formattedAmount)
        .replace(/\{\{CURRENCY\}\}/g, currency)
        .replace(/\{\{PAYMENT_METHOD\}\}/g, formattedPaymentMethod)
        .replace(/\{\{FAILURE_REASON\}\}/g, failureReason)
        .replace(/\{\{ORDER_DETAILS_URL\}\}/g, orderDetailsUrl)
        .replace(/\{\{RETRY_PAYMENT_URL\}\}/g, retryPaymentUrl);

      return template;
    } catch (error) {
      logger.warn({ error }, 'Failed to load payment failed template, using fallback');
      // Fallback to inline template
      return this.getFallbackPaymentFailedTemplate(
        orderNumber,
        paymentAmount,
        currency,
        paymentMethod,
        failureReason
      );
    }
  }

  /**
   * Fallback payment confirmation template (inline)
   */
  private getFallbackPaymentConfirmationTemplate(
    orderNumber: string,
    paymentAmount: number,
    currency: string,
    paymentMethod: string,
    transactionId: string | null
  ): string {
    const formattedAmount = (paymentAmount / 100).toFixed(2);
    const formattedPaymentMethod = paymentMethod
      .replace('_', ' ')
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Payment Confirmation</title>
        </head>
        <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f4f4f4;">
          <table role="presentation" style="width: 100%; border-collapse: collapse;">
            <tr>
              <td align="center" style="padding: 40px 0;">
                <table role="presentation" style="width: 600px; border-collapse: collapse; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                  <tr>
                    <td style="padding: 40px 40px 20px 40px; text-align: center;">
                      <h1 style="margin: 0; color: #28a745; font-size: 24px; font-weight: bold;">✓ Payment Confirmed</h1>
                    </td>
                  </tr>
                  
                  <tr>
                    <td style="padding: 20px 40px;">
                      <p style="margin: 0 0 20px 0; color: #666666; font-size: 16px; line-height: 1.5;">
                        Your payment has been successfully processed!
                      </p>
                      
                      <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
                        <tr>
                          <td style="padding: 10px 0; border-bottom: 1px solid #eeeeee;">
                            <strong style="color: #333333;">Order Number:</strong>
                          </td>
                          <td style="padding: 10px 0; border-bottom: 1px solid #eeeeee; text-align: right; color: #666666;">
                            ${orderNumber}
                          </td>
                        </tr>
                        <tr>
                          <td style="padding: 10px 0; border-bottom: 1px solid #eeeeee;">
                            <strong style="color: #333333;">Payment Amount:</strong>
                          </td>
                          <td style="padding: 10px 0; border-bottom: 1px solid #eeeeee; text-align: right; color: #666666;">
                            ${formattedAmount} ${currency}
                          </td>
                        </tr>
                        <tr>
                          <td style="padding: 10px 0; border-bottom: 1px solid #eeeeee;">
                            <strong style="color: #333333;">Payment Method:</strong>
                          </td>
                          <td style="padding: 10px 0; border-bottom: 1px solid #eeeeee; text-align: right; color: #666666;">
                            ${formattedPaymentMethod}
                          </td>
                        </tr>
                        ${transactionId
        ? `
                        <tr>
                          <td style="padding: 10px 0;">
                            <strong style="color: #333333;">Transaction ID:</strong>
                          </td>
                          <td style="padding: 10px 0; text-align: right; color: #666666;">
                            ${transactionId}
                          </td>
                        </tr>
                        `
        : ''
      }
                      </table>
                      
                      <p style="margin: 20px 0; color: #666666; font-size: 16px; line-height: 1.5;">
                        Your order is now being processed and will be shipped soon.
                      </p>
                    </td>
                  </tr>
                  
                  <tr>
                    <td style="padding: 30px 40px; border-top: 1px solid #eeeeee;">
                      <p style="margin: 0; color: #999999; font-size: 12px; line-height: 1.5;">
                        Thank you for your purchase!
                      </p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </body>
      </html>
    `;
  }

  /**
   * Fallback payment failed template (inline)
   */
  private getFallbackPaymentFailedTemplate(
    orderNumber: string,
    paymentAmount: number,
    currency: string,
    paymentMethod: string,
    failureReason: string
  ): string {
    const formattedAmount = (paymentAmount / 100).toFixed(2);
    const formattedPaymentMethod = paymentMethod
      .replace('_', ' ')
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Payment Failed</title>
        </head>
        <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f4f4f4;">
          <table role="presentation" style="width: 100%; border-collapse: collapse;">
            <tr>
              <td align="center" style="padding: 40px 0;">
                <table role="presentation" style="width: 600px; border-collapse: collapse; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                  <tr>
                    <td style="padding: 40px 40px 20px 40px; text-align: center;">
                      <h1 style="margin: 0; color: #dc3545; font-size: 24px; font-weight: bold;">✗ Payment Failed</h1>
                    </td>
                  </tr>
                  
                  <tr>
                    <td style="padding: 20px 40px;">
                      <p style="margin: 0 0 20px 0; color: #666666; font-size: 16px; line-height: 1.5;">
                        Unfortunately, your payment could not be processed.
                      </p>
                      
                      <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
                        <tr>
                          <td style="padding: 10px 0; border-bottom: 1px solid #eeeeee;">
                            <strong style="color: #333333;">Order Number:</strong>
                          </td>
                          <td style="padding: 10px 0; border-bottom: 1px solid #eeeeee; text-align: right; color: #666666;">
                            ${orderNumber}
                          </td>
                        </tr>
                        <tr>
                          <td style="padding: 10px 0; border-bottom: 1px solid #eeeeee;">
                            <strong style="color: #333333;">Payment Amount:</strong>
                          </td>
                          <td style="padding: 10px 0; border-bottom: 1px solid #eeeeee; text-align: right; color: #666666;">
                            ${formattedAmount} ${currency}
                          </td>
                        </tr>
                        <tr>
                          <td style="padding: 10px 0; border-bottom: 1px solid #eeeeee;">
                            <strong style="color: #333333;">Payment Method:</strong>
                          </td>
                          <td style="padding: 10px 0; border-bottom: 1px solid #eeeeee; text-align: right; color: #666666;">
                            ${formattedPaymentMethod}
                          </td>
                        </tr>
                        <tr>
                          <td style="padding: 10px 0;">
                            <strong style="color: #333333;">Reason:</strong>
                          </td>
                          <td style="padding: 10px 0; text-align: right; color: #dc3545;">
                            ${failureReason}
                          </td>
                        </tr>
                      </table>
                      
                      <p style="margin: 20px 0; color: #666666; font-size: 16px; line-height: 1.5;">
                        Please try again or use a different payment method. If the problem persists, contact our support team.
                      </p>
                    </td>
                  </tr>
                  
                  <tr>
                    <td style="padding: 30px 40px; border-top: 1px solid #eeeeee;">
                      <p style="margin: 0; color: #999999; font-size: 12px; line-height: 1.5;">
                        Need help? Contact our support team.
                      </p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </body>
      </html>
    `;
  }

  /**
   * Order item interface for email templates
   */
  private formatOrderItemsForEmail(items: Array<{
    productName: string;
    variantName?: string | null;
    quantity: number;
    unitPrice: number;
    subtotal: number;
    isPromotionalGift?: boolean | null;
  }>): string {
    return items.map(item => `
      <tr style="border-bottom: 1px solid #e9ecef;">
        <td style="padding: 12px 0;">
          <span style="color: #333333; font-size: 14px;">${item.productName}${item.variantName ? ` - ${item.variantName}` : ''}${item.isPromotionalGift ? ' <span style="color: #28a745; font-size: 12px;">(Gift)</span>' : ''}</span>
        </td>
        <td style="padding: 12px 8px; text-align: center;">
          <span style="color: #6c757d; font-size: 14px;">x${item.quantity}</span>
        </td>
        <td style="padding: 12px 0; text-align: right;">
          <span style="color: #333333; font-size: 14px;">${item.isPromotionalGift ? 'FREE' : `฿${(item.subtotal / 100).toLocaleString()}`}</span>
        </td>
      </tr>
    `).join('');
  }

  /**
   * Send order confirmation email to customer
   */
  async sendOrderConfirmationEmail(
    email: string,
    orderDetails: {
      orderNumber: string;
      customerName: string;
      orderDate: string;
      items: Array<{
        productName: string;
        variantName?: string | null;
        quantity: number;
        unitPrice: number;
        subtotal: number;
        isPromotionalGift?: boolean | null;
      }>;
      subtotal: number;
      shippingCost: number;
      discountAmount: number;
      promotionDiscountAmount?: number;
      totalAmount: number;
      shippingAddress: {
        firstName: string;
        lastName: string;
        addressLine1: string;
        addressLine2?: string | null;
        city: string;
        province: string;
        postalCode: string;
        phone: string;
      };
      orderDetailsUrl: string;
    }
  ): Promise<boolean> {
    try {
      const subject = `Order Confirmed - ${orderDetails.orderNumber}`;
      const html = this.getOrderConfirmationTemplate(orderDetails);
      return await this.sendEmail(email, subject, html);
    } catch (error) {
      logger.error({ error, email, orderNumber: orderDetails.orderNumber }, 'Failed to send order confirmation email');
      return false;
    }
  }

  /**
   * Send new order notification to admin
   */
  async sendAdminNewOrderNotification(
    adminEmail: string,
    orderDetails: {
      orderNumber: string;
      customerName: string;
      customerEmail: string;
      customerPhone: string;
      orderDate: string;
      items: Array<{
        productName: string;
        variantName?: string | null;
        quantity: number;
        unitPrice: number;
        subtotal: number;
        isPromotionalGift?: boolean | null;
      }>;
      totalAmount: number;
      shippingAddress: {
        firstName: string;
        lastName: string;
        addressLine1: string;
        addressLine2?: string | null;
        city: string;
        province: string;
        postalCode: string;
        phone: string;
      };
      orderDetailsUrl: string;
      adminOrderUrl: string;
    },
    cc?: string
  ): Promise<boolean> {
    try {
      const subject = `🛒 New Order - ${orderDetails.orderNumber} - ฿${(orderDetails.totalAmount / 100).toLocaleString()}`;
      const html = this.getAdminNewOrderTemplate(orderDetails);
      return await this.sendEmail(adminEmail, subject, html, cc);
    } catch (error) {
      logger.error({ error, adminEmail, orderNumber: orderDetails.orderNumber }, 'Failed to send admin new order notification');
      return false;
    }
  }

  /**
   * Get order confirmation email template
   */
  private getOrderConfirmationTemplate(orderDetails: {
    orderNumber: string;
    customerName: string;
    orderDate: string;
    items: Array<{
      productName: string;
      variantName?: string | null;
      quantity: number;
      unitPrice: number;
      subtotal: number;
      isPromotionalGift?: boolean | null;
    }>;
    subtotal: number;
    shippingCost: number;
    discountAmount: number;
    promotionDiscountAmount?: number;
    totalAmount: number;
    shippingAddress: {
      firstName: string;
      lastName: string;
      addressLine1: string;
      addressLine2?: string | null;
      city: string;
      province: string;
      postalCode: string;
      phone: string;
    };
    orderDetailsUrl: string;
  }): string {
    try {
      const templatePath = join(__dirname, 'templates', 'order-confirmation.html');
      let template = readFileSync(templatePath, 'utf-8');

      const orderItemsHtml = this.formatOrderItemsForEmail(orderDetails.items);
      const totalDiscount = (orderDetails.discountAmount || 0) + (orderDetails.promotionDiscountAmount || 0);

      const discountRow = totalDiscount > 0 ? `
        <tr>
          <td style="padding: 8px 0;">
            <span style="color: #28a745; font-size: 14px;">Discount</span>
          </td>
          <td style="padding: 8px 0; text-align: right;">
            <span style="color: #28a745; font-size: 14px;">-฿${(totalDiscount / 100).toLocaleString()}</span>
          </td>
        </tr>
      ` : '';

      const shippingCostDisplay = orderDetails.shippingCost === 0
        ? '<span style="color: #28a745;">FREE</span>'
        : `฿${(orderDetails.shippingCost / 100).toLocaleString()}`;

      const shippingAddressLine2 = orderDetails.shippingAddress.addressLine2
        ? `${orderDetails.shippingAddress.addressLine2}, `
        : '';

      template = template
        .replace(/\{\{CUSTOMER_NAME\}\}/g, orderDetails.customerName)
        .replace(/\{\{ORDER_NUMBER\}\}/g, orderDetails.orderNumber)
        .replace(/\{\{ORDER_DATE\}\}/g, orderDetails.orderDate)
        .replace(/\{\{ORDER_ITEMS\}\}/g, orderItemsHtml)
        .replace(/\{\{SUBTOTAL\}\}/g, (orderDetails.subtotal / 100).toLocaleString())
        .replace(/\{\{SHIPPING_COST\}\}/g, shippingCostDisplay)
        .replace(/\{\{DISCOUNT_ROW\}\}/g, discountRow)
        .replace(/\{\{TOTAL_AMOUNT\}\}/g, (orderDetails.totalAmount / 100).toLocaleString())
        .replace(/\{\{SHIPPING_NAME\}\}/g, `${orderDetails.shippingAddress.firstName} ${orderDetails.shippingAddress.lastName}`)
        .replace(/\{\{SHIPPING_ADDRESS\}\}/g, `${orderDetails.shippingAddress.addressLine1}${shippingAddressLine2 ? ', ' + shippingAddressLine2 : ''}`)
        .replace(/\{\{SHIPPING_CITY\}\}/g, orderDetails.shippingAddress.city)
        .replace(/\{\{SHIPPING_PROVINCE\}\}/g, orderDetails.shippingAddress.province)
        .replace(/\{\{SHIPPING_POSTAL_CODE\}\}/g, orderDetails.shippingAddress.postalCode)
        .replace(/\{\{SHIPPING_PHONE\}\}/g, orderDetails.shippingAddress.phone)
        .replace(/\{\{ORDER_DETAILS_URL\}\}/g, orderDetails.orderDetailsUrl);

      return template;
    } catch (error) {
      logger.warn({ error }, 'Failed to load order confirmation template');
      throw error;
    }
  }

  /**
   * Get admin new order notification template
   */
  private getAdminNewOrderTemplate(orderDetails: {
    orderNumber: string;
    customerName: string;
    customerEmail: string;
    customerPhone: string;
    orderDate: string;
    items: Array<{
      productName: string;
      variantName?: string | null;
      quantity: number;
      unitPrice: number;
      subtotal: number;
      isPromotionalGift?: boolean | null;
    }>;
    totalAmount: number;
    shippingAddress: {
      firstName: string;
      lastName: string;
      addressLine1: string;
      addressLine2?: string | null;
      city: string;
      province: string;
      postalCode: string;
      phone: string;
    };
    orderDetailsUrl: string;
    adminOrderUrl: string;
  }): string {
    try {
      const templatePath = join(__dirname, 'templates', 'admin-new-order.html');
      let template = readFileSync(templatePath, 'utf-8');

      const orderItemsHtml = this.formatOrderItemsForEmail(orderDetails.items);
      const itemCount = orderDetails.items.reduce((sum, item) => sum + item.quantity, 0);

      const shippingAddressLine2 = orderDetails.shippingAddress.addressLine2
        ? `${orderDetails.shippingAddress.addressLine2}, `
        : '';

      template = template
        .replace(/\{\{CUSTOMER_NAME\}\}/g, orderDetails.customerName)
        .replace(/\{\{CUSTOMER_EMAIL\}\}/g, orderDetails.customerEmail)
        .replace(/\{\{CUSTOMER_PHONE\}\}/g, orderDetails.customerPhone)
        .replace(/\{\{ORDER_NUMBER\}\}/g, orderDetails.orderNumber)
        .replace(/\{\{ORDER_DATE\}\}/g, orderDetails.orderDate)
        .replace(/\{\{TOTAL_AMOUNT\}\}/g, (orderDetails.totalAmount / 100).toLocaleString())
        .replace(/\{\{ITEM_COUNT\}\}/g, itemCount.toString())
        .replace(/\{\{ORDER_ITEMS\}\}/g, orderItemsHtml)
        .replace(/\{\{SHIPPING_NAME\}\}/g, `${orderDetails.shippingAddress.firstName} ${orderDetails.shippingAddress.lastName}`)
        .replace(/\{\{SHIPPING_ADDRESS\}\}/g, `${orderDetails.shippingAddress.addressLine1}${shippingAddressLine2 ? ', ' + shippingAddressLine2 : ''}`)
        .replace(/\{\{SHIPPING_CITY\}\}/g, orderDetails.shippingAddress.city)
        .replace(/\{\{SHIPPING_PROVINCE\}\}/g, orderDetails.shippingAddress.province)
        .replace(/\{\{SHIPPING_POSTAL_CODE\}\}/g, orderDetails.shippingAddress.postalCode)
        .replace(/\{\{SHIPPING_PHONE\}\}/g, orderDetails.shippingAddress.phone)
        .replace(/\{\{ORDER_DETAILS_URL\}\}/g, orderDetails.orderDetailsUrl)
        .replace(/\{\{ADMIN_ORDER_URL\}\}/g, orderDetails.adminOrderUrl);

      return template;
    } catch (error) {
      logger.warn({ error }, 'Failed to load admin new order template');
      throw error;
    }
  }
}

export const emailService = new EmailService(); 
