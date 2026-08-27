-- name: GetOrderItems :many
SELECT oi.*, p.name AS product_name, p.slug AS product_slug,
       v.slug AS variant_slug, v.size_label AS product_size_label,
       v.unit AS product_unit, p.image_url AS product_image_url
FROM order_items oi
JOIN product_variants v ON v.id = oi.variant_id
JOIN products p ON p.id = v.product_id
WHERE oi.order_id = $1
ORDER BY oi.id;

-- name: CreateOrderItem :one
INSERT INTO order_items (order_id, variant_id, quantity, unit_price_paise)
VALUES ($1, $2, $3, $4)
RETURNING *;

-- name: BatchPreparationSummary :many
SELECT
    v.id AS variant_id,
    v.slug AS variant_slug,
    v.size_label AS product_size_label,
    v.unit AS product_unit,
    p.id AS product_id,
    p.name AS product_name,
    p.slug AS product_slug,
    SUM(oi.quantity)::BIGINT AS total_quantity,
    COUNT(DISTINCT oi.order_id)::BIGINT AS order_count
FROM order_items oi
JOIN product_variants v ON v.id = oi.variant_id
JOIN products p ON p.id = v.product_id
JOIN orders o ON o.id = oi.order_id
WHERE o.batch_id = $1
  AND o.status <> 'cancelled'
GROUP BY v.id, v.slug, v.size_label, v.unit, p.id, p.name, p.slug
ORDER BY p.name, v.size_label;
