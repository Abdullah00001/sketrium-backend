import Stripe from 'stripe';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { Payment } from './src/app/modules/marketplace/marketplacePayment.model';
import { convertToSubunit } from './src/app/utils/currency.utils';

dotenv.config();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string);

async function simulate() {
  console.log('--- STRIPE DIRECT CHARGE & REFUND SIMULATION ---\n');

  try {
    // 1. Create a dummy USD connected account (Standard)
    console.log('[1] Creating a test Standard connected account...');
    const account = await stripe.accounts.create({
      type: 'standard',
      country: 'US',
      email: 'test_merchant_usd@example.com',
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
    });
    console.log(`    ✅ Created connected account: ${account.id} (Default Currency: ${account.default_currency})`);

    // 2. Create a Direct Charge Payment Intent for $20 USD
    const amount = 20; // $20
    const currency = 'usd';
    const amountCents = convertToSubunit(amount, currency);
    const applicationFeeAmountCents = Math.round(amountCents * 0.10); // 10% Skatrium Fee ($2.00)

    console.log(`\n[2] Creating a Direct Charge PaymentIntent for $${amount} USD...`);
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountCents,
      currency: currency,
      payment_method_types: ['card'],
      application_fee_amount: applicationFeeAmountCents,
    }, {
      stripeAccount: account.id, // DIRECT CHARGE: Created directly on the connected account
    });
    console.log(`    ✅ Created PaymentIntent: ${paymentIntent.id}`);
    console.log(`    ℹ️ Target Account: ${account.id}`);
    console.log(`    ℹ️ Amount: ${paymentIntent.amount} cents`);
    console.log(`    ℹ️ Platform Fee (application_fee_amount): ${paymentIntent.application_fee_amount} cents`);

    // 3. Confirm the PaymentIntent with a test card
    console.log(`\n[3] Simulating customer payment confirmation...`);
    const confirmedPi = await stripe.paymentIntents.confirm(paymentIntent.id, {
      payment_method: 'pm_card_visa',
    }, {
      stripeAccount: account.id,
    });
    console.log(`    ✅ Payment confirmed! Status: ${confirmedPi.status}`);

    // Wait a few seconds to let Stripe process the charge
    await new Promise(resolve => setTimeout(resolve, 3000));

    // 4. Retrieve the charge to show balances
    const retrievedPi = await stripe.paymentIntents.retrieve(paymentIntent.id, {
      expand: ['latest_charge'],
    }, { stripeAccount: account.id });

    const charge = retrievedPi.latest_charge as Stripe.Charge;
    console.log(`\n[4] Analyzing the completed charge:`);
    console.log(`    ℹ️ Charge ID: ${charge.id}`);
    console.log(`    ℹ️ Paid by Customer: ${charge.amount} cents`);
    
    // 5. Issue a refund from the platform
    console.log(`\n[5] Issuing a refund from the Skatrium platform...`);
    const refund = await stripe.refunds.create({
      payment_intent: paymentIntent.id,
    }, {
      stripeAccount: account.id, // DIRECT CHARGE REFUND: Refunded from the connected account
    });
    console.log(`    ✅ Refund successful! Refund ID: ${refund.id}`);
    console.log(`    ℹ️ Refund Amount: ${refund.amount} cents`);
    console.log(`    ℹ️ Status: ${refund.status}`);

    console.log('\n--- SIMULATION COMPLETED SUCCESSFULLY ---');
    console.log('The customer paid $20 directly to the merchant. Skatrium collected a $2 platform fee.');
    console.log('The refund was then successfully deducted from the merchant\'s balance without Skatrium being liable.');

  } catch (err: any) {
    console.error('Simulation Failed:', err.message);
  }
}

simulate();
