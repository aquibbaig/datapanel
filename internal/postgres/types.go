package postgres

type SchemaSummary struct {
	Name string `json:"name"`
}

type TableSummary struct {
	Schema      string `json:"schema"`
	Name        string `json:"name"`
	Type        string `json:"type"`
	RowEstimate int64  `json:"rowEstimate"`
}

type SchemaFingerprint struct {
	Hash string `json:"hash"`
}

type SchemaContextRequest struct {
	ConnectionID      string               `json:"connectionId"`
	Prompt            string               `json:"prompt"`
	Dialect           string               `json:"dialect"`
	MaxDetailedTables int                  `json:"maxDetailedTables"`
	Tables            []SchemaContextTable `json:"tables"`
}

type SchemaContextTable struct {
	Schema string `json:"schema"`
	Name   string `json:"name"`
}

type SchemaContext struct {
	Context        string `json:"context"`
	DetailedTables int    `json:"detailedTables"`
	TotalTables    int    `json:"totalTables"`
	Truncated      bool   `json:"truncated"`
}

type ColumnSummary struct {
	Name      string `json:"name"`
	DataType  string `json:"dataType"`
	Nullable  bool   `json:"nullable"`
	Default   string `json:"default"`
	Position  int    `json:"position"`
	IsPrimary bool   `json:"isPrimary"`
}

type IndexSummary struct {
	Name       string `json:"name"`
	Definition string `json:"definition"`
}

type ConstraintSummary struct {
	Name       string `json:"name"`
	Type       string `json:"type"`
	Definition string `json:"definition"`
}

type TableDetails struct {
	Schema      string              `json:"schema"`
	Name        string              `json:"name"`
	Type        string              `json:"type"`
	Columns     []ColumnSummary     `json:"columns"`
	Indexes     []IndexSummary      `json:"indexes"`
	Constraints []ConstraintSummary `json:"constraints"`
}
