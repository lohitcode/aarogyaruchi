// Package geo validates locality perimeter polygons and enforces the
// no-overlap rule between service areas. Perimeters are stored as plain
// [lat, lng] rings (no PostGIS); all spatial reasoning happens here.
package geo

import (
	"fmt"

	"github.com/peterstace/simplefeatures/geom"
)

// Ring is one polygon perimeter: [lat, lng] pairs, unclosed (the first point
// is not repeated at the end).
type Ring [][2]float64

const (
	MaxRings      = 10
	MinRingPoints = 3
	MaxRingPoints = 100

	maxLat = 90.0
	maxLng = 180.0

	// OverlapEPS is the intersection area in square degrees below which two
	// perimeters are considered merely touching — shared edges and corner
	// touches between adjacent localities are allowed. 1e-11 deg² is roughly
	// 0.1 m² at Hyderabad's latitude, far below any intentional zone.
	OverlapEPS = 1e-11
)

// LocalityPerimeters pairs a locality name with its perimeters so overlap
// errors can name the conflicting zone.
type LocalityPerimeters struct {
	Name       string
	IsActive   bool
	Perimeters []Ring
}

// Validate checks ring count, point counts, coordinate ranges and ring
// self-intersection. Zero perimeters is valid (a locality without a drawn
// zone).
func Validate(perimeters []Ring) error {
	if len(perimeters) > MaxRings {
		return fmt.Errorf("a locality can have at most %d perimeters", MaxRings)
	}
	for i, ring := range perimeters {
		if len(ring) < MinRingPoints {
			return fmt.Errorf("perimeter %d needs at least %d points", i+1, MinRingPoints)
		}
		if len(ring) > MaxRingPoints {
			return fmt.Errorf("perimeter %d can have at most %d points", i+1, MaxRingPoints)
		}
		if _, err := toPolygon(ring); err != nil {
			return fmt.Errorf("perimeter %d: %w", i+1, err)
		}
	}
	return nil
}

// FindOverlap returns the name of the first other ACTIVE locality whose
// perimeters overlap any of ours with intersection area > OverlapEPS.
// Empty name and nil error mean no conflict.
func FindOverlap(perimeters []Ring, others []LocalityPerimeters) (string, error) {
	mine := make([]geom.Geometry, 0, len(perimeters))
	for _, ring := range perimeters {
		g, err := toPolygon(ring)
		if err != nil {
			return "", err
		}
		mine = append(mine, g)
	}
	for _, other := range others {
		if !other.IsActive {
			continue
		}
		for _, ring := range other.Perimeters {
			otherPoly, err := toPolygon(ring)
			if err != nil {
				continue // unparsable foreign data cannot be checked
			}
			for _, g := range mine {
				inter, err := geom.Intersection(g, otherPoly)
				if err != nil {
					// Both inputs are validated; an overlay error is
					// unexpected, so fail closed and reject the write.
					return other.Name, nil
				}
				if inter.Area() > OverlapEPS {
					return other.Name, nil
				}
			}
		}
	}
	return "", nil
}

// ContainsPoint reports whether the [lat, lng] point falls inside ring
// (ray casting; a point exactly on the border counts as inside, so addresses
// on a shared edge resolve deterministically to whichever ring is tested
// first).
func ContainsPoint(ring Ring, lat, lng float64) bool {
	x, y := lng, lat
	inside := false
	for i, j := 0, len(ring)-1; i < len(ring); i, j = i+1, i {
		xi, yi := ring[i][1], ring[i][0]
		xj, yj := ring[j][1], ring[j][0]
		if (yi > y) != (yj > y) && x < (xj-xi)*(y-yi)/(yj-yi)+xi {
			inside = !inside
		}
	}
	return inside
}

// toPolygon converts an unclosed lat/lng ring into a validated closed
// simplefeatures polygon (x = lng, y = lat).
func toPolygon(ring Ring) (geom.Geometry, error) {
	flat := make([]float64, 0, (len(ring)+1)*2)
	for _, p := range ring {
		if p[0] < -maxLat || p[0] > maxLat {
			return geom.Geometry{}, fmt.Errorf("latitude %f out of range", p[0])
		}
		if p[1] < -maxLng || p[1] > maxLng {
			return geom.Geometry{}, fmt.Errorf("longitude %f out of range", p[1])
		}
		flat = append(flat, p[1], p[0])
	}
	flat = append(flat, ring[0][1], ring[0][0])
	poly := geom.NewPolygonXY(flat)
	if err := poly.Validate(); err != nil {
		return geom.Geometry{}, err
	}
	return poly.AsGeometry(), nil
}
