/**
 * Netlify Function: create-checkout
 *
 * Called by the frontend when a customer clicks "Continue to payment".
 * Creates a Stripe Checkout session and returns the checkout URL.
 *
 * Required environment variables (set in Netlify dashboard → Site settings → Environment):
 *   STRIPE_SECRET_KEY       — your Stripe secret key (sk_live_... or sk_test_...)
 *   SUPABASE_URL            — your Supabase project URL
 *   SUPABASE_SERVICE_KEY    — your Supabase service role key (NOT the anon key)
 *   CLIENT_URL              — your site's public URL (e.g. https://bakingatelier.netlify.app)
 */

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
);

exports.handler = async (event) => {
  // Only allow POST
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid request body' }) };
  }

  const { productId, quantity, customerName, customerEmail, notes } = body;

  // Validate
  if (!productId || !quantity || !customerEmail) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing required fields' }) };
  }

  // 1. Fetch product from Supabase
  const { data: product, error: fetchError } = await supabase
    .from('products')
    .select('*')
    .eq('id', productId)
    .single();

  if (fetchError || !product) {
    return { statusCode: 404, body: JSON.stringify({ error: 'Product not found' }) };
  }

  // 2. Check inventory
  if (product.remaining_slots < quantity) {
    return {
      statusCode: 409,
      body: JSON.stringify({
        error: `Only ${product.remaining_slots} slot(s) left for this item.`,
      }),
    };
  }

  // 3. Create Stripe Checkout session
  const clientUrl = process.env.CLIENT_URL || 'http://localhost:8888';

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    mode: 'payment',
    customer_email: customerEmail,
    line_items: [
      {
        price_data: {
          currency: 'cad',
          unit_amount: product.price_cents,
          product_data: {
            name: product.name,
            description: product.description,
            images: product.image_url ? [product.image_url] : [],
          },
        },
        quantity,
      },
    ],
    metadata: {
      productId,
      quantity: String(quantity),
      customerName,
      notes: notes || '',
    },
    success_url: `${clientUrl}/?success=1`,
    cancel_url:  `${clientUrl}/#menu`,
  });

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ checkoutUrl: session.url }),
  };
};
