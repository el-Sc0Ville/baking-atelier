/**
 * Vercel Serverless Function: submit-order
 *
 * Called when a customer submits an order (no payment required).
 * - Checks inventory
 * - Saves the order to Supabase
 * - Decrements remaining_slots
 * - Sends email notifications to the baker and the customer
 *
 * Required environment variables (Vercel dashboard → Project → Settings → Environment Variables):
 *   SUPABASE_URL          — your Supabase project URL
 *   SUPABASE_SERVICE_KEY  — your Supabase service role key
 *   RESEND_API_KEY        — from resend.com (free account, 100 emails/day)
 *   BAKER_EMAIL           — the email address that receives new order notifications
 *   BAKING_SITE_NAME      — e.g. "Baking Atelier" (used in email subjects)
 */

const { createClient } = require('@supabase/supabase-js');

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const BAKER_EMAIL    = process.env.BAKER_EMAIL  || 'hello@bakingatelier.com';
const SITE_NAME      = process.env.BAKING_SITE_NAME || 'Baking Atelier';

module.exports = async (req, res) => {
  // CORS headers (same-origin in production, useful during local testing)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Initialise Supabase inside the handler so env-var errors are caught cleanly
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
      console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY env vars');
      return res.status(500).json({ error: 'Server configuration error: Supabase env vars not set' });
    }

    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY,
    );

    // Parse body — Vercel auto-parses JSON, but guard against edge cases
    let body = req.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch { body = {}; }
    }

    const { productId, quantity, customerName, customerEmail, notes } = body || {};

    console.log('Order attempt:', { productId, quantity, customerName, customerEmail });

    if (!productId || !quantity || !customerName || !customerEmail) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // 1. Fetch product
    const { data: product, error: fetchError } = await supabase
      .from('products')
      .select('*')
      .eq('id', productId)
      .single();

    if (fetchError) {
      console.error('Product fetch error:', JSON.stringify(fetchError));
      return res.status(404).json({ error: 'Product not found. Detail: ' + (fetchError.message || JSON.stringify(fetchError)) });
    }
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    // 2. Check inventory
    if (product.remaining_slots < quantity) {
      return res.status(409).json({
        error: `Sorry, only ${product.remaining_slots} slot(s) left for this item.`,
      });
    }

    const totalCents = product.price_cents * quantity;
    const totalStr   = `$${(totalCents / 100).toFixed(2)} CAD`;

    // 3. Save order to Supabase
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert({
        product_id:     productId,
        quantity,
        customer_name:  customerName,
        customer_email: customerEmail,
        notes:          notes || '',
        status:         'pending',
      })
      .select()
      .single();

    if (orderError) {
      console.error('Order insert error:', JSON.stringify(orderError));
      return res.status(500).json({ error: 'Could not save order: ' + (orderError.message || JSON.stringify(orderError)) });
    }

    // 4. Decrement slots
    const { error: decrError } = await supabase.rpc('decrement_slots', {
      p_product_id: productId,
      p_amount:     quantity,
    });

    if (decrError) {
      console.error('Slot decrement error:', JSON.stringify(decrError));
      // Order is saved — log the issue but don't fail the response
    }

    // 5. Send emails via Resend
    if (RESEND_API_KEY) {
      const orderRef = order.id.slice(0, 8).toUpperCase();

      // Email to baker
      await sendEmail({
        to:      BAKER_EMAIL,
        subject: `New order #${orderRef} — ${product.name}`,
        html: `
          <h2>New order received!</h2>
          <table style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:14px;">
            <tr><td style="padding:6px 16px 6px 0;color:#8a7060;"><strong>Order #</strong></td><td>${orderRef}</td></tr>
            <tr><td style="padding:6px 16px 6px 0;color:#8a7060;"><strong>Product</strong></td><td>${product.name}</td></tr>
            <tr><td style="padding:6px 16px 6px 0;color:#8a7060;"><strong>Quantity</strong></td><td>${quantity}</td></tr>
            <tr><td style="padding:6px 16px 6px 0;color:#8a7060;"><strong>Total</strong></td><td>${totalStr}</td></tr>
            <tr><td style="padding:6px 16px 6px 0;color:#8a7060;"><strong>Customer</strong></td><td>${customerName}</td></tr>
            <tr><td style="padding:6px 16px 6px 0;color:#8a7060;"><strong>Email</strong></td><td><a href="mailto:${customerEmail}">${customerEmail}</a></td></tr>
            ${notes ? `<tr><td style="padding:6px 16px 6px 0;color:#8a7060;"><strong>Notes</strong></td><td>${notes}</td></tr>` : ''}
          </table>
          <p style="margin-top:20px;color:#4a3525;">
            Reply to this email or send an Interac e-transfer request to <strong>${customerEmail}</strong> for <strong>${totalStr}</strong>.
          </p>
        `,
      });

      // Confirmation email to customer
      await sendEmail({
        to:      customerEmail,
        subject: `Your order is confirmed — ${SITE_NAME}`,
        html: `
          <div style="font-family:Georgia,serif;max-width:520px;margin:0 auto;color:#2c1f14;">
            <h2 style="color:#4a3525;">Thank you, ${customerName}!</h2>
            <p>Your order has been received. Here's a summary:</p>
            <table style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:14px;margin:16px 0;">
              <tr><td style="padding:6px 16px 6px 0;color:#8a7060;"><strong>Product</strong></td><td>${product.name}</td></tr>
              <tr><td style="padding:6px 16px 6px 0;color:#8a7060;"><strong>Quantity</strong></td><td>${quantity}</td></tr>
              <tr><td style="padding:6px 16px 6px 0;color:#8a7060;"><strong>Total</strong></td><td>${totalStr}</td></tr>
              ${notes ? `<tr><td style="padding:6px 16px 6px 0;color:#8a7060;"><strong>Notes</strong></td><td>${notes}</td></tr>` : ''}
            </table>
            <p>I'll be in touch shortly to confirm pick-up details and arrange payment by Interac e-transfer or cash at pick-up.</p>
            <p style="margin-top:24px;color:#8a7060;font-size:13px;">— ${SITE_NAME}</p>
          </div>
        `,
      });
    }

    return res.status(200).json({ success: true, orderRef: order.id.slice(0, 8).toUpperCase() });

  } catch (err) {
    console.error('Unhandled exception in submit-order:', err);
    return res.status(500).json({ error: 'Unexpected error: ' + err.message });
  }
};

async function sendEmail({ to, subject, html }) {
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method:  'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({
        from:    'Baking Atelier <orders@resend.dev>',  // update once you have a domain
        to:      [to],
        subject,
        html,
      }),
    });
    if (!response.ok) console.error('Resend error:', await response.text());
  } catch (err) {
    console.error('Email send failed:', err.message);
  }
}
