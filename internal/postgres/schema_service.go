package postgres

import (
	"context"
	"fmt"
	"strings"
	"time"
	"unicode"

	"datapanel/internal/apperrors"
)

const metadataTimeout = 12 * time.Second
const schemaContextTimeout = 30 * time.Second
const defaultMaxDetailedTables = 240
const hardMaxDetailedTables = 500
const relationshipExpansionTableLimit = 12

type MetadataProvider interface {
	ListSchemas(ctx context.Context, connectionID string) ([]SchemaSummary, error)
	ListTables(ctx context.Context, connectionID string, schema string) ([]TableSummary, error)
	DescribeTable(ctx context.Context, connectionID string, schema string, table string) (TableDetails, error)
	ListForeignKeys(ctx context.Context, connectionID string) ([]ForeignKeySummary, error)
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

func (s *SchemaService) BuildSchemaContext(input SchemaContextRequest) (SchemaContext, error) {
	connectionID := strings.TrimSpace(input.ConnectionID)
	if connectionID == "" {
		return SchemaContext{}, apperrors.New(apperrors.CodeValidation, "connection id is required")
	}

	maxDetailedTables := input.MaxDetailedTables
	if maxDetailedTables <= 0 {
		maxDetailedTables = defaultMaxDetailedTables
	}
	if maxDetailedTables > hardMaxDetailedTables {
		maxDetailedTables = hardMaxDetailedTables
	}

	ctx, cancel := context.WithTimeout(context.Background(), schemaContextTimeout)
	defer cancel()

	schemas, err := s.adapter.ListSchemas(ctx, connectionID)
	if err != nil {
		return SchemaContext{}, err
	}

	tablesBySchema := map[string][]TableSummary{}
	allTables := []TableSummary{}
	for _, schema := range schemas {
		tables, err := s.adapter.ListTables(ctx, connectionID, schema.Name)
		if err != nil {
			return SchemaContext{}, err
		}
		tablesBySchema[schema.Name] = tables
		allTables = append(allTables, tables...)
	}

	selectedTables, err := selectTablesForSchemaContext(input, allTables, maxDetailedTables)
	if err != nil {
		return SchemaContext{}, err
	}
	if len(input.Tables) > 0 {
		foreignKeys, err := s.adapter.ListForeignKeys(ctx, connectionID)
		if err != nil {
			return SchemaContext{}, err
		}
		selectedTables = expandSelectedTablesForRelationships(input, selectedTables, allTables, foreignKeys, maxDetailedTables)
	}
	detailsByKey := map[string]TableDetails{}
	for _, table := range selectedTables {
		details, err := s.adapter.DescribeTable(ctx, connectionID, table.Schema, table.Name)
		if err != nil {
			return SchemaContext{}, err
		}
		detailsByKey[schemaTableKey(table.Schema, table.Name)] = details
	}

	lines := []string{
		"Dialect: " + schemaContextDialect(input.Dialect),
		"",
		"Schema context rules:",
		"- Only generate SQL against tables that include a DDL block below.",
		"- DDL blocks are authoritative. Every SELECT, WHERE, GROUP BY, ORDER BY, and JOIN column must appear in that table's DDL.",
		"- Infer user-facing concepts from table names, column names, and SQL data types when the DDL clearly supports the mapping; do not require separate descriptions or sample values.",
		"- Natural-language terms may match singular/plural forms or snake_case components of listed identifiers.",
		"- When a user asks for a combined result over multiple matching columns, combine all clearly matching listed columns instead of asking for extra metadata.",
		"- Array-typed columns are collection-valued attributes. For broad all/combined requests over related collection columns on a target table, expand each array and union the element values before grouping.",
		"- If a needed table lacks a DDL block, return an empty sql string and explain that table DDL is not loaded.",
		"- If a requested column, metric, or join key is not listed, return an empty sql string and state the missing schema item instead of guessing.",
		"- Prefer listed FOREIGN KEY constraints for joins.",
		"",
		"Schemas and tables:",
	}

	for _, schema := range schemas {
		lines = append(lines, "- "+schema.Name)
		for _, table := range tablesBySchema[schema.Name] {
			lines = append(lines, fmt.Sprintf("  - %s.%s (%s, estimated rows: %d)", table.Schema, table.Name, table.Type, table.RowEstimate))
			details, ok := detailsByKey[schemaTableKey(table.Schema, table.Name)]
			if !ok {
				lines = append(lines, "    DDL: not loaded. Do not generate SQL against this table.")
				continue
			}
			appendTableDDL(&lines, details, input.Dialect, "    ")
		}
	}

	truncated := len(selectedTables) < len(allTables)
	lines = append(lines, "")
	lines = append(lines, fmt.Sprintf("Detailed DDL included for %d of %d table(s).", len(selectedTables), len(allTables)))
	if truncated {
		lines = append(lines, "Some table DDL was omitted because the schema is large; only listed DDL blocks are queryable.")
	}

	return SchemaContext{
		Context:        strings.Join(lines, "\n"),
		DetailedTables: len(selectedTables),
		TotalTables:    len(allTables),
		Truncated:      truncated,
	}, nil
}

func selectTablesForSchemaContext(input SchemaContextRequest, allTables []TableSummary, maxDetailedTables int) ([]TableSummary, error) {
	if len(input.Tables) > 0 {
		return selectExplicitTablesForSchemaContext(input.Tables, allTables, maxDetailedTables)
	}

	selectedKeys := map[string]bool{}
	selected := make([]TableSummary, 0, minInt(len(allTables), maxDetailedTables))

	addTable := func(table TableSummary) {
		if len(selected) >= maxDetailedTables {
			return
		}
		key := schemaTableKey(table.Schema, table.Name)
		if selectedKeys[key] {
			return
		}
		selectedKeys[key] = true
		selected = append(selected, table)
	}

	for _, table := range allTables {
		if promptReferencesTable(input.Prompt, table) {
			addTable(table)
		}
	}

	for _, table := range allTables {
		addTable(table)
	}

	return selected, nil
}

func selectExplicitTablesForSchemaContext(requestedTables []SchemaContextTable, allTables []TableSummary, maxDetailedTables int) ([]TableSummary, error) {
	tablesByKey := map[string]TableSummary{}
	for _, table := range allTables {
		tablesByKey[schemaTableKey(table.Schema, table.Name)] = table
	}

	selectedKeys := map[string]bool{}
	selected := make([]TableSummary, 0, minInt(len(requestedTables), maxDetailedTables))
	for _, requested := range requestedTables {
		if len(selected) >= maxDetailedTables {
			break
		}
		key := schemaTableKey(requested.Schema, requested.Name)
		if selectedKeys[key] {
			continue
		}
		table, ok := tablesByKey[key]
		if !ok {
			return nil, apperrors.New(apperrors.CodeValidation, "planned table is not present in schema: "+requested.Schema+"."+requested.Name)
		}
		selectedKeys[key] = true
		selected = append(selected, table)
	}
	return selected, nil
}

func expandSelectedTablesForRelationships(input SchemaContextRequest, selectedTables []TableSummary, allTables []TableSummary, foreignKeys []ForeignKeySummary, maxDetailedTables int) []TableSummary {
	if len(selectedTables) == 0 || len(foreignKeys) == 0 {
		return selectedTables
	}

	limit := maxDetailedTables
	expandedLimit := len(selectedTables) + relationshipExpansionTableLimit
	if expandedLimit > limit {
		limit = expandedLimit
	}
	if limit > hardMaxDetailedTables {
		limit = hardMaxDetailedTables
	}
	if limit > len(allTables) {
		limit = len(allTables)
	}
	if len(selectedTables) >= limit {
		return selectedTables
	}

	tablesByKey := map[string]TableSummary{}
	for _, table := range allTables {
		tablesByKey[schemaTableKey(table.Schema, table.Name)] = table
	}

	selectedKeys := map[string]bool{}
	for _, table := range selectedTables {
		selectedKeys[schemaTableKey(table.Schema, table.Name)] = true
	}
	initialSelectedCount := len(selectedKeys)

	type relationshipCandidate struct {
		table                    TableSummary
		connectedSelectedKeys    map[string]bool
		referencedBySelectedJoin bool
	}
	candidates := map[string]*relationshipCandidate{}
	selectedSourceTargets := map[string]map[string]bool{}

	addConnection := func(candidateKey string, selectedKey string) {
		table, ok := tablesByKey[candidateKey]
		if !ok || selectedKeys[candidateKey] {
			return
		}
		candidate := candidates[candidateKey]
		if candidate == nil {
			candidate = &relationshipCandidate{
				table:                 table,
				connectedSelectedKeys: map[string]bool{},
			}
			candidates[candidateKey] = candidate
		}
		candidate.connectedSelectedKeys[selectedKey] = true
	}

	for _, foreignKey := range foreignKeys {
		sourceKey := schemaTableKey(foreignKey.SourceSchema, foreignKey.SourceTable)
		targetKey := schemaTableKey(foreignKey.TargetSchema, foreignKey.TargetTable)
		sourceSelected := selectedKeys[sourceKey]
		targetSelected := selectedKeys[targetKey]

		if sourceSelected && !targetSelected {
			targets := selectedSourceTargets[sourceKey]
			if targets == nil {
				targets = map[string]bool{}
				selectedSourceTargets[sourceKey] = targets
			}
			targets[targetKey] = true
			addConnection(targetKey, sourceKey)
		}
		if targetSelected && !sourceSelected {
			addConnection(sourceKey, targetKey)
		}
	}

	for _, foreignKey := range foreignKeys {
		sourceKey := schemaTableKey(foreignKey.SourceSchema, foreignKey.SourceTable)
		targetKey := schemaTableKey(foreignKey.TargetSchema, foreignKey.TargetTable)
		if !selectedKeys[sourceKey] || selectedKeys[targetKey] || len(selectedSourceTargets[sourceKey]) < 2 {
			continue
		}
		if candidate := candidates[targetKey]; candidate != nil {
			candidate.referencedBySelectedJoin = true
		}
	}

	addTable := func(table TableSummary) {
		if len(selectedTables) >= limit {
			return
		}
		key := schemaTableKey(table.Schema, table.Name)
		if selectedKeys[key] {
			return
		}
		selectedKeys[key] = true
		selectedTables = append(selectedTables, table)
	}

	for _, table := range allTables {
		key := schemaTableKey(table.Schema, table.Name)
		candidate := candidates[key]
		if candidate == nil {
			continue
		}
		if (initialSelectedCount > 1 && len(candidate.connectedSelectedKeys) >= 2) ||
			candidate.referencedBySelectedJoin ||
			promptReferencesTable(input.Prompt, candidate.table) {
			addTable(candidate.table)
		}
	}

	return selectedTables
}

func promptReferencesTable(prompt string, table TableSummary) bool {
	normalizedPrompt := normalizeIdentifierText(prompt)
	if normalizedPrompt == "" {
		return false
	}
	promptTokens := map[string]bool{}
	for _, token := range strings.Fields(normalizedPrompt) {
		promptTokens[token] = true
	}

	schema := strings.ToLower(table.Schema)
	name := strings.ToLower(table.Name)
	if strings.Contains(normalizedPrompt, schema+" "+name) {
		return true
	}
	if promptTokens[name] {
		return true
	}
	if strings.HasSuffix(name, "s") && promptTokens[strings.TrimSuffix(name, "s")] {
		return true
	}

	nameParts := strings.FieldsFunc(name, func(r rune) bool {
		return r == '_'
	})
	if len(nameParts) > 1 {
		for _, part := range nameParts {
			if !promptTokens[part] {
				return false
			}
		}
		return true
	}
	return false
}

func normalizeIdentifierText(value string) string {
	fields := strings.FieldsFunc(strings.ToLower(value), func(r rune) bool {
		return !(unicode.IsLetter(r) || unicode.IsDigit(r) || r == '_')
	})
	return strings.Join(fields, " ")
}

func appendTableDDL(lines *[]string, tableDetails TableDetails, dialect string, indent string) {
	*lines = append(*lines, indent+"DDL:")
	*lines = append(*lines, formatCreateTableDDL(tableDetails, dialect, indent)...)
	if len(tableDetails.Constraints) > 0 {
		*lines = append(*lines, indent+"Constraints:")
		for _, constraint := range tableDetails.Constraints {
			*lines = append(*lines, fmt.Sprintf("%s- %s: %s", indent, constraint.Type, constraint.Definition))
		}
	}
	if len(tableDetails.Indexes) > 0 {
		*lines = append(*lines, indent+"Indexes:")
		for _, index := range tableDetails.Indexes {
			*lines = append(*lines, fmt.Sprintf("%s- %s: %s", indent, index.Name, index.Definition))
		}
	}
}

func formatCreateTableDDL(tableDetails TableDetails, dialect string, indent string) []string {
	lines := []string{
		fmt.Sprintf("%sCREATE TABLE %s (", indent, qualifiedDDLName(dialect, tableDetails.Schema, tableDetails.Name)),
	}
	for index, column := range tableDetails.Columns {
		suffix := ","
		if index == len(tableDetails.Columns)-1 {
			suffix = ""
		}
		lines = append(lines, fmt.Sprintf("%s  %s %s%s", indent, quoteDDLIdentifier(dialect, column.Name), formatColumnDDL(column), suffix))
	}
	lines = append(lines, indent+");")
	return lines
}

func formatColumnDDL(column ColumnSummary) string {
	parts := []string{column.DataType}
	if !column.Nullable {
		parts = append(parts, "NOT NULL")
	}
	if column.Default != "" {
		parts = append(parts, "DEFAULT "+column.Default)
	}
	if column.IsPrimary {
		parts = append(parts, "PRIMARY KEY")
	}
	return strings.Join(parts, " ")
}

func qualifiedDDLName(dialect string, schema string, table string) string {
	return quoteDDLIdentifier(dialect, schema) + "." + quoteDDLIdentifier(dialect, table)
}

func quoteDDLIdentifier(dialect string, identifier string) string {
	quote := `"`
	switch strings.ToLower(strings.TrimSpace(dialect)) {
	case "mysql", "bigquery":
		quote = "`"
	}
	return quote + strings.ReplaceAll(identifier, quote, quote+quote) + quote
}

func schemaContextDialect(dialect string) string {
	switch strings.ToLower(strings.TrimSpace(dialect)) {
	case "mysql":
		return "mysql"
	case "bigquery":
		return "bigquery"
	}
	return "postgres"
}

func schemaTableKey(schema string, table string) string {
	return strings.ToLower(schema + "." + table)
}

func minInt(left int, right int) int {
	if left < right {
		return left
	}
	return right
}
