package query

type QueryRequest struct {
	RequestID          string `json:"requestId"`
	ConnectionID       string `json:"connectionId"`
	SQL                string `json:"sql"`
	MaxRows            int    `json:"maxRows"`
	TimeoutSeconds     int    `json:"timeoutSeconds"`
	ConfirmDestructive bool   `json:"confirmDestructive"`
}

type QueryColumn struct {
	Name         string `json:"name"`
	DataType     string `json:"dataType"`
	SourceSchema string `json:"sourceSchema,omitempty"`
	SourceTable  string `json:"sourceTable,omitempty"`
	SourceColumn string `json:"sourceColumn,omitempty"`
}

type QueryResult struct {
	Columns      []QueryColumn `json:"columns"`
	Rows         [][]any       `json:"rows"`
	AffectedRows int64         `json:"affectedRows"`
	DurationMS   int64         `json:"durationMs"`
	Notices      []string      `json:"notices"`
	Error        string        `json:"error"`
	Truncated    bool          `json:"truncated"`
}

type QueryHistoryItem struct {
	ID           string `json:"id"`
	ConnectionID string `json:"connectionId"`
	SQL          string `json:"sql"`
	DurationMS   int64  `json:"durationMs"`
	ExecutedAt   string `json:"executedAt"`
	Success      bool   `json:"success"`
}

type SQLAnalysis struct {
	Destructive bool     `json:"destructive"`
	Warnings    []string `json:"warnings"`
}
