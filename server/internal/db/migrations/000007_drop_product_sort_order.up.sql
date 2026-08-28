-- Phase B of removing manual sort ordering (phase A removed all code usage
-- and is deployed): drop the column. Safe because the running server no
-- longer references it — catalog ordering is popularity-based (see
-- queries/products.sql). Dropping the column also drops idx_products_sort.

ALTER TABLE products DROP COLUMN sort_order;
