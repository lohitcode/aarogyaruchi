-- name: GetAdmin :one
SELECT * FROM admins WHERE id = $1;

-- name: GetAdminByPhone :one
SELECT * FROM admins WHERE phone = $1;

-- name: ListAdmins :many
SELECT * FROM admins ORDER BY created_at DESC;

-- name: CreateAdmin :one
INSERT INTO admins (phone, name, role, locality_id)
VALUES ($1, $2, $3, $4)
RETURNING *;

-- name: UpsertSeedAdmin :one
INSERT INTO admins (phone, name, role)
VALUES ($1, $2, $3)
ON CONFLICT (phone) DO UPDATE SET
    role = EXCLUDED.role,
    is_active = TRUE
RETURNING *;

-- name: UpdateAdmin :one
UPDATE admins SET
    name = $2,
    role = $3,
    is_active = $4,
    locality_id = $5
WHERE id = $1
RETURNING *;
