-- Best-effort reverse of 000002. Paise columns cannot be faithfully restored
-- for rows created after this migration ran; test data only.

BEGIN;

DROP TABLE IF EXISTS refresh_tokens;
DROP TABLE IF EXISTS idempotency_keys;
DROP TABLE IF EXISTS cash_handovers;
DROP TABLE IF EXISTS location_samples;
DROP TABLE IF EXISTS run_stops;
DROP TABLE IF EXISTS delivery_runs;
DROP TABLE IF EXISTS order_status_history;

ALTER TABLE orders
    DROP COLUMN IF EXISTS code,
    DROP COLUMN IF EXISTS batch_id,
    DROP COLUMN IF EXISTS package_token,
    DROP COLUMN IF EXISTS ship_address_line,
    DROP COLUMN IF EXISTS ship_landmark,
    DROP COLUMN IF EXISTS ship_locality_id,
    DROP COLUMN IF EXISTS ship_latitude,
    DROP COLUMN IF EXISTS ship_longitude,
    DROP COLUMN IF EXISTS ship_accuracy_m,
    DROP COLUMN IF EXISTS ship_instructions,
    DROP COLUMN IF EXISTS delivered_at,
    DROP COLUMN IF EXISTS delivery_note,
    DROP COLUMN IF EXISTS failure_reason,
    DROP COLUMN IF EXISTS updated_by_actor,
    ADD COLUMN IF EXISTS delivery_type TEXT DEFAULT 'home',
    ADD COLUMN IF EXISTS gym_id BIGINT,
    ADD COLUMN IF EXISTS pickup_code VARCHAR(6),
    ADD COLUMN IF EXISTS picked_up_at TIMESTAMPTZ,
    ADD COLUMN IF EXISTS commission_amount DECIMAL(10,2) DEFAULT 0,
    ADD COLUMN IF EXISTS commission_paid BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF EXISTS commission_paid_at TIMESTAMPTZ,
    ADD COLUMN IF EXISTS payment_status TEXT DEFAULT 'pending',
    ADD COLUMN IF EXISTS payment_id VARCHAR(255);
UPDATE orders SET status = 'pending' WHERE status = 'placed';

DROP TABLE IF EXISTS order_batches;
DROP TABLE IF EXISTS operating_settings;

ALTER TABLE users
    ADD COLUMN IF EXISTS address_line TEXT,
    ADD COLUMN IF EXISTS landmark VARCHAR(255),
    ADD COLUMN IF EXISTS locality_id BIGINT;
UPDATE users u SET address_line = a.address_line, landmark = a.landmark, locality_id = a.locality_id
FROM addresses a WHERE a.user_id = u.id AND a.is_default;
CREATE INDEX IF NOT EXISTS idx_users_locality ON users(locality_id);
DROP TABLE IF EXISTS addresses;

ALTER TABLE products
    DROP COLUMN IF EXISTS archived_at,
    DROP COLUMN IF EXISTS slug,
    DROP COLUMN IF EXISTS category,
    DROP COLUMN IF EXISTS size_label,
    DROP COLUMN IF EXISTS is_featured;
DELETE FROM products WHERE slug IS DISTINCT FROM 'legacy-egg-salad';
ALTER TABLE products ADD COLUMN IF EXISTS price DECIMAL(10,2);
UPDATE products SET price = ROUND(price_paise / 100.0, 2) WHERE price IS NULL;
ALTER TABLE products ALTER COLUMN price SET NOT NULL;
ALTER TABLE products DROP COLUMN IF EXISTS price_paise;

ALTER TABLE order_items ADD COLUMN IF EXISTS unit_price DECIMAL(10,2);
UPDATE order_items SET unit_price = ROUND(unit_price_paise / 100.0, 2) WHERE unit_price IS NULL;
ALTER TABLE order_items ALTER COLUMN unit_price SET NOT NULL;
ALTER TABLE order_items DROP COLUMN IF EXISTS unit_price_paise;

ALTER TABLE orders ADD COLUMN IF EXISTS total_amount DECIMAL(10,2);
UPDATE orders SET total_amount = ROUND(total_amount_paise / 100.0, 2) WHERE total_amount IS NULL;
ALTER TABLE orders ALTER COLUMN total_amount SET NOT NULL;
ALTER TABLE orders DROP COLUMN IF EXISTS total_amount_paise;

UPDATE admins SET role = 'super' WHERE role = 'super_admin';
UPDATE admins SET role = 'locality' WHERE role = 'operations_admin';

CREATE TABLE IF NOT EXISTS gyms (
    id BIGSERIAL PRIMARY KEY,
    phone VARCHAR(15) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    address TEXT,
    locality_id BIGINT REFERENCES localities(id),
    commission_percent DECIMAL(5,2) DEFAULT 10.00,
    status TEXT DEFAULT 'pending',
    approved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMIT;
