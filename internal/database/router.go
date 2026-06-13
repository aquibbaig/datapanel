package database

import (
	"context"
	"strings"
	"sync"

	"datapanel/internal/apperrors"
	"datapanel/internal/connections"
	"datapanel/internal/postgres"
	"datapanel/internal/query"
)

type Adapter interface {
	Test(ctx context.Context, profile connections.ConnectionProfile, password string) error
	Connect(ctx context.Context, profile connections.ConnectionProfile, password string) error
	Disconnect(ctx context.Context, profileID string) error
	CloseAll()
	ListSchemas(ctx context.Context, connectionID string) ([]postgres.SchemaSummary, error)
	ListTables(ctx context.Context, connectionID string, schema string) ([]postgres.TableSummary, error)
	DescribeTable(ctx context.Context, connectionID string, schema string, table string) (postgres.TableDetails, error)
	SchemaFingerprint(ctx context.Context, connectionID string) (postgres.SchemaFingerprint, error)
	Execute(ctx context.Context, request query.QueryRequest) (query.QueryResult, error)
}

type Router struct {
	mu      sync.RWMutex
	active  map[string]string
	drivers map[string]Adapter
}

func NewRouter(drivers map[string]Adapter) *Router {
	return &Router{
		active:  map[string]string{},
		drivers: drivers,
	}
}

func (r *Router) Test(ctx context.Context, profile connections.ConnectionProfile, password string) error {
	adapter, err := r.adapterForDriver(profile.Driver)
	if err != nil {
		return err
	}
	return adapter.Test(ctx, profile, password)
}

func (r *Router) Connect(ctx context.Context, profile connections.ConnectionProfile, password string) error {
	driver := normalizeDriver(profile.Driver)
	adapter, err := r.adapterForDriver(driver)
	if err != nil {
		return err
	}
	if err := adapter.Connect(ctx, profile, password); err != nil {
		return err
	}

	r.mu.Lock()
	previous := r.active[profile.ID]
	r.active[profile.ID] = driver
	r.mu.Unlock()

	if previous != "" && previous != driver {
		if oldAdapter, ok := r.drivers[previous]; ok {
			_ = oldAdapter.Disconnect(context.Background(), profile.ID)
		}
	}
	return nil
}

func (r *Router) Disconnect(ctx context.Context, profileID string) error {
	r.mu.Lock()
	driver := r.active[profileID]
	delete(r.active, profileID)
	r.mu.Unlock()

	if driver != "" {
		adapter, ok := r.drivers[driver]
		if !ok {
			return apperrors.New(apperrors.CodeValidation, "database driver is not supported")
		}
		return adapter.Disconnect(ctx, profileID)
	}

	for _, adapter := range r.drivers {
		_ = adapter.Disconnect(ctx, profileID)
	}
	return nil
}

func (r *Router) CloseAll() {
	r.mu.Lock()
	r.active = map[string]string{}
	r.mu.Unlock()

	for _, adapter := range r.drivers {
		adapter.CloseAll()
	}
}

func (r *Router) ListSchemas(ctx context.Context, connectionID string) ([]postgres.SchemaSummary, error) {
	adapter, err := r.adapterForConnection(connectionID)
	if err != nil {
		return nil, err
	}
	return adapter.ListSchemas(ctx, connectionID)
}

func (r *Router) ListTables(ctx context.Context, connectionID string, schema string) ([]postgres.TableSummary, error) {
	adapter, err := r.adapterForConnection(connectionID)
	if err != nil {
		return nil, err
	}
	return adapter.ListTables(ctx, connectionID, schema)
}

func (r *Router) DescribeTable(ctx context.Context, connectionID string, schema string, table string) (postgres.TableDetails, error) {
	adapter, err := r.adapterForConnection(connectionID)
	if err != nil {
		return postgres.TableDetails{}, err
	}
	return adapter.DescribeTable(ctx, connectionID, schema, table)
}

func (r *Router) SchemaFingerprint(ctx context.Context, connectionID string) (postgres.SchemaFingerprint, error) {
	adapter, err := r.adapterForConnection(connectionID)
	if err != nil {
		return postgres.SchemaFingerprint{}, err
	}
	return adapter.SchemaFingerprint(ctx, connectionID)
}

func (r *Router) Execute(ctx context.Context, request query.QueryRequest) (query.QueryResult, error) {
	adapter, err := r.adapterForConnection(request.ConnectionID)
	if err != nil {
		return query.QueryResult{}, err
	}
	return adapter.Execute(ctx, request)
}

func (r *Router) adapterForConnection(connectionID string) (Adapter, error) {
	r.mu.RLock()
	driver := r.active[connectionID]
	r.mu.RUnlock()
	if driver == "" {
		return nil, apperrors.New(apperrors.CodeNotFound, "connection is not active")
	}
	return r.adapterForDriver(driver)
}

func (r *Router) adapterForDriver(driver string) (Adapter, error) {
	adapter := r.drivers[normalizeDriver(driver)]
	if adapter == nil {
		return nil, apperrors.New(apperrors.CodeValidation, "database driver is not supported")
	}
	return adapter, nil
}

func normalizeDriver(driver string) string {
	switch strings.ToLower(strings.TrimSpace(driver)) {
	case "mysql":
		return "mysql"
	default:
		return "postgres"
	}
}
