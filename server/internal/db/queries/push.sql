-- name: UpsertPushSubscription :one
INSERT INTO push_subscriptions (role, user_id, admin_id, endpoint, p256dh, auth, user_agent)
VALUES ($1, $2, $3, $4, $5, $6, $7)
ON CONFLICT (endpoint) DO UPDATE SET
    role = EXCLUDED.role,
    user_id = EXCLUDED.user_id,
    admin_id = EXCLUDED.admin_id,
    p256dh = EXCLUDED.p256dh,
    auth = EXCLUDED.auth,
    user_agent = EXCLUDED.user_agent
RETURNING *;

-- name: DeletePushSubscriptionByEndpoint :execrows
DELETE FROM push_subscriptions WHERE endpoint = $1;

-- name: DeletePushSubscription :execrows
DELETE FROM push_subscriptions WHERE id = $1;

-- name: ListPushSubscriptionsForUser :many
SELECT * FROM push_subscriptions WHERE role = 'user' AND user_id = $1;

-- name: ListPushSubscriptionsForAdmins :many
SELECT * FROM push_subscriptions WHERE role = 'admin';

-- name: UpsertNotificationState :one
INSERT INTO notification_states (role, user_id, admin_id, permission)
VALUES ($1, $2, $3, $4)
ON CONFLICT (user_id, admin_id) DO UPDATE SET
    permission = EXCLUDED.permission,
    reported_at = NOW()
RETURNING *;
