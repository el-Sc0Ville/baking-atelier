-- ============================================================
-- Baking Atelier — Supabase Database Setup
-- Run this in: Supabase dashboard → SQL Editor → New query
-- ============================================================

-- 1. PRODUCTS TABLE
create table if not exists products (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  description     text,
  price_cents     integer not null,   -- price in cents (e.g. 1400 = $14.00)
  total_slots     integer not null,   -- total quantity available per cycle
  remaining_slots integer not null,   -- decremented on each order
  image_url       text,               -- direct image URL
  tag             text,               -- optional badge label (e.g. "Fan favourite")
  active          boolean default true,
  sort_order      integer default 0,  -- lower = shown first
  created_at      timestamptz default now()
);

-- 2. Row Level Security — public can READ, only service role can WRITE
alter table products enable row level security;

create policy "Public read" on products
  for select using (true);

-- Service role key (used by Netlify functions) bypasses RLS automatically.
-- No additional write policy needed for service role.


-- 3. ORDERS TABLE (optional — for your own records)
create table if not exists orders (
  id               uuid primary key default gen_random_uuid(),
  stripe_session_id text unique,
  product_id       uuid references products(id),
  quantity         integer,
  customer_name    text,
  customer_email   text,
  notes            text,
  status           text default 'pending',  -- pending | paid | cancelled
  created_at       timestamptz default now()
);

alter table orders enable row level security;
-- Orders are private — no public read policy


-- 4. ATOMIC DECREMENT FUNCTION
-- Called by the webhook to safely decrement remaining_slots
create or replace function decrement_slots(p_product_id uuid, p_amount integer)
returns void
language plpgsql
security definer
as $$
begin
  update products
  set remaining_slots = greatest(0, remaining_slots - p_amount)
  where id = p_product_id;
end;
$$;


-- 5. SAMPLE PRODUCTS (delete or edit before going live)
insert into products (name, description, price_cents, total_slots, remaining_slots, image_url, tag, sort_order)
values
  (
    'Classic Cream Scones',
    'Our signature scones — flaky, buttery, and perfectly golden. Served with jam & clotted cream recipe card.',
    1400, 12, 12,
    'https://images.unsplash.com/photo-1589302168068-964664d93dc0?w=600&h=420&fit=crop',
    'Fan favourite', 1
  ),
  (
    'Lemon Blueberry Scones',
    'Bright lemon zest folded through a tender crumb, studded with fresh wild blueberries. A seasonal treat.',
    1600, 8, 8,
    'https://images.unsplash.com/photo-1563729784474-d77dbb933a9e?w=600&h=420&fit=crop',
    'Seasonal', 2
  ),
  (
    'Vanilla Bean Cupcakes',
    'Light vanilla sponge topped with Swiss meringue buttercream and a sprinkle of vanilla bean caviar.',
    500, 24, 24,
    'https://images.unsplash.com/photo-1614707267537-b85aaf00c4b7?w=600&h=420&fit=crop',
    null, 3
  ),
  (
    'Chocolate Ganache Cake',
    'A rich, dense chocolate cake draped in glossy dark chocolate ganache. Serves 8–10. Pre-order required.',
    7500, 3, 3,
    'https://images.unsplash.com/photo-1578985545062-69928b1d9587?w=600&h=420&fit=crop',
    'Whole cake', 4
  );
