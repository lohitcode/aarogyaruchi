package geo

import (
	"math"
	"testing"
)

// square returns a counter-clockwise [lat,lng] ring over [latMin,latMax] x
// [lngMin,lngMax].
func square(latMin, latMax, lngMin, lngMax float64) Ring {
	return Ring{
		{latMin, lngMin},
		{latMax, lngMin},
		{latMax, lngMax},
		{latMin, lngMax},
	}
}

func TestFindOverlap(t *testing.T) {
	tests := []struct {
		name    string
		mine    []Ring
		other   LocalityPerimeters
		overlap bool
	}{
		{
			name:    "disjoint squares",
			mine:    []Ring{square(0, 1, 0, 1)},
			other:   LocalityPerimeters{Name: "Far", IsActive: true, Perimeters: []Ring{square(2, 3, 2, 3)}},
			overlap: false,
		},
		{
			name:    "shared full edge",
			mine:    []Ring{square(0, 1, 0, 1)},
			other:   LocalityPerimeters{Name: "East", IsActive: true, Perimeters: []Ring{square(0, 1, 1, 2)}},
			overlap: false,
		},
		{
			name:    "corner touch",
			mine:    []Ring{square(0, 1, 0, 1)},
			other:   LocalityPerimeters{Name: "Diagonal", IsActive: true, Perimeters: []Ring{square(1, 2, 1, 2)}},
			overlap: false,
		},
		{
			name:    "partial overlap",
			mine:    []Ring{square(0, 1, 0, 1.1)},
			other:   LocalityPerimeters{Name: "East", IsActive: true, Perimeters: []Ring{square(0, 1, 1, 2)}},
			overlap: true,
		},
		{
			name:    "containment",
			mine:    []Ring{square(0, 10, 0, 10)},
			other:   LocalityPerimeters{Name: "Inside", IsActive: true, Perimeters: []Ring{square(2, 4, 2, 4)}},
			overlap: true,
		},
		{
			name:    "inactive neighbour ignored",
			mine:    []Ring{square(0, 1, 0, 1.1)},
			other:   LocalityPerimeters{Name: "Dormant", IsActive: false, Perimeters: []Ring{square(0, 1, 1, 2)}},
			overlap: false,
		},
		{
			name:    "second ring conflicts",
			mine:    []Ring{square(0, 1, 0, 1), square(0, 1, 1.5, 2.5)},
			other:   LocalityPerimeters{Name: "East", IsActive: true, Perimeters: []Ring{square(0, 1, 1, 2)}},
			overlap: true,
		},
		{
			name:    "no perimeters never conflicts",
			mine:    nil,
			other:   LocalityPerimeters{Name: "East", IsActive: true, Perimeters: []Ring{square(0, 1, 1, 2)}},
			overlap: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			conflict, err := FindOverlap(tt.mine, []LocalityPerimeters{tt.other})
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if tt.overlap && conflict != tt.other.Name {
				t.Errorf("expected overlap with %q, got %q", tt.other.Name, conflict)
			}
			if !tt.overlap && conflict != "" {
				t.Errorf("expected no overlap, got conflict with %q", conflict)
			}
		})
	}
}

func TestValidate(t *testing.T) {
	tests := []struct {
		name       string
		perimeters []Ring
		wantErr    bool
	}{
		{name: "nil ok", perimeters: nil},
		{name: "triangle ok", perimeters: []Ring{{{17.5, 78.3}, {17.6, 78.3}, {17.55, 78.4}}}},
		{name: "too few points", perimeters: []Ring{{{0, 0}, {1, 1}}}, wantErr: true},
		{
			name: "too many points",
			perimeters: func() []Ring {
				ring := make(Ring, MaxRingPoints+1)
				for i := range ring {
					ring[i] = [2]float64{float64(i), float64(i % 7)}
				}
				return []Ring{ring}
			}(),
			wantErr: true,
		},
		{name: "latitude out of range", perimeters: []Ring{{{91, 0}, {0, 1}, {1, 1}}}, wantErr: true},
		{name: "longitude out of range", perimeters: []Ring{{{0, 181}, {0, 1}, {1, 1}}}, wantErr: true},
		{
			// Bowtie: ring that crosses itself must be rejected.
			name:       "self intersection",
			perimeters: []Ring{{{0, 0}, {0, 2}, {2, 0}, {2, 2}}},
			wantErr:    true,
		},
		{
			name: "more than max rings",
			perimeters: func() []Ring {
				var ps []Ring
				for i := 0; i < MaxRings+1; i++ {
					ps = append(ps, square(float64(i), float64(i)+0.5, float64(i), float64(i)+0.5))
				}
				return ps
			}(),
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := Validate(tt.perimeters)
			if tt.wantErr && err == nil {
				t.Errorf("expected error, got nil")
			}
			if !tt.wantErr && err != nil {
				t.Errorf("unexpected error: %v", err)
			}
		})
	}
}

func TestContainsPoint(t *testing.T) {
	ring := square(0, 1, 0, 1)
	tests := []struct {
		name    string
		lat     float64
		lng     float64
		inside  bool
	}{
		{name: "centre", lat: 0.5, lng: 0.5, inside: true},
		{name: "outside", lat: 1.5, lng: 0.5, inside: false},
		{name: "outside diagonal", lat: -0.5, lng: -0.5, inside: false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := ContainsPoint(ring, tt.lat, tt.lng); got != tt.inside {
				t.Errorf("ContainsPoint(%v, %v) = %v, want %v", tt.lat, tt.lng, got, tt.inside)
			}
		})
	}
}

// Real-world scale sanity: two Hyderabad-sized zones a few metres apart must
// not trip the epsilon, and a 10 m intrusion must.
func TestOverlapEpsilonScale(t *testing.T) {
	// ~0.001 deg ≈ 111 m at this latitude.
	zone := square(17.500, 17.501, 78.300, 78.301)
	adjacent := square(17.500, 17.501, 78.301, 78.302)
	if conflict, err := FindOverlap([]Ring{zone}, []LocalityPerimeters{
		{Name: "adjacent", IsActive: true, Perimeters: []Ring{adjacent}},
	}); err != nil || conflict != "" {
		t.Fatalf("edge-adjacent zones must not conflict: %q, %v", conflict, err)
	}

	// A 10 m ≈ 0.00009 deg intrusion along the full 111 m edge.
	intruding := square(17.500, 17.501, 78.300, 78.30109)
	if conflict, err := FindOverlap([]Ring{zone}, []LocalityPerimeters{
		{Name: "intruder", IsActive: true, Perimeters: []Ring{intruding}},
	}); err != nil || conflict == "" {
		t.Fatalf("intruding zone must conflict: %q, %v", conflict, err)
	}

	if math.Abs(OverlapEPS) <= 0 {
		t.Fatal("epsilon must be positive")
	}
}
