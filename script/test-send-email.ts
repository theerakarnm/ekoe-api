import { emailService } from '../src/core/email';

(async () => {
  await emailService.sendPaymentConfirmationEmail(
    'gmgamer50280@gmail.com',
    'orderNumber',
    100,
    'THB',
    'PromptPay',
    'transactionIdtest'
  );
})()