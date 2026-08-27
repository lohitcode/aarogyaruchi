package orderstate

import "testing"

func TestHappyPathAdminThenPartner(t *testing.T) {
	path := []struct {
		from, to, actor string
	}{
		{Placed, Confirmed, ActorAdmin},
		{Confirmed, Preparing, ActorAdmin},
		{Preparing, Ready, ActorAdmin},
		{Ready, Assigned, ActorAdmin},
		{Assigned, PickedUp, ActorPartner},
		{PickedUp, OutForDelivery, ActorPartner},
		{OutForDelivery, Delivered, ActorPartner},
	}
	for _, step := range path {
		if !CanTransition(step.from, step.to, step.actor) {
			t.Fatalf("transition %s → %s by %s should be allowed", step.from, step.to, step.actor)
		}
	}
}

func TestRejectsWrongActorAndSkips(t *testing.T) {
	rejected := []struct {
		from, to, actor string
	}{
		// Partner cannot drive admin preparation steps.
		{Placed, Confirmed, ActorPartner},
		{Confirmed, Preparing, ActorPartner},
		{Preparing, Ready, ActorPartner},
		// Admin cannot drive partner route steps.
		{Assigned, PickedUp, ActorAdmin},
		{PickedUp, OutForDelivery, ActorAdmin},
		{OutForDelivery, Delivered, ActorAdmin},
		// No skipping lifecycle stages.
		{Placed, Ready, ActorAdmin},
		{Confirmed, Assigned, ActorAdmin},
		{Placed, Delivered, ActorPartner},
		{Ready, OutForDelivery, ActorPartner},
		// Cannot assign an unprepared order.
		{Placed, Assigned, ActorAdmin},
		{Confirmed, Assigned, ActorAdmin},
	}
	for _, step := range rejected {
		if CanTransition(step.from, step.to, step.actor) {
			t.Fatalf("transition %s → %s by %s must be rejected", step.from, step.to, step.actor)
		}
	}
}

func TestCancellationRules(t *testing.T) {
	cases := []struct {
		status          string
		customer, admin bool
	}{
		{Placed, true, true},
		{Confirmed, true, true},
		{Preparing, false, true},
		{Ready, false, true},
		{Assigned, false, true},
		{PickedUp, false, false},
		{OutForDelivery, false, false},
		{Delivered, false, false},
		{Cancelled, false, false},
		{DeliveryFailed, false, false},
	}
	for _, c := range cases {
		if got := CustomerCancellable(c.status); got != c.customer {
			t.Errorf("CustomerCancellable(%s) = %v, want %v", c.status, got, c.customer)
		}
		if got := CanTransition(c.status, Cancelled, ActorCustomer); got != c.customer {
			t.Errorf("customer cancel from %s = %v, want %v", c.status, got, c.customer)
		}
		if got := CanTransition(c.status, Cancelled, ActorAdmin); got != c.admin {
			t.Errorf("admin cancel from %s = %v, want %v", c.status, got, c.admin)
		}
	}
}

func TestFailureAndRestoreEdges(t *testing.T) {
	if !CanTransition(OutForDelivery, DeliveryFailed, ActorPartner) {
		t.Fatal("partner failed-attempt from out_for_delivery should be allowed")
	}
	if !CanTransition(PickedUp, DeliveryFailed, ActorPartner) {
		t.Fatal("partner failed-attempt from picked_up should be allowed")
	}
	if CanTransition(Ready, DeliveryFailed, ActorPartner) {
		t.Fatal("partner cannot fail an order that was never picked up")
	}
	if !CanTransition(Assigned, Ready, ActorAdmin) {
		t.Fatal("admin must be able to pull an order back out of a draft run")
	}
}

func TestTerminalAndValid(t *testing.T) {
	for _, s := range []string{Delivered, Cancelled, DeliveryFailed} {
		if !Terminal(s) {
			t.Errorf("%s should be terminal", s)
		}
		if CanTransition(s, Placed, ActorAdmin) || CanTransition(s, Cancelled, ActorAdmin) {
			t.Errorf("no transitions out of terminal state %s", s)
		}
	}
	if !Valid(Placed) || Valid("pending") {
		t.Error("Valid() must match the constrained status set")
	}
}
