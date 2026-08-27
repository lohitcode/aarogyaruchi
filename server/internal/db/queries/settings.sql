-- name: GetOperatingSettings :one
SELECT * FROM operating_settings WHERE id = 1;

-- name: UpdateOperatingSettings :one
UPDATE operating_settings SET
    cutoff_minutes = $1,
    delivery_window_start = $2,
    delivery_window_end = $3,
    tracking_enabled = $4,
    updated_at = NOW(),
    updated_by = $5
WHERE id = 1
RETURNING *;
