package postgres

import (
	"context"
	"strings"
	"time"

	"datapanel/internal/apperrors"
)

const metadataTimeout = 12 * time.Second

type MetadataProvider interface {
	ListSchemas(ctx context.Context, connectionID string) ([]SchemaSummary, error)
	ListTables(ctx context.Context, connectionID string, schema string) ([]TableSummary, error)
	DescribeTable(ctx context.Context, connectionID string, schema string, table string) (TableDetails, error)
	SchemaFingerprint(ctx context.Context, connectionID string) (SchemaFingerprint, error)
}

type SchemaService struct {
	adapter MetadataProvider
}

func NewSchemaService(adapter MetadataProvider) *SchemaService {
	return &SchemaService{adapter: adapter}
}

func (s *SchemaService) ListSchemas(connectionID string) ([]SchemaSummary, error) {
	if strings.TrimSpace(connectionID) == "" {
		return nil, apperrors.New(apperrors.CodeValidation, "connection id is required")
	}
	ctx, cancel := context.WithTimeout(context.Background(), metadataTimeout)
	defer cancel()
	return s.adapter.ListSchemas(ctx, connectionID)
}

func (s *SchemaService) ListTables(connectionID string, schema string) ([]TableSummary, error) {
	if strings.TrimSpace(connectionID) == "" {
		return nil, apperrors.New(apperrors.CodeValidation, "connection id is required")
	}
	if strings.TrimSpace(schema) == "" {
		return nil, apperrors.New(apperrors.CodeValidation, "schema is required")
	}
	ctx, cancel := context.WithTimeout(context.Background(), metadataTimeout)
	defer cancel()
	return s.adapter.ListTables(ctx, connectionID, schema)
}

func (s *SchemaService) DescribeTable(connectionID string, schema string, table string) (TableDetails, error) {
	if strings.TrimSpace(connectionID) == "" {
		return TableDetails{}, apperrors.New(apperrors.CodeValidation, "connection id is required")
	}
	if strings.TrimSpace(schema) == "" || strings.TrimSpace(table) == "" {
		return TableDetails{}, apperrors.New(apperrors.CodeValidation, "schema and table are required")
	}
	ctx, cancel := context.WithTimeout(context.Background(), metadataTimeout)
	defer cancel()
	return s.adapter.DescribeTable(ctx, connectionID, schema, table)
}

func (s *SchemaService) RefreshMetadata(connectionID string) ([]SchemaSummary, error) {
	return s.ListSchemas(connectionID)
}

func (s *SchemaService) SchemaFingerprint(connectionID string) (SchemaFingerprint, error) {
	if strings.TrimSpace(connectionID) == "" {
		return SchemaFingerprint{}, apperrors.New(apperrors.CodeValidation, "connection id is required")
	}
	ctx, cancel := context.WithTimeout(context.Background(), metadataTimeout)
	defer cancel()
	return s.adapter.SchemaFingerprint(ctx, connectionID)
}
