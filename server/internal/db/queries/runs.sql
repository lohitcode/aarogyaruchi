-- name: CreateDeliveryRun :one
INSERT INTO delivery_runs (batch_id, delivery_date, name, partner_id, status)
VALUES ($1, $2, $3, $4, $5)
RETURNING *;

-- name: GetDeliveryRun :one
SELECT * FROM delivery_runs WHERE id = $1;

-- name: GetDeliveryRunForUpdate :one
SELECT * FROM delivery_runs WHERE id = $1 FOR UPDATE;

-- name: ListDeliveryRuns :many
SELECT r.*, dp.name AS partner_name,
       (SELECT COUNT(*) FROM run_stops rs WHERE rs.run_id = r.id)::BIGINT AS stop_count
FROM delivery_runs r
LEFT JOIN delivery_partners dp ON dp.id = r.partner_id
WHERE (sqlc.narg('delivery_date')::DATE IS NULL OR r.delivery_date = sqlc.narg('delivery_date'))
  AND (sqlc.narg('partner_id')::BIGINT IS NULL OR r.partner_id = sqlc.narg('partner_id'))
  AND (sqlc.narg('status')::TEXT IS NULL OR r.status = sqlc.narg('status'))
ORDER BY r.id DESC
LIMIT COALESCE(@max_rows, 100);

-- name: DashboardRunCounts :one
SELECT (COUNT(*) FILTER (WHERE status IN ('dispatched', 'in_progress')))::BIGINT AS active_count,
       COUNT(*)::BIGINT AS run_count
FROM delivery_runs
WHERE delivery_date BETWEEN $1 AND $2;

-- name: ListRunsForPartner :many
SELECT r.*,
       (SELECT COUNT(*) FROM run_stops rs WHERE rs.run_id = r.id)::BIGINT AS stop_count
FROM delivery_runs r
WHERE r.partner_id = $1
  AND (sqlc.narg('delivery_date')::DATE IS NULL OR r.delivery_date = sqlc.narg('delivery_date'))
  AND r.status <> 'cancelled'
ORDER BY r.delivery_date DESC, r.id DESC;

-- name: UpdateRunMeta :one
UPDATE delivery_runs SET
    name = $2,
    status = $3,
    updated_at = NOW()
WHERE id = $1
RETURNING *;

-- name: AssignRunPartner :one
UPDATE delivery_runs SET
    partner_id = $2,
    status = CASE WHEN status = 'draft' THEN 'assigned' ELSE status END,
    assigned_at = CASE WHEN status = 'draft' THEN NOW() ELSE assigned_at END,
    updated_at = NOW()
WHERE id = $1
RETURNING *;

-- name: DispatchRun :execrows
UPDATE delivery_runs
SET status = 'dispatched', dispatched_at = NOW(), updated_at = NOW()
WHERE id = $1 AND status = 'assigned';

-- name: StartRun :execrows
UPDATE delivery_runs
SET status = 'in_progress', updated_at = NOW()
WHERE id = $1 AND status IN ('dispatched', 'in_progress');

-- name: CompleteRun :execrows
UPDATE delivery_runs
SET status = 'completed', completed_at = NOW(), updated_at = NOW()
WHERE id = $1 AND status IN ('in_progress', 'dispatched');

-- name: ReconcileRun :execrows
UPDATE delivery_runs
SET status = 'reconciled', reconciled_at = NOW(), updated_at = NOW()
WHERE id = $1 AND status = 'completed';

-- name: CancelRun :execrows
UPDATE delivery_runs
SET status = 'cancelled', updated_at = NOW()
WHERE id = $1 AND status IN ('draft', 'assigned');

-- name: ListRunStops :many
SELECT rs.*,
       o.code AS order_code, o.total_amount_paise, o.status AS order_status,
       o.ship_address_line, o.ship_landmark, o.ship_latitude, o.ship_longitude,
       o.ship_instructions, o.delivery_date,
       u.id AS customer_id, u.name AS customer_name, u.phone AS customer_phone,
       l.name AS locality_name
FROM run_stops rs
JOIN orders o ON o.id = rs.order_id
JOIN users u ON u.id = o.user_id
LEFT JOIN localities l ON l.id = o.ship_locality_id
WHERE rs.run_id = $1
ORDER BY rs.position;

-- name: GetStop :one
SELECT rs.*, r.partner_id, r.status AS run_status
FROM run_stops rs
JOIN delivery_runs r ON r.id = rs.run_id
WHERE rs.id = $1;

-- name: GetStopWithOrder :one
SELECT rs.*,
       o.id AS order_id, o.code AS order_code, o.total_amount_paise, o.status AS order_status,
       o.user_id AS customer_id, u.name AS customer_name, u.phone AS customer_phone,
       o.ship_address_line, o.ship_landmark, o.ship_latitude, o.ship_longitude,
       r.partner_id, r.status AS run_status, r.delivery_date AS run_delivery_date
FROM run_stops rs
JOIN delivery_runs r ON r.id = rs.run_id
JOIN orders o ON o.id = rs.order_id
JOIN users u ON u.id = o.user_id
WHERE rs.id = $1;

-- name: AddStop :one
INSERT INTO run_stops (run_id, order_id, position)
SELECT $1, $2, COALESCE(MAX(position), 0) + 1
FROM run_stops WHERE run_id = $1
RETURNING *;

-- name: UpdateStopPosition :exec
UPDATE run_stops SET position = $2, updated_at = NOW() WHERE id = $1;

-- name: RemoveStop :execrows
DELETE FROM run_stops WHERE id = $1 AND run_id = $2;

-- name: SkipStopsForRun :exec
UPDATE run_stops SET status = 'skipped', updated_at = NOW()
WHERE run_id = $1 AND status IN ('pending', 'in_progress');

-- name: StartStop :execrows
UPDATE run_stops
SET status = 'in_progress', started_at = NOW(), updated_at = NOW()
WHERE id = $1 AND status = 'pending';

-- name: CompleteStop :execrows
UPDATE run_stops
SET status = 'delivered', completed_at = NOW(),
    collected_amount_paise = $2, note = $3, updated_at = NOW()
WHERE id = $1 AND status IN ('pending', 'in_progress');

-- name: FailStop :execrows
UPDATE run_stops
SET status = 'failed', completed_at = NOW(),
    failure_reason = $2, note = $3, updated_at = NOW()
WHERE id = $1 AND status IN ('pending', 'in_progress');

-- name: CountOpenStopsForRun :one
SELECT
    (COUNT(*) FILTER (WHERE status IN ('pending', 'in_progress')))::BIGINT AS open_count,
    (COUNT(*) FILTER (WHERE status = 'delivered'))::BIGINT AS delivered_count,
    (COUNT(*) FILTER (WHERE status = 'failed'))::BIGINT AS failed_count,
    (COUNT(*))::BIGINT AS total_count
FROM run_stops WHERE run_id = $1;

-- name: GetActiveRunForPartner :one
SELECT * FROM delivery_runs
WHERE partner_id = $1 AND status IN ('dispatched', 'in_progress')
ORDER BY id DESC
LIMIT 1;

-- name: ListTrackingCustomerIDsForRun :many
SELECT DISTINCT o.user_id
FROM run_stops rs
JOIN orders o ON o.id = rs.order_id
WHERE rs.run_id = $1 AND o.status = 'out_for_delivery';

-- name: ListRunStopsForOrder :many
SELECT rs.*, r.partner_id, r.status AS run_status
FROM run_stops rs
JOIN delivery_runs r ON r.id = rs.run_id
WHERE rs.order_id = $1
ORDER BY rs.id DESC;
