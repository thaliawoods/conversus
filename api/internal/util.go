package internal

import (
	"context"
	"fmt"
	"regexp"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/stdlib"
	"github.com/jmoiron/sqlx"

	"github.com/golang-migrate/migrate/v4"
	"github.com/golang-migrate/migrate/v4/database/postgres"
	_ "github.com/golang-migrate/migrate/v4/source/file"
)

type HaveNamespace struct{
	NameSpace string
}

func GetDevDB() (*sqlx.DB, error) {
	db, err := GetDB("postgres://postgres:postgres@db:5432/chat-goblin-db?sslmode=disable")
	if err != nil {
		return db, fmt.Errorf("development DB retrieval: %w", err)
	}
	err = MigrateDB(db, "file://migrations")
	if err != nil {
		return db, fmt.Errorf("development DB migration: %w", err)
	}
	return db, nil
}

func GetLocalDB() (*sqlx.DB, error) {
	db, err := GetDB("postgres://postgres:postgres@0.0.0.0:6432/chat-goblin-db?sslmode=disable")
	if err != nil {
		return db, fmt.Errorf("local DB retrieval: %w", err)
	}
	return db, nil
}

func GetDB(addr string) (*sqlx.DB, error) {

	connConfig, err := pgx.ParseConfig(addr)
	if err != nil {
		errMsg := err.Error()
		errMsg = regexp.MustCompile(`(://[^:]+:).+(@.+)`).ReplaceAllString(errMsg, "$1*****$2")
		errMsg = regexp.MustCompile(`(password=).+(\s+)`).ReplaceAllString(errMsg, "$1*****$2")
		return nil, fmt.Errorf("parsing DSN failed: %s", errMsg)
	}
	connectionStr := stdlib.RegisterConnConfig(connConfig)
	db, err := sqlx.Open("pgx", connectionStr)
	if err != nil {
		return nil, err
	}

	err = db.Ping()
	if err != nil {
		return nil, err
	}

	return db, nil
}

func MigrateDB(db *sqlx.DB, migration string) error {
	instance, err := postgres.WithInstance(db.DB, &postgres.Config{})
	if err != nil {
		return err
	}
	m, err := migrate.NewWithDatabaseInstance(
		migration,
		"chat-goblin-db",
		instance,
	)
	if err != nil {
		return fmt.Errorf("Error migrating the DB: %s", err.Error())
	}
	if err := m.Up(); err != nil && err != migrate.ErrNoChange {
		return fmt.Errorf("Error changing DB version", err)
	}
	return nil
}

func GetNamespace(ctx context.Context) string {
	namespace :=  ctx.Value("namespace")
	if namespace == nil {
		return ""
	}
	ns := namespace.(*HaveNamespace)
	return ns.NameSpace
}
