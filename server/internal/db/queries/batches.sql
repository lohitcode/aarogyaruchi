-- name: GetBatch :one
SELECT * FROM order_batches WHERE id = $1;

-- name: GetBatchByOrderDate :one
SELECT * FROM order_batches WHERE order_date = $1;

-- The no-op DO UPDATE makes this race-safe: a concurrent creator wins the
-- INSERT and we still get the existing row back instead of an error.
-- name: GetOrCreateBatch :one
INSERT INTO order_batches (order_date, delivery_date, cutoff_policy)
VALUES ($1, $2, $3)
ON CONFLICT (order_date) DO UPDATE SET cutoff_policy = order_batches.cutoff_policy
RETURNING *;

-- name: ListBatches :many
SELECT * FROM order_batches
ORDER BY order_date DESC
LIMIT @max_rows OFFSET COALESCE(@skip, 0);

-- name: CloseBatch :execrows
UPDATE order_batches
SET status = 'closed', closed_at = NOW(), closed_by = $2
WHERE id = $1 AND status = 'open';

-- name: BatchOrderCounts :one
SELECT
    (COUNT(*) FILTER (WHERE status <> 'cancelled'))::BIGINT AS order_count,
    (COUNT(*) FILTER (WHERE status = 'cancelled'))::BIGINT AS cancelled_count,
    COALESCE(SUM(total_amount_paise) FILTER (WHERE status <> 'cancelled'), 0)::BIGINT AS total_paise,
    (COUNT(*) FILTER (WHERE status = 'delivered'))::BIGINT AS delivered_count
FROM orders
WHERE batch_id = $1;
