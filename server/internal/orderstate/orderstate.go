// Package orderstate defines the server-enforced order lifecycle.
//
//	placed → confirmed → preparing → ready → assigned → picked_up → out_for_delivery → delivered
//
// Terminal: cancelled, delivery_failed. The backend is authoritative: every
// transition is validated against this table before it is applied, and each
// applied transition is recorded in order_status_history.
package orderstate

// Status values (must match the orders_status_check constraint).
const (
	Placed         = "placed"
	Confirmed      = "confirmed"
	Preparing      = "preparing"
	Ready          = "ready"
	Assigned       = "assigned"
	PickedUp       = "picked_up"
	OutForDelivery = "out_for_delivery"
	Delivered      = "delivered"
	Cancelled      = "cancelled"
	DeliveryFailed = "delivery_failed"
)

// Actor roles that can drive transitions.
const (
	ActorCustomer = "customer"
	ActorAdmin    = "admin"
	ActorPartner  = "partner"
	ActorSystem   = "system"
)

type edge struct {
	From string
	To   string
}

// allowed maps each permitted edge to the set of actors that may drive it.
var allowed = map[edge][]string{
	// Admin prepares the day's orders.
	{Placed, Confirmed}:    {ActorAdmin},
	{Confirmed, Preparing}: {ActorAdmin},
	{Preparing, Ready}:     {ActorAdmin},

	// Run lifecycle: assignment (admin), pickup/departure (partner).
	{Ready, Assigned}:    {ActorAdmin, ActorSystem},
	{Assigned, Ready}:    {ActorAdmin, ActorSystem}, // removed from a draft run
	{Assigned, PickedUp}: {ActorPartner},

	// Partner drives the route.
	{PickedUp, OutForDelivery}:       {ActorPartner},
	{OutForDelivery, Delivered}:      {ActorPartner},
	{PickedUp, Delivered}:            {ActorPartner},
	{OutForDelivery, DeliveryFailed}: {ActorPartner},
	{PickedUp, DeliveryFailed}:       {ActorPartner},

	// Cancellations.
	{Placed, Cancelled}:    {ActorCustomer, ActorAdmin},
	{Confirmed, Cancelled}: {ActorCustomer, ActorAdmin},
	{Preparing, Cancelled}: {ActorAdmin},
	{Ready, Cancelled}:     {ActorAdmin},
	{Assigned, Cancelled}:  {ActorAdmin},
}

// CanTransition reports whether actor may move an order from one status to
// another.
func CanTransition(from, to, actor string) bool {
	actors, ok := allowed[edge{from, to}]
	if !ok {
		return false
	}
	for _, a := range actors {
		if a == actor {
			return true
		}
	}
	return false
}

// Valid reports whether s is a known status.
func Valid(s string) bool {
	switch s {
	case Placed, Confirmed, Preparing, Ready, Assigned, PickedUp,
		OutForDelivery, Delivered, Cancelled, DeliveryFailed:
		return true
	}
	return false
}

// CustomerCancellable reports whether the customer may still cancel (only
// before preparation begins).
func CustomerCancellable(s string) bool {
	return s == Placed || s == Confirmed
}

// Terminal reports whether s is a final state.
func Terminal(s string) bool {
	return s == Delivered || s == Cancelled || s == DeliveryFailed
}
