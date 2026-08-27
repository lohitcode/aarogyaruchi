-- Locality service-area perimeters: array of polygon rings,
-- each ring an array of [lat, lng] pairs. Kept as plain JSONB (no PostGIS)
-- so managed Postgres providers stay options; overlap validation runs in Go.
ALTER TABLE localities
    ADD COLUMN perimeters JSONB NOT NULL DEFAULT '[]'::jsonb;
