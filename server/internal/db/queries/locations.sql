-- name: InsertLocationSample :exec
INSERT INTO location_samples (
    partner_id, run_id, latitude, longitude,
    accuracy_m, speed_mps, heading_deg, recorded_at
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8);

-- name: ListLocationSamplesForRun :many
SELECT * FROM location_samples
WHERE run_id = $1
ORDER BY recorded_at DESC
LIMIT $2;

-- name: GetLatestLocationSample :one
SELECT * FROM location_samples
WHERE partner_id = $1
ORDER BY recorded_at DESC
LIMIT 1;

-- name: PruneLocationSamples :execrows
DELETE FROM location_samples WHERE recorded_at < NOW() - INTERVAL '14 days';

-- name: ListActiveRunsWithPartnerLocation :many
SELECT r.id AS run_id, r.partner_id, r.delivery_date, dp.name AS partner_name,
       ls.latitude, ls.longitude, ls.accuracy_m, ls.speed_mps, ls.heading_deg,
       ls.recorded_at
FROM delivery_runs r
JOIN delivery_partners dp ON dp.id = r.partner_id
LEFT JOIN LATERAL (
    SELECT * FROM location_samples l
    WHERE l.partner_id = r.partner_id
    ORDER BY l.recorded_at DESC LIMIT 1
) ls ON TRUE
WHERE r.status IN ('dispatched', 'in_progress')
ORDER BY r.id;
