-- Reverses 000001_init: drops everything the baseline creates, in reverse
-- dependency order. Sequences owned by BIGSERIAL columns go with their tables.

BEGIN;

DROP TABLE IF EXISTS notification_states;
DROP TABLE IF EXISTS push_subscriptions;
DROP TABLE IF EXISTS chat_messages;
DROP TABLE IF EXISTS chat_threads;
DROP TABLE IF EXISTS refresh_tokens;
DROP TABLE IF EXISTS idempotency_keys;
-- Before admins: operating_settings.updated_by references it.
DROP TABLE IF EXISTS operating_settings;
DROP TABLE IF EXISTS cash_handovers;
DROP TABLE IF EXISTS location_samples;
DROP TABLE IF EXISTS run_stops;
DROP TABLE IF EXISTS delivery_runs;
DROP TABLE IF EXISTS order_status_history;
DROP TABLE IF EXISTS order_items;
DROP TABLE IF EXISTS orders;
DROP TABLE IF EXISTS order_batches;
DROP TABLE IF EXISTS product_variants;
DROP TABLE IF EXISTS products;
DROP TABLE IF EXISTS addresses;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS delivery_partners;
DROP TABLE IF EXISTS admins;
DROP TABLE IF EXISTS localities;
DROP TABLE IF EXISTS operating_settings;

COMMIT;
