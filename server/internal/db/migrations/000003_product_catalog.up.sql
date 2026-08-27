-- 000003_product_catalog: proper ecommerce catalog shape.
--
-- The flat per-size rows become `product_variants` (sellable SKUs that
-- orders reference), and a new parent `products` table holds the
-- marketing content (description, category, image, ingredients,
-- nutrition, tags). The admin panel manages parents + variants; the
-- storefront renders exclusively from the database.

BEGIN;

-- 1. The current table (one row per size) becomes the variant table.
ALTER TABLE products RENAME TO product_variants;

DROP INDEX IF EXISTS idx_products_slug;
DROP INDEX IF EXISTS idx_products_category;

-- 2. Parent products with full catalog content.
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
    sort_order INT NOT NULL DEFAULT 0,
    archived_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX idx_products_slug ON products(slug) WHERE archived_at IS NULL;
CREATE INDEX idx_products_category ON products(category) WHERE archived_at IS NULL;
CREATE INDEX idx_products_sort ON products(sort_order, name) WHERE archived_at IS NULL;

-- 3. Link variants to parents. Base slug = variant slug minus its size
--    suffix; every seeded variant matches this rule.
ALTER TABLE product_variants ADD COLUMN product_id BIGINT REFERENCES products(id);

INSERT INTO products (slug, name, description, category, image_url, is_featured, archived_at)
SELECT DISTINCT ON (regexp_replace(slug, '-(small|medium|large|regular)$', ''))
    regexp_replace(slug, '-(small|medium|large|regular)$', '') AS base_slug,
    name,
    description,
    category,
    image_url,
    is_featured,
    archived_at
FROM product_variants;

UPDATE product_variants v
SET product_id = p.id
FROM products p
WHERE p.slug = regexp_replace(v.slug, '-(small|medium|large|regular)$', '');

ALTER TABLE product_variants ALTER COLUMN product_id SET NOT NULL;
CREATE INDEX idx_product_variants_product ON product_variants(product_id);
CREATE UNIQUE INDEX idx_product_variants_slug ON product_variants(slug) WHERE archived_at IS NULL;

-- 4. Marketing content moves to the parent; the variant keeps only what
--    makes it sellable.
ALTER TABLE product_variants
    DROP COLUMN name,
    DROP COLUMN description,
    DROP COLUMN category,
    DROP COLUMN image_url,
    DROP COLUMN is_featured;

-- 5. Order items reference variants; name the FK honestly.
ALTER TABLE order_items RENAME COLUMN product_id TO variant_id;

-- 6. Seed the catalog marketing content (mirrors the previous static
--    storefront data so the API-rendered catalog loses nothing).
UPDATE products SET
    ingredients = ARRAY['Finger millet', 'Water', 'Jaggery', 'Cardamom'],
    tags = ARRAY['Calcium-Rich', 'Traditional', 'Warm Drink'],
    nutrition = '{"calories":"120","protein":"3g","carbs":"24g","fat":"1g","fiber":"2g"}',
    sort_order = 1
WHERE slug = 'ragi-jawa';

UPDATE products SET
    ingredients = ARRAY['Sprouted ragi', 'Jaggery', 'Milk', 'Cardamom'],
    tags = ARRAY['Calcium-Rich', 'Sprouted', 'Sweet'],
    nutrition = '{"calories":"140","protein":"4g","carbs":"26g","fat":"2g","fiber":"3g"}',
    sort_order = 2
WHERE slug = 'ragi-malt-sweet';

UPDATE products SET
    ingredients = ARRAY['Sprouted ragi', 'Salt', 'Buttermilk', 'Cumin'],
    tags = ARRAY['Calcium-Rich', 'Sprouted', 'Savory'],
    nutrition = '{"calories":"130","protein":"4g","carbs":"25g","fat":"2g","fiber":"3g"}',
    sort_order = 3
WHERE slug = 'ragi-malt-salted';

UPDATE products SET
    ingredients = ARRAY['Green gram sprouts', 'Chickpea sprouts', 'Moath sprouts', 'Onion', 'Lemon', 'Spices'],
    tags = ARRAY['High-Protein', 'Fresh', 'Sprouted'],
    nutrition = '{"calories":"180","protein":"12g","carbs":"30g","fat":"2g","fiber":"8g"}',
    sort_order = 4
WHERE slug = 'mixed-sprouts';

UPDATE products SET
    ingredients = ARRAY['Green gram sprouts', 'Coconut', 'Mustard seeds', 'Lemon'],
    tags = ARRAY['High-Protein', 'Pesalu', 'Traditional'],
    nutrition = '{"calories":"170","protein":"13g","carbs":"28g","fat":"2g","fiber":"9g"}',
    sort_order = 5
WHERE slug = 'green-gram-sprouts';

UPDATE products SET
    ingredients = ARRAY['Fresh oranges', 'Amla', 'Optional: Chia seeds'],
    tags = ARRAY['Fresh', 'Seasonal', 'Vitamin C'],
    nutrition = '{"calories":"110","protein":"2g","carbs":"26g","fat":"0g","fiber":"1g"}',
    sort_order = 6
WHERE slug = 'orange-juice';

UPDATE products SET
    ingredients = ARRAY['Fresh watermelon', 'Mint leaves', 'Black salt'],
    tags = ARRAY['Refreshing', 'Seasonal', 'Hydrating'],
    nutrition = '{"calories":"80","protein":"1g","carbs":"20g","fat":"0g","fiber":"1g"}',
    sort_order = 7
WHERE slug = 'watermelon-juice';

UPDATE products SET
    ingredients = ARRAY['Fresh mosambi', 'Black salt', 'Chat masala'],
    tags = ARRAY['Refreshing', 'Vitamin C', 'Seasonal'],
    nutrition = '{"calories":"90","protein":"1g","carbs":"22g","fat":"0g","fiber":"1g"}',
    sort_order = 8
WHERE slug = 'mosambi-juice';

UPDATE products SET
    ingredients = ARRAY['Mixed sprouts', 'Onion', 'Tomato', 'Cucumber', 'Lemon juice', 'Green chutney'],
    tags = ARRAY['Fresh', 'Chaat-Style', 'High-Fiber'],
    nutrition = '{"calories":"150","protein":"8g","carbs":"22g","fat":"3g","fiber":"10g"}',
    sort_order = 9
WHERE slug = 'sprout-salad';

COMMIT;
