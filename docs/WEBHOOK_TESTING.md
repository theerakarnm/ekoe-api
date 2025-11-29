# Webhook Testing Guide

This guide provides detailed instructions for testing payment webhooks locally and in production environments.

## Table of Contents

- [Overview](#overview)
- [Local Webhook Testing](#local-webhook-testing)
- [Webhook Payloads](#webhook-payloads)
- [Signature Generation](#signature-generation)
- [Manual Testing with cURL](#manual-testing-with-curl)
- [Automated Testing](#automated-testing)
- [Troubleshooting](#troubleshooting)

## Overview

Webhooks are HTTP callbacks that payment providers send to notify your application about payment status changes. Testing webhooks is crucial to ensure your application correctly processes payment notifications.

### Webhook Endpoints

Your application exposes two webhook endpoints:

- **PromptPay**: `POST /api/webhooks/promptpay`
- **2C2P**: `POST /api/webhooks/2c2p`

Both endpoints:
- Accept POST requests with JSON payloads
- Verify webhook signatures for security
- Return 200 OK on successful processing
- Log all webhook attempts

## Local Webhook Testing

### Method 1: Using ngrok (Recommended)

ngrok creates a secure tunnel to your local development server, allowing payment providers to send webhooks to your local machine.

#### Step 1: Install ngrok

```bash
# macOS (using Homebrew)
brew install ngrok

# Or download from https://ngrok.com/download
```

#### Step 2: Start Your Local Server

```bash
cd api
bun run dev
# Server running on http://localhost:3000
```

#### Step 3: Create ngrok Tunnel

```bash
# In a new terminal
ngrok http 3000

# Output will show:
# Forwarding: https://abc123.ngrok.io -> http://localhost:3000
```

#### Step 4: Configure Webhook URLs

Use the ngrok URL in your payment provider settings:

- **PromptPay**: `https://abc123.ngrok.io/api/webhooks/promptpay`
- **2C2P**: `https://abc123.ngrok.io/api/webhooks/2c2p`

#### Step 5: Monitor Webhooks

```bash
# View ngrok web interface
open http://127.0.0.1:4040

# Or watch application logs
tail -f logs/app.log | grep webhook
```

### Method 2: Using localtunnel

Alternative to ngrok:

```bash
# Install localtunnel
npm install -g localtunnel

# Create tunnel
lt --port 3000 --subdomain mypayments

# Use: https://mypayments.loca.lt/api/webhooks/promptpay
```

### Method 3: Manual Webhook Simulation

For testing without external services, simulate webhooks using cURL (see [Manual Testing](#manual-testing-with-curl) section).

## Webhook Payloads

### PromptPay Webhook Payload

#### Successful Payment

```json
{
  "transactionId": "PP20240101123456789",
  "amount": 100.00,
  "currency": "THB",
  "status": "success",
  "referenceId": "payment-uuid-here",
  "timestamp": "2024-01-01T12:00:00Z",
  "merchantId": "0812345678",
  "customerAccount": "0891234567"
}
```

#### Failed Payment

```json
{
  "transactionId": "PP20240101123456790",
  "amount": 100.00,
  "currency": "THB",
  "status": "failed",
  "referenceId": "payment-uuid-here",
  "timestamp": "2024-01-01T12:00:00Z",
  "merchantId": "0812345678",
  "errorCode": "INSUFFICIENT_FUNDS",
  "errorMessage": "Insufficient funds in customer account"
}
```

### 2C2P Webhook Payload

#### Successful Payment

```json
{
  "version": "9.9",
  "merchant_id": "JT01",
  "order_id": "order-uuid-here",
  "invoice_no": "INV-2024-001",
  "currency": "764",
  "amount": "000000010000",
  "transaction_ref": "2C2P20240101123456",
  "approval_code": "123456",
  "eci": "05",
  "transaction_datetime": "20240101120000",
  "payment_channel": "001",
  "payment_status": "000",
  "channel_response_code": "00",
  "channel_response_desc": "Success",
  "masked_pan": "411111XXXXXX1111",
  "stored_card_unique_id": "",
  "backend_invoice": "INV-2024-001",
  "paid_channel": "CC",
  "paid_agent": "VISA",
  "recurring_unique_id": "",
  "user_defined_1": "",
  "user_defined_2": "",
  "user_defined_3": "",
  "user_defined_4": "",
  "user_defined_5": "",
  "browser_info": "",
  "ippPeriod": "",
  "ippInterestType": "",
  "ippInterestRate": "",
  "ippMerchantAbsorbRate": "",
  "payment_scheme": "VISA",
  "process_by": "2C2P",
  "sub_merchant_list": "",
  "hash_value": "generated-hash-here"
}
```

#### Failed Payment

```json
{
  "version": "9.9",
  "merchant_id": "JT01",
  "order_id": "order-uuid-here",
  "currency": "764",
  "amount": "000000010000",
  "transaction_ref": "2C2P20240101123457",
  "transaction_datetime": "20240101120000",
  "payment_status": "001",
  "channel_response_code": "05",
  "channel_response_desc": "Do not honor",
  "masked_pan": "411111XXXXXX1111",
  "hash_value": "generated-hash-here"
}
```

### Payload Field Descriptions

#### PromptPay Fields

| Field | Type | Description |
|-------|------|-------------|
| `transactionId` | string | Unique transaction identifier from PromptPay |
| `amount` | number | Payment amount in THB |
| `currency` | string | Currency code (always "THB") |
| `status` | string | Payment status: "success" or "failed" |
| `referenceId` | string | Your payment ID (from QR code) |
| `timestamp` | string | ISO 8601 timestamp |
| `merchantId` | string | Your PromptPay merchant ID |
| `customerAccount` | string | Customer's phone number (optional) |
| `errorCode` | string | Error code if failed (optional) |
| `errorMessage` | string | Error description if failed (optional) |

#### 2C2P Fields

| Field | Type | Description |
|-------|------|-------------|
| `merchant_id` | string | Your 2C2P merchant ID |
| `order_id` | string | Your order ID |
| `amount` | string | Amount in smallest unit (e.g., "000000010000" = 100.00) |
| `transaction_ref` | string | 2C2P transaction reference |
| `payment_status` | string | "000" = success, "001" = failed, "002" = pending |
| `channel_response_code` | string | Payment channel response code |
| `masked_pan` | string | Masked card number |
| `payment_scheme` | string | Card brand (VISA, MASTERCARD, etc.) |
| `hash_value` | string | HMAC signature for verification |

## Signature Generation

### PromptPay Signature

PromptPay uses HMAC-SHA256 for webhook signatures.

#### Algorithm

```
signature = HMAC-SHA256(webhook_secret, payload_string)
```

#### Example (Node.js/Bun)

```javascript
import crypto from 'crypto';

function generatePromptPaySignature(payload, secret) {
  const payloadString = JSON.stringify(payload);
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(payloadString);
  return hmac.digest('hex');
}

// Usage
const payload = {
  transactionId: "PP20240101123456789",
  amount: 100.00,
  currency: "THB",
  status: "success",
  referenceId: "payment-uuid-here",
  timestamp: "2024-01-01T12:00:00Z",
  merchantId: "0812345678"
};

const secret = process.env.PROMPTPAY_WEBHOOK_SECRET;
const signature = generatePromptPaySignature(payload, secret);
console.log('X-PromptPay-Signature:', signature);
```

#### Example (Python)

```python
import hmac
import hashlib
import json

def generate_promptpay_signature(payload, secret):
    payload_string = json.dumps(payload, separators=(',', ':'))
    signature = hmac.new(
        secret.encode('utf-8'),
        payload_string.encode('utf-8'),
        hashlib.sha256
    ).hexdigest()
    return signature

# Usage
payload = {
    "transactionId": "PP20240101123456789",
    "amount": 100.00,
    "currency": "THB",
    "status": "success",
    "referenceId": "payment-uuid-here",
    "timestamp": "2024-01-01T12:00:00Z",
    "merchantId": "0812345678"
}

secret = "your_webhook_secret"
signature = generate_promptpay_signature(payload, secret)
print(f"X-PromptPay-Signature: {signature}")
```

### 2C2P Signature

2C2P uses HMAC-SHA256 with a specific field concatenation.

#### Algorithm

```
string_to_sign = version + merchant_id + order_id + currency + amount + 
                 payment_status + transaction_ref
hash_value = HMAC-SHA256(secret_key, string_to_sign)
```

#### Example (Node.js/Bun)

```javascript
import crypto from 'crypto';

function generate2C2PSignature(payload, secretKey) {
  const stringToSign = 
    payload.version +
    payload.merchant_id +
    payload.order_id +
    payload.currency +
    payload.amount +
    payload.payment_status +
    payload.transaction_ref;
  
  const hmac = crypto.createHmac('sha256', secretKey);
  hmac.update(stringToSign);
  return hmac.digest('hex').toUpperCase();
}

// Usage
const payload = {
  version: "9.9",
  merchant_id: "JT01",
  order_id: "order-uuid-here",
  currency: "764",
  amount: "000000010000",
  payment_status: "000",
  transaction_ref: "2C2P20240101123456"
};

const secretKey = process.env.TWOC2P_SECRET_KEY;
const hashValue = generate2C2PSignature(payload, secretKey);
console.log('hash_value:', hashValue);

// Add hash_value to payload
payload.hash_value = hashValue;
```

#### Example (Python)

```python
import hmac
import hashlib

def generate_2c2p_signature(payload, secret_key):
    string_to_sign = (
        payload['version'] +
        payload['merchant_id'] +
        payload['order_id'] +
        payload['currency'] +
        payload['amount'] +
        payload['payment_status'] +
        payload['transaction_ref']
    )
    
    signature = hmac.new(
        secret_key.encode('utf-8'),
        string_to_sign.encode('utf-8'),
        hashlib.sha256
    ).hexdigest().upper()
    
    return signature

# Usage
payload = {
    "version": "9.9",
    "merchant_id": "JT01",
    "order_id": "order-uuid-here",
    "currency": "764",
    "amount": "000000010000",
    "payment_status": "000",
    "transaction_ref": "2C2P20240101123456"
}

secret_key = "your_secret_key"
hash_value = generate_2c2p_signature(payload, secret_key)
print(f"hash_value: {hash_value}")

payload['hash_value'] = hash_value
```

## Manual Testing with cURL

### Testing PromptPay Webhook

#### Step 1: Generate Signature

```bash
# Using the Node.js script above, or use this bash one-liner:
PAYLOAD='{"transactionId":"PP20240101123456789","amount":100.00,"currency":"THB","status":"success","referenceId":"your-payment-id","timestamp":"2024-01-01T12:00:00Z","merchantId":"0812345678"}'
SECRET="your_webhook_secret"
SIGNATURE=$(echo -n "$PAYLOAD" | openssl dgst -sha256 -hmac "$SECRET" -hex | cut -d' ' -f2)
echo "Signature: $SIGNATURE"
```

#### Step 2: Send Webhook Request

```bash
curl -X POST http://localhost:3000/api/webhooks/promptpay \
  -H "Content-Type: application/json" \
  -H "X-PromptPay-Signature: $SIGNATURE" \
  -d '{
    "transactionId": "PP20240101123456789",
    "amount": 100.00,
    "currency": "THB",
    "status": "success",
    "referenceId": "your-payment-id",
    "timestamp": "2024-01-01T12:00:00Z",
    "merchantId": "0812345678"
  }'
```

#### Expected Response

```json
{
  "success": true,
  "message": "Webhook processed successfully"
}
```

### Testing 2C2P Webhook

#### Step 1: Prepare Payload

```bash
# Create payload file
cat > 2c2p_webhook.json << 'EOF'
{
  "version": "9.9",
  "merchant_id": "JT01",
  "order_id": "your-order-id",
  "currency": "764",
  "amount": "000000010000",
  "transaction_ref": "2C2P20240101123456",
  "payment_status": "000",
  "channel_response_code": "00",
  "masked_pan": "411111XXXXXX1111",
  "payment_scheme": "VISA"
}
EOF
```

#### Step 2: Generate Hash

```javascript
// save as generate-2c2p-hash.js
import crypto from 'crypto';

const payload = {
  version: "9.9",
  merchant_id: "JT01",
  order_id: "your-order-id",
  currency: "764",
  amount: "000000010000",
  payment_status: "000",
  transaction_ref: "2C2P20240101123456"
};

const stringToSign = 
  payload.version +
  payload.merchant_id +
  payload.order_id +
  payload.currency +
  payload.amount +
  payload.payment_status +
  payload.transaction_ref;

const secretKey = process.env.TWOC2P_SECRET_KEY;
const hash = crypto.createHmac('sha256', secretKey)
  .update(stringToSign)
  .digest('hex')
  .toUpperCase();

console.log(hash);
```

```bash
# Run script
bun run generate-2c2p-hash.js
# Copy the output hash
```

#### Step 3: Send Webhook Request

```bash
HASH="your-generated-hash"

curl -X POST http://localhost:3000/api/webhooks/2c2p \
  -H "Content-Type: application/json" \
  -d '{
    "version": "9.9",
    "merchant_id": "JT01",
    "order_id": "your-order-id",
    "currency": "764",
    "amount": "000000010000",
    "transaction_ref": "2C2P20240101123456",
    "payment_status": "000",
    "channel_response_code": "00",
    "masked_pan": "411111XXXXXX1111",
    "payment_scheme": "VISA",
    "hash_value": "'$HASH'"
  }'
```

### Testing Failed Payments

#### PromptPay Failed Payment

```bash
curl -X POST http://localhost:3000/api/webhooks/promptpay \
  -H "Content-Type: application/json" \
  -H "X-PromptPay-Signature: $SIGNATURE" \
  -d '{
    "transactionId": "PP20240101123456790",
    "amount": 100.00,
    "currency": "THB",
    "status": "failed",
    "referenceId": "your-payment-id",
    "timestamp": "2024-01-01T12:00:00Z",
    "merchantId": "0812345678",
    "errorCode": "INSUFFICIENT_FUNDS",
    "errorMessage": "Insufficient funds"
  }'
```

#### 2C2P Failed Payment

```bash
curl -X POST http://localhost:3000/api/webhooks/2c2p \
  -H "Content-Type: application/json" \
  -d '{
    "version": "9.9",
    "merchant_id": "JT01",
    "order_id": "your-order-id",
    "currency": "764",
    "amount": "000000010000",
    "transaction_ref": "2C2P20240101123457",
    "payment_status": "001",
    "channel_response_code": "05",
    "channel_response_desc": "Do not honor",
    "hash_value": "'$HASH'"
  }'
```

## Automated Testing

### Integration Test Example

```typescript
// api/src/__test__/webhook-integration.test.ts
import { describe, test, expect, beforeAll } from 'bun:test';
import crypto from 'crypto';

describe('Webhook Integration Tests', () => {
  const baseUrl = 'http://localhost:3000';
  
  function generatePromptPaySignature(payload: any, secret: string): string {
    const payloadString = JSON.stringify(payload);
    return crypto.createHmac('sha256', secret)
      .update(payloadString)
      .digest('hex');
  }
  
  test('PromptPay webhook - successful payment', async () => {
    const payload = {
      transactionId: 'PP20240101123456789',
      amount: 100.00,
      currency: 'THB',
      status: 'success',
      referenceId: 'test-payment-id',
      timestamp: new Date().toISOString(),
      merchantId: process.env.PROMPTPAY_MERCHANT_ID
    };
    
    const signature = generatePromptPaySignature(
      payload,
      process.env.PROMPTPAY_WEBHOOK_SECRET!
    );
    
    const response = await fetch(`${baseUrl}/api/webhooks/promptpay`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-PromptPay-Signature': signature
      },
      body: JSON.stringify(payload)
    });
    
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.success).toBe(true);
  });
  
  test('PromptPay webhook - invalid signature', async () => {
    const payload = {
      transactionId: 'PP20240101123456789',
      amount: 100.00,
      currency: 'THB',
      status: 'success',
      referenceId: 'test-payment-id',
      timestamp: new Date().toISOString(),
      merchantId: process.env.PROMPTPAY_MERCHANT_ID
    };
    
    const response = await fetch(`${baseUrl}/api/webhooks/promptpay`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-PromptPay-Signature': 'invalid-signature'
      },
      body: JSON.stringify(payload)
    });
    
    expect(response.status).toBe(401);
  });
});
```

### Running Tests

```bash
# Run webhook tests
bun test webhook-integration.test.ts

# Run all payment tests
bun test --grep payment

# Run with verbose output
bun test --verbose webhook-integration.test.ts
```

## Troubleshooting

### Issue: Signature Verification Failed

**Symptoms**: Webhook returns 401 Unauthorized

**Debug Steps**:

```bash
# 1. Check webhook secret
echo $PROMPTPAY_WEBHOOK_SECRET
echo $TWOC2P_SECRET_KEY

# 2. Enable debug logging
LOG_LEVEL=debug bun run dev

# 3. Check signature generation
# Add console.log in your signature generation code

# 4. Compare signatures
# Log both expected and received signatures
```

**Common Causes**:
- Incorrect webhook secret
- Payload modification (whitespace, encoding)
- Wrong signature algorithm
- Missing or incorrect headers

### Issue: Webhook Not Reaching Server

**Symptoms**: No webhook logs, payment status not updating

**Debug Steps**:

```bash
# 1. Check server is running
curl http://localhost:3000/health

# 2. Test webhook endpoint directly
curl -X POST http://localhost:3000/api/webhooks/promptpay \
  -H "Content-Type: application/json" \
  -d '{"test": "data"}'

# 3. Check ngrok tunnel
curl https://your-ngrok-url.ngrok.io/api/webhooks/promptpay

# 4. Check firewall rules
# Ensure port 3000 is accessible

# 5. Check webhook URL in provider settings
# Verify URL is correct and accessible
```

### Issue: Duplicate Webhook Processing

**Symptoms**: Payment processed multiple times

**Debug Steps**:

```bash
# Check for duplicate transaction IDs in database
psql -d your_database -c "
  SELECT transaction_id, COUNT(*) 
  FROM payments 
  GROUP BY transaction_id 
  HAVING COUNT(*) > 1;
"

# Review webhook logs for duplicates
grep "transactionId" logs/webhook.log | sort | uniq -c
```

**Solution**: Ensure idempotency check is working:

```typescript
// In webhook handler
const existingPayment = await getPaymentByTransactionId(transactionId);
if (existingPayment && existingPayment.status !== 'pending') {
  // Already processed, return success
  return { success: true, message: 'Already processed' };
}
```

### Issue: Webhook Timeout

**Symptoms**: Provider reports webhook timeout, but processing succeeds

**Debug Steps**:

```bash
# Check webhook processing time
grep "webhook processing time" logs/app.log

# Identify slow operations
# - Database queries
# - Email sending
# - External API calls
```

**Solution**: Process webhooks asynchronously:

```typescript
// Return 200 immediately, process in background
app.post('/api/webhooks/promptpay', async (c) => {
  const payload = await c.req.json();
  
  // Verify signature
  if (!verifySignature(payload, signature)) {
    return c.json({ error: 'Invalid signature' }, 401);
  }
  
  // Return success immediately
  c.status(200);
  
  // Process asynchronously
  processWebhookAsync(payload).catch(err => {
    logger.error('Webhook processing failed', err);
  });
  
  return c.json({ success: true });
});
```

### Issue: Webhook Payload Parsing Error

**Symptoms**: Error parsing webhook JSON

**Debug Steps**:

```bash
# Log raw webhook body
# Add to webhook handler:
console.log('Raw body:', await c.req.text());

# Check content-type header
# Should be application/json

# Validate JSON structure
echo '{"your": "payload"}' | jq .
```

## Best Practices

1. **Always verify signatures** before processing webhooks
2. **Implement idempotency** using transaction IDs
3. **Return 200 OK quickly** (within 5 seconds)
4. **Log all webhook attempts** for debugging
5. **Handle duplicate webhooks** gracefully
6. **Use HTTPS in production** for security
7. **Monitor webhook failures** and set up alerts
8. **Test with real providers** before going live
9. **Document your webhook URLs** for provider support
10. **Keep webhook secrets secure** and rotate regularly

## Additional Resources

- [PromptPay Technical Documentation](https://www.bot.or.th/Thai/PaymentSystems/StandardPS/Pages/PromptPay.aspx)
- [2C2P Developer Documentation](https://developer.2c2p.com)
- [ngrok Documentation](https://ngrok.com/docs)
- [HMAC-SHA256 Specification](https://tools.ietf.org/html/rfc2104)

---

**Last Updated**: 2024-01-01  
**Version**: 1.0  
**Maintained By**: Development Team
