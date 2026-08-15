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

func TestBuildSchemaContextAuditsMissingPlannedTable(t *testing.T) {
	provider := fakeMetadataProvider{
		schemas: []SchemaSummary{{Name: "public"}},
		tables: map[string][]TableSummary{
			"public": {{Schema: "public", Name: "users", Type: "BASE TABLE"}},
		},
		details: map[string]TableDetails{},
	}

	contextResult, err := NewSchemaService(provider).BuildSchemaContext(SchemaContextRequest{
		ConnectionID: "connection-1",
		Prompt:       "show orders",
		Dialect:      "postgres",
		Tables:       []SchemaContextTable{{Schema: "public", Name: "orders"}},
	})
	if err != nil {
		t.Fatalf("BuildSchemaContext returned error: %v", err)
	}
	if contextResult.Ready {
		t.Fatal("expected schema context not to be ready")
	}
	if len(contextResult.MissingTables) != 1 || contextResult.MissingTables[0].Name != "orders" {
		t.Fatalf("expected orders in missing table audit, got %#v", contextResult.MissingTables)
	}
	if strings.Contains(contextResult.Context, "DDL: not loaded") {
		t.Fatalf("did not expect missing-DDL warnings in model context:\n%s", contextResult.Context)
	}
}

func TestBuildSchemaContextExpandsExplicitTablesWithSharedForeignKeyTable(t *testing.T) {
	provider := fakeMetadataProvider{
		schemas: []SchemaSummary{{Name: "typehero"}},
		tables: map[string][]TableSummary{
			"typehero": {
				{Schema: "typehero", Name: "Challenge", Type: "BASE TABLE", RowEstimate: 10},
				{Schema: "typehero", Name: "Submission", Type: "BASE TABLE", RowEstimate: 100},
				{Schema: "typehero", Name: "User", Type: "BASE TABLE", RowEstimate: 20},
				{Schema: "typehero", Name: "UserSession", Type: "BASE TABLE", RowEstimate: 200},
			},
		},
		details: map[string]TableDetails{
			"typehero.challenge": {
				Schema: "typehero",
				Name:   "Challenge",
				Type:   "BASE TABLE",
				Columns: []ColumnSummary{
					{Name: "id", DataType: "text", Position: 1, IsPrimary: true},
					{Name: "difficulty", DataType: "text", Position: 2},
				},
			},
			"typehero.submission": {
				Schema: "typehero",
				Name:   "Submission",
				Type:   "BASE TABLE",
				Columns: []ColumnSummary{
					{Name: "id", DataType: "text", Position: 1, IsPrimary: true},
					{Name: "userId", DataType: "text", Position: 2},
					{Name: "challengeId", DataType: "text", Position: 3},
					{Name: "status", DataType: "text", Position: 4},
				},
				Constraints: []ConstraintSummary{
					{Name: "Submission_userId_fkey", Type: "FOREIGN KEY", Definition: `FOREIGN KEY ("userId") REFERENCES "typehero"."User"("id")`},
					{Name: "Submission_challengeId_fkey", Type: "FOREIGN KEY", Definition: `FOREIGN KEY ("challengeId") REFERENCES "typehero"."Challenge"("id")`},
				},
			},
			"typehero.user": {
				Schema: "typehero",
				Name:   "User",
				Type:   "BASE TABLE",
				Columns: []ColumnSummary{
					{Name: "id", DataType: "text", Position: 1, IsPrimary: true},
					{Name: "name", DataType: "text", Position: 2},
				},
			},
			"typehero.usersession": {
				Schema: "typehero",
				Name:   "UserSession",
				Type:   "BASE TABLE",
				Columns: []ColumnSummary{
					{Name: "id", DataType: "text", Position: 1, IsPrimary: true},
					{Name: "userId", DataType: "text", Position: 2},
				},
				Constraints: []ConstraintSummary{
					{Name: "UserSession_userId_fkey", Type: "FOREIGN KEY", Definition: `FOREIGN KEY ("userId") REFERENCES "typehero"."User"("id")`},
				},
			},
		},
		foreignKeys: []ForeignKeySummary{
			{Name: "Submission_userId_fkey", SourceSchema: "typehero", SourceTable: "Submission", TargetSchema: "typehero", TargetTable: "User"},
			{Name: "Submission_challengeId_fkey", SourceSchema: "typehero", SourceTable: "Submission", TargetSchema: "typehero", TargetTable: "Challenge"},
			{Name: "UserSession_userId_fkey", SourceSchema: "typehero", SourceTable: "UserSession", TargetSchema: "typehero", TargetTable: "User"},
		},
	}

	contextResult, err := NewSchemaService(provider).BuildSchemaContext(SchemaContextRequest{
		ConnectionID:      "connection-1",
		Prompt:            "show the count of the types of Challenges a user has solved",
		Dialect:           "postgres",
		MaxDetailedTables: 2,
		Tables: []SchemaContextTable{
			{Schema: "typehero", Name: "User"},
			{Schema: "typehero", Name: "Challenge"},
		},
	})
	if err != nil {
		t.Fatalf("BuildSchemaContext returned error: %v", err)
	}

	if contextResult.DetailedTables != 3 {
		t.Fatalf("expected three detailed tables after relationship expansion, got %d", contextResult.DetailedTables)
	}
	if !strings.Contains(contextResult.Context, `CREATE TABLE "typehero"."Submission"`) {
		t.Fatalf("expected shared FK table DDL in context:\n%s", contextResult.Context)
	}
	if strings.Contains(contextResult.Context, `CREATE TABLE "typehero"."UserSession"`) {
		t.Fatalf("did not expect one-sided related table DDL in context:\n%s", contextResult.Context)
	}
}

func TestBuildSchemaContextExpandsSelectedJoinTableTargets(t *testing.T) {
	provider := fakeMetadataProvider{
		schemas: []SchemaSummary{{Name: "typehero"}},
		tables: map[string][]TableSummary{
			"typehero": {
				{Schema: "typehero", Name: "Challenge", Type: "BASE TABLE", RowEstimate: 10},
				{Schema: "typehero", Name: "Submission", Type: "BASE TABLE", RowEstimate: 100},
				{Schema: "typehero", Name: "User", Type: "BASE TABLE", RowEstimate: 20},
			},
		},
		details: map[string]TableDetails{
			"typehero.challenge": {
				Schema: "typehero",
				Name:   "Challenge",
				Type:   "BASE TABLE",
				Columns: []ColumnSummary{
					{Name: "id", DataType: "text", Position: 1, IsPrimary: true},
					{Name: "difficulty", DataType: "text", Position: 2},
				},
			},
			"typehero.submission": {
				Schema: "typehero",
				Name:   "Submission",
				Type:   "BASE TABLE",
				Columns: []ColumnSummary{
					{Name: "id", DataType: "text", Position: 1, IsPrimary: true},
					{Name: "userId", DataType: "text", Position: 2},
					{Name: "challengeId", DataType: "text", Position: 3},
				},
				Constraints: []ConstraintSummary{
					{Name: "Submission_userId_fkey", Type: "FOREIGN KEY", Definition: `FOREIGN KEY ("userId") REFERENCES "typehero"."User"("id")`},
					{Name: "Submission_challengeId_fkey", Type: "FOREIGN KEY", Definition: `FOREIGN KEY ("challengeId") REFERENCES "typehero"."Challenge"("id")`},
				},
			},
			"typehero.user": {
				Schema: "typehero",
				Name:   "User",
				Type:   "BASE TABLE",
				Columns: []ColumnSummary{
					{Name: "id", DataType: "text", Position: 1, IsPrimary: true},
					{Name: "name", DataType: "text", Position: 2},
				},
			},
		},
		foreignKeys: []ForeignKeySummary{
			{Name: "Submission_userId_fkey", SourceSchema: "typehero", SourceTable: "Submission", TargetSchema: "typehero", TargetTable: "User"},
			{Name: "Submission_challengeId_fkey", SourceSchema: "typehero", SourceTable: "Submission", TargetSchema: "typehero", TargetTable: "Challenge"},
		},
	}

	contextResult, err := NewSchemaService(provider).BuildSchemaContext(SchemaContextRequest{
		ConnectionID:      "connection-1",
		Prompt:            "show solved challenge counts",
		Dialect:           "postgres",
		MaxDetailedTables: 1,
		Tables:            []SchemaContextTable{{Schema: "typehero", Name: "Submission"}},
	})
	if err != nil {
		t.Fatalf("BuildSchemaContext returned error: %v", err)
	}

	for _, expected := range []string{
		`CREATE TABLE "typehero"."Submission"`,
		`CREATE TABLE "typehero"."User"`,
		`CREATE TABLE "typehero"."Challenge"`,
	} {
		if !strings.Contains(contextResult.Context, expected) {
			t.Fatalf("expected %q in context:\n%s", expected, contextResult.Context)
		}
	}
}

type fakeMetadataProvider struct {
	schemas     []SchemaSummary
	tables      map[string][]TableSummary
	details     map[string]TableDetails
	foreignKeys []ForeignKeySummary
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

func (f fakeMetadataProvider) ListForeignKeys(ctx context.Context, connectionID string) ([]ForeignKeySummary, error) {
	_ = ctx
	_ = connectionID
	return f.foreignKeys, nil
}

func (f fakeMetadataProvider) SchemaFingerprint(ctx context.Context, connectionID string) (SchemaFingerprint, error) {
	_ = ctx
	_ = connectionID
	return SchemaFingerprint{Hash: "fake"}, nil
}
