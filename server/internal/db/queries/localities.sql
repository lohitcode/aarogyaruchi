-- name: GetLocality :one
SELECT * FROM localities WHERE id = $1;

-- name: ListLocalities :many
SELECT * FROM localities WHERE is_active = TRUE ORDER BY name;

-- name: ListAllLocalities :many
SELECT * FROM localities ORDER BY name;

-- name: CreateLocality :one
INSERT INTO localities (name, city, perimeters) VALUES ($1, $2, $3) RETURNING *;

-- name: UpdateLocality :one
UPDATE localities SET name = $2, city = $3, is_active = $4, perimeters = $5
WHERE id = $1
RETURNING *;

-- name: ListLocalityPerimeters :many
SELECT id, name, city, is_active, perimeters FROM localities;

-- name: LockLocalityOverlapCheck :exec
-- Serialises perimeter writes so the read-validate-write overlap check in the
-- handler cannot race a concurrent create/update. Transaction-scoped: the
-- lock releases on commit/rollback.
SELECT pg_advisory_xact_lock(942017);
