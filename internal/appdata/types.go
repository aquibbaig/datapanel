package appdata

import (
	"datapanel/internal/ai"
	"datapanel/internal/postgres"
)

type AIChatThread struct {
	ID               string        `json:"id"`
	ConnectionID     string        `json:"connectionId"`
	Title            string        `json:"title"`
	Provider         string        `json:"provider"`
	Model            string        `json:"model"`
	PromptTokens     int           `json:"promptTokens"`
	CompletionTokens int           `json:"completionTokens"`
	TotalTokens      int           `json:"totalTokens"`
	TokenUsage       ai.TokenUsage `json:"tokenUsage"`
	CreatedAt        string        `json:"createdAt"`
	UpdatedAt        string        `json:"updatedAt"`
}

type AIChatMessage struct {
	ID           string               `json:"id"`
	ThreadID     string               `json:"threadId"`
	ConnectionID string               `json:"connectionId"`
	Provider     string               `json:"provider"`
	Model        string               `json:"model"`
	Role         string               `json:"role"`
	Content      string               `json:"content"`
	Response     *ai.GenerateResponse `json:"response,omitempty"`
	CreatedAt    string               `json:"createdAt"`
}

type ListAIChatThreadsRequest struct {
	ConnectionID string `json:"connectionId"`
}

type CreateAIChatThreadRequest struct {
	ConnectionID string `json:"connectionId"`
	Title        string `json:"title"`
	Provider     string `json:"provider"`
	Model        string `json:"model"`
}

type UpdateAIChatThreadRequest struct {
	ID       string `json:"id"`
	Title    string `json:"title"`
	Provider string `json:"provider"`
	Model    string `json:"model"`
}

type DeleteAIChatThreadRequest struct {
	ID string `json:"id"`
}

type ListAIChatMessagesRequest struct {
	ThreadID string `json:"threadId"`
	Limit    int    `json:"limit"`
}

type SaveAIChatMessageRequest struct {
	ID           string               `json:"id"`
	ThreadID     string               `json:"threadId"`
	ConnectionID string               `json:"connectionId"`
	Provider     string               `json:"provider"`
	Model        string               `json:"model"`
	Role         string               `json:"role"`
	Content      string               `json:"content"`
	Response     *ai.GenerateResponse `json:"response,omitempty"`
	CreatedAt    string               `json:"createdAt"`
}

type ClearAIChatMessagesRequest struct {
	ThreadID string `json:"threadId"`
}

type QueryHistoryEntry struct {
	ID           string `json:"id"`
	ConnectionID string `json:"connectionId"`
	SQL          string `json:"sql"`
	Mode         string `json:"mode"`
	DurationMS   int64  `json:"durationMs"`
	ExecutedAt   string `json:"executedAt"`
	Success      bool   `json:"success"`
	RowCount     int    `json:"rowCount"`
	AffectedRows int64  `json:"affectedRows"`
	Error        string `json:"error,omitempty"`
}

type ListQueryHistoryRequest struct {
	ConnectionID string `json:"connectionId"`
	Limit        int    `json:"limit"`
}

type SaveQueryHistoryRequest struct {
	ID           string `json:"id"`
	ConnectionID string `json:"connectionId"`
	SQL          string `json:"sql"`
	Mode         string `json:"mode"`
	DurationMS   int64  `json:"durationMs"`
	ExecutedAt   string `json:"executedAt"`
	Success      bool   `json:"success"`
	RowCount     int    `json:"rowCount"`
	AffectedRows int64  `json:"affectedRows"`
	Error        string `json:"error,omitempty"`
}

type QueryWorkspaceDraft struct {
	ID    string `json:"id"`
	Title string `json:"title"`
	SQL   string `json:"sql"`
}

type QueryWorkspaceDraftState struct {
	ConnectionID      string                `json:"connectionId"`
	ActiveWorkspaceID string                `json:"activeWorkspaceId"`
	Workspaces        []QueryWorkspaceDraft `json:"workspaces"`
	UpdatedAt         string                `json:"updatedAt"`
}

type GetQueryWorkspaceDraftsRequest struct {
	ConnectionID string `json:"connectionId"`
}

type SaveQueryWorkspaceDraftsRequest struct {
	ConnectionID      string                `json:"connectionId"`
	ActiveWorkspaceID string                `json:"activeWorkspaceId"`
	Workspaces        []QueryWorkspaceDraft `json:"workspaces"`
}

type SchemaMetadataSnapshot struct {
	ConnectionID   string                             `json:"connectionId"`
	Schemas        []postgres.SchemaSummary           `json:"schemas"`
	TablesBySchema map[string][]postgres.TableSummary `json:"tablesBySchema"`
	Fingerprint    string                             `json:"fingerprint"`
	UpdatedAt      string                             `json:"updatedAt"`
}

type GetSchemaSnapshotRequest struct {
	ConnectionID string `json:"connectionId"`
}

type SaveSchemaSnapshotRequest struct {
	ConnectionID   string                             `json:"connectionId"`
	Schemas        []postgres.SchemaSummary           `json:"schemas"`
	TablesBySchema map[string][]postgres.TableSummary `json:"tablesBySchema"`
	Fingerprint    string                             `json:"fingerprint"`
}
