/**
 * Netlify Function: stripe-webhook
 *
 * Stripe calls this after a successful payment.
 * It decrements the inventory in Supabase.
 *
 * Required environment variables:
 *   STRIPE_WEBHOOK_SECRET   — from Stripe dashboard → Webhooks → your endpoint → Signing secret
 *   STRIPE_SECRET_KEY       — your Stripe secret key
 *   SUPABASE_URL            — your Supabase project URL
 *   SUPABASE_SERVICE_KEY    — your Supabase service role key
 *
 * In the Stripe dashboard, register this webhook endpoint:
 *   https://YOUR-SITE.netlify.app/.netlify/functions/stripe-webhook
 * and listen for the event: checkout.session.completed
 */

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
);

exports.handler = async (event) => {
  const sig = event.headers['stripe-signature'];

  let stripeEvent;
  try {
    stripeEvent = stripe.webhooks.constructEvent(
      event.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET,
    );
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return { statusCode: 400, body: `Webhook Error: ${err.message}` };
  }

  if (stripeEvent.type === 'checkout.session.completed') {
    const session  = stripeEvent.data.object;
    const productId = session.metadata?.productId;
    const quantity  = parseInt(session.metadata?.quantity || '1', 10);

    if (!productId) {
      console.warn('No productId in session metadata');
      return { statusCode: 200, body: 'ok' };
    }

    // Decrement remaining_slots using Supabase RPC (atomic)
    const { error } = await supabase.rpc('decrement_slots', {
      p_product_id: productId,
      p_amount: quantity,
    });

    if (error) {
      console.error('Failed to decrement slots:', error);
      // Return 200 so Stripe doesn't retry — log the issue separately
    } else {
      console.log(`Decremented ${quantity} slot(s) for product ${productId}`);
    }
  }

  return { statusCode: 200, body: 'ok' };
};
