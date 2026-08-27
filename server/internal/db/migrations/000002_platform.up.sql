-- 000002_platform: ordering, admin, and delivery platform rework.
-- Drops the gym/commission flow, converts money to integer paise, and adds
-- addresses, batches, runs, stops, status history, labels, locations, cash
-- reconciliation, idempotency, and partner refresh tokens.

BEGIN;

-- ============ 1. Drop gym flow ============
-- Columns first: orders.gym_id carries an FK into gyms.
DROP INDEX IF EXISTS idx_orders_gym;
ALTER TABLE orders DROP COLUMN IF EXISTS gym_id;
ALTER TABLE orders DROP COLUMN IF EXISTS commission_amount;
ALTER TABLE orders DROP COLUMN IF EXISTS commission_paid;
ALTER TABLE orders DROP COLUMN IF EXISTS commission_paid_at;
ALTER TABLE orders DROP COLUMN IF EXISTS pickup_code;
ALTER TABLE orders DROP COLUMN IF EXISTS picked_up_at;
ALTER TABLE orders DROP COLUMN IF EXISTS delivery_type;
DROP TABLE IF EXISTS gyms;

-- ============ 2. Admin roles ============
UPDATE admins SET role = 'super_admin' WHERE role = 'super';
UPDATE admins SET role = 'operations_admin' WHERE role = 'locality';

-- ============ 3. Money -> integer paise ============
ALTER TABLE products ADD COLUMN price_paise BIGINT;
UPDATE products SET price_paise = ROUND(price * 100)::BIGINT;
ALTER TABLE products ALTER COLUMN price_paise SET NOT NULL;
ALTER TABLE products DROP COLUMN price;

ALTER TABLE order_items ADD COLUMN unit_price_paise BIGINT;
UPDATE order_items SET unit_price_paise = ROUND(unit_price * 100)::BIGINT;
ALTER TABLE order_items ALTER COLUMN unit_price_paise SET NOT NULL;
ALTER TABLE order_items DROP COLUMN unit_price;

ALTER TABLE orders ADD COLUMN total_amount_paise BIGINT;
UPDATE orders SET total_amount_paise = ROUND(total_amount * 100)::BIGINT;
ALTER TABLE orders ALTER COLUMN total_amount_paise SET NOT NULL;
ALTER TABLE orders DROP COLUMN total_amount;

-- ============ 4. Products: archival + catalog shape ============
ALTER TABLE products ADD COLUMN archived_at TIMESTAMPTZ;
ALTER TABLE products ADD COLUMN slug VARCHAR(255);
ALTER TABLE products ADD COLUMN category VARCHAR(100);
ALTER TABLE products ADD COLUMN size_label VARCHAR(100);
ALTER TABLE products ADD COLUMN is_featured BOOLEAN NOT NULL DEFAULT FALSE;
CREATE UNIQUE INDEX idx_products_slug ON products(slug) WHERE archived_at IS NULL AND slug IS NOT NULL;
CREATE INDEX idx_products_category ON products(category) WHERE archived_at IS NULL;

-- Retire the placeholder row from 000001; it is not part of the real catalog.
UPDATE products SET archived_at = NOW(), slug = 'legacy-egg-salad' WHERE slug IS NULL;

-- Seed the full catalog (one row per sellable size). Prices in paise.
INSERT INTO products (slug, name, description, category, size_label, unit, price_paise, image_url, is_available, is_featured) VALUES
  ('ragi-jawa-small',  'Ragi Jawa', 'Freshly prepared ragi drink, usually served warm. Traditional Karnataka health drink rich in calcium and iron.', 'drinks', 'Small',  '200ml', 4000, 'https://images-cdn.lohit.workers.dev/ragi-jawa.png', TRUE, TRUE),
  ('ragi-jawa-medium', 'Ragi Jawa', 'Freshly prepared ragi drink, usually served warm. Traditional Karnataka health drink rich in calcium and iron.', 'drinks', 'Medium', '300ml', 6000, 'https://images-cdn.lohit.workers.dev/ragi-jawa.png', TRUE, TRUE),
  ('ragi-jawa-large',  'Ragi Jawa', 'Freshly prepared ragi drink, usually served warm. Traditional Karnataka health drink rich in calcium and iron.', 'drinks', 'Large',  '400ml', 8000, 'https://images-cdn.lohit.workers.dev/ragi-jawa.png', TRUE, TRUE),
  ('ragi-malt-sweet-small',  'Ragi Malt (Sweet)', 'Classic sweet ragi malt drink made from sprouted finger millet. High calcium health drink.', 'drinks', 'Small',  '200ml', 5000, 'https://images-cdn.lohit.workers.dev/ragi-malt-sweet.png', TRUE, TRUE),
  ('ragi-malt-sweet-medium', 'Ragi Malt (Sweet)', 'Classic sweet ragi malt drink made from sprouted finger millet. High calcium health drink.', 'drinks', 'Medium', '300ml', 7000, 'https://images-cdn.lohit.workers.dev/ragi-malt-sweet.png', TRUE, TRUE),
  ('ragi-malt-sweet-large',  'Ragi Malt (Sweet)', 'Classic sweet ragi malt drink made from sprouted finger millet. High calcium health drink.', 'drinks', 'Large',  '400ml', 9000, 'https://images-cdn.lohit.workers.dev/ragi-malt-sweet.png', TRUE, TRUE),
  ('ragi-malt-salted-small',  'Ragi Malt (Salted)', 'Savory version of the traditional ragi malt. Perfect for those who prefer less sweet.', 'drinks', 'Small',  '200ml', 5000, 'https://images-cdn.lohit.workers.dev/ragi-malt-salted.png', TRUE, FALSE),
  ('ragi-malt-salted-medium', 'Ragi Malt (Salted)', 'Savory version of the traditional ragi malt. Perfect for those who prefer less sweet.', 'drinks', 'Medium', '300ml', 7000, 'https://images-cdn.lohit.workers.dev/ragi-malt-salted.png', TRUE, FALSE),
  ('ragi-malt-salted-large',  'Ragi Malt (Salted)', 'Savory version of the traditional ragi malt. Perfect for those who prefer less sweet.', 'drinks', 'Large',  '400ml', 9000, 'https://images-cdn.lohit.workers.dev/ragi-malt-salted.png', TRUE, FALSE),
  ('mixed-sprouts-regular', 'Mixed Sprouts', 'Healthy combination of sprouted green gram, chickpeas, and other lentils. Protein-rich snack.', 'snacks', 'Regular', '150g', 5000, 'https://images-cdn.lohit.workers.dev/sprouts.png', TRUE, TRUE),
  ('mixed-sprouts-large',   'Mixed Sprouts', 'Healthy combination of sprouted green gram, chickpeas, and other lentils. Protein-rich snack.', 'snacks', 'Large',   '250g', 8000, 'https://images-cdn.lohit.workers.dev/sprouts.png', TRUE, TRUE),
  ('green-gram-sprouts-regular', 'Green Gram Sprouts', 'Pesalu sprouts - protein-rich green gram sprouts. Traditional Andhra healthy snack.', 'snacks', 'Regular', '150g', 5000, 'https://images-cdn.lohit.workers.dev/sprouts.png', TRUE, TRUE),
  ('green-gram-sprouts-large',   'Green Gram Sprouts', 'Pesalu sprouts - protein-rich green gram sprouts. Traditional Andhra healthy snack.', 'snacks', 'Large',   '250g', 8000, 'https://images-cdn.lohit.workers.dev/sprouts.png', TRUE, TRUE),
  ('orange-juice-small',  'Orange Juice', 'Fresh seasonal orange juice. No added sugar or preservatives. Pure vitamin C boost.', 'drinks', 'Small',  '200ml', 6000, 'https://images-cdn.lohit.workers.dev/orange-juice.png', TRUE, FALSE),
  ('orange-juice-medium', 'Orange Juice', 'Fresh seasonal orange juice. No added sugar or preservatives. Pure vitamin C boost.', 'drinks', 'Medium', '300ml', 8000, 'https://images-cdn.lohit.workers.dev/orange-juice.png', TRUE, FALSE),
  ('orange-juice-large',  'Orange Juice', 'Fresh seasonal orange juice. No added sugar or preservatives. Pure vitamin C boost.', 'drinks', 'Large',  '400ml', 10000, 'https://images-cdn.lohit.workers.dev/orange-juice.png', TRUE, FALSE),
  ('watermelon-juice-small',  'Watermelon Juice', 'Refreshing watermelon juice. Perfect summer drink with natural sweetness.', 'drinks', 'Small',  '200ml', 5000, 'https://images-cdn.lohit.workers.dev/watermelon-juice.png', TRUE, FALSE),
  ('watermelon-juice-medium', 'Watermelon Juice', 'Refreshing watermelon juice. Perfect summer drink with natural sweetness.', 'drinks', 'Medium', '300ml', 7000, 'https://images-cdn.lohit.workers.dev/watermelon-juice.png', TRUE, FALSE),
  ('watermelon-juice-large',  'Watermelon Juice', 'Refreshing watermelon juice. Perfect summer drink with natural sweetness.', 'drinks', 'Large',  '400ml', 9000, 'https://images-cdn.lohit.workers.dev/watermelon-juice.png', TRUE, FALSE),
  ('mosambi-juice-small',  'Mosambi Juice', 'Sweet lime juice with a hint of salt. Hydrating and refreshing citrus drink.', 'drinks', 'Small',  '200ml', 5000, 'https://images-cdn.lohit.workers.dev/mosambi-juice.png', TRUE, FALSE),
  ('mosambi-juice-medium', 'Mosambi Juice', 'Sweet lime juice with a hint of salt. Hydrating and refreshing citrus drink.', 'drinks', 'Medium', '300ml', 7000, 'https://images-cdn.lohit.workers.dev/mosambi-juice.png', TRUE, FALSE),
  ('mosambi-juice-large',  'Mosambi Juice', 'Sweet lime juice with a hint of salt. Hydrating and refreshing citrus drink.', 'drinks', 'Large',  '400ml', 9000, 'https://images-cdn.lohit.workers.dev/mosambi-juice.png', TRUE, FALSE),
  ('sprout-salad-regular', 'Sprout Salad', 'Fresh sprout mix with onions, tomatoes, cucumber, lemon, and spices. Healthy chaat-style salad.', 'snacks', 'Regular', '200g', 6000, 'https://images-cdn.lohit.workers.dev/sprouts.png', TRUE, TRUE),
  ('sprout-salad-large',   'Sprout Salad', 'Fresh sprout mix with onions, tomatoes, cucumber, lemon, and spices. Healthy chaat-style salad.', 'snacks', 'Large',   '350g', 10000, 'https://images-cdn.lohit.workers.dev/sprouts.png', TRUE, TRUE)
ON CONFLICT DO NOTHING;

-- ============ 5. Addresses (users lose inline address) ============
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

-- Carry over any pre-existing inline addresses.
INSERT INTO addresses (user_id, label, address_line, landmark, locality_id, is_default)
SELECT id, 'Home', address_line, landmark, locality_id, TRUE
FROM users WHERE address_line IS NOT NULL;

DROP INDEX IF EXISTS idx_users_locality;
ALTER TABLE users DROP COLUMN IF EXISTS address_line;
ALTER TABLE users DROP COLUMN IF EXISTS landmark;
ALTER TABLE users DROP COLUMN IF EXISTS locality_id;

-- ============ 6. Operating settings (singleton) ============
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
INSERT INTO operating_settings (id) VALUES (1);

-- Seed service areas around the Bachupally kitchen.
INSERT INTO localities (name, city)
SELECT v.name, 'Hyderabad'
FROM (VALUES
    ('Bachupally'),
    ('Nizampet'),
    ('Kompally'),
    ('Kukatpally'),
    ('Miyapur'),
    ('Jeedimetla'),
    ('Suraram'),
    ('Bowrampet')
) AS v(name)
WHERE NOT EXISTS (SELECT 1 FROM localities l WHERE l.name = v.name);

-- ============ 7. Daily order batches ============
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

-- ============ 8. Orders rework ============
UPDATE orders SET status = 'placed' WHERE status = 'pending';
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_status_check CHECK (
    status IN ('placed', 'confirmed', 'preparing', 'ready', 'assigned',
               'picked_up', 'out_for_delivery', 'delivered',
               'cancelled', 'delivery_failed')
);
ALTER TABLE orders DROP COLUMN IF EXISTS payment_status;
ALTER TABLE orders DROP COLUMN IF EXISTS payment_id;
UPDATE orders SET payment_method = 'cash_on_delivery' WHERE payment_method IS NULL OR payment_method = '';
ALTER TABLE orders ALTER COLUMN payment_method SET NOT NULL;
ALTER TABLE orders ALTER COLUMN payment_method SET DEFAULT 'cash_on_delivery';

ALTER TABLE orders
    ADD COLUMN code VARCHAR(20),
    ADD COLUMN batch_id BIGINT REFERENCES order_batches(id),
    ADD COLUMN package_token VARCHAR(64),
    ADD COLUMN ship_address_line TEXT,
    ADD COLUMN ship_landmark VARCHAR(255),
    ADD COLUMN ship_locality_id BIGINT REFERENCES localities(id),
    ADD COLUMN ship_latitude DOUBLE PRECISION,
    ADD COLUMN ship_longitude DOUBLE PRECISION,
    ADD COLUMN ship_accuracy_m DOUBLE PRECISION,
    ADD COLUMN ship_instructions TEXT,
    ADD COLUMN delivered_at TIMESTAMPTZ,
    ADD COLUMN delivery_note TEXT,
    ADD COLUMN failure_reason TEXT,
    ADD COLUMN updated_by_actor VARCHAR(20);

CREATE UNIQUE INDEX idx_orders_code ON orders(code) WHERE code IS NOT NULL;
CREATE UNIQUE INDEX idx_orders_package_token ON orders(package_token) WHERE package_token IS NOT NULL;
CREATE INDEX idx_orders_batch ON orders(batch_id);
CREATE INDEX idx_orders_created ON orders(created_at);

-- ============ 9. Immutable status history ============
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

-- ============ 10. Delivery runs and ordered stops ============
CREATE TABLE delivery_runs (
    id BIGSERIAL PRIMARY KEY,
    batch_id BIGINT NOT NULL REFERENCES order_batches(id),
    delivery_date DATE NOT NULL,
    partner_id BIGINT REFERENCES delivery_partners(id),
    name VARCHAR(255),
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
-- An open stop (pending/in_progress) blocks the order from joining another run.
CREATE UNIQUE INDEX idx_run_stops_open_order ON run_stops(order_id) WHERE status IN ('pending', 'in_progress');

-- ============ 11. Location samples ============
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

-- ============ 12. Cash handover / reconciliation ============
CREATE TABLE cash_handovers (
    id BIGSERIAL PRIMARY KEY,
    run_id BIGINT NOT NULL UNIQUE REFERENCES delivery_runs(id),
    expected_paise BIGINT NOT NULL DEFAULT 0,
    submitted_paise BIGINT,
    submitted_note TEXT,
    submitted_at TIMESTAMPTZ,
    admin_id BIGINT REFERENCES admins(id),
    confirmed_paise BIGINT,
    confirmed_at TIMESTAMPTZ,
    discrepancy_paise BIGINT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'submitted', 'confirmed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_cash_handovers_status ON cash_handovers(status);

-- ============ 13. Idempotency records ============
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

-- ============ 14. Partner refresh tokens ============
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

COMMIT;
