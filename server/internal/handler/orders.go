package handler

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"sort"
	"strconv"
	"time"

	"aarogyaruchi/internal/db/sqlc"
	"aarogyaruchi/internal/middleware"
	"aarogyaruchi/internal/orderstate"
	"aarogyaruchi/internal/ratelimit"
	"aarogyaruchi/internal/websocket"
	"aarogyaruchi/internal/webpush"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgtype"
)

type orderItemRequest struct {
	VariantID int64 `json:"variant_id"`
	Quantity  int32 `json:"quantity"`
}

type quoteRequest struct {
	Items      []orderItemRequest `json:"items"`
	LocalityID int64              `json:"locality_id"`
}

type itemLine struct {
	VariantID  int64  `json:"variant_id"`
	Name       string `json:"name"`
	SizeLabel  string `json:"size_label,omitempty"`
	Unit       string `json:"unit,omitempty"`
	Quantity   int32  `json:"quantity"`
	UnitPaise  int64  `json:"unit_price_paise"`
	TotalPaise int64  `json:"total_price_paise"`
}

// validateItems checks the item list shape (non-empty, sane quantities).
func validateItems(items []orderItemRequest) error {
	if len(items) == 0 {
		return errors.New("items are required")
	}
	if len(items) > 50 {
		return errors.New("too many items")
	}
	seen := make(map[int64]bool, len(items))
	for _, it := range items {
		if it.VariantID <= 0 {
			return errors.New("invalid variant_id")
		}
		if it.Quantity < 1 || it.Quantity > 50 {
			return errors.New("quantity must be between 1 and 50")
		}
		if seen[it.VariantID] {
			return errors.New("duplicate variant in items")
		}
		seen[it.VariantID] = true
	}
	return nil
}

// priceItems loads products with a row lock (FOR UPDATE inside the caller's
// transaction) and computes per-line and total amounts in integer paise.
func priceItems(ctx context.Context, q *sqlc.Queries, items []orderItemRequest) ([]itemLine, int64, error) {
	ids := make([]int64, 0, len(items))
	for _, it := range items {
		ids = append(ids, it.VariantID)
	}
	variants, err := q.GetVariantsForUpdate(ctx, ids)
	if err != nil {
		return nil, 0, err
	}
	byID := make(map[int64]sqlc.GetVariantsForUpdateRow, len(variants))
	for _, v := range variants {
		byID[v.ID] = v
	}

	lines := make([]itemLine, 0, len(items))
	var total int64
	for _, it := range items {
		v, ok := byID[it.VariantID]
		if !ok {
			return nil, 0, fmt.Errorf("product %d unavailable", it.VariantID)
		}
		line := itemLine{
			VariantID:  v.ID,
			Name:       v.ProductName,
			SizeLabel:  v.SizeLabel.String,
			Unit:       v.Unit.String,
			Quantity:   it.Quantity,
			UnitPaise:  v.PricePaise,
			TotalPaise: v.PricePaise * int64(it.Quantity),
		}
		if v.PricePaise > 0 && line.TotalPaise/v.PricePaise != int64(it.Quantity) {
			return nil, 0, errors.New("amount overflow")
		}
		total += line.TotalPaise
		lines = append(lines, line)
	}
	return lines, total, nil
}

// QuoteOrder validates items, locality, and the open batch, and returns the
// computed totals and delivery date without persisting anything.
func (h *Handler) QuoteOrder(w http.ResponseWriter, r *http.Request) {
	var req quoteRequest
	if err := decodeJSON(r, &req); err != nil {
		h.Error(w, http.StatusBadRequest, "invalid request")
		return
	}
	if err := validateItems(req.Items); err != nil {
		h.Error(w, http.StatusBadRequest, err.Error())
		return
	}

	ctx := r.Context()
	if req.LocalityID != 0 {
		locality, err := h.queries.GetLocality(ctx, req.LocalityID)
		if err != nil || !locality.IsActive.Bool {
			h.Error(w, http.StatusBadRequest, "locality not serviceable")
			return
		}
	}

	b, _, err := h.resolveCurrentBatch(ctx, h.queries)
	if err != nil {
		h.Error(w, http.StatusInternalServerError, "failed to resolve batch")
		return
	}
	if b.Status != "open" {
		h.Error(w, http.StatusConflict, "today's batch is closed")
		return
	}

	lines, total, err := priceItems(ctx, h.queries, req.Items)
	if err != nil {
		h.Error(w, http.StatusBadRequest, err.Error())
		return
	}

	h.JSON(w, http.StatusOK, map[string]any{
		"items":          lines,
		"total_paise":    total,
		"currency":       "INR",
		"payment_method": "cash_on_delivery",
		"delivery_date":  b.DeliveryDate.Time.Format("2006-01-02"),
		"batch_id":       b.ID,
		"batch_status":   b.Status,
		"cutoff_policy":  b.CutoffPolicy,
	})
}

type createOrderRequest struct {
	AddressID  int64              `json:"address_id"`
	LocalityID int64              `json:"locality_id"`
	Items      []orderItemRequest `json:"items"`
}

// CreateOrder places a cash-on-delivery order atomically: idempotency check,
// batch resolution, immutable address + price snapshots, and the initial
// status-history row all commit or roll back together.
func (h *Handler) CreateOrder(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.GetUserID(r.Context())

	var req createOrderRequest
	if err := decodeJSON(r, &req); err != nil {
		h.Error(w, http.StatusBadRequest, "invalid request")
		return
	}
	if err := validateItems(req.Items); err != nil {
		h.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	if req.AddressID == 0 {
		h.Error(w, http.StatusBadRequest, "address_id is required")
		return
	}

	// Idempotency: same key + same body replays the stored response.
	idemKey := r.Header.Get("Idempotency-Key")
	bodyHash := ""
	if idemKey != "" {
		if len(idemKey) > 128 {
			h.Error(w, http.StatusBadRequest, "idempotency key too long")
			return
		}
		bodyHash = hashRequest(req)
		if h.checkIdempotency(w, r, idemKey, userID, bodyHash) {
			return
		}
	}

	// Rate-limit order creation per customer.
	if !ratelimit.Allow(r.Context(), h.cache, ratelimit.Key("orders", strconv.FormatInt(userID, 10)), 20, time.Hour) {
		h.Error(w, http.StatusTooManyRequests, "too many orders, slow down")
		return
	}

	var order sqlc.Order
	var lines []itemLine
	err := h.withTx(r.Context(), func(q *sqlc.Queries) error {
		ctx := r.Context()

		// Address must belong to the customer; snapshot its fields.
		addr, err := q.GetAddress(ctx, sqlc.GetAddressParams{ID: req.AddressID, UserID: userID})
		if err != nil {
			return errAddress
		}
		if addr.LocalityID.Valid {
			locality, err := q.GetLocality(ctx, addr.LocalityID.Int64)
			if err != nil || !locality.IsActive.Bool {
				return errLocalityInactive
			}
		}

		// Resolve (and persist) today's batch; closed batches reject checkout.
		b, _, err := h.resolveCurrentBatch(ctx, q)
		if err != nil {
			return err
		}
		if b.ID == 0 {
			b, err = q.GetOrCreateBatch(ctx, sqlc.GetOrCreateBatchParams{
				OrderDate:    b.OrderDate,
				DeliveryDate: b.DeliveryDate,
				CutoffPolicy: b.CutoffPolicy,
			})
			if err != nil {
				return err
			}
		}
		if b.Status != "open" {
			return errBatchClosed
		}

		lines, _, err = priceItems(ctx, q, req.Items)
		if err != nil {
			return err
		}
		var total int64
		for _, l := range lines {
			total += l.TotalPaise
		}

		code, err := newOrderCode()
		if err != nil {
			return err
		}
		pkgToken, err := newPackageToken()
		if err != nil {
			return err
		}

		order, err = q.CreateOrder(ctx, sqlc.CreateOrderParams{
			Code:             pgText(code),
			UserID:           userID,
			BatchID:          pgInt8(b.ID),
			DeliveryDate:     b.DeliveryDate,
			TotalAmountPaise: total,
			PackageToken:     pgText(pkgToken),
			ShipAddressLine:  pgText(addr.AddressLine),
			ShipLandmark:     addr.Landmark,
			ShipLocalityID:   addr.LocalityID,
			ShipLatitude:     addr.Latitude,
			ShipLongitude:    addr.Longitude,
			ShipAccuracyM:    addr.AccuracyM,
			ShipInstructions: addr.Instructions,
		})
		if err != nil {
			return err
		}

		for _, l := range lines {
			if _, err := q.CreateOrderItem(ctx, sqlc.CreateOrderItemParams{
				OrderID:        order.ID,
				VariantID:      l.VariantID,
				Quantity:       l.Quantity,
				UnitPricePaise: l.UnitPaise,
			}); err != nil {
				return err
			}
		}

		if err := q.InsertOrderStatusHistory(ctx, sqlc.InsertOrderStatusHistoryParams{
			OrderID:   order.ID,
			ToStatus:  orderstate.Placed,
			ActorType: "customer",
			ActorID:   pgInt8(userID),
		}); err != nil {
			return err
		}
		return nil
	})

	if err != nil {
		switch {
		case errors.Is(err, errAddress):
			h.Error(w, http.StatusBadRequest, "address not found")
		case errors.Is(err, errLocalityInactive):
			h.Error(w, http.StatusBadRequest, "locality not serviceable")
		case errors.Is(err, errBatchClosed):
			h.Error(w, http.StatusConflict, "today's batch is closed")
		default:
			h.Error(w, http.StatusInternalServerError, "failed to place order")
		}
		return
	}

	// Persist the idempotent response after commit.
	if idemKey != "" {
		resp := map[string]any{
			"order_id":       order.ID,
			"code":           order.Code.String,
			"status":         order.Status.String,
			"delivery_date":  order.DeliveryDate.Time.Format("2006-01-02"),
			"total_paise":    order.TotalAmountPaise,
			"payment_method": order.PaymentMethod,
		}
		if data, err := json.Marshal(resp); err == nil {
			_ = h.queries.SaveIdempotencyResponse(r.Context(), sqlc.SaveIdempotencyResponseParams{Key: idemKey, Response: data, StatusCode: pgtype.Int4{Int32: http.StatusCreated, Valid: true}})
		}
	}

	if h.hub != nil {
		h.hub.PublishOrderCreated(websocketOrderCreated(order))
		if order.BatchID.Valid {
			h.hub.PublishBatchSummary(websocket.BatchSummaryPayload{
				BatchID:      order.BatchID.Int64,
				OrderDate:    order.CreatedAt.Time.Format("2006-01-02"),
				DeliveryDate: order.DeliveryDate.Time.Format("2006-01-02"),
			})
		}
	}

	// Ping subscribed admin devices so a new order isn't missed between
	// console check-ins. One shared tag: a morning rush replaces the
	// notification with the latest order instead of piling up dozens.
	if h.push != nil && h.push.Enabled() {
		h.notifyAdmins(r, webpush.Notification{
			Title: "New order · " + order.Code.String,
			Body: fmt.Sprintf(
				"%s · delivery %s",
				formatPaiseRupees(order.TotalAmountPaise),
				order.DeliveryDate.Time.Format("2 Jan"),
			),
			URL: "/orders",
			Tag: "new-order",
		})
	}

	h.JSON(w, http.StatusCreated, map[string]any{
		"order_id":       order.ID,
		"code":           order.Code.String,
		"status":         order.Status.String,
		"delivery_date":  order.DeliveryDate.Time.Format("2006-01-02"),
		"total_paise":    order.TotalAmountPaise,
		"payment_method": order.PaymentMethod,
		"items":          lines,
	})
}

var (
	errAddress          = errors.New("address not found")
	errLocalityInactive = errors.New("locality inactive")
	errBatchClosed      = errors.New("batch closed")
)

// formatPaiseRupees renders integer paise as ₹rupees (17000 → "₹170",
// 15550 → "₹155.50") for notification copy.
func formatPaiseRupees(paise int64) string {
	rupees, rest := paise/100, paise%100
	if rest == 0 {
		return fmt.Sprintf("₹%d", rupees)
	}
	return fmt.Sprintf("₹%d.%02d", rupees, rest)
}

// checkIdempotency replays a stored response for a repeat submission.
// Returns true when the request was fully handled here.
func (h *Handler) checkIdempotency(w http.ResponseWriter, r *http.Request, key string, userID int64, bodyHash string) bool {
	ctx := r.Context()
	if err := h.queries.InsertIdempotencyKey(ctx, sqlc.InsertIdempotencyKeyParams{
		Key: key, UserID: userID, Endpoint: "POST /v1/orders", RequestHash: bodyHash,
	}); err != nil {
		// Key exists: replay or conflict.
		existing, getErr := h.queries.GetIdempotencyKey(ctx, key)
		if getErr != nil {
			h.Error(w, http.StatusInternalServerError, "idempotency check failed")
			return true
		}
		if existing.UserID != userID || existing.RequestHash != bodyHash {
			h.Error(w, http.StatusConflict, "idempotency key reused with a different request")
			return true
		}
		if existing.Response == nil {
			// A previous attempt is still in flight (or died before saving).
			h.Error(w, http.StatusConflict, "request already being processed")
			return true
		}
		w.Header().Set("Content-Type", "application/json")
		if existing.StatusCode.Valid {
			w.WriteHeader(int(existing.StatusCode.Int32))
		} else {
			w.WriteHeader(http.StatusCreated)
		}
		w.Write(existing.Response)
		return true
	}
	return false
}

func hashRequest(req createOrderRequest) string {
	// Stable serialization: sort items by product id.
	items := make([]orderItemRequest, len(req.Items))
	copy(items, req.Items)
	sort.Slice(items, func(i, j int) bool { return items[i].VariantID < items[j].VariantID })
	data, _ := json.Marshal(struct {
		AddressID  int64              `json:"address_id"`
		LocalityID int64              `json:"locality_id"`
		Items      []orderItemRequest `json:"items"`
	}{req.AddressID, req.LocalityID, items})
	sum := sha256Sum(data)
	return sum
}

// ListUserOrders returns the customer's orders, newest first, cursor-paginated.
func (h *Handler) ListUserOrders(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.GetUserID(r.Context())

	limit := int32(20)
	if v := r.URL.Query().Get("limit"); v != "" {
		if n, err := strconv.ParseInt(v, 10, 32); err == nil && n > 0 && n <= 100 {
			limit = int32(n)
		}
	}
	beforeID := pgtype.Int8{}
	if v := r.URL.Query().Get("before_id"); v != "" {
		if n, err := strconv.ParseInt(v, 10, 64); err == nil && n > 0 {
			beforeID = pgInt8(n)
		}
	}

	orders, err := h.queries.ListUserOrders(r.Context(), sqlc.ListUserOrdersParams{
		UserID:   userID,
		BeforeID: beforeID,
		MaxRows:  limit + 1,
	})
	if err != nil {
		h.Error(w, http.StatusInternalServerError, "failed to fetch orders")
		return
	}

	hasMore := false
	if int32(len(orders)) > limit {
		orders = orders[:limit]
		hasMore = true
	}

	views := make([]map[string]any, 0, len(orders))
	for _, o := range orders {
		views = append(views, orderSummaryView(o.ID, o.Code.String, o.Status.String, o.DeliveryDate, o.TotalAmountPaise, o.CreatedAt))
	}

	resp := map[string]any{"orders": views}
	if hasMore && len(orders) > 0 {
		resp["next_before_id"] = orders[len(orders)-1].ID
	}
	h.JSON(w, http.StatusOK, resp)
}

// GetOrder returns one of the customer's orders with items, timeline, and —
// once dispatched — live partner tracking info.
func (h *Handler) GetOrder(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.GetUserID(r.Context())
	orderID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		h.Error(w, http.StatusBadRequest, "invalid order id")
		return
	}

	order, err := h.queries.GetOrderForUser(r.Context(), sqlc.GetOrderForUserParams{ID: orderID, UserID: userID})
	if err != nil {
		if isNoRows(err) {
			h.Error(w, http.StatusNotFound, "order not found")
			return
		}
		h.Error(w, http.StatusInternalServerError, "failed to fetch order")
		return
	}

	items, err := h.queries.GetOrderItems(r.Context(), orderID)
	if err != nil {
		h.Error(w, http.StatusInternalServerError, "failed to fetch items")
		return
	}
	history, err := h.queries.ListOrderStatusHistory(r.Context(), orderID)
	if err != nil {
		h.Error(w, http.StatusInternalServerError, "failed to fetch timeline")
		return
	}

	itemViews := make([]map[string]any, 0, len(items))
	for _, it := range items {
		itemViews = append(itemViews, map[string]any{
			"variant_id":        it.VariantID,
			"name":              it.ProductName,
			"size_label":        it.ProductSizeLabel.String,
			"unit":              it.ProductUnit.String,
			"quantity":          it.Quantity,
			"unit_price_paise":  it.UnitPricePaise,
			"total_price_paise": it.UnitPricePaise * int64(it.Quantity),
		})
	}

	timeline := make([]map[string]any, 0, len(history))
	for _, hRow := range history {
		timeline = append(timeline, map[string]any{
			"status":     hRow.ToStatus,
			"from":       hRow.FromStatus.String,
			"actor_type": hRow.ActorType,
			"note":       hRow.Note.String,
			"at":         hRow.CreatedAt.Time,
		})
	}

	resp := map[string]any{
		"order_id":       order.ID,
		"code":           order.Code.String,
		"status":         order.Status.String,
		"delivery_date":  order.DeliveryDate.Time.Format("2006-01-02"),
		"total_paise":    order.TotalAmountPaise,
		"payment_method": order.PaymentMethod,
		"created_at":     order.CreatedAt.Time,
		"items":          itemViews,
		"timeline":       timeline,
		"address": map[string]any{
			"address_line": order.ShipAddressLine.String,
			"landmark":     order.ShipLandmark.String,
			"instructions": order.ShipInstructions.String,
		},
	}

	// Partner display + tracking only once the order is on a dispatched run.
	if order.DeliveryPartnerID.Valid {
		resp["partner"] = map[string]any{
			"name": order.PartnerName.String,
		}
		if order.Status.String == orderstate.OutForDelivery {
			if tracking := h.livePartnerLocation(r, order.DeliveryPartnerID.Int64); tracking != nil {
				resp["tracking"] = tracking
			}
		}
	}

	h.JSON(w, http.StatusOK, resp)
}

// CancelOrder lets the customer cancel before preparation begins.
func (h *Handler) CancelOrder(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.GetUserID(r.Context())
	orderID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		h.Error(w, http.StatusBadRequest, "invalid order id")
		return
	}

	err = h.withTx(r.Context(), func(q *sqlc.Queries) error {
		order, err := q.GetOrderForUpdate(r.Context(), orderID)
		if err != nil {
			return errNotFound
		}
		if order.UserID != userID {
			return errNotFound
		}
		if !orderstate.CustomerCancellable(order.Status.String) {
			return transitionError{from: order.Status.String, to: orderstate.Cancelled, actor: "customer"}
		}
		return applyOrderTransition(r.Context(), q, order, orderstate.Cancelled, "customer", userID, "cancelled by customer")
	})
	if err != nil {
		var te transitionError
		switch {
		case errors.As(err, &te):
			h.Error(w, http.StatusConflict, "order can no longer be cancelled (status "+te.from+")")
		case errors.Is(err, errNotFound):
			h.Error(w, http.StatusNotFound, "order not found")
		default:
			h.Error(w, http.StatusInternalServerError, "failed to cancel order")
		}
		return
	}

	if h.hub != nil {
		h.hub.PublishOrderCancelled(websocket.OrderStatusPayload{
			OrderID: orderID, Status: orderstate.Cancelled,
		}, userID)
	}

	h.JSON(w, http.StatusOK, map[string]any{"order_id": orderID, "status": orderstate.Cancelled})
}

// ---- shared helpers ----

func orderSummaryView(id int64, code, status string, deliveryDate pgtype.Date, totalPaise int64, createdAt pgtype.Timestamptz) map[string]any {
	return map[string]any{
		"order_id":      id,
		"code":          code,
		"status":        status,
		"delivery_date": deliveryDate.Time.Format("2006-01-02"),
		"total_paise":   totalPaise,
		"created_at":    createdAt.Time,
	}
}

// newOrderCode returns a short human-readable order code (AR + 6 chars).
func newOrderCode() (string, error) {
	buf := make([]byte, 6)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return "AR" + base64.RawURLEncoding.EncodeToString(buf)[:6], nil
}

func newPackageToken() (string, error) {
	buf := make([]byte, 18)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return "pkg_" + base64.RawURLEncoding.EncodeToString(buf), nil
}

func sha256Sum(data []byte) string {
	sum := sha256.Sum256(data)
	return hex.EncodeToString(sum[:])
}

func websocketOrderCreated(order sqlc.Order) websocket.OrderCreatedPayload {
	payload := websocket.OrderCreatedPayload{
		OrderID:      order.ID,
		Code:         order.Code.String,
		UserID:       order.UserID,
		DeliveryDate: order.DeliveryDate.Time.Format("2006-01-02"),
		TotalPaise:   order.TotalAmountPaise,
	}
	if order.BatchID.Valid {
		payload.BatchID = order.BatchID.Int64
	}
	if order.ShipLocalityID.Valid {
		payload.LocalityID = order.ShipLocalityID.Int64
	}
	return payload
}
