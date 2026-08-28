ALTER TABLE products ADD COLUMN sort_order INT NOT NULL DEFAULT 0;

CREATE INDEX idx_products_sort ON products(sort_order, name) WHERE archived_at IS NULL;
