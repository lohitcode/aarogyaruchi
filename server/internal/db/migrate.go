package db

import (
	"embed"
	"errors"
	"fmt"
	"log"
	"strings"

	"github.com/golang-migrate/migrate/v4"
	_ "github.com/golang-migrate/migrate/v4/database/pgx/v5"
	"github.com/golang-migrate/migrate/v4/source/iofs"
)

//go:embed migrations/*.sql
var migrationsFS embed.FS

func RunMigrations(databaseURL string) error {
	// golang-migrate's pgx5 driver requires pgx5:// scheme
	migrateURL := strings.Replace(databaseURL, "postgresql://", "pgx5://", 1)
	migrateURL = strings.Replace(migrateURL, "postgres://", "pgx5://", 1)

	source, err := iofs.New(migrationsFS, "migrations")
	if err != nil {
		return fmt.Errorf("failed to create migration source: %w", err)
	}

	m, err := migrate.NewWithSourceInstance("iofs", source, migrateURL)
	if err != nil {
		return fmt.Errorf("failed to create migrate instance: %w", err)
	}
	defer m.Close()

	if err := m.Up(); err != nil {
		if errors.Is(err, migrate.ErrNoChange) {
			log.Println("migrations: already up to date")
			return nil
		}
		return fmt.Errorf("failed to run migrations: %w", err)
	}

	version, dirty, _ := m.Version()
	log.Printf("migrations: applied up to version %d (dirty: %v)", version, dirty)
	return nil
}
