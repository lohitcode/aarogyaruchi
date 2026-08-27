-- name: InsertOrderStatusHistory :exec
INSERT INTO order_status_history (order_id, from_status, to_status, actor_type, actor_id, note)
VALUES ($1, $2, $3, $4, $5, $6);

-- name: ListOrderStatusHistory :many
SELECT * FROM order_status_history WHERE order_id = $1 ORDER BY id;
