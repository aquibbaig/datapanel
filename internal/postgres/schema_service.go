package postgres

import (
	"context"
	"strings"
	"time"

	"sequel/internal/apperrors"
)

const metadataTimeout = 12 * time.Second

type SchemaService struct {
	adapter *Adapter
}

func NewSchemaService(adapter *Adapter) *SchemaService {
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
