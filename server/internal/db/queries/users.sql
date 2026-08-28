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

-- Customer profile for the ops console: identity, best address (default
-- first, else most recent), and notification reachability. Drives the
-- customer-details dialog in the admin chat.
-- name: AdminGetUserDetail :one
SELECT u.id, u.phone, u.name, u.created_at,
       a.label AS address_label, COALESCE(a.address_line, '') AS address_line, a.landmark,
       a.latitude, a.longitude,
       l.name AS locality_name, l.city AS locality_city,
       (SELECT COUNT(*) FROM addresses a2 WHERE a2.user_id = u.id)::BIGINT AS address_count,
       EXISTS (SELECT 1 FROM push_subscriptions ps
               WHERE ps.role = 'user' AND ps.user_id = u.id) AS push_subscribed,
       ns.permission AS notif_permission, ns.reported_at AS notif_reported_at
FROM users u
LEFT JOIN LATERAL (
    SELECT ad.*
    FROM addresses ad
    WHERE ad.user_id = u.id
    ORDER BY ad.is_default DESC, ad.created_at DESC
    LIMIT 1
) a ON true
LEFT JOIN localities l ON l.id = a.locality_id
LEFT JOIN notification_states ns ON ns.role = 'user' AND ns.user_id = u.id
WHERE u.id = $1;
