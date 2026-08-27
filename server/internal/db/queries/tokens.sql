-- name: InsertRefreshToken :exec
INSERT INTO refresh_tokens (partner_id, token_hash, expires_at)
VALUES ($1, $2, $3);

-- name: GetRefreshToken :one
SELECT * FROM refresh_tokens
WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > NOW();

-- name: RevokeRefreshToken :execrows
UPDATE refresh_tokens SET revoked_at = NOW()
WHERE token_hash = $1 AND revoked_at IS NULL;

-- name: TouchRefreshToken :exec
UPDATE refresh_tokens SET last_used_at = NOW() WHERE id = $1;

-- name: RevokeAllPartnerRefreshTokens :exec
UPDATE refresh_tokens SET revoked_at = NOW()
WHERE partner_id = $1 AND revoked_at IS NULL;
