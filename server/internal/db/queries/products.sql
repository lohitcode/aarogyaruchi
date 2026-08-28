-- ============ Public catalog (parent products + sellable variants) ============
--
-- Popularity = units ever sold (cancelled orders excluded), computed as a
-- correlated subquery: SELECT * keeps its products-model shape for sqlc and
-- the handlers. Free at this catalog/order volume; revisit only if
-- order_items grows large (then materialize a counter).

-- name: ListCatalogProducts :many
SELECT * FROM products p
WHERE p.is_available = TRUE AND p.archived_at IS NULL
ORDER BY (
    SELECT COALESCE(SUM(CASE WHEN o.status IS DISTINCT FROM 'cancelled' THEN oi.quantity END), 0)
    FROM product_variants v
    JOIN order_items oi ON oi.variant_id = v.id
    JOIN orders o ON o.id = oi.order_id
    WHERE v.product_id = p.id
) DESC, p.name;

-- name: ListCatalogVariants :many
SELECT * FROM product_variants
WHERE is_available = TRUE AND archived_at IS NULL
  AND product_id = ANY($1::BIGINT[])
ORDER BY id;

-- name: GetProductBySlug :one
SELECT * FROM products
WHERE slug = $1 AND archived_at IS NULL;

-- name: GetVariantsForProduct :many
SELECT * FROM product_variants
WHERE product_id = $1 AND archived_at IS NULL
ORDER BY id;

-- ============ Pricing (variants are the sellable SKUs) ============

-- name: GetVariantsForUpdate :many
SELECT v.*, p.name AS product_name
FROM product_variants v
JOIN products p ON p.id = v.product_id
WHERE v.id = ANY($1::BIGINT[]) AND v.is_available = TRUE AND v.archived_at IS NULL
FOR UPDATE OF v;

-- ============ Admin management ============

-- name: AdminListProducts :many
SELECT p.*,
       (SELECT COUNT(*) FROM product_variants v WHERE v.product_id = p.id AND v.archived_at IS NULL)::BIGINT AS variant_count,
       (SELECT COALESCE(MIN(v.price_paise), 0) FROM product_variants v WHERE v.product_id = p.id AND v.archived_at IS NULL AND v.is_available = TRUE)::BIGINT AS min_price_paise,
       (SELECT COUNT(*) FROM order_items oi JOIN product_variants v ON v.id = oi.variant_id WHERE v.product_id = p.id)::BIGINT AS order_count
FROM products p
ORDER BY p.archived_at NULLS FIRST, (
    SELECT COALESCE(SUM(CASE WHEN o.status IS DISTINCT FROM 'cancelled' THEN oi.quantity END), 0)
    FROM product_variants v
    JOIN order_items oi ON oi.variant_id = v.id
    JOIN orders o ON o.id = oi.order_id
    WHERE v.product_id = p.id
) DESC, p.name;

-- name: AdminGetProduct :one
SELECT * FROM products WHERE id = $1;

-- name: AdminCreateProduct :one
INSERT INTO products (
    slug, name, description, category, image_url,
    ingredients, nutrition, tags, is_featured, is_available
) VALUES (
    $1, $2, $3, $4, $5,
    $6, $7, $8, $9, $10
)
RETURNING *;

-- name: AdminUpdateProduct :one
UPDATE products SET
    slug = $2,
    name = $3,
    description = $4,
    category = $5,
    image_url = $6,
    ingredients = $7,
    nutrition = $8,
    tags = $9,
    is_featured = $10,
    is_available = $11,
    updated_at = NOW()
WHERE id = $1
RETURNING *;

-- Archiving a product archives its variants; historical order items keep
-- their snapshots.
-- name: AdminArchiveProduct :execrows
UPDATE products SET archived_at = NOW(), is_available = FALSE, updated_at = NOW()
WHERE id = $1 AND archived_at IS NULL;

-- name: AdminArchiveVariantsForProduct :exec
UPDATE product_variants SET archived_at = NOW(), is_available = FALSE, updated_at = NOW()
WHERE product_id = $1 AND archived_at IS NULL;

-- name: AdminListVariantsForProduct :many
SELECT * FROM product_variants
WHERE product_id = $1
ORDER BY archived_at NULLS FIRST, id;

-- name: AdminCreateVariant :one
INSERT INTO product_variants (product_id, slug, size_label, unit, price_paise, is_available)
VALUES ($1, $2, $3, $4, $5, $6)
RETURNING *;

-- name: AdminUpdateVariant :one
UPDATE product_variants SET
    slug = $2,
    size_label = $3,
    unit = $4,
    price_paise = $5,
    is_available = $6,
    updated_at = NOW()
WHERE id = $1
RETURNING *;

-- name: AdminArchiveVariant :execrows
UPDATE product_variants SET archived_at = NOW(), is_available = FALSE, updated_at = NOW()
WHERE id = $1 AND archived_at IS NULL;

-- ============ Hard delete (frees the slug) ============
--
-- Only archived products that were never ordered can be deleted; order
-- history pins everything else. The order_items → product_variants FK is the
-- backstop if an order lands between the check and the delete.

-- name: CountOrderItemsForProduct :one
SELECT COUNT(*)::BIGINT FROM order_items oi
JOIN product_variants v ON v.id = oi.variant_id
WHERE v.product_id = $1;

-- name: AdminDeleteVariantsForProduct :execrows
DELETE FROM product_variants WHERE product_id = $1;

-- name: AdminDeleteProduct :execrows
DELETE FROM products WHERE id = $1 AND archived_at IS NOT NULL;
