package handler

import (
	"encoding/json"
	"net/http"
	"strconv"

	"aarogyaruchi/internal/db/sqlc"
	"aarogyaruchi/internal/geo"
)

// productVariantView is one sellable size.
type productVariantView struct {
	ID         int64  `json:"id"`
	Slug       string `json:"slug"`
	SizeLabel  string `json:"size_label,omitempty"`
	Unit       string `json:"unit,omitempty"`
	PricePaise int64  `json:"price_paise"`
	IsDefault  bool   `json:"is_default"` // first listed variant
}

// productView is a catalog product with its variants (the storefront shape).
type productView struct {
	ID          int64                `json:"id"`
	Slug        string               `json:"slug"`
	Name        string               `json:"name"`
	Description string               `json:"description,omitempty"`
	Category    string               `json:"category,omitempty"`
	ImageURL    string               `json:"image_url,omitempty"`
	Ingredients []string             `json:"ingredients"`
	Nutrition   map[string]string    `json:"nutrition,omitempty"`
	Tags        []string             `json:"tags"`
	IsFeatured  bool                 `json:"is_featured"`
	Variants    []productVariantView `json:"variants"`
}

func nutritionMap(raw []byte) map[string]string {
	if len(raw) == 0 {
		return nil
	}
	var m map[string]string
	if err := json.Unmarshal(raw, &m); err != nil {
		return nil
	}
	return m
}

func toProductView(p sqlc.Product, variants []sqlc.ProductVariant) productView {
	view := productView{
		ID:          p.ID,
		Slug:        p.Slug,
		Name:        p.Name,
		Description: p.Description.String,
		Category:    p.Category.String,
		ImageURL:    p.ImageUrl.String,
		Ingredients: p.Ingredients,
		Nutrition:   nutritionMap(p.Nutrition),
		Tags:        p.Tags,
		IsFeatured:  p.IsFeatured,
		Variants:    make([]productVariantView, 0, len(variants)),
	}
	for i, v := range variants {
		view.Variants = append(view.Variants, productVariantView{
			ID:         v.ID,
			Slug:       v.Slug.String,
			SizeLabel:  v.SizeLabel.String,
			Unit:       v.Unit.String,
			PricePaise: v.PricePaise,
			IsDefault:  i == 0,
		})
	}
	return view
}

// ListProducts returns the live catalog: parent products with their
// purchasable variants, straight from the database.
func (h *Handler) ListProducts(w http.ResponseWriter, r *http.Request) {
	parents, err := h.queries.ListCatalogProducts(r.Context())
	if err != nil {
		h.Error(w, http.StatusInternalServerError, "failed to fetch products")
		return
	}

	ids := make([]int64, 0, len(parents))
	for _, p := range parents {
		ids = append(ids, p.ID)
	}
	var variantsByProduct map[int64][]sqlc.ProductVariant
	if len(ids) > 0 {
		variants, err := h.queries.ListCatalogVariants(r.Context(), ids)
		if err != nil {
			h.Error(w, http.StatusInternalServerError, "failed to fetch variants")
			return
		}
		variantsByProduct = make(map[int64][]sqlc.ProductVariant, len(parents))
		for _, v := range variants {
			variantsByProduct[v.ProductID] = append(variantsByProduct[v.ProductID], v)
		}
	}

	views := make([]productView, 0, len(parents))
	for _, p := range parents {
		views = append(views, toProductView(p, variantsByProduct[p.ID]))
	}
	h.JSON(w, http.StatusOK, map[string]any{"products": views})
}

type localityView struct {
	ID       int64  `json:"id"`
	Name     string `json:"name"`
	City     string `json:"city"`
	IsActive bool   `json:"is_active"`
}

// ListLocalities returns active service areas for checkout.
func (h *Handler) ListLocalities(w http.ResponseWriter, r *http.Request) {
	localities, err := h.queries.ListLocalities(r.Context())
	if err != nil {
		h.Error(w, http.StatusInternalServerError, "failed to fetch localities")
		return
	}
	views := make([]localityView, 0, len(localities))
	for _, l := range localities {
		views = append(views, localityView{ID: l.ID, Name: l.Name, City: l.City, IsActive: l.IsActive.Bool})
	}
	h.JSON(w, http.StatusOK, map[string]any{"localities": views})
}

// ResolveLocality maps a GPS point to the active locality whose perimeter
// contains it, so customers are assigned to their delivery zone
// automatically. Points in no zone resolve to a null locality (the checkout
// dropdown stays a manual override).
func (h *Handler) ResolveLocality(w http.ResponseWriter, r *http.Request) {
	lat, err := strconv.ParseFloat(r.URL.Query().Get("lat"), 64)
	if err != nil || lat < -90 || lat > 90 {
		h.Error(w, http.StatusBadRequest, "valid lat is required")
		return
	}
	lng, err := strconv.ParseFloat(r.URL.Query().Get("lng"), 64)
	if err != nil || lng < -180 || lng > 180 {
		h.Error(w, http.StatusBadRequest, "valid lng is required")
		return
	}
	rows, err := h.queries.ListLocalityPerimeters(r.Context())
	if err != nil {
		h.Error(w, http.StatusInternalServerError, "failed to fetch localities")
		return
	}
	for _, row := range rows {
		if !row.IsActive.Bool {
			continue
		}
		for _, ring := range perimetersFromDB(row.Perimeters) {
			if geo.ContainsPoint(ring, lat, lng) {
				h.JSON(w, http.StatusOK, map[string]any{
					"locality": localityView{ID: row.ID, Name: row.Name, City: row.City, IsActive: true},
				})
				return
			}
		}
	}
	h.JSON(w, http.StatusOK, map[string]any{"locality": nil})
}
