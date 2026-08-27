// Package batch resolves which daily order batch a moment in time belongs to.
//
// Business rule: orders placed during one local calendar day belong to one
// batch and are delivered the following morning (Asia/Kolkata). The cutoff is
// configurable: an order placed after the cutoff minute on day D rolls to the
// batch of D+1 (delivered the morning after next). A cutoff of 00:00 means the
// boundary sits at the end of the calendar day, so every order on day D —
// including 23:59:59.999 — joins batch(D) for delivery on D+1.
package batch

import (
	"fmt"
	"time"
)

// Settings describes the batch policy in effect when an order is placed.
// CutoffMinutes is minutes after local midnight, 0–1439 (0 = midnight).
type Settings struct {
	CutoffMinutes int
	Timezone      *time.Location
}

// Resolution is the batch an order placed at a given moment joins.
type Resolution struct {
	// OrderDate is the local calendar date identifying the batch (midnight
	// in the business timezone on that date).
	OrderDate time.Time
	// DeliveryDate is the morning the batch is delivered (OrderDate + 1 day).
	DeliveryDate time.Time
}

// Policy renders the applied cutoff policy snapshot stored on the batch row,
// so later setting changes never move existing orders.
func (s Settings) Policy() string {
	offset := "+05:30"
	if s.Timezone != nil {
		if name := s.Timezone.String(); name != "" {
			offset = name
		}
	}
	return fmt.Sprintf("cutoff=%02d:%02d tz=%s", s.CutoffMinutes/60, s.CutoffMinutes%60, offset)
}

// Resolve maps a point in time to its batch.
//
// The batch boundary for order date D is midnight(D) + cutoff, where a cutoff
// of 0 is treated as 24:00 (end of day D). An order at or before the boundary
// joins batch(D) and is delivered D+1; an order after it joins batch(D+1).
func Resolve(t time.Time, s Settings) Resolution {
	loc := s.Timezone
	if loc == nil {
		loc = time.UTC
	}
	local := t.In(loc)
	midnight := time.Date(local.Year(), local.Month(), local.Day(), 0, 0, 0, 0, loc)

	cutoff := time.Duration(s.CutoffMinutes) * time.Minute
	if s.CutoffMinutes == 0 {
		cutoff = 24 * time.Hour
	}

	boundary := midnight.Add(cutoff)
	if !local.After(boundary) {
		return Resolution{OrderDate: midnight, DeliveryDate: midnight.AddDate(0, 0, 1)}
	}
	next := midnight.AddDate(0, 0, 1)
	return Resolution{OrderDate: next, DeliveryDate: next.AddDate(0, 0, 1)}
}
