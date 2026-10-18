-- 000001_init: consolidated schema baseline.
--
-- This single migration replaces the original 000001..000007 chain (gym flow,
-- money-to-paise conversion, catalog rework, chat/push, locality perimeters,
-- notification states, sort-order removal). It reproduces the schema those
-- migrations produced, with the legacy churn removed: no dropped-then-created
-- columns, no stale constraint/PK/sequence names, no retired catalog rows.
-- The schema is byte-for-byte equivalent (same column types, nullability,
-- defaults, CHECKs, FKs, partial indexes), so existing databases need no DDL.
--
-- !! REQUIRED ONE-TIME STEP for databases built by the old chain !!
--
-- golang-migrate refuses to run when the recorded version has no file:
--     no migration found for version 7: file does not exist
-- So before shipping this migration set to an existing environment, reset its
-- bookkeeping to the baseline version (no DDL is executed either way):
--
--     psql "$DATABASE_URL" -c "UPDATE schema_migrations SET version = 1, dirty = false"
--     # or: migrate -path internal/db/migrations -database "$DATABASE_URL" force 1
--
-- Ordering matters: do the reset and the deploy back-to-back. While the
-- environment records version 1 but still runs the OLD binary, a restart of
-- that old binary would try to re-apply 000002..000007, fail on the first
-- existing table, and leave the version dirty (re-run the reset to clear it).
--
-- Fresh databases just run this — no manual step.

BEGIN;

-- ============ Service areas ============
-- `perimeters` is the service-area boundary stored as plain JSONB (no
-- PostGIS, so managed Postgres stays an option): an array of polygon rings,
-- each ring an array of [lat, lng] pairs. Overlap validation runs in Go.
CREATE TABLE localities (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    city VARCHAR(100) NOT NULL DEFAULT 'Hyderabad',
    is_active BOOLEAN DEFAULT TRUE,
    perimeters JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============ Staff ============
CREATE TABLE admins (
    id BIGSERIAL PRIMARY KEY,
    phone VARCHAR(15) NOT NULL UNIQUE,
    name VARCHAR(255),
    role TEXT NOT NULL DEFAULT 'operations_admin',
    locality_id BIGINT REFERENCES localities(id),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_admins_phone ON admins(phone);

CREATE TABLE delivery_partners (
    id BIGSERIAL PRIMARY KEY,
    phone VARCHAR(15) NOT NULL UNIQUE,
    name VARCHAR(255),
    admin_id BIGINT REFERENCES admins(id),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_delivery_partners_phone ON delivery_partners(phone);
CREATE INDEX idx_delivery_partners_admin ON delivery_partners(admin_id);

-- ============ Customers ============
CREATE TABLE users (
    id BIGSERIAL PRIMARY KEY,
    phone VARCHAR(15) NOT NULL UNIQUE,
    name VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_users_phone ON users(phone);

CREATE TABLE addresses (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    label VARCHAR(100),
    address_line TEXT NOT NULL,
    landmark VARCHAR(255),
    locality_id BIGINT REFERENCES localities(id),
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    accuracy_m DOUBLE PRECISION,
    instructions TEXT,
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_addresses_user ON addresses(user_id);

-- ============ Catalog ============
-- `products` holds the marketing content; `product_variants` holds the
-- sellable SKUs (one per size) that order items reference.
CREATE TABLE products (
    id BIGSERIAL PRIMARY KEY,
    slug VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(100),
    image_url TEXT,
    ingredients TEXT[] NOT NULL DEFAULT '{}',
    nutrition JSONB NOT NULL DEFAULT '{}',
    tags TEXT[] NOT NULL DEFAULT '{}',
    is_featured BOOLEAN NOT NULL DEFAULT FALSE,
    is_available BOOLEAN NOT NULL DEFAULT TRUE,
    archived_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX idx_products_slug ON products(slug) WHERE archived_at IS NULL;
CREATE INDEX idx_products_category ON products(category) WHERE archived_at IS NULL;

CREATE TABLE product_variants (
    id BIGSERIAL PRIMARY KEY,
    product_id BIGINT NOT NULL REFERENCES products(id),
    slug VARCHAR(255),
    size_label VARCHAR(100),
    unit VARCHAR(50),
    price_paise BIGINT NOT NULL,
    is_available BOOLEAN DEFAULT TRUE,
    archived_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_product_variants_product ON product_variants(product_id);
CREATE UNIQUE INDEX idx_product_variants_slug ON product_variants(slug) WHERE archived_at IS NULL;

-- ============ Operating settings (singleton row) ============
CREATE TABLE operating_settings (
    id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    cutoff_minutes INT NOT NULL DEFAULT 0 CHECK (cutoff_minutes >= 0 AND cutoff_minutes < 1440),
    delivery_window_start VARCHAR(5) NOT NULL DEFAULT '06:00',
    delivery_window_end VARCHAR(5) NOT NULL DEFAULT '10:00',
    business_timezone VARCHAR(64) NOT NULL DEFAULT 'Asia/Kolkata',
    tracking_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by BIGINT REFERENCES admins(id)
);

-- ============ Daily order batches ============
-- One batch per order date; closing a batch freezes the day's orders and
-- their delivery date.
CREATE TABLE order_batches (
    id BIGSERIAL PRIMARY KEY,
    order_date DATE NOT NULL UNIQUE,
    delivery_date DATE NOT NULL,
    cutoff_policy TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
    closed_at TIMESTAMPTZ,
    closed_by BIGINT REFERENCES admins(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_order_batches_delivery ON order_batches(delivery_date);

-- ============ Orders ============
-- Order codes and package tokens are generated on demand, so they are
-- nullable with partial unique indexes. Ship-to fields are snapshotted at
-- placement: the customer's address can change later without rewriting
-- history.
CREATE TABLE orders (
    id BIGSERIAL PRIMARY KEY,
    code VARCHAR(20),
    package_token VARCHAR(64),
    user_id BIGINT NOT NULL REFERENCES users(id),
    batch_id BIGINT REFERENCES order_batches(id),
    delivery_date DATE NOT NULL,
    status TEXT DEFAULT 'placed' CHECK (
        status IN ('placed', 'confirmed', 'preparing', 'ready', 'assigned',
                   'picked_up', 'out_for_delivery', 'delivered',
                   'cancelled', 'delivery_failed')
    ),
    payment_method TEXT NOT NULL DEFAULT 'cash_on_delivery',
    total_amount_paise BIGINT NOT NULL,
    ship_address_line TEXT,
    ship_landmark VARCHAR(255),
    ship_locality_id BIGINT REFERENCES localities(id),
    ship_latitude DOUBLE PRECISION,
    ship_longitude DOUBLE PRECISION,
    ship_accuracy_m DOUBLE PRECISION,
    ship_instructions TEXT,
    delivery_partner_id BIGINT REFERENCES delivery_partners(id),
    assigned_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    delivery_note TEXT,
    failure_reason TEXT,
    updated_by_actor VARCHAR(20),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE UNIQUE INDEX idx_orders_code ON orders(code) WHERE code IS NOT NULL;
CREATE UNIQUE INDEX idx_orders_package_token ON orders(package_token) WHERE package_token IS NOT NULL;
CREATE INDEX idx_orders_user ON orders(user_id);
CREATE INDEX idx_orders_batch ON orders(batch_id);
CREATE INDEX idx_orders_delivery_date ON orders(delivery_date);
CREATE INDEX idx_orders_delivery_partner ON orders(delivery_partner_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_created ON orders(created_at);

CREATE TABLE order_items (
    id BIGSERIAL PRIMARY KEY,
    order_id BIGINT NOT NULL REFERENCES orders(id),
    variant_id BIGINT NOT NULL REFERENCES product_variants(id),
    quantity INT NOT NULL,
    unit_price_paise BIGINT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_order_items_order ON order_items(order_id);

-- Append-only audit trail of every order transition.
CREATE TABLE order_status_history (
    id BIGSERIAL PRIMARY KEY,
    order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    from_status TEXT,
    to_status TEXT NOT NULL,
    actor_type VARCHAR(20) NOT NULL CHECK (actor_type IN ('customer', 'admin', 'partner', 'system')),
    actor_id BIGINT,
    note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_order_status_history_order ON order_status_history(order_id);

-- ============ Delivery runs and ordered stops ============
CREATE TABLE delivery_runs (
    id BIGSERIAL PRIMARY KEY,
    batch_id BIGINT NOT NULL REFERENCES order_batches(id),
    delivery_date DATE NOT NULL,
    name VARCHAR(255),
    partner_id BIGINT REFERENCES delivery_partners(id),
    status TEXT NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'assigned', 'dispatched', 'in_progress', 'completed', 'reconciled', 'cancelled')),
    assigned_at TIMESTAMPTZ,
    dispatched_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    reconciled_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_delivery_runs_batch ON delivery_runs(batch_id);
CREATE INDEX idx_delivery_runs_partner ON delivery_runs(partner_id);
CREATE INDEX idx_delivery_runs_status ON delivery_runs(status);
CREATE INDEX idx_delivery_runs_date ON delivery_runs(delivery_date);

CREATE TABLE run_stops (
    id BIGSERIAL PRIMARY KEY,
    run_id BIGINT NOT NULL REFERENCES delivery_runs(id) ON DELETE CASCADE,
    order_id BIGINT NOT NULL REFERENCES orders(id),
    position INT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'in_progress', 'delivered', 'failed', 'skipped')),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    collected_amount_paise BIGINT,
    failure_reason TEXT,
    note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_run_stops_run ON run_stops(run_id);
CREATE INDEX idx_run_stops_order ON run_stops(order_id);
CREATE UNIQUE INDEX idx_run_stops_position ON run_stops(run_id, position);
-- An open stop (pending/in_progress) blocks its order from joining another run.
CREATE UNIQUE INDEX idx_run_stops_open_order ON run_stops(order_id) WHERE status IN ('pending', 'in_progress');

-- ============ Partner GPS tracking ============
-- Pruned periodically by the server; `run_id` survives partner/run deletion
-- so history is never orphaned silently.
CREATE TABLE location_samples (
    id BIGSERIAL PRIMARY KEY,
    partner_id BIGINT NOT NULL REFERENCES delivery_partners(id) ON DELETE CASCADE,
    run_id BIGINT REFERENCES delivery_runs(id) ON DELETE SET NULL,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    accuracy_m DOUBLE PRECISION,
    speed_mps DOUBLE PRECISION,
    heading_deg DOUBLE PRECISION,
    recorded_at TIMESTAMPTZ NOT NULL,
    received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_location_samples_partner_time ON location_samples(partner_id, recorded_at DESC);
CREATE INDEX idx_location_samples_run ON location_samples(run_id);

-- ============ Cash reconciliation ============
CREATE TABLE cash_handovers (
    id BIGSERIAL PRIMARY KEY,
    run_id BIGINT NOT NULL UNIQUE REFERENCES delivery_runs(id),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'submitted', 'confirmed')),
    expected_paise BIGINT NOT NULL DEFAULT 0,
    submitted_paise BIGINT,
    submitted_note TEXT,
    submitted_at TIMESTAMPTZ,
    admin_id BIGINT REFERENCES admins(id),
    confirmed_paise BIGINT,
    confirmed_at TIMESTAMPTZ,
    discrepancy_paise BIGINT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_cash_handovers_status ON cash_handovers(status);

-- ============ Idempotency ============
CREATE TABLE idempotency_keys (
    key VARCHAR(128) PRIMARY KEY,
    user_id BIGINT NOT NULL,
    endpoint VARCHAR(255) NOT NULL,
    request_hash VARCHAR(64) NOT NULL,
    response JSONB,
    status_code INT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_idempotency_user ON idempotency_keys(user_id);

-- ============ Partner mobile auth ============
-- Short-lived access JWTs are stateless; refresh tokens are opaque, stored
-- hashed, rotated on use, and revoked on logout.
CREATE TABLE refresh_tokens (
    id BIGSERIAL PRIMARY KEY,
    partner_id BIGINT NOT NULL REFERENCES delivery_partners(id) ON DELETE CASCADE,
    token_hash VARCHAR(64) NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    last_used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_refresh_tokens_partner ON refresh_tokens(partner_id);

-- ============ Support chat ============
-- One thread per customer (admin-side inbox model).
CREATE TABLE chat_threads (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    last_message_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_read_by_user_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_read_by_admin_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE chat_messages (
    id BIGSERIAL PRIMARY KEY,
    thread_id BIGINT NOT NULL REFERENCES chat_threads(id) ON DELETE CASCADE,
    sender_role TEXT NOT NULL CHECK (sender_role IN ('user', 'admin')),
    sender_id BIGINT NOT NULL,
    body TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_chat_messages_thread ON chat_messages(thread_id, id);

-- ============ Web push ============
CREATE TABLE push_subscriptions (
    id BIGSERIAL PRIMARY KEY,
    role TEXT NOT NULL CHECK (role IN ('user', 'admin')),
    user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
    admin_id BIGINT REFERENCES admins(id) ON DELETE CASCADE,
    endpoint TEXT NOT NULL UNIQUE,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (
        (role = 'user' AND user_id IS NOT NULL) OR
        (role = 'admin' AND admin_id IS NOT NULL)
    )
);
CREATE INDEX idx_push_subscriptions_user ON push_subscriptions(user_id);
CREATE INDEX idx_push_subscriptions_admin ON push_subscriptions(admin_id);

-- Last-reported browser notification permission per subject. Subscription
-- rows alone cannot distinguish "never asked" from "asked and blocked".
CREATE TABLE notification_states (
    id BIGSERIAL PRIMARY KEY,
    role TEXT NOT NULL CHECK (role IN ('user', 'admin')),
    user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
    admin_id BIGINT REFERENCES admins(id) ON DELETE CASCADE,
    permission TEXT NOT NULL CHECK (permission IN ('granted', 'denied', 'default', 'unsupported')),
    reported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (
        (role = 'user' AND user_id IS NOT NULL AND admin_id IS NULL) OR
        (role = 'admin' AND admin_id IS NOT NULL AND user_id IS NULL)
    ),
    -- One row per subject. NULLS NOT DISTINCT collapses the NULL half of the
    -- (user_id, admin_id) pair so ON CONFLICT (user_id, admin_id) works.
    CONSTRAINT notification_states_subject_uk UNIQUE NULLS NOT DISTINCT (user_id, admin_id)
);

-- ============ Seed: operating settings ============
INSERT INTO operating_settings (id) VALUES (1);

-- ============ Seed: service areas around the Bachupally kitchen ============
INSERT INTO localities (name, city) VALUES
  ('Bachupally', 'Hyderabad'),
  ('Nizampet', 'Hyderabad'),
  ('Kompally', 'Hyderabad'),
  ('Kukatpally', 'Hyderabad'),
  ('Miyapur', 'Hyderabad'),
  ('Jeedimetla', 'Hyderabad'),
  ('Suraram', 'Hyderabad'),
  ('Bowrampet', 'Hyderabad');

-- ============ Seed: catalog (prices in paise) ============
INSERT INTO products (slug, name, description, category, image_url, ingredients, nutrition, tags, is_featured, is_available) VALUES
  ('ragi-jawa', 'Ragi Jawa',
   'Freshly prepared ragi drink, usually served warm. Traditional Karnataka health drink rich in calcium and iron.',
   'drinks', 'https://images-cdn.lohit.workers.dev/ragi-jawa.png',
   ARRAY['Finger millet', 'Water', 'Jaggery', 'Cardamom'],
   '{"calories":"120","protein":"3g","carbs":"24g","fat":"1g","fiber":"2g"}'::jsonb,
   ARRAY['Calcium-Rich', 'Traditional', 'Warm Drink'], TRUE, TRUE),
  ('ragi-malt-sweet', 'Ragi Malt (Sweet)',
   'Classic sweet ragi malt drink made from sprouted finger millet. High calcium health drink.',
   'drinks', 'https://images-cdn.lohit.workers.dev/ragi-malt-sweet.png',
   ARRAY['Sprouted ragi', 'Jaggery', 'Milk', 'Cardamom'],
   '{"calories":"140","protein":"4g","carbs":"26g","fat":"2g","fiber":"3g"}'::jsonb,
   ARRAY['Calcium-Rich', 'Sprouted', 'Sweet'], TRUE, TRUE),
  ('ragi-malt-salted', 'Ragi Malt (Salted)',
   'Savory version of the traditional ragi malt. Perfect for those who prefer less sweet.',
   'drinks', 'https://images-cdn.lohit.workers.dev/ragi-malt-salted.png',
   ARRAY['Sprouted ragi', 'Salt', 'Buttermilk', 'Cumin'],
   '{"calories":"130","protein":"4g","carbs":"25g","fat":"2g","fiber":"3g"}'::jsonb,
   ARRAY['Calcium-Rich', 'Sprouted', 'Savory'], FALSE, TRUE),
  ('mixed-sprouts', 'Mixed Sprouts',
   'Healthy combination of sprouted green gram, chickpeas, and other lentils. Protein-rich snack.',
   'snacks', 'https://images-cdn.lohit.workers.dev/sprouts.png',
   ARRAY['Green gram sprouts', 'Chickpea sprouts', 'Moath sprouts', 'Onion', 'Lemon', 'Spices'],
   '{"calories":"180","protein":"12g","carbs":"30g","fat":"2g","fiber":"8g"}'::jsonb,
   ARRAY['High-Protein', 'Fresh', 'Sprouted'], TRUE, TRUE),
  ('green-gram-sprouts', 'Green Gram Sprouts',
   'Pesalu sprouts - protein-rich green gram sprouts. Traditional Andhra healthy snack.',
   'snacks', 'https://images-cdn.lohit.workers.dev/sprouts.png',
   ARRAY['Green gram sprouts', 'Coconut', 'Mustard seeds', 'Lemon'],
   '{"calories":"170","protein":"13g","carbs":"28g","fat":"2g","fiber":"9g"}'::jsonb,
   ARRAY['High-Protein', 'Pesalu', 'Traditional'], TRUE, TRUE),
  ('sprout-salad', 'Sprout Salad',
   'Fresh sprout mix with onions, tomatoes, cucumber, lemon, and spices. Healthy chaat-style salad.',
   'snacks', 'https://images-cdn.lohit.workers.dev/sprouts.png',
   ARRAY['Mixed sprouts', 'Onion', 'Tomato', 'Cucumber', 'Lemon juice', 'Green chutney'],
   '{"calories":"150","protein":"8g","carbs":"22g","fat":"3g","fiber":"10g"}'::jsonb,
   ARRAY['Fresh', 'Chaat-Style', 'High-Fiber'], TRUE, TRUE),
  ('orange-juice', 'Orange Juice',
   'Fresh seasonal orange juice. No added sugar or preservatives. Pure vitamin C boost.',
   'drinks', 'https://images-cdn.lohit.workers.dev/orange-juice.png',
   ARRAY['Fresh oranges', 'Amla', 'Optional: Chia seeds'],
   '{"calories":"110","protein":"2g","carbs":"26g","fat":"0g","fiber":"1g"}'::jsonb,
   ARRAY['Fresh', 'Seasonal', 'Vitamin C'], FALSE, TRUE),
  ('watermelon-juice', 'Watermelon Juice',
   'Refreshing watermelon juice. Perfect summer drink with natural sweetness.',
   'drinks', 'https://images-cdn.lohit.workers.dev/watermelon-juice.png',
   ARRAY['Fresh watermelon', 'Mint leaves', 'Black salt'],
   '{"calories":"80","protein":"1g","carbs":"20g","fat":"0g","fiber":"1g"}'::jsonb,
   ARRAY['Refreshing', 'Seasonal', 'Hydrating'], FALSE, TRUE),
  ('mosambi-juice', 'Mosambi Juice',
   'Sweet lime juice with a hint of salt. Hydrating and refreshing citrus drink.',
   'drinks', 'https://images-cdn.lohit.workers.dev/mosambi-juice.png',
   ARRAY['Fresh mosambi', 'Black salt', 'Chat masala'],
   '{"calories":"90","protein":"1g","carbs":"22g","fat":"0g","fiber":"1g"}'::jsonb,
   ARRAY['Refreshing', 'Vitamin C', 'Seasonal'], FALSE, TRUE);

INSERT INTO product_variants (product_id, slug, size_label, unit, price_paise, is_available)
SELECT p.id, v.slug, v.size_label, v.unit, v.price_paise, TRUE
FROM (VALUES
    ('ragi-jawa', 'ragi-jawa-small', 'Small', '200ml', 4000),
    ('ragi-jawa', 'ragi-jawa-medium', 'Medium', '300ml', 6000),
    ('ragi-jawa', 'ragi-jawa-large', 'Large', '400ml', 8000),
    ('ragi-malt-sweet', 'ragi-malt-sweet-small', 'Small', '200ml', 5000),
    ('ragi-malt-sweet', 'ragi-malt-sweet-medium', 'Medium', '300ml', 7000),
    ('ragi-malt-sweet', 'ragi-malt-sweet-large', 'Large', '400ml', 9000),
    ('ragi-malt-salted', 'ragi-malt-salted-small', 'Small', '200ml', 5000),
    ('ragi-malt-salted', 'ragi-malt-salted-medium', 'Medium', '300ml', 7000),
    ('ragi-malt-salted', 'ragi-malt-salted-large', 'Large', '400ml', 9000),
    ('mixed-sprouts', 'mixed-sprouts-regular', 'Regular', '150g', 5000),
    ('mixed-sprouts', 'mixed-sprouts-large', 'Large', '250g', 8000),
    ('green-gram-sprouts', 'green-gram-sprouts-regular', 'Regular', '150g', 5000),
    ('green-gram-sprouts', 'green-gram-sprouts-large', 'Large', '250g', 8000),
    ('sprout-salad', 'sprout-salad-regular', 'Regular', '200g', 6000),
    ('sprout-salad', 'sprout-salad-large', 'Large', '350g', 10000),
    ('orange-juice', 'orange-juice-small', 'Small', '200ml', 6000),
    ('orange-juice', 'orange-juice-medium', 'Medium', '300ml', 8000),
    ('orange-juice', 'orange-juice-large', 'Large', '400ml', 10000),
    ('watermelon-juice', 'watermelon-juice-small', 'Small', '200ml', 5000),
    ('watermelon-juice', 'watermelon-juice-medium', 'Medium', '300ml', 7000),
    ('watermelon-juice', 'watermelon-juice-large', 'Large', '400ml', 9000),
    ('mosambi-juice', 'mosambi-juice-small', 'Small', '200ml', 5000),
    ('mosambi-juice', 'mosambi-juice-medium', 'Medium', '300ml', 7000),
    ('mosambi-juice', 'mosambi-juice-large', 'Large', '400ml', 9000)
) AS v(product_slug, slug, size_label, unit, price_paise)
JOIN products p ON p.slug = v.product_slug;

COMMIT;
