-- name: GetOrCreateChatThread :one
INSERT INTO chat_threads (user_id)
VALUES ($1)
ON CONFLICT (user_id) DO UPDATE SET user_id = EXCLUDED.user_id
RETURNING *;

-- name: GetChatThread :one
SELECT * FROM chat_threads WHERE id = $1;

-- name: InsertChatMessage :one
INSERT INTO chat_messages (thread_id, sender_role, sender_id, body)
VALUES ($1, $2, $3, $4)
RETURNING *;

-- name: TouchChatThread :exec
UPDATE chat_threads SET last_message_at = NOW() WHERE id = $1;

-- Customer's unread support messages: admin sends after the customer's
-- last read. Zero rows (no thread yet) counts as zero.
-- name: CountUnreadChatForUser :one
SELECT COUNT(*)::BIGINT AS unread
FROM chat_messages m
JOIN chat_threads t ON t.id = m.thread_id
WHERE t.user_id = $1
  AND m.sender_role = 'admin'
  AND m.created_at > t.last_read_by_user_at;

-- name: MarkChatThreadReadByUser :exec
UPDATE chat_threads SET last_read_by_user_at = NOW() WHERE id = $1;

-- name: MarkChatThreadReadByAdmin :exec
UPDATE chat_threads SET last_read_by_admin_at = NOW() WHERE id = $1;

-- name: ListChatMessages :many
SELECT m.*, u.phone AS sender_phone, u.name AS sender_name
FROM chat_messages m
LEFT JOIN users u ON u.id = m.sender_id AND m.sender_role = 'user'
WHERE m.thread_id = $1
ORDER BY m.id
LIMIT 500;

-- name: ListChatMessagesAfter :many
SELECT m.*, u.phone AS sender_phone, u.name AS sender_name
FROM chat_messages m
LEFT JOIN users u ON u.id = m.sender_id AND m.sender_role = 'user'
WHERE m.thread_id = $1 AND m.id > $2
ORDER BY m.id
LIMIT 500;

-- Support inbox: every customer that has a thread, newest activity first.
-- name: AdminListChatThreads :many
SELECT t.id AS thread_id, t.last_message_at, t.last_read_by_admin_at,
       u.id AS user_id, u.phone AS user_phone, u.name AS user_name,
       COALESCE((SELECT m.body FROM chat_messages m WHERE m.thread_id = t.id ORDER BY m.id DESC LIMIT 1), '') AS last_message,
       (SELECT COUNT(*) FROM chat_messages m
         WHERE m.thread_id = t.id AND m.sender_role = 'user'
           AND m.created_at > t.last_read_by_admin_at)::BIGINT AS unread_count
FROM chat_threads t
JOIN users u ON u.id = t.user_id
ORDER BY t.last_message_at DESC
LIMIT 200;

-- Every customer, with their thread state (null when no thread yet).
-- name: AdminListUsers :many
SELECT u.id AS user_id, u.phone, u.name, u.created_at,
       t.id AS thread_id,
       t.last_message_at,
       COALESCE((SELECT m.body FROM chat_messages m WHERE m.thread_id = t.id ORDER BY m.id DESC LIMIT 1), '') AS last_message,
       (SELECT COUNT(*) FROM chat_messages m
         WHERE m.thread_id = t.id AND m.sender_role = 'user'
           AND m.created_at > t.last_read_by_admin_at)::BIGINT AS unread_count,
       (SELECT COUNT(*) FROM orders o WHERE o.user_id = u.id)::BIGINT AS order_count
FROM users u
LEFT JOIN chat_threads t ON t.user_id = u.id
ORDER BY t.last_message_at DESC NULLS LAST, u.created_at DESC
LIMIT 500;
