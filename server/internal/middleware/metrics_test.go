package middleware

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/prometheus/client_golang/prometheus"
	dto "github.com/prometheus/client_model/go"
)

func TestMetricsLabelsByRoutePatternNotRawPath(t *testing.T) {
	r := chi.NewRouter()
	r.Use(Metrics())
	r.Get("/orders/{id}", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusTeapot)
	})
	r.Post("/chat/stream", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	for _, path := range []string{"/orders/42", "/orders/9999"} {
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, path, nil))
		if rec.Code != http.StatusTeapot {
			t.Fatalf("status = %d, want %d", rec.Code, http.StatusTeapot)
		}
	}
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/chat/stream", nil))

	families, err := prometheus.DefaultGatherer.Gather()
	if err != nil {
		t.Fatalf("gather: %v", err)
	}
	var countsTotal, streamedTotal float64
	for _, mf := range families {
		if mf.GetName() != "http_requests_total" {
			continue
		}
		for _, m := range mf.GetMetric() {
			labels := labelMap(m)
			if labels["route"] == "/orders/{id}" {
				if labels["status"] == "418" {
					countsTotal = m.GetCounter().GetValue()
				}
			}
			// Long-lived SSE route must never be recorded.
			if strings.HasPrefix(labels["route"], "/chat/stream") {
				streamedTotal += m.GetCounter().GetValue()
			}
		}
	}
	if countsTotal != 2 {
		t.Errorf("http_requests_total{route=/orders/{id},status=418} = %v, want 2 (both raw paths collapse onto the pattern)", countsTotal)
	}
	if streamedTotal != 0 {
		t.Errorf("long-lived route /chat/stream was recorded (%v samples), want 0", streamedTotal)
	}
}

func TestMetricsExposesDurationHistogram(t *testing.T) {
	r := chi.NewRouter()
	r.Use(Metrics())
	r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		_, _ = io.WriteString(w, "ok")
	})
	r.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodGet, "/health", nil))

	families, err := prometheus.DefaultGatherer.Gather()
	if err != nil {
		t.Fatalf("gather: %v", err)
	}
	for _, mf := range families {
		if mf.GetName() != "http_request_duration_seconds" {
			continue
		}
		for _, m := range mf.GetMetric() {
			if labelMap(m)["route"] == "/health" {
				if m.GetHistogram().GetSampleCount() == 0 {
					t.Error("no samples observed for /health histogram")
				}
				return
			}
		}
	}
	t.Fatal("http_request_duration_seconds has no /health series")
}

func labelMap(m *dto.Metric) map[string]string {
	out := make(map[string]string, len(m.GetLabel()))
	for _, lp := range m.GetLabel() {
		out[lp.GetName()] = lp.GetValue()
	}
	return out
}
