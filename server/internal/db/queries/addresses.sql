-- name: GetAddress :one
SELECT * FROM addresses WHERE id = $1 AND user_id = $2;

-- name: ListAddressesByUser :many
SELECT * FROM addresses WHERE user_id = $1
ORDER BY is_default DESC, created_at DESC;

-- name: GetDefaultAddress :one
SELECT * FROM addresses WHERE user_id = $1 AND is_default = TRUE
ORDER BY created_at DESC LIMIT 1;

-- name: CreateAddress :one
INSERT INTO addresses (
    user_id, label, address_line, landmark, locality_id,
    latitude, longitude, accuracy_m, instructions, is_default
) VALUES (
    $1, $2, $3, $4, $5,
    $6, $7, $8, $9, $10
)
RETURNING *;

-- name: UpdateAddress :one
UPDATE addresses SET
    label = $3,
    address_line = $4,
    landmark = $5,
    locality_id = $6,
    latitude = $7,
    longitude = $8,
    accuracy_m = $9,
    instructions = $10,
    is_default = $11,
    updated_at = NOW()
WHERE id = $1 AND user_id = $2
RETURNING *;

-- name: DeleteAddress :execrows
DELETE FROM addresses WHERE id = $1 AND user_id = $2;

-- name: ClearDefaultAddress :exec
UPDATE addresses SET is_default = FALSE, updated_at = NOW()
WHERE user_id = $1 AND is_default = TRUE;

-- name: CountAddressesByUser :one
SELECT COUNT(*) FROM addresses WHERE user_id = $1;
