-- name: InsertIdempotencyKey :exec
INSERT INTO idempotency_keys (key, user_id, endpoint, request_hash)
VALUES ($1, $2, $3, $4);

-- name: GetIdempotencyKey :one
SELECT * FROM idempotency_keys WHERE key = $1;

-- name: SaveIdempotencyResponse :exec
UPDATE idempotency_keys
SET response = $2, status_code = $3
WHERE key = $1;
