package handler

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"aarogyaruchi/internal/db/sqlc"
	"aarogyaruchi/internal/geo"
	"aarogyaruchi/internal/middleware"
	"aarogyaruchi/internal/validator"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"
)

var (
	errNotArchived      = errors.New("product is not archived")
	errProductHasOrders = errors.New("product has order history")
)

const fkViolationCode = "23503"

// ---------- Products (super admin) ----------

type variantRequest struct {
	ID          *int64 `json:"id"`
	Slug        string `json:"slug"`
	SizeLabel   string `json:"size_label"`
	Unit        string `json:"unit"`
	PricePaise  int64  `json:"price_paise"`
	IsAvailable bool   `json:"is_available"`
}

type productRequest struct {
	Slug        string            `json:"slug"`
	Name        string            `json:"name"`
	Description string            `json:"description"`
	Category    string            `json:"category"`
	ImageURL    string            `json:"image_url"`
	Ingredients []string          `json:"ingredients"`
	Nutrition   map[string]string `json:"nutrition"`
	Tags        []string          `json:"tags"`
	IsFeatured  bool              `json:"is_featured"`
	IsAvailable bool              `json:"is_available"`
	Variants    []variantRequest  `json:"variants"`
}

func (req productRequest) validate() string {
	if strings.TrimSpace(req.Name) == "" {
		return "name is required"
	}
	if len(req.Variants) == 0 {
		return "at least one variant (size) is required"
	}
	for _, v := range req.Variants {
		if v.PricePaise < 100 {
			return "every variant price must be at least 100 paise (₹1)"
		}
	}
	return ""
}

func slugify(name string) string {
	s := strings.ToLower(strings.TrimSpace(name))
	var b strings.Builder
	lastDash := false
	for _, r := range s {
		switch {
		case r >= 'a' && r <= 'z' || r >= '0' && r <= '9':
			b.WriteRune(r)
			lastDash = false
		default:
			if !lastDash {
				b.WriteRune('-')
				lastDash = true
			}
		}
	}
	return strings.Trim(b.String(), "-")
}

func (req productRequest) baseSlug() string {
	if req.Slug != "" {
		return req.Slug
	}
	return slugify(req.Name)
}

func variantSlug(base string, sizeLabel string, provided string) string {
	if provided != "" {
		return provided
	}
	if sizeLabel != "" {
		return base + "-" + slugify(sizeLabel)
	}
	return base
}

func nonNil(list []string) []string {
	if list == nil {
		return []string{}
	}
	return list
}

func nutritionJSON(m map[string]string) []byte {
	if len(m) == 0 {
		return []byte("{}")
	}
	data, _ := json.Marshal(m)
	return data
}

// AdminCreateProduct adds a product with its variants.
func (h *Handler) AdminCreateProduct(w http.ResponseWriter, r *http.Request) {
	var req productRequest
	if err := decodeJSON(r, &req); err != nil || req.validate() != "" {
		msg := "invalid request"
		if err == nil {
			msg = req.validate()
		}
		h.Error(w, http.StatusBadRequest, msg)
		return
	}

	base := req.baseSlug()
	var created sqlc.Product
	err := h.withTx(r.Context(), func(q *sqlc.Queries) error {
		var err error
		created, err = q.AdminCreateProduct(r.Context(), sqlc.AdminCreateProductParams{
			Slug:        base,
			Name:        strings.TrimSpace(req.Name),
			Description: pgText(req.Description),
			Category:    pgText(req.Category),
			ImageUrl:    pgText(req.ImageURL),
			Ingredients: nonNil(req.Ingredients),
			Nutrition:   nutritionJSON(req.Nutrition),
			Tags:        nonNil(req.Tags),
			IsFeatured:  req.IsFeatured,
			IsAvailable: req.IsAvailable,
		})
		if err != nil {
			return err
		}
		for _, v := range req.Variants {
			if _, err := q.AdminCreateVariant(r.Context(), sqlc.AdminCreateVariantParams{
				ProductID:   created.ID,
				Slug:        pgText(variantSlug(base, v.SizeLabel, v.Slug)),
				SizeLabel:   pgText(v.SizeLabel),
				Unit:        pgText(v.Unit),
				PricePaise:  v.PricePaise,
				IsAvailable: pgtype.Bool{Bool: v.IsAvailable, Valid: true},
			}); err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		h.Error(w, http.StatusConflict, "slug already in use or invalid variants")
		return
	}
	h.syncOgCatalog(base)
	h.writeAdminProduct(w, http.StatusCreated, r, created.ID)
}

// AdminGetProduct returns a product with all variants for the editor.
func (h *Handler) AdminGetProduct(w http.ResponseWriter, r *http.Request) {
	productID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		h.Error(w, http.StatusBadRequest, "invalid product id")
		return
	}
	h.writeAdminProduct(w, http.StatusOK, r, productID)
}

// writeAdminProduct loads parent + variants and writes the editor shape.
func (h *Handler) writeAdminProduct(w http.ResponseWriter, status int, r *http.Request, productID int64) {
	product, err := h.queries.AdminGetProduct(r.Context(), productID)
	if err != nil {
		h.Error(w, http.StatusNotFound, "product not found")
		return
	}
	variants, err := h.queries.AdminListVariantsForProduct(r.Context(), productID)
	if err != nil {
		h.Error(w, http.StatusInternalServerError, "failed to load variants")
		return
	}

	variantViews := make([]map[string]any, 0, len(variants))
	for _, v := range variants {
		variantViews = append(variantViews, map[string]any{
			"id":           v.ID,
			"slug":         v.Slug.String,
			"size_label":   v.SizeLabel.String,
			"unit":         v.Unit.String,
			"price_paise":  v.PricePaise,
			"is_available": v.IsAvailable.Bool,
			"archived":     v.ArchivedAt.Valid,
		})
	}

	h.JSON(w, status, map[string]any{
		"id":           product.ID,
		"slug":         product.Slug,
		"name":         product.Name,
		"description":  product.Description.String,
		"category":     product.Category.String,
		"image_url":    product.ImageUrl.String,
		"ingredients":  product.Ingredients,
		"nutrition":    nutritionMap(product.Nutrition),
		"tags":         product.Tags,
		"is_featured":  product.IsFeatured,
		"is_available": product.IsAvailable,
		"archived":     product.ArchivedAt.Valid,
		"variants":     variantViews,
	})
}

// AdminUpdateProduct edits a product and synchronizes its variant set:
// variants with an id are updated, without an id are created, and existing
// variants absent from the payload are archived.
func (h *Handler) AdminUpdateProduct(w http.ResponseWriter, r *http.Request) {
	productID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		h.Error(w, http.StatusBadRequest, "invalid product id")
		return
	}

	var req productRequest
	if err := decodeJSON(r, &req); err != nil || req.validate() != "" {
		msg := "invalid request"
		if err == nil {
			msg = req.validate()
		}
		h.Error(w, http.StatusBadRequest, msg)
		return
	}

	base := req.baseSlug()
	var oldSlug string
	err = h.withTx(r.Context(), func(q *sqlc.Queries) error {
		if previous, err := q.AdminGetProduct(r.Context(), productID); err == nil {
			// Captured pre-update so a slug rename can evict the old key.
			oldSlug = previous.Slug
		}
		if _, err := q.AdminUpdateProduct(r.Context(), sqlc.AdminUpdateProductParams{
			ID:          productID,
			Slug:        base,
			Name:        strings.TrimSpace(req.Name),
			Description: pgText(req.Description),
			Category:    pgText(req.Category),
			ImageUrl:    pgText(req.ImageURL),
			Ingredients: nonNil(req.Ingredients),
			Nutrition:   nutritionJSON(req.Nutrition),
			Tags:        nonNil(req.Tags),
			IsFeatured:  req.IsFeatured,
			IsAvailable: req.IsAvailable,
		}); err != nil {
			return err
		}

		existing, err := q.AdminListVariantsForProduct(r.Context(), productID)
		if err != nil {
			return err
		}
		kept := make(map[int64]bool)
		for _, v := range req.Variants {
			if v.ID != nil {
				if _, err := q.AdminUpdateVariant(r.Context(), sqlc.AdminUpdateVariantParams{
					ID:          *v.ID,
					Slug:        pgText(variantSlug(base, v.SizeLabel, v.Slug)),
					SizeLabel:   pgText(v.SizeLabel),
					Unit:        pgText(v.Unit),
					PricePaise:  v.PricePaise,
					IsAvailable: pgtype.Bool{Bool: v.IsAvailable, Valid: true},
				}); err != nil {
					return err
				}
				kept[*v.ID] = true
			} else {
				if _, err := q.AdminCreateVariant(r.Context(), sqlc.AdminCreateVariantParams{
					ProductID:   productID,
					Slug:        pgText(variantSlug(base, v.SizeLabel, v.Slug)),
					SizeLabel:   pgText(v.SizeLabel),
					Unit:        pgText(v.Unit),
					PricePaise:  v.PricePaise,
					IsAvailable: pgtype.Bool{Bool: v.IsAvailable, Valid: true},
				}); err != nil {
					return err
				}
			}
		}
		for _, ex := range existing {
			if ex.ArchivedAt.Valid {
				continue
			}
			if !kept[ex.ID] {
				if _, err := q.AdminArchiveVariant(r.Context(), ex.ID); err != nil {
					return err
				}
			}
		}
		return nil
	})
	if err != nil {
		h.Error(w, http.StatusConflict, "slug already in use or invalid variants")
		return
	}
	h.syncOgCatalog(oldSlug, base)
	h.writeAdminProduct(w, http.StatusOK, r, productID)
}

// AdminArchiveProduct retires a product (and its variants) while keeping
// historical order items valid via their snapshots.
func (h *Handler) AdminArchiveProduct(w http.ResponseWriter, r *http.Request) {
	productID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		h.Error(w, http.StatusBadRequest, "invalid product id")
		return
	}
	var slug string
	err = h.withTx(r.Context(), func(q *sqlc.Queries) error {
		// Slug captured before the archive so the preview entry can be evicted.
		if product, err := q.AdminGetProduct(r.Context(), productID); err == nil {
			slug = product.Slug
		}
		rows, err := q.AdminArchiveProduct(r.Context(), productID)
		if err != nil {
			return err
		}
		if rows == 0 {
			return errNotFound
		}
		return q.AdminArchiveVariantsForProduct(r.Context(), productID)
	})
	if err != nil {
		if errors.Is(err, errNotFound) {
			h.Error(w, http.StatusNotFound, "product not found or already archived")
			return
		}
		h.Error(w, http.StatusInternalServerError, "failed to archive product")
		return
	}
	h.syncOgCatalog(slug)
	h.JSON(w, http.StatusOK, map[string]string{"message": "archived"})
}

// AdminDeleteProduct permanently removes an archived product that was never
// ordered, freeing its slug (and its variants' slugs) for reuse. Products
// with any order history stay archived forever — order snapshots must keep
// resolving.
func (h *Handler) AdminDeleteProduct(w http.ResponseWriter, r *http.Request) {
	productID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		h.Error(w, http.StatusBadRequest, "invalid product id")
		return
	}

	var ordered int64
	var deletedSlug string
	err = h.withTx(r.Context(), func(q *sqlc.Queries) error {
		product, err := q.AdminGetProduct(r.Context(), productID)
		if err != nil {
			return errNotFound
		}
		deletedSlug = product.Slug
		if !product.ArchivedAt.Valid {
			return errNotArchived
		}
		if ordered, err = q.CountOrderItemsForProduct(r.Context(), productID); err != nil {
			return err
		}
		if ordered > 0 {
			return errProductHasOrders
		}
		// Variants first: product_variants.product_id has no ON DELETE CASCADE.
		if _, err := q.AdminDeleteVariantsForProduct(r.Context(), productID); err != nil {
			return err
		}
		rows, err := q.AdminDeleteProduct(r.Context(), productID)
		if err != nil {
			return err
		}
		if rows == 0 {
			return errNotFound
		}
		return nil
	})
	if err != nil {
		var fkErr *pgconn.PgError
		switch {
		case errors.Is(err, errNotFound):
			h.Error(w, http.StatusNotFound, "product not found")
		case errors.Is(err, errNotArchived):
			h.Error(w, http.StatusBadRequest, "archive the product before deleting it")
		case errors.Is(err, errProductHasOrders):
			h.Error(w, http.StatusConflict, "product has order history and can only be archived")
		case errors.As(err, &fkErr) && fkErr.Code == fkViolationCode:
			// An order landed between the check and the delete; its items pin the variants.
			h.Error(w, http.StatusConflict, "product has order history and can only be archived")
		default:
			h.Error(w, http.StatusInternalServerError, "failed to delete product")
		}
		return
	}
	h.syncOgCatalog(deletedSlug)
	h.JSON(w, http.StatusOK, map[string]string{"message": "deleted"})
}

// AdminListAllProducts lists every product (including archived) with
// variant counts for the management table.
func (h *Handler) AdminListAllProducts(w http.ResponseWriter, r *http.Request) {
	rows, err := h.queries.AdminListProducts(r.Context())
	if err != nil {
		h.Error(w, http.StatusInternalServerError, "failed to fetch products")
		return
	}
	views := make([]map[string]any, 0, len(rows))
	for _, p := range rows {
		views = append(views, map[string]any{
			"id":              p.ID,
			"slug":            p.Slug,
			"name":            p.Name,
			"category":        p.Category.String,
			"image_url":       p.ImageUrl.String,
			"is_featured":     p.IsFeatured,
			"is_available":    p.IsAvailable,
			"archived":        p.ArchivedAt.Valid,
			"variant_count":   p.VariantCount,
			"min_price_paise": p.MinPricePaise,
			"order_count":     p.OrderCount,
		})
	}
	h.JSON(w, http.StatusOK, map[string]any{"products": views})
}

// ---------- Localities ----------

type localityRequest struct {
	Name string `json:"name"`
	City string `json:"city"`
	// IsActive follows PUT semantics: always written, exactly like the
	// pre-perimeter API (the frontend sends it on every update).
	IsActive bool `json:"is_active"`
	// Perimeters is a pointer so an absent field keeps the stored zones on
	// update (stale bundles), while an explicit [] clears them.
	Perimeters *[]geo.Ring `json:"perimeters"`
}

type adminLocalityView struct {
	ID         int64       `json:"id"`
	Name       string      `json:"name"`
	City       string      `json:"city"`
	IsActive   bool        `json:"is_active"`
	Perimeters []geo.Ring  `json:"perimeters"`
}

var errLocalityOverlap = errors.New("locality perimeters overlap")

func perimetersFromDB(b []byte) []geo.Ring {
	var rings []geo.Ring
	if len(b) > 0 {
		_ = json.Unmarshal(b, &rings)
	}
	if rings == nil {
		rings = []geo.Ring{}
	}
	return rings
}

func perimetersToDB(rings []geo.Ring) []byte {
	if len(rings) == 0 {
		return []byte("[]")
	}
	data, _ := json.Marshal(rings)
	return data
}

func adminLocalityViewFrom(l sqlc.Locality) adminLocalityView {
	return adminLocalityView{
		ID: l.ID, Name: l.Name, City: l.City, IsActive: l.IsActive.Bool,
		Perimeters: perimetersFromDB(l.Perimeters),
	}
}

// localityRowsToGeo converts perimeter rows for the overlap check, skipping
// excludeID (the locality being written).
func localityRowsToGeo(rows []sqlc.ListLocalityPerimetersRow, excludeID int64) []geo.LocalityPerimeters {
	out := make([]geo.LocalityPerimeters, 0, len(rows))
	for _, row := range rows {
		if row.ID == excludeID {
			continue
		}
		out = append(out, geo.LocalityPerimeters{
			Name:       row.Name,
			IsActive:   row.IsActive.Bool,
			Perimeters: perimetersFromDB(row.Perimeters),
		})
	}
	return out
}

// validateLocalityOverlap runs inside the perimeter write transaction under
// the advisory lock: when the locality is active after the write, its rings
// must not overlap any other active locality's rings.
func validateLocalityOverlap(ctx context.Context, q *sqlc.Queries, selfID int64, active bool, perimeters []geo.Ring) error {
	if !active || len(perimeters) == 0 {
		return nil
	}
	if err := q.LockLocalityOverlapCheck(ctx); err != nil {
		return err
	}
	rows, err := q.ListLocalityPerimeters(ctx)
	if err != nil {
		return err
	}
	conflict, err := geo.FindOverlap(perimeters, localityRowsToGeo(rows, selfID))
	if err != nil {
		return err
	}
	if conflict != "" {
		return fmt.Errorf("%w with active locality %q", errLocalityOverlap, conflict)
	}
	return nil
}

// AdminCreateLocality adds a service area with its drawn perimeters.
func (h *Handler) AdminCreateLocality(w http.ResponseWriter, r *http.Request) {
	var req localityRequest
	if err := decodeJSON(r, &req); err != nil || strings.TrimSpace(req.Name) == "" {
		h.Error(w, http.StatusBadRequest, "name is required")
		return
	}
	perimeters := []geo.Ring{}
	if req.Perimeters != nil {
		perimeters = *req.Perimeters
	}
	if err := geo.Validate(perimeters); err != nil {
		h.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	city := req.City
	if city == "" {
		city = "Hyderabad"
	}
	var locality sqlc.Locality
	err := h.withTx(r.Context(), func(q *sqlc.Queries) error {
		if err := validateLocalityOverlap(r.Context(), q, 0, true, perimeters); err != nil {
			return err
		}
		var err error
		locality, err = q.CreateLocality(r.Context(), sqlc.CreateLocalityParams{
			Name: strings.TrimSpace(req.Name), City: city, Perimeters: perimetersToDB(perimeters),
		})
		return err
	})
	if err != nil {
		if errors.Is(err, errLocalityOverlap) {
			h.Error(w, http.StatusConflict, err.Error())
			return
		}
		h.Error(w, http.StatusInternalServerError, "failed to create locality")
		return
	}
	h.JSON(w, http.StatusCreated, adminLocalityViewFrom(locality))
}

// AdminUpdateLocality edits name/city/zones and toggles serviceability.
func (h *Handler) AdminUpdateLocality(w http.ResponseWriter, r *http.Request) {
	localityID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		h.Error(w, http.StatusBadRequest, "invalid locality id")
		return
	}
	var req localityRequest
	if err := decodeJSON(r, &req); err != nil || strings.TrimSpace(req.Name) == "" {
		h.Error(w, http.StatusBadRequest, "name is required")
		return
	}
	existing, err := h.queries.GetLocality(r.Context(), localityID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			h.Error(w, http.StatusNotFound, "locality not found")
			return
		}
		h.Error(w, http.StatusInternalServerError, "failed to update locality")
		return
	}
	perimeters := perimetersFromDB(existing.Perimeters)
	if req.Perimeters != nil {
		perimeters = *req.Perimeters
	}
	if err := geo.Validate(perimeters); err != nil {
		h.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	city := req.City
	if city == "" {
		city = "Hyderabad"
	}
	var locality sqlc.Locality
	err = h.withTx(r.Context(), func(q *sqlc.Queries) error {
		if err := validateLocalityOverlap(r.Context(), q, localityID, req.IsActive, perimeters); err != nil {
			return err
		}
		var err error
		locality, err = q.UpdateLocality(r.Context(), sqlc.UpdateLocalityParams{
			ID: localityID, Name: strings.TrimSpace(req.Name), City: city,
			IsActive:   pgtype.Bool{Bool: req.IsActive, Valid: true},
			Perimeters: perimetersToDB(perimeters),
		})
		return err
	})
	if err != nil {
		if errors.Is(err, errLocalityOverlap) {
			h.Error(w, http.StatusConflict, err.Error())
			return
		}
		h.Error(w, http.StatusInternalServerError, "failed to update locality")
		return
	}
	h.JSON(w, http.StatusOK, adminLocalityViewFrom(locality))
}

// AdminListAllLocalities includes inactive ones, with their perimeters.
func (h *Handler) AdminListAllLocalities(w http.ResponseWriter, r *http.Request) {
	localities, err := h.queries.ListAllLocalities(r.Context())
	if err != nil {
		h.Error(w, http.StatusInternalServerError, "failed to fetch localities")
		return
	}
	views := make([]adminLocalityView, 0, len(localities))
	for _, l := range localities {
		views = append(views, adminLocalityViewFrom(l))
	}
	h.JSON(w, http.StatusOK, map[string]any{"localities": views})
}

// ---------- Delivery partners (super admin) ----------

type partnerRequest struct {
	Phone    string `json:"phone"`
	Name     string `json:"name"`
	IsActive *bool  `json:"is_active"`
}

// AdminCreatePartner provisions a delivery partner.
func (h *Handler) AdminCreatePartner(w http.ResponseWriter, r *http.Request) {
	var req partnerRequest
	if err := decodeJSON(r, &req); err != nil {
		h.Error(w, http.StatusBadRequest, "invalid request")
		return
	}
	phone, ok := normalizePhone(req.Phone)
	if !ok {
		h.Error(w, http.StatusBadRequest, "a valid phone is required")
		return
	}
	partner, err := h.queries.CreateDeliveryPartner(r.Context(), sqlc.CreateDeliveryPartnerParams{
		Phone: phone, Name: pgText(req.Name),
	})
	if err != nil {
		h.Error(w, http.StatusConflict, "phone already registered")
		return
	}
	h.JSON(w, http.StatusCreated, map[string]any{
		"partner_id": partner.ID, "phone": partner.Phone, "name": partner.Name.String, "is_active": partner.IsActive.Bool,
	})
}

// AdminUpdatePartner edits or deactivates a partner.
func (h *Handler) AdminUpdatePartner(w http.ResponseWriter, r *http.Request) {
	partnerID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		h.Error(w, http.StatusBadRequest, "invalid partner id")
		return
	}

	var req partnerRequest
	if err := decodeJSON(r, &req); err != nil {
		h.Error(w, http.StatusBadRequest, "invalid request")
		return
	}

	existing, err := h.queries.GetDeliveryPartner(r.Context(), partnerID)
	if err != nil {
		h.Error(w, http.StatusNotFound, "partner not found")
		return
	}

	phone := existing.Phone
	if req.Phone != "" {
		if p, ok := normalizePhone(req.Phone); ok {
			phone = p
		} else {
			h.Error(w, http.StatusBadRequest, "invalid phone")
			return
		}
	}
	name := existing.Name
	if req.Name != "" {
		name = pgText(req.Name)
	}
	active := existing.IsActive.Bool
	if req.IsActive != nil {
		active = *req.IsActive
	}

	partner, err := h.queries.UpdateDeliveryPartner(r.Context(), sqlc.UpdateDeliveryPartnerParams{
		ID: partnerID, Name: name, Phone: phone,
		IsActive: pgtype.Bool{Bool: active, Valid: true},
	})
	if err != nil {
		h.Error(w, http.StatusConflict, "phone already registered")
		return
	}
	h.JSON(w, http.StatusOK, map[string]any{
		"partner_id": partner.ID, "phone": partner.Phone, "name": partner.Name.String, "is_active": partner.IsActive.Bool,
	})
}

// AdminListPartners lists every partner.
func (h *Handler) AdminListPartners(w http.ResponseWriter, r *http.Request) {
	partners, err := h.queries.ListDeliveryPartners(r.Context())
	if err != nil {
		h.Error(w, http.StatusInternalServerError, "failed to fetch partners")
		return
	}
	views := make([]map[string]any, 0, len(partners))
	for _, p := range partners {
		views = append(views, map[string]any{
			"partner_id": p.ID, "phone": p.Phone, "name": p.Name.String, "is_active": p.IsActive.Bool,
		})
	}
	h.JSON(w, http.StatusOK, map[string]any{"partners": views})
}

// ---------- Admins (super admin) ----------

type adminRequest struct {
	Phone    string `json:"phone"`
	Name     string `json:"name"`
	Role     string `json:"role"`
	IsActive *bool  `json:"is_active"`
}

// AdminCreateAdmin provisions another admin account.
func (h *Handler) AdminCreateAdmin(w http.ResponseWriter, r *http.Request) {
	var req adminRequest
	if err := decodeJSON(r, &req); err != nil {
		h.Error(w, http.StatusBadRequest, "invalid request")
		return
	}
	phone, ok := normalizePhone(req.Phone)
	if !ok || !validator.IsValid(validator.AdminRoles, req.Role) {
		h.Error(w, http.StatusBadRequest, "valid phone and role (super_admin|operations_admin) are required")
		return
	}
	admin, err := h.queries.CreateAdmin(r.Context(), sqlc.CreateAdminParams{
		Phone: phone, Name: pgText(req.Name), Role: req.Role,
	})
	if err != nil {
		h.Error(w, http.StatusConflict, "phone already registered")
		return
	}
	h.JSON(w, http.StatusCreated, map[string]any{
		"admin_id": admin.ID, "phone": admin.Phone, "name": admin.Name.String, "role": admin.Role,
	})
}

// AdminUpdateAdmin deactivates or edits an admin.
func (h *Handler) AdminUpdateAdmin(w http.ResponseWriter, r *http.Request) {
	adminID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		h.Error(w, http.StatusBadRequest, "invalid admin id")
		return
	}

	var req adminRequest
	if err := decodeJSON(r, &req); err != nil {
		h.Error(w, http.StatusBadRequest, "invalid request")
		return
	}

	existing, err := h.queries.GetAdmin(r.Context(), adminID)
	if err != nil {
		h.Error(w, http.StatusNotFound, "admin not found")
		return
	}
	name := existing.Name
	if req.Name != "" {
		name = pgText(req.Name)
	}
	role := existing.Role
	if req.Role != "" {
		if !validator.IsValid(validator.AdminRoles, req.Role) {
			h.Error(w, http.StatusBadRequest, "invalid role")
			return
		}
		role = req.Role
	}
	active := existing.IsActive.Bool
	if req.IsActive != nil {
		active = *req.IsActive
	}

	admin, err := h.queries.UpdateAdmin(r.Context(), sqlc.UpdateAdminParams{
		ID: adminID, Name: name, Role: role,
		IsActive:   pgtype.Bool{Bool: active, Valid: true},
		LocalityID: existing.LocalityID,
	})
	if err != nil {
		h.Error(w, http.StatusInternalServerError, "failed to update admin")
		return
	}
	h.JSON(w, http.StatusOK, map[string]any{
		"admin_id": admin.ID, "phone": admin.Phone, "name": admin.Name.String, "role": admin.Role, "is_active": admin.IsActive.Bool,
	})
}

// AdminListAdmins lists admin accounts.
func (h *Handler) AdminListAdmins(w http.ResponseWriter, r *http.Request) {
	admins, err := h.queries.ListAdmins(r.Context())
	if err != nil {
		h.Error(w, http.StatusInternalServerError, "failed to fetch admins")
		return
	}
	views := make([]map[string]any, 0, len(admins))
	for _, a := range admins {
		views = append(views, map[string]any{
			"admin_id": a.ID, "phone": a.Phone, "name": a.Name.String, "role": a.Role, "is_active": a.IsActive.Bool,
		})
	}
	h.JSON(w, http.StatusOK, map[string]any{"admins": views})
}

// ---------- Operating settings (super admin) ----------

type settingsRequest struct {
	CutoffMinutes       *int   `json:"cutoff_minutes"`
	DeliveryWindowStart string `json:"delivery_window_start"`
	DeliveryWindowEnd   string `json:"delivery_window_end"`
	TrackingEnabled     *bool  `json:"tracking_enabled"`
}

func validHHMM(s string) bool {
	if len(s) != 5 {
		return false
	}
	h, m := s[0:2], s[3:5]
	if s[2] != ':' {
		return false
	}
	if h < "00" || h > "23" || m < "00" || m > "59" {
		return false
	}
	return true
}

// AdminGetSettings returns the operating settings singleton.
func (h *Handler) AdminGetSettings(w http.ResponseWriter, r *http.Request) {
	settings, err := h.queries.GetOperatingSettings(r.Context())
	if err != nil {
		h.Error(w, http.StatusInternalServerError, "failed to load settings")
		return
	}
	h.JSON(w, http.StatusOK, settingsView(settings))
}

// AdminUpdateSettings changes cutoff/delivery window/tracking. Existing
// orders keep their batch snapshots; only future batches are affected.
func (h *Handler) AdminUpdateSettings(w http.ResponseWriter, r *http.Request) {
	adminID, _ := middleware.GetAdminID(r.Context())
	current, err := h.queries.GetOperatingSettings(r.Context())
	if err != nil {
		h.Error(w, http.StatusInternalServerError, "failed to load settings")
		return
	}

	var req settingsRequest
	if err := decodeJSON(r, &req); err != nil {
		h.Error(w, http.StatusBadRequest, "invalid request")
		return
	}

	next := sqlc.UpdateOperatingSettingsParams{
		CutoffMinutes:       current.CutoffMinutes,
		DeliveryWindowStart: current.DeliveryWindowStart,
		DeliveryWindowEnd:   current.DeliveryWindowEnd,
		TrackingEnabled:     current.TrackingEnabled,
		UpdatedBy:           pgInt8(adminID),
	}
	if req.CutoffMinutes != nil {
		if *req.CutoffMinutes < 0 || *req.CutoffMinutes >= 1440 {
			h.Error(w, http.StatusBadRequest, "cutoff_minutes must be 0-1439")
			return
		}
		next.CutoffMinutes = int32(*req.CutoffMinutes)
	}
	if req.DeliveryWindowStart != "" {
		if !validHHMM(req.DeliveryWindowStart) {
			h.Error(w, http.StatusBadRequest, "delivery_window_start must be HH:MM")
			return
		}
		next.DeliveryWindowStart = req.DeliveryWindowStart
	}
	if req.DeliveryWindowEnd != "" {
		if !validHHMM(req.DeliveryWindowEnd) {
			h.Error(w, http.StatusBadRequest, "delivery_window_end must be HH:MM")
			return
		}
		next.DeliveryWindowEnd = req.DeliveryWindowEnd
	}
	if req.TrackingEnabled != nil {
		next.TrackingEnabled = *req.TrackingEnabled
	}

	settings, err := h.queries.UpdateOperatingSettings(r.Context(), next)
	if err != nil {
		h.Error(w, http.StatusInternalServerError, "failed to save settings")
		return
	}
	h.JSON(w, http.StatusOK, settingsView(settings))
}

func settingsView(s sqlc.OperatingSetting) map[string]any {
	return map[string]any{
		"cutoff_minutes":        s.CutoffMinutes,
		"delivery_window_start": s.DeliveryWindowStart,
		"delivery_window_end":   s.DeliveryWindowEnd,
		"business_timezone":     s.BusinessTimezone,
		"tracking_enabled":      s.TrackingEnabled,
		"updated_at":            s.UpdatedAt.Time,
	}
}
