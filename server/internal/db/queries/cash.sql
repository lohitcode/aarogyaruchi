-- name: GetCashHandoverByRun :one
SELECT * FROM cash_handovers WHERE run_id = $1;

-- name: CreateCashHandover :one
INSERT INTO cash_handovers (run_id, expected_paise) VALUES ($1, $2)
RETURNING *;

-- name: SubmitCashHandover :execrows
UPDATE cash_handovers
SET submitted_paise = $2,
    submitted_note = $3,
    submitted_at = NOW(),
    status = 'submitted'
WHERE run_id = $1 AND status = 'pending';

-- name: ConfirmCashHandover :execrows
UPDATE cash_handovers
SET confirmed_paise = $2,
    discrepancy_paise = $3,
    admin_id = $4,
    confirmed_at = NOW(),
    status = 'confirmed'
WHERE run_id = $1 AND status = 'submitted';

-- name: RunCashTotals :one
SELECT
    COALESCE(SUM(o.total_amount_paise) FILTER (WHERE rs.status = 'delivered'), 0)::BIGINT AS collected_paise,
    COALESCE(SUM(o.total_amount_paise) FILTER (WHERE rs.status IN ('pending', 'in_progress')), 0)::BIGINT AS pending_paise,
    COALESCE(SUM(o.total_amount_paise) FILTER (WHERE rs.status = 'failed'), 0)::BIGINT AS failed_paise
FROM run_stops rs
JOIN orders o ON o.id = rs.order_id
WHERE rs.run_id = $1;

-- name: ListHandoverHistory :many
SELECT ch.*, r.delivery_date, dp.name AS partner_name
FROM cash_handovers ch
JOIN delivery_runs r ON r.id = ch.run_id
LEFT JOIN delivery_partners dp ON dp.id = r.partner_id
ORDER BY ch.submitted_at DESC NULLS LAST, ch.id DESC
LIMIT @max_rows;
