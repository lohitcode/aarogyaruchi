package validator

import "slices"

// Valid values
var (
	AdminRoles    = []string{"super_admin", "operations_admin"}
	OrderStatuses = []string{
		"placed", "confirmed", "preparing", "ready", "assigned",
		"picked_up", "out_for_delivery", "delivered", "cancelled", "delivery_failed",
	}
	RunStatuses = []string{"draft", "assigned", "dispatched", "in_progress", "completed", "reconciled", "cancelled"}
)

func IsValid(valid []string, val string) bool {
	return slices.Contains(valid, val)
}
