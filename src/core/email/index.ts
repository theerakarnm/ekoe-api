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

  async sendEmail(to: string, subject: string, html: string): Promise<boolean> {
    if (!this.isConfigured || !this.transporter) {
      logger.warn({ to, subject }, 'Email not sent - SMTP not configured');
      return false;
    }

    try {
      const info = await this.transporter.sendMail({
        from: config.email.from,
        to,
        subject,
        html,
      });

      logger.info({ messageId: info.messageId, to, subject }, 'Email sent successfully');
      return true;
    } catch (error) {
      logger.error({ error, to, subject }, 'Failed to send email');
      return false;
    }
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
}

export const emailService = new EmailService(); 
