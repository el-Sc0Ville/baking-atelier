# Baking Atelier — Setup Guide

Five steps to go from these files to a live, working storefront.

---

## Step 1 — Create a Supabase account (free)

1. Go to **https://supabase.com** → Sign up (free, no credit card)
2. Create a new project (pick a name like `baking-atelier`)
3. Go to **SQL Editor** → paste the contents of `supabase-setup.sql` → Run
4. Go to **Settings → API** and copy:
   - **Project URL** → paste into `index.html` where it says `YOUR_SUPABASE_URL`
   - **anon / public key** → paste into `index.html` where it says `YOUR_SUPABASE_ANON_KEY`
   - **service_role key** → save this for Step 3 (Netlify env variables — never put it in the HTML)

---

## Step 2 — Create a Stripe account (free)

1. Go to **https://stripe.com** → Create account
2. In the dashboard, make sure you're in **Test mode** first (toggle in top left)
3. Go to **Developers → API keys** and copy your **Secret key** (starts with `sk_test_…`)
4. Later, when ready to take real payments, switch to **Live mode** and use the live key

---

## Step 3 — Deploy to Netlify (free)

1. Go to **https://netlify.com** → Sign up (free, no GitHub needed)
2. Click **Add new site → Deploy manually**
3. **Drag and drop** the entire `baking-atelier` folder onto the page — Netlify will give you an instant public URL
4. Go to **Site settings → Environment variables** and add:

| Variable name           | Value                              |
|-------------------------|------------------------------------|
| `STRIPE_SECRET_KEY`     | your Stripe secret key             |
| `STRIPE_WEBHOOK_SECRET` | (set after step 4)                 |
| `SUPABASE_URL`          | your Supabase project URL          |
| `SUPABASE_SERVICE_KEY`  | your Supabase service role key     |
| `CLIENT_URL`            | your Netlify site URL (e.g. https://bakingatelier.netlify.app) |

4. Click **Deploy site**. Your site will be live in ~60 seconds.

---

## Step 4 — Register the Stripe webhook

1. In Stripe dashboard → **Developers → Webhooks → Add endpoint**
2. Endpoint URL: `https://YOUR-SITE.netlify.app/.netlify/functions/stripe-webhook`
3. Events to listen for: `checkout.session.completed`
4. Copy the **Signing secret** → go back to Netlify → add it as `STRIPE_WEBHOOK_SECRET`
5. Trigger a redeploy in Netlify (Site settings → Deploys → Trigger deploy)

---

## Step 5 — Customize the content

### Products
- Edit products directly in **Supabase → Table Editor → products**
- To add a product: click **Insert row**, fill in the columns
- To mark something sold out: set `remaining_slots` to `0`
- To hide an item: set `active` to `false`
- The site reads inventory live — changes appear immediately

### Text & branding
Open `index.html` in any text editor and search for these comments:

- `CHANGE the handle below` — update the Instagram username and link
- `CHANGE @yourusername` — appears twice (nav and footer)
- `CHANGE to real email` — update the contact email in the footer
- `PICKUP_LOCATION` in the `CONFIG` object — update pick-up address/times

### FAQ
Edit the `faqData` array in `index.html` (around line 400). Each item has a `q` (question) and `a` (answer).

### Instagram posts
In the Instagram section, replace the `.ig-placeholder` divs with real Instagram embed codes:
1. Open a post on instagram.com in a browser
2. Click the **⋯** menu → **Embed**
3. Copy the `<blockquote>` code
4. Wrap it in `<div class="ig-embed-wrap">…</div>` and replace one of the placeholder divs
5. Uncomment the Instagram embed script at the bottom of `index.html`

**Automated Instagram feed (optional):** Sign up for a free account at
**https://snapwidget.com** or **https://elfsight.com** — they provide a small embed
code that shows your latest posts automatically.

---

## Going live (real payments)

1. In Stripe, switch to **Live mode**
2. Update `STRIPE_SECRET_KEY` in Netlify to your live key (`sk_live_…`)
3. Register a new webhook endpoint in Stripe Live mode (same URL, same event)
4. Update `STRIPE_WEBHOOK_SECRET` in Netlify
5. Trigger a redeploy

---

## Managing inventory week to week

At the start of each week:
1. Log in to Supabase → Table Editor → products
2. Reset `remaining_slots` to the amount you want to offer
3. Add or hide items by toggling `active`

That's it — the site updates instantly.
