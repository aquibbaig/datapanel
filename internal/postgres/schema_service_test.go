package postgres

import (
	"context"
	"strings"
	"testing"
)

func TestBuildSchemaContextPrioritizesReferencedTableDDL(t *testing.T) {
	provider := fakeMetadataProvider{
		schemas: []SchemaSummary{{Name: "public"}},
		tables: map[string][]TableSummary{
			"public": {
				{Schema: "public", Name: "users", Type: "BASE TABLE", RowEstimate: 10},
				{Schema: "public", Name: "pr_comment_metrics", Type: "BASE TABLE", RowEstimate: 20},
				{Schema: "public", Name: "repositories", Type: "BASE TABLE", RowEstimate: 30},
			},
		},
		details: map[string]TableDetails{
			"public.users": {
				Schema: "public",
				Name:   "users",
				Type:   "BASE TABLE",
				Columns: []ColumnSummary{
					{Name: "id", DataType: "uuid", Position: 1, IsPrimary: true},
				},
			},
			"public.pr_comment_metrics": {
				Schema: "public",
				Name:   "pr_comment_metrics",
				Type:   "BASE TABLE",
				Columns: []ColumnSummary{
					{Name: "id", DataType: "uuid", Position: 1, IsPrimary: true},
					{Name: "severity_tags", DataType: "text[]", Nullable: true, Position: 2},
					{Name: "issue_types", DataType: "text[]", Nullable: true, Position: 3},
					{Name: "category_tags", DataType: "text[]", Nullable: true, Position: 4},
				},
			},
			"public.repositories": {
				Schema: "public",
				Name:   "repositories",
				Type:   "BASE TABLE",
				Columns: []ColumnSummary{
					{Name: "id", DataType: "uuid", Position: 1, IsPrimary: true},
				},
			},
		},
	}

	contextResult, err := NewSchemaService(provider).BuildSchemaContext(SchemaContextRequest{
		ConnectionID:      "connection-1",
		Prompt:            "Group all PR comment metrics by all tags combined",
		Dialect:           "postgres",
		MaxDetailedTables: 1,
	})
	if err != nil {
		t.Fatalf("BuildSchemaContext returned error: %v", err)
	}

	if contextResult.DetailedTables != 1 {
		t.Fatalf("expected one detailed table, got %d", contextResult.DetailedTables)
	}
	if !contextResult.Truncated {
		t.Fatalf("expected truncated context for schema larger than detail limit")
	}
	if !strings.Contains(contextResult.Context, `CREATE TABLE "public"."pr_comment_metrics"`) {
		t.Fatalf("expected referenced table DDL in context:\n%s", contextResult.Context)
	}
	if !strings.Contains(contextResult.Context, `"severity_tags" text[]`) ||
		!strings.Contains(contextResult.Context, `"issue_types" text[]`) ||
		!strings.Contains(contextResult.Context, `"category_tags" text[]`) {
		t.Fatalf("expected array column types in DDL:\n%s", contextResult.Context)
	}
	if strings.Contains(contextResult.Context, `CREATE TABLE "public"."users"`) {
		t.Fatalf("did not expect unreferenced table DDL before referenced table under cap:\n%s", contextResult.Context)
	}
}

func TestBuildSchemaContextUsesExplicitPlannedTables(t *testing.T) {
	provider := fakeMetadataProvider{
		schemas: []SchemaSummary{{Name: "public"}},
		tables: map[string][]TableSummary{
			"public": {
				{Schema: "public", Name: "users", Type: "BASE TABLE", RowEstimate: 10},
				{Schema: "public", Name: "orders", Type: "BASE TABLE", RowEstimate: 20},
			},
		},
		details: map[string]TableDetails{
			"public.users": {
				Schema: "public",
				Name:   "users",
				Type:   "BASE TABLE",
				Columns: []ColumnSummary{
					{Name: "id", DataType: "uuid", Position: 1, IsPrimary: true},
				},
			},
			"public.orders": {
				Schema: "public",
				Name:   "orders",
				Type:   "BASE TABLE",
				Columns: []ColumnSummary{
					{Name: "id", DataType: "uuid", Position: 1, IsPrimary: true},
					{Name: "user_id", DataType: "uuid", Position: 2},
				},
			},
		},
	}

	contextResult, err := NewSchemaService(provider).BuildSchemaContext(SchemaContextRequest{
		ConnectionID: "connection-1",
		Prompt:       "show users",
		Dialect:      "postgres",
		Tables:       []SchemaContextTable{{Schema: "public", Name: "orders"}},
	})
	if err != nil {
		t.Fatalf("BuildSchemaContext returned error: %v", err)
	}
	if !strings.Contains(contextResult.Context, `CREATE TABLE "public"."orders"`) {
		t.Fatalf("expected planned table DDL in context:\n%s", contextResult.Context)
	}
	if strings.Contains(contextResult.Context, `CREATE TABLE "public"."users"`) {
		t.Fatalf("did not expect prompt-matched table DDL when explicit plan is supplied:\n%s", contextResult.Context)
	}
}

type fakeMetadataProvider struct {
	schemas []SchemaSummary
	tables  map[string][]TableSummary
	details map[string]TableDetails
}

func (f fakeMetadataProvider) ListSchemas(ctx context.Context, connectionID string) ([]SchemaSummary, error) {
	_ = ctx
	_ = connectionID
	return f.schemas, nil
}

func (f fakeMetadataProvider) ListTables(ctx context.Context, connectionID string, schema string) ([]TableSummary, error) {
	_ = ctx
	_ = connectionID
	return f.tables[schema], nil
}

func (f fakeMetadataProvider) DescribeTable(ctx context.Context, connectionID string, schema string, table string) (TableDetails, error) {
	_ = ctx
	_ = connectionID
	return f.details[schemaTableKey(schema, table)], nil
}

func (f fakeMetadataProvider) SchemaFingerprint(ctx context.Context, connectionID string) (SchemaFingerprint, error) {
	_ = ctx
	_ = connectionID
	return SchemaFingerprint{Hash: "fake"}, nil
}
