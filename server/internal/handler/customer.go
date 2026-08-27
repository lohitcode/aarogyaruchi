package handler

import (
	"errors"
	"net/http"
	"strconv"
	"strings"

	"aarogyaruchi/internal/db/sqlc"
	"aarogyaruchi/internal/middleware"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgtype"
)

// ---- Profile ----

type updateCustomerRequest struct {
	Name *string `json:"name"`
}

// GetCustomer returns the logged-in customer's profile.
func (h *Handler) GetCustomer(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.GetUserID(r.Context())
	user, err := h.queries.GetUser(r.Context(), userID)
	if err != nil {
		h.Error(w, http.StatusNotFound, "user not found")
		return
	}
	h.JSON(w, http.StatusOK, map[string]any{
		"id":    user.ID,
		"phone": user.Phone,
		"name":  user.Name.String,
	})
}

// UpdateCustomer updates editable profile fields.
func (h *Handler) UpdateCustomer(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.GetUserID(r.Context())

	var req updateCustomerRequest
	if err := decodeJSON(r, &req); err != nil {
		h.Error(w, http.StatusBadRequest, "invalid request")
		return
	}
	if req.Name != nil {
		name := strings.TrimSpace(*req.Name)
		if name == "" || len(name) > 100 {
			h.Error(w, http.StatusBadRequest, "name must be 1-100 characters")
			return
		}
		if _, err := h.queries.UpdateUserName(r.Context(), sqlc.UpdateUserNameParams{ID: userID, Name: pgText(name)}); err != nil {
			h.Error(w, http.StatusInternalServerError, "failed to update profile")
			return
		}
	}
	h.GetCustomer(w, r)
}

// ---- Addresses ----

type addressRequest struct {
	Label        string   `json:"label"`
	AddressLine  string   `json:"address_line"`
	Landmark     string   `json:"landmark"`
	LocalityID   int64    `json:"locality_id"`
	Latitude     *float64 `json:"latitude"`
	Longitude    *float64 `json:"longitude"`
	AccuracyM    *float64 `json:"accuracy_m"`
	Instructions string   `json:"instructions"`
	IsDefault    bool     `json:"is_default"`
}

type addressView struct {
	ID           int64    `json:"id"`
	Label        string   `json:"label,omitempty"`
	AddressLine  string   `json:"address_line"`
	Landmark     string   `json:"landmark,omitempty"`
	LocalityID   int64    `json:"locality_id,omitempty"`
	LocalityName string   `json:"locality_name,omitempty"`
	Latitude     *float64 `json:"latitude,omitempty"`
	Longitude    *float64 `json:"longitude,omitempty"`
	AccuracyM    *float64 `json:"accuracy_m,omitempty"`
	Instructions string   `json:"instructions,omitempty"`
	IsDefault    bool     `json:"is_default"`
}

func toAddressView(a sqlc.Address, localityName string) addressView {
	v := addressView{
		ID:           a.ID,
		Label:        a.Label.String,
		AddressLine:  a.AddressLine,
		Landmark:     a.Landmark.String,
		LocalityID:   a.LocalityID.Int64,
		LocalityName: localityName,
		Instructions: a.Instructions.String,
		IsDefault:    a.IsDefault,
	}
	if a.Latitude.Valid {
		lat := a.Latitude.Float64
		v.Latitude = &lat
	}
	if a.Longitude.Valid {
		lng := a.Longitude.Float64
		v.Longitude = &lng
	}
	if a.AccuracyM.Valid {
		acc := a.AccuracyM.Float64
		v.AccuracyM = &acc
	}
	return v
}

func (req addressRequest) validate() (string, bool) {
	if strings.TrimSpace(req.AddressLine) == "" {
		return "address_line is required", false
	}
	if req.AddressLine != "" && len(req.AddressLine) > 500 {
		return "address_line too long", false
	}
	if (req.Latitude == nil) != (req.Longitude == nil) {
		return "latitude and longitude must be provided together", false
	}
	if req.Latitude != nil && (*req.Latitude < -90 || *req.Latitude > 90) {
		return "latitude out of range", false
	}
	if req.Longitude != nil && (*req.Longitude < -180 || *req.Longitude > 180) {
		return "longitude out of range", false
	}
	return "", true
}

// ListAddresses returns the customer's saved delivery addresses.
func (h *Handler) ListAddresses(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.GetUserID(r.Context())
	addresses, err := h.queries.ListAddressesByUser(r.Context(), userID)
	if err != nil {
		h.Error(w, http.StatusInternalServerError, "failed to fetch addresses")
		return
	}
	views := make([]addressView, 0, len(addresses))
	for _, a := range addresses {
		views = append(views, toAddressView(a, ""))
	}
	h.JSON(w, http.StatusOK, map[string]any{"addresses": views})
}

// CreateAddress saves a new delivery address (with optional GPS capture).
func (h *Handler) CreateAddress(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.GetUserID(r.Context())

	var req addressRequest
	if err := decodeJSON(r, &req); err != nil {
		h.Error(w, http.StatusBadRequest, "invalid request")
		return
	}
	if msg, ok := req.validate(); !ok {
		h.Error(w, http.StatusBadRequest, msg)
		return
	}
	if req.LocalityID != 0 {
		locality, err := h.queries.GetLocality(r.Context(), req.LocalityID)
		if err != nil || !locality.IsActive.Bool {
			h.Error(w, http.StatusBadRequest, "locality not serviceable")
			return
		}
	}

	var created sqlc.Address
	err := h.withTx(r.Context(), func(q *sqlc.Queries) error {
		if req.IsDefault {
			if err := q.ClearDefaultAddress(r.Context(), userID); err != nil {
				return err
			}
		}
		var err error
		created, err = q.CreateAddress(r.Context(), sqlc.CreateAddressParams{
			UserID:       userID,
			Label:        pgText(req.Label),
			AddressLine:  strings.TrimSpace(req.AddressLine),
			Landmark:     pgText(req.Landmark),
			LocalityID:   pgInt8OrNil(req.LocalityID),
			Latitude:     pgFloatPtr(req.Latitude),
			Longitude:    pgFloatPtr(req.Longitude),
			AccuracyM:    pgFloatPtr(req.AccuracyM),
			Instructions: pgText(req.Instructions),
			IsDefault:    req.IsDefault,
		})
		return err
	})
	if err != nil {
		h.Error(w, http.StatusInternalServerError, "failed to save address")
		return
	}

	h.JSON(w, http.StatusCreated, toAddressView(created, ""))
}

// UpdateAddress edits one of the customer's addresses.
func (h *Handler) UpdateAddress(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.GetUserID(r.Context())
	addressID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		h.Error(w, http.StatusBadRequest, "invalid address id")
		return
	}

	var req addressRequest
	if err := decodeJSON(r, &req); err != nil {
		h.Error(w, http.StatusBadRequest, "invalid request")
		return
	}
	if msg, ok := req.validate(); !ok {
		h.Error(w, http.StatusBadRequest, msg)
		return
	}
	if req.LocalityID != 0 {
		locality, err := h.queries.GetLocality(r.Context(), req.LocalityID)
		if err != nil || !locality.IsActive.Bool {
			h.Error(w, http.StatusBadRequest, "locality not serviceable")
			return
		}
	}

	var updated sqlc.Address
	err = h.withTx(r.Context(), func(q *sqlc.Queries) error {
		// Ownership check inside the tx.
		if _, err := q.GetAddress(r.Context(), sqlc.GetAddressParams{ID: addressID, UserID: userID}); err != nil {
			return errNotFound
		}
		if req.IsDefault {
			if err := q.ClearDefaultAddress(r.Context(), userID); err != nil {
				return err
			}
		}
		var err error
		updated, err = q.UpdateAddress(r.Context(), sqlc.UpdateAddressParams{
			ID:           addressID,
			UserID:       userID,
			Label:        pgText(req.Label),
			AddressLine:  strings.TrimSpace(req.AddressLine),
			Landmark:     pgText(req.Landmark),
			LocalityID:   pgInt8OrNil(req.LocalityID),
			Latitude:     pgFloatPtr(req.Latitude),
			Longitude:    pgFloatPtr(req.Longitude),
			AccuracyM:    pgFloatPtr(req.AccuracyM),
			Instructions: pgText(req.Instructions),
			IsDefault:    req.IsDefault,
		})
		return err
	})
	if err != nil {
		if errors.Is(err, errNotFound) {
			h.Error(w, http.StatusNotFound, "address not found")
			return
		}
		h.Error(w, http.StatusInternalServerError, "failed to update address")
		return
	}

	h.JSON(w, http.StatusOK, toAddressView(updated, ""))
}

// DeleteAddress removes one of the customer's addresses.
func (h *Handler) DeleteAddress(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.GetUserID(r.Context())
	addressID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		h.Error(w, http.StatusBadRequest, "invalid address id")
		return
	}
	rows, err := h.queries.DeleteAddress(r.Context(), sqlc.DeleteAddressParams{ID: addressID, UserID: userID})
	if err != nil {
		h.Error(w, http.StatusInternalServerError, "failed to delete address")
		return
	}
	if rows == 0 {
		h.Error(w, http.StatusNotFound, "address not found")
		return
	}
	h.JSON(w, http.StatusOK, map[string]string{"message": "deleted"})
}

var errNotFound = errors.New("not found")

func pgFloatPtr(f *float64) pgtype.Float8 {
	if f == nil {
		return pgtype.Float8{}
	}
	return pgtype.Float8{Float64: *f, Valid: true}
}
