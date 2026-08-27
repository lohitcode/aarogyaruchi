package batch

import (
	"testing"
	"time"
)

func ist(t *testing.T) *time.Location {
	t.Helper()
	loc, err := time.LoadLocation("Asia/Kolkata")
	if err != nil {
		t.Fatalf("load Asia/Kolkata: %v", err)
	}
	return loc
}

// atIST builds a time in Asia/Kolkata from wall-clock components.
func atIST(t *testing.T, y int, m time.Month, d, hh, mm, ss int) time.Time {
	t.Helper()
	return time.Date(y, m, d, hh, mm, ss, 0, ist(t))
}

func date(t *testing.T, y int, m time.Month, d int) time.Time {
	t.Helper()
	return time.Date(y, m, d, 0, 0, 0, 0, ist(t))
}

func TestDefaultCutoffSameCalendarDaySameBatch(t *testing.T) {
	s := Settings{CutoffMinutes: 0, Timezone: ist(t)}

	morning := Resolve(atIST(t, 2026, time.August, 24, 9, 0, 0), s)
	night := Resolve(atIST(t, 2026, time.August, 24, 23, 59, 59), s)

	if morning.OrderDate != night.OrderDate {
		t.Fatalf("orders during one calendar day must share a batch: %v vs %v", morning.OrderDate, night.OrderDate)
	}
	wantOrder := date(t, 2026, time.August, 24)
	wantDelivery := date(t, 2026, time.August, 25)
	if !morning.OrderDate.Equal(wantOrder) || !morning.DeliveryDate.Equal(wantDelivery) {
		t.Fatalf("got (%v, %v), want order %v delivered %v", morning.OrderDate, morning.DeliveryDate, wantOrder, wantDelivery)
	}
}

func TestMidnightBoundaryStartsNextBatch(t *testing.T) {
	s := Settings{CutoffMinutes: 0, Timezone: ist(t)}

	// 00:00:00 on the 25th is calendar day 25: it joins the 25th's batch
	// (delivered the 26th), distinct from 23:59:59 on the 24th.
	beforeMidnight := Resolve(atIST(t, 2026, time.August, 24, 23, 59, 59), s)
	atMidnight := Resolve(atIST(t, 2026, time.August, 25, 0, 0, 0), s)

	if beforeMidnight.OrderDate.Equal(atMidnight.OrderDate) {
		t.Fatalf("midnight must start a new batch, both resolved to %v", atMidnight.OrderDate)
	}
	if !atMidnight.OrderDate.Equal(date(t, 2026, time.August, 25)) || !atMidnight.DeliveryDate.Equal(date(t, 2026, time.August, 26)) {
		t.Fatalf("midnight order got (%v, %v)", atMidnight.OrderDate, atMidnight.DeliveryDate)
	}
}

func TestCustomCutoffRollsLateOrders(t *testing.T) {
	s := Settings{CutoffMinutes: 22 * 60, Timezone: ist(t)} // 22:00 cutoff

	beforeCutoff := Resolve(atIST(t, 2026, time.August, 24, 21, 59, 59), s)
	if !beforeCutoff.OrderDate.Equal(date(t, 2026, time.August, 24)) || !beforeCutoff.DeliveryDate.Equal(date(t, 2026, time.August, 25)) {
		t.Fatalf("order before 22:00 cutoff should deliver next morning, got (%v, %v)",
			beforeCutoff.OrderDate, beforeCutoff.DeliveryDate)
	}

	afterCutoff := Resolve(atIST(t, 2026, time.August, 24, 22, 0, 1), s)
	if !afterCutoff.OrderDate.Equal(date(t, 2026, time.August, 25)) || !afterCutoff.DeliveryDate.Equal(date(t, 2026, time.August, 26)) {
		t.Fatalf("order after 22:00 cutoff must roll one day, got (%v, %v)",
			afterCutoff.OrderDate, afterCutoff.DeliveryDate)
	}

	// The boundary instant itself (exactly 22:00:00) still makes the batch.
	atCutoff := Resolve(atIST(t, 2026, time.August, 24, 22, 0, 0), s)
	if !atCutoff.OrderDate.Equal(date(t, 2026, time.August, 24)) {
		t.Fatalf("order exactly at cutoff should join today's batch, got %v", atCutoff.OrderDate)
	}
}

func TestMorningCutoffEarlyOrdersJoinPreviousBatch(t *testing.T) {
	// A 06:00 cutoff: the batch window is (D-1 06:00, D 06:00], delivered
	// D+1 morning. So a 05:30 order on the 25th sits in the window closing
	// 25th 06:00 and is delivered the 26th; a 06:30 order rolls to the 27th.
	s := Settings{CutoffMinutes: 6 * 60, Timezone: ist(t)}

	early := Resolve(atIST(t, 2026, time.August, 25, 5, 30, 0), s)
	if !early.OrderDate.Equal(date(t, 2026, time.August, 25)) || !early.DeliveryDate.Equal(date(t, 2026, time.August, 26)) {
		t.Fatalf("early morning order got (%v, %v), want batch 25th delivered 26th",
			early.OrderDate, early.DeliveryDate)
	}

	lateMorning := Resolve(atIST(t, 2026, time.August, 25, 6, 30, 0), s)
	if !lateMorning.OrderDate.Equal(date(t, 2026, time.August, 26)) || !lateMorning.DeliveryDate.Equal(date(t, 2026, time.August, 27)) {
		t.Fatalf("post-cutoff order got (%v, %v), want batch 26th delivered 27th",
			lateMorning.OrderDate, lateMorning.DeliveryDate)
	}
}

func TestMonthAndYearBoundaries(t *testing.T) {
	s := Settings{CutoffMinutes: 0, Timezone: ist(t)}

	endOfMonth := Resolve(atIST(t, 2026, time.December, 31, 23, 0, 0), s)
	if !endOfMonth.DeliveryDate.Equal(date(t, 2027, time.January, 1)) {
		t.Fatalf("Dec 31 order should deliver Jan 1, got %v", endOfMonth.DeliveryDate)
	}
}

func TestUTCTimestampsResolveInBusinessTimezone(t *testing.T) {
	loc := ist(t)
	s := Settings{CutoffMinutes: 0, Timezone: loc}

	// 2026-08-24 18:30 UTC == 2026-08-25 00:00 IST exactly: midnight starts
	// the 25th's batch.
	utcMidnight := time.Date(2026, time.August, 24, 18, 30, 0, 0, time.UTC)
	got := Resolve(utcMidnight, s)
	if !got.OrderDate.Equal(date(t, 2026, time.August, 25)) {
		t.Fatalf("UTC midnight IST got batch %v, want Aug 25", got.OrderDate)
	}

	// One second earlier is still the 24th in IST.
	justBefore := utcMidnight.Add(-time.Second)
	got = Resolve(justBefore, s)
	if !got.OrderDate.Equal(date(t, 2026, time.August, 24)) {
		t.Fatalf("just-before-midnight got batch %v, want Aug 24", got.OrderDate)
	}
}

func TestPolicySnapshot(t *testing.T) {
	s := Settings{CutoffMinutes: 22 * 60, Timezone: ist(t)}
	if got, want := s.Policy(), "cutoff=22:00 tz=Asia/Kolkata"; got != want {
		t.Fatalf("policy = %q, want %q", got, want)
	}
	zero := Settings{CutoffMinutes: 0, Timezone: ist(t)}
	if got, want := zero.Policy(), "cutoff=00:00 tz=Asia/Kolkata"; got != want {
		t.Fatalf("policy = %q, want %q", got, want)
	}
}
