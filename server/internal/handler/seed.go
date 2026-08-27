package handler

import (
	"context"
	"log"
	"strings"

	"aarogyaruchi/internal/db/sqlc"
)

// SeedPrivilegedAccounts upserts the admin and delivery-partner phones that
// arrive via private server environment variables (SEED_ADMIN_PHONES,
// SEED_PARTNER_PHONES). Idempotent — runs at every boot.
func (h *Handler) SeedPrivilegedAccounts(ctx context.Context) {
	for _, phone := range h.config.SeedAdminPhones {
		phone, ok := normalizePhone(phone)
		if !ok {
			log.Printf("seed: skipping invalid admin phone %q", phone)
			continue
		}
		admin, err := h.queries.UpsertSeedAdmin(ctx, sqlc.UpsertSeedAdminParams{
			Phone: phone,
			Name:  pgText("Admin " + phone[len(phone)-4:]),
			Role:  "super_admin",
		})
		if err != nil {
			log.Printf("seed: failed to upsert admin %s: %v", maskPhone(phone), err)
			continue
		}
		log.Printf("seed: admin %s ready (role=%s)", maskPhone(phone), admin.Role)
	}

	for _, phone := range h.config.SeedPartnerPhones {
		phone, ok := normalizePhone(phone)
		if !ok {
			log.Printf("seed: skipping invalid partner phone %q", phone)
			continue
		}
		if _, err := h.queries.UpsertSeedDeliveryPartner(ctx, sqlc.UpsertSeedDeliveryPartnerParams{
			Phone: phone,
			Name:  pgText("Partner " + phone[len(phone)-4:]),
		}); err != nil {
			log.Printf("seed: failed to upsert partner %s: %v", maskPhone(phone), err)
			continue
		}
		log.Printf("seed: delivery partner %s ready", maskPhone(phone))
	}
}

// maskPhone keeps full numbers out of logs.
func maskPhone(phone string) string {
	if len(phone) <= 4 {
		return strings.Repeat("*", len(phone))
	}
	return strings.Repeat("*", len(phone)-4) + phone[len(phone)-4:]
}
