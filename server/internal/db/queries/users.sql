-- name: GetUser :one
SELECT * FROM users WHERE id = $1;

-- name: GetUserByPhone :one
SELECT * FROM users WHERE phone = $1;

-- name: CreateUser :one
INSERT INTO users (phone, name)
VALUES ($1, $2)
ON CONFLICT (phone) DO UPDATE SET updated_at = NOW()
RETURNING *;

-- name: UpdateUserName :one
UPDATE users SET name = $2, updated_at = NOW() WHERE id = $1
RETURNING *;
