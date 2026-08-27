.PHONY: dev run build sqlc up down migrate-up migrate-down migrate-create

DATABASE_URL ?= postgres://aarogya:aarogya123@localhost:5432/aarogya_ruchi?sslmode=disable

# Development with hot reload (starts PostgreSQL, Valkey, and Go server)
dev:
	docker compose --profile local up -d
	air

# Run without hot reload
run:
	docker compose --profile local up -d
	go run ./cmd/server

# Build binary
build:
	go build -o bin/server ./cmd/server

# Generate sqlc code
sqlc:
	cd internal/db && sqlc generate

# Start only database and cache
up:
	docker compose --profile local up -d

# Stop database and cache
down:
	docker compose --profile local down

# Run all pending migrations
migrate-up:
	migrate -path internal/db/migrations -database "$(DATABASE_URL)" up

# Roll back the last migration
migrate-down:
	migrate -path internal/db/migrations -database "$(DATABASE_URL)" down 1

# Create a new migration pair (usage: make migrate-create name=add_something)
migrate-create:
	migrate create -ext sql -dir internal/db/migrations -seq -digits 6 $(name)

# All unit + handler tests
test:
	go test ./...

# Integration tests need the local docker Postgres/Valkey (make up) with the
# credentials from .env
test-integration:
	AR_TEST_DATABASE_URL="$$(grep '^DATABASE_URL=' .env | cut -d= -f2-)" \
	AR_TEST_CACHE_URL="$$(grep '^CACHE_URL=' .env | cut -d= -f2-)" \
	go test ./internal/handler -run Integration -v
