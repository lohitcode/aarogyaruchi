-- Best-effort reverse of 000003 (test data only).

BEGIN;

ALTER TABLE order_items RENAME COLUMN variant_id TO product_id;

-- Restore a flat products table: fold parents back onto their variants.
ALTER TABLE product_variants ADD COLUMN name VARCHAR(255);
ALTER TABLE product_variants ADD COLUMN description TEXT;
ALTER TABLE product_variants ADD COLUMN category VARCHAR(100);
ALTER TABLE product_variants ADD COLUMN image_url TEXT;
ALTER TABLE product_variants ADD COLUMN is_featured BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE product_variants v SET
    name = p.name,
    description = p.description,
    category = p.category,
    image_url = p.image_url,
    is_featured = p.is_featured
FROM products p WHERE p.id = v.product_id;

ALTER TABLE product_variants ALTER COLUMN name SET NOT NULL;
ALTER TABLE product_variants DROP COLUMN product_id;

DROP TABLE IF EXISTS products;

ALTER TABLE product_variants RENAME TO products;

CREATE UNIQUE INDEX idx_products_slug ON products(slug) WHERE archived_at IS NULL;
CREATE INDEX idx_products_category ON products(category) WHERE archived_at IS NULL;

COMMIT;
