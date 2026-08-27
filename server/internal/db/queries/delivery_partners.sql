-- name: GetDeliveryPartner :one
SELECT * FROM delivery_partners WHERE id = $1;

-- name: GetDeliveryPartnerByPhone :one
SELECT * FROM delivery_partners WHERE phone = $1;

-- name: ListDeliveryPartners :many
SELECT * FROM delivery_partners ORDER BY created_at DESC;

-- name: ListActiveDeliveryPartners :many
SELECT * FROM delivery_partners WHERE is_active = TRUE ORDER BY name;

-- name: CreateDeliveryPartner :one
INSERT INTO delivery_partners (phone, name, admin_id)
VALUES ($1, $2, $3)
RETURNING *;

-- name: UpsertSeedDeliveryPartner :one
INSERT INTO delivery_partners (phone, name)
VALUES ($1, $2)
ON CONFLICT (phone) DO UPDATE SET is_active = TRUE
RETURNING *;

-- name: UpdateDeliveryPartner :one
UPDATE delivery_partners SET
    name = $2,
    phone = $3,
    is_active = $4
WHERE id = $1
RETURNING *;
