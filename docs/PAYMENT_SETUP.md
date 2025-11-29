# Payment Integration Setup Guide

This guide walks you through setting up payment processing for the e-commerce platform, including PromptPay QR code payments and 2C2P credit card payments.

## Table of Contents

- [Prerequisites](#prerequisites)
- [PromptPay Setup](#promptpay-setup)
- [2C2P Setup](#2c2p-setup)
- [Environment Configuration](#environment-configuration)
- [Testing Instructions](#testing-instructions)
- [Common Issues and Solutions](#common-issues-and-solutions)

## Prerequisites

Before setting up payment integration, ensure you have:

- A PostgreSQL database configured and running
- Node.js/Bun runtime installed
- Access to your production domain (for webhook URLs)
- SSL certificate configured (HTTPS required for production)

## PromptPay Setup

PromptPay is Thailand's national instant payment system that allows customers to pay via QR codes using their mobile banking apps.

### Step 1: Register for PromptPay Merchant Account

1. Contact your bank in Thailand to register as a PromptPay merchant
2. Provide your business registration documents
3. Request a PromptPay Merchant ID (typically your phone number or Tax ID)
4. Set up webhook notifications with your bank

### Step 2: Obtain Merchant Credentials

You'll need the following from your bank:

- **Merchant ID**: Your unique PromptPay identifier (phone number format: 0812345678 or Tax ID)
- **Webhook Secret**: A secret key for verifying webhook signatures
- **Webhook URL**: Provide your webhook endpoint to the bank: `https://yourdomain.com/api/webhooks/promptpay`

### Step 3: Configure PromptPay in Application

Add the following to your `.env` file:

```bash
# PromptPay Configuration
PROMPTPAY_MERCHANT_ID=0812345678
PROMPTPAY_WEBHOOK_SECRET=your_webhook_secret_from_bank
```

### Step 4: Test PromptPay Integration

1. Create a test payment through your application
2. Scan the generated QR code with a banking app in test mode
3. Verify the webhook is received and payment status updates

## 2C2P Setup

2C2P is a payment gateway that supports credit cards, debit cards, and alternative payment methods across Asia.

### Step 1: Create 2C2P Account

1. Visit [2C2P website](https://www.2c2p.com) and sign up for a merchant account
2. Complete the merchant application form
3. Submit required business documents:
   - Business registration certificate
   - Bank account details
   - Director/owner identification
4. Wait for account approval (typically 3-5 business days)

### Step 2: Access Merchant Portal

Once approved:

1. Log in to the 2C2P Merchant Portal
2. Navigate to **Settings** > **API Credentials**
3. Note down your credentials:
   - **Merchant ID**: Your unique merchant identifier
   - **Secret Key**: Used for generating payment hashes
   - **API URL**: 
     - Sandbox: `https://sandbox.2c2p.com/2C2PFrontEnd/SecurePayment/api/`
     - Production: `https://t.2c2p.com/2C2PFrontEnd/SecurePayment/api/`

### Step 3: Configure Webhook Settings

In the 2C2P Merchant Portal:

1. Go to **Settings** > **Webhook Configuration**
2. Set your webhook URL: `https://yourdomain.com/api/webhooks/2c2p`
3. Enable webhook notifications for:
   - Payment Success
   - Payment Failed
   - Payment Pending
4. Generate and save your **Webhook Secret Key**

### Step 4: Configure Return URLs

Set up return URLs for customer redirects:

1. **Success URL**: `https://yourdomain.com/payment/2c2p/return`
2. **Failure URL**: `https://yourdomain.com/payment/2c2p/return`
3. **Cancel URL**: `https://yourdomain.com/checkout`

### Step 5: Configure 2C2P in Application

Add the following to your `.env` file:

```bash
# 2C2P Configuration
TWOC2P_MERCHANT_ID=your_merchant_id
TWOC2P_SECRET_KEY=your_secret_key
TWOC2P_API_URL=https://sandbox.2c2p.com/2C2PFrontEnd/SecurePayment/api/
TWOC2P_WEBHOOK_SECRET=your_webhook_secret
```

**Note**: Use sandbox URL for testing, production URL for live transactions.

### Step 6: Test 2C2P Integration

1. Create a test payment through your application
2. Use 2C2P test card numbers:
   - **Success**: `4111111111111111`
   - **Failure**: `4000000000000002`
   - **CVV**: Any 3 digits
   - **Expiry**: Any future date
3. Verify redirect flow and webhook reception

## Environment Configuration

### Complete Environment Variables

Create or update your `.env` file with all payment-related variables:

```bash
# ===================================
# Payment Configuration
# ===================================

# PromptPay Settings
PROMPTPAY_MERCHANT_ID=0812345678
PROMPTPAY_WEBHOOK_SECRET=your_promptpay_webhook_secret

# 2C2P Settings
TWOC2P_MERCHANT_ID=JT01
TWOC2P_SECRET_KEY=your_2c2p_secret_key
TWOC2P_API_URL=https://sandbox.2c2p.com/2C2PFrontEnd/SecurePayment/api/
TWOC2P_WEBHOOK_SECRET=your_2c2p_webhook_secret

# Payment Behavior Settings
PAYMENT_QR_EXPIRY_MINUTES=15
PAYMENT_POLLING_INTERVAL_MS=5000
PAYMENT_MAX_RETRY_ATTEMPTS=3

# Application URLs (for 2C2P redirects)
APP_URL=https://yourdomain.com
```

### Environment Variable Descriptions

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `PROMPTPAY_MERCHANT_ID` | Your PromptPay merchant identifier | Yes | - |
| `PROMPTPAY_WEBHOOK_SECRET` | Secret for verifying PromptPay webhooks | Yes | - |
| `TWOC2P_MERCHANT_ID` | Your 2C2P merchant ID | Yes | - |
| `TWOC2P_SECRET_KEY` | Secret key for 2C2P API requests | Yes | - |
| `TWOC2P_API_URL` | 2C2P API endpoint (sandbox or production) | Yes | - |
| `TWOC2P_WEBHOOK_SECRET` | Secret for verifying 2C2P webhooks | Yes | - |
| `PAYMENT_QR_EXPIRY_MINUTES` | Minutes until PromptPay QR expires | No | 15 |
| `PAYMENT_POLLING_INTERVAL_MS` | Milliseconds between status polls | No | 5000 |
| `PAYMENT_MAX_RETRY_ATTEMPTS` | Max payment retry attempts | No | 3 |
| `APP_URL` | Your application base URL | Yes | - |

### Validation

The application validates all required environment variables on startup. If any are missing, you'll see an error message indicating which variables need to be configured.

## Testing Instructions

### Local Development Testing

#### 1. Set Up Local Environment

```bash
# Navigate to API directory
cd api

# Copy environment template
cp .env.example .env

# Edit .env with your test credentials
nano .env

# Install dependencies
bun install

# Run database migrations
bun run db:migrate

# Start development server
bun run dev
```

#### 2. Test PromptPay Flow

```bash
# Create a test order and payment
curl -X POST http://localhost:3000/api/payments/promptpay \
  -H "Content-Type: application/json" \
  -d '{
    "orderId": "your-order-id",
    "amount": 100.00
  }'

# Response will include QR code data
# Scan with banking app or simulate webhook (see WEBHOOK_TESTING.md)
```

#### 3. Test 2C2P Flow

```bash
# Initiate 2C2P payment
curl -X POST http://localhost:3000/api/payments/2c2p/initiate \
  -H "Content-Type: application/json" \
  -d '{
    "orderId": "your-order-id",
    "amount": 100.00,
    "returnUrl": "http://localhost:5173/payment/2c2p/return"
  }'

# Response will include payment URL
# Open URL in browser and use test card numbers
```

#### 4. Test Payment Status Polling

```bash
# Check payment status
curl http://localhost:3000/api/payments/{payment-id}/status

# Should return current payment status
```

### Production Testing Checklist

Before going live, verify:

- [ ] All environment variables are set with production values
- [ ] HTTPS is enabled on your domain
- [ ] Webhook URLs are accessible from the internet
- [ ] Database backups are configured
- [ ] Error logging and monitoring are set up
- [ ] Test a small real transaction (minimum amount)
- [ ] Verify email notifications are sent
- [ ] Test payment retry functionality
- [ ] Verify admin payment verification works
- [ ] Check payment transaction logging

### Testing with Real Banking Apps

For PromptPay testing:

1. Use a small amount (e.g., 1 THB) for initial tests
2. Scan QR code with your banking app
3. Complete payment in test/sandbox mode if available
4. Verify webhook is received within 5 seconds
5. Check order status updates correctly
6. Confirm email notification is sent

## Common Issues and Solutions

### Issue 1: QR Code Not Generating

**Symptoms**: Error when creating PromptPay payment, no QR code displayed

**Possible Causes**:
- Invalid merchant ID format
- Missing `promptpay-qr` package
- Incorrect amount format

**Solutions**:
```bash
# Verify merchant ID format (should be phone number or Tax ID)
echo $PROMPTPAY_MERCHANT_ID

# Install PromptPay QR package if missing
bun add promptpay-qr

# Check amount is a positive number
# Amount should be in THB, e.g., 100.00
```

### Issue 2: Webhook Not Received

**Symptoms**: Payment completed but order status not updated

**Possible Causes**:
- Webhook URL not accessible from internet
- Firewall blocking webhook requests
- Incorrect webhook URL configured with provider

**Solutions**:
```bash
# Test webhook URL accessibility
curl https://yourdomain.com/api/webhooks/promptpay

# Should return 200 OK (even with invalid payload)

# For local testing, use ngrok
ngrok http 3000
# Update webhook URL with ngrok URL
```

### Issue 3: Webhook Signature Verification Failed

**Symptoms**: Webhook received but returns 401 Unauthorized

**Possible Causes**:
- Incorrect webhook secret
- Signature algorithm mismatch
- Payload modification in transit

**Solutions**:
```bash
# Verify webhook secret matches provider configuration
echo $PROMPTPAY_WEBHOOK_SECRET
echo $TWOC2P_WEBHOOK_SECRET

# Check webhook logs for signature details
tail -f logs/app.log | grep webhook

# Test signature generation (see WEBHOOK_TESTING.md)
```

### Issue 4: 2C2P Redirect Not Working

**Symptoms**: Customer not redirected to 2C2P payment page

**Possible Causes**:
- Invalid API credentials
- Incorrect API URL
- Network connectivity issues

**Solutions**:
```bash
# Test 2C2P API connectivity
curl -X POST $TWOC2P_API_URL/payment \
  -H "Content-Type: application/json" \
  -d '{"test": "connection"}'

# Verify credentials in merchant portal
# Check API URL matches environment (sandbox vs production)

# Review API logs for detailed error messages
```

### Issue 5: Payment Status Stuck in Pending

**Symptoms**: Payment shows as pending indefinitely

**Possible Causes**:
- Webhook not received
- Database transaction failed
- Payment actually failed but not updated

**Solutions**:
```bash
# Check payment in database
psql -d your_database -c "SELECT * FROM payments WHERE id = 'payment-id';"

# Manually verify payment with provider
# Use admin panel to manually mark as paid if confirmed

# Check webhook logs
grep "payment-id" logs/webhook.log

# Retry webhook if needed (contact provider support)
```

### Issue 6: QR Code Expired

**Symptoms**: Customer scans QR code but payment fails

**Possible Causes**:
- QR code expired (default 15 minutes)
- Customer took too long to complete payment

**Solutions**:
```bash
# Adjust expiry time in .env
PAYMENT_QR_EXPIRY_MINUTES=30

# Implement payment retry functionality
# Customer can generate new QR code for same order
```

### Issue 7: Email Notifications Not Sent

**Symptoms**: Payment completed but no confirmation email

**Possible Causes**:
- Email service not configured
- Invalid customer email address
- Email service rate limits

**Solutions**:
```bash
# Check email configuration
echo $EMAIL_HOST
echo $EMAIL_FROM

# Test email service
bun run test:email

# Check email logs
tail -f logs/email.log

# Verify customer email in database
psql -d your_database -c "SELECT email FROM customers WHERE id = 'customer-id';"
```

### Issue 8: Database Connection Errors

**Symptoms**: Payment creation fails with database errors

**Possible Causes**:
- Database connection pool exhausted
- Database server down
- Migration not run

**Solutions**:
```bash
# Check database connectivity
bun run test:db

# Run pending migrations
bun run db:migrate

# Check database connection pool settings
# Increase pool size if needed in drizzle.config.ts

# Restart database if necessary
```

## Getting Help

### Support Resources

- **PromptPay Support**: Contact your bank's merchant support team
- **2C2P Support**: 
  - Email: support@2c2p.com
  - Merchant Portal: Live chat available
  - Documentation: https://developer.2c2p.com

### Application Logs

Check application logs for detailed error information:

```bash
# View recent logs
tail -f logs/app.log

# Search for payment-related errors
grep -i "payment\|webhook" logs/app.log

# View webhook-specific logs
tail -f logs/webhook.log
```

### Debug Mode

Enable debug logging for payment operations:

```bash
# Add to .env
LOG_LEVEL=debug
PAYMENT_DEBUG=true

# Restart application
bun run dev
```

## Security Best Practices

1. **Never commit `.env` files** to version control
2. **Rotate webhook secrets** periodically (every 90 days)
3. **Use HTTPS only** for all payment endpoints
4. **Implement rate limiting** on payment creation endpoints
5. **Monitor for suspicious activity** (multiple failed payments)
6. **Keep dependencies updated** for security patches
7. **Backup payment data** regularly
8. **Use strong webhook secrets** (minimum 32 characters)
9. **Validate all webhook signatures** before processing
10. **Log all payment operations** for audit trails

## Next Steps

After completing setup:

1. Review [WEBHOOK_TESTING.md](./WEBHOOK_TESTING.md) for webhook testing procedures
2. Test payment flows in sandbox/test environment
3. Perform security audit of payment endpoints
4. Set up monitoring and alerting for payment failures
5. Train support team on payment troubleshooting
6. Document your specific payment workflows
7. Schedule regular payment reconciliation
8. Plan for production deployment

## Appendix

### Useful Commands

```bash
# Check payment configuration
bun run check:payment-config

# Test payment providers connectivity
bun run test:payment-providers

# Generate test payment data
bun run seed:test-payments

# View payment statistics
bun run stats:payments

# Export payment logs
bun run export:payment-logs --date=2024-01-01
```

### Database Queries

```sql
-- Check recent payments
SELECT id, order_id, payment_method, status, amount, created_at 
FROM payments 
ORDER BY created_at DESC 
LIMIT 10;

-- Count payments by status
SELECT status, COUNT(*) as count 
FROM payments 
GROUP BY status;

-- Find failed payments
SELECT * FROM payments 
WHERE status = 'failed' 
AND created_at > NOW() - INTERVAL '24 hours';

-- Check pending payments older than 1 hour
SELECT * FROM payments 
WHERE status = 'pending' 
AND created_at < NOW() - INTERVAL '1 hour';
```

---

**Last Updated**: 2024-01-01  
**Version**: 1.0  
**Maintained By**: Development Team
