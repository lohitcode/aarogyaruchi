-- name: GetOrder :one
SELECT * FROM orders WHERE id = $1;

-- name: GetOrderForUpdate :one
SELECT * FROM orders WHERE id = $1 FOR UPDATE;

-- name: GetOrderForUser :one
SELECT o.*, dp.name AS partner_name, dp.phone AS partner_phone
FROM orders o
LEFT JOIN delivery_partners dp ON dp.id = o.delivery_partner_id
WHERE o.id = $1 AND o.user_id = $2;

-- name: GetOrderForAdmin :one
SELECT o.*, u.name AS user_name, u.phone AS user_phone,
       dp.name AS partner_name, dp.phone AS partner_phone
FROM orders o
JOIN users u ON u.id = o.user_id
LEFT JOIN delivery_partners dp ON dp.id = o.delivery_partner_id
WHERE o.id = $1;

-- name: GetOrderByCode :one
SELECT * FROM orders WHERE code = $1;

-- name: GetOrderByPackageToken :one
SELECT o.*, u.name AS user_name, u.phone AS user_phone
FROM orders o
JOIN users u ON u.id = o.user_id
WHERE o.package_token = $1;

-- name: CreateOrder :one
INSERT INTO orders (
    code, user_id, batch_id, delivery_date, status, payment_method,
    total_amount_paise, package_token,
    ship_address_line, ship_landmark, ship_locality_id,
    ship_latitude, ship_longitude, ship_accuracy_m, ship_instructions
) VALUES (
    @code, @user_id, @batch_id, @delivery_date, 'placed', 'cash_on_delivery',
    @total_amount_paise, @package_token,
    @ship_address_line, @ship_landmark, @ship_locality_id,
    @ship_latitude, @ship_longitude, @ship_accuracy_m, @ship_instructions
)
RETURNING *;

-- name: ListUserOrders :many
SELECT * FROM orders
WHERE user_id = $1
  AND (sqlc.narg('before_id')::BIGINT IS NULL OR id < sqlc.narg('before_id'))
ORDER BY id DESC
LIMIT @max_rows;

-- name: CountUserOrders :one
SELECT COUNT(*) FROM orders WHERE user_id = $1;

-- name: AdminListOrders :many
-- Scalar subqueries (not LATERAL joins) so sqlc infers nullable run columns:
-- orders without a run return NULL there.
SELECT o.*, u.name AS user_name, u.phone AS user_phone,
       dp.name AS partner_name,
       stop.run_id AS run_id, stop.position AS stop_position, stop.status AS stop_status
FROM orders o
JOIN users u ON u.id = o.user_id
LEFT JOIN delivery_partners dp ON dp.id = o.delivery_partner_id
LEFT JOIN run_stops stop ON stop.id = (
    SELECT rs.id FROM run_stops rs
    WHERE rs.order_id = o.id AND rs.status <> 'skipped'
    ORDER BY rs.id DESC LIMIT 1
)
WHERE (sqlc.narg('delivery_date')::DATE IS NULL OR o.delivery_date = sqlc.narg('delivery_date'))
  AND (sqlc.narg('batch_id')::BIGINT IS NULL OR o.batch_id = sqlc.narg('batch_id'))
  AND (sqlc.narg('locality_id')::BIGINT IS NULL OR o.ship_locality_id = sqlc.narg('locality_id'))
  AND (sqlc.narg('run_id')::BIGINT IS NULL OR EXISTS (
       SELECT 1 FROM run_stops rs
       WHERE rs.order_id = o.id AND rs.status <> 'skipped' AND rs.run_id = sqlc.narg('run_id')))
  AND (sqlc.narg('partner_id')::BIGINT IS NULL OR o.delivery_partner_id = sqlc.narg('partner_id'))
  AND (sqlc.narg('status')::TEXT IS NULL OR o.status = sqlc.narg('status'))
  AND (sqlc.narg('search')::TEXT IS NULL
       OR u.name ILIKE '%' || sqlc.narg('search') || '%'
       OR u.phone ILIKE '%' || sqlc.narg('search') || '%'
       OR o.code ILIKE '%' || sqlc.narg('search') || '%')
  AND (sqlc.narg('before_id')::BIGINT IS NULL OR o.id < sqlc.narg('before_id'))
ORDER BY o.id DESC
LIMIT COALESCE(@max_rows, 50);

-- name: TransitionOrderStatus :execrows
UPDATE orders SET status = $2, updated_at = NOW(), updated_by_actor = $3
WHERE id = $1 AND status = $4;

-- name: SetOrderDelivered :one
UPDATE orders SET
    status = 'delivered',
    delivered_at = NOW(),
    updated_at = NOW(),
    updated_by_actor = $2
WHERE id = $1
RETURNING *;

-- name: SetOrderDeliveryFailed :one
UPDATE orders SET
    status = 'delivery_failed',
    failure_reason = $2,
    updated_at = NOW(),
    updated_by_actor = $3
WHERE id = $1
RETURNING *;

-- name: SetOrderRunAssignment :execrows
UPDATE orders SET
    delivery_partner_id = $2,
    status = CASE WHEN $3::BOOLEAN THEN 'assigned' ELSE status END,
    updated_at = NOW()
WHERE id = $1;

-- name: RevertOrderToReady :execrows
UPDATE orders SET
    delivery_partner_id = NULL,
    status = 'ready',
    updated_at = NOW()
WHERE id = $1 AND status = 'assigned';

-- name: ListOrdersForBatch :many
SELECT o.*, u.name AS user_name, u.phone AS user_phone
FROM orders o
JOIN users u ON u.id = o.user_id
WHERE o.batch_id = $1
ORDER BY o.id;

-- name: ListReadyOrdersForBatchLocality :many
SELECT o.*, u.name AS user_name, u.phone AS user_phone
FROM orders o
JOIN users u ON u.id = o.user_id
WHERE o.batch_id = $1
  AND o.ship_locality_id = $2
  AND o.status = 'ready'
ORDER BY o.id;

-- name: ListAssignedOrdersForRun :many
SELECT o.*, u.name AS user_name, u.phone AS user_phone
FROM orders o
JOIN run_stops rs ON rs.order_id = o.id AND rs.status <> 'skipped'
JOIN users u ON u.id = o.user_id
WHERE rs.run_id = $1
ORDER BY rs.position;

-- name: DashboardStatusCounts :many
SELECT status,
       COUNT(*)::BIGINT AS count,
       COALESCE(SUM(total_amount_paise), 0)::BIGINT AS total_paise
FROM orders
WHERE delivery_date = $1
GROUP BY status;

-- name: OrdersNeedingAttention :many
SELECT o.*, u.name AS user_name, u.phone AS user_phone
FROM orders o
JOIN users u ON u.id = o.user_id
WHERE o.delivery_date = $1
  AND o.status IN ('placed', 'confirmed', 'preparing')
ORDER BY o.id
LIMIT 20;
