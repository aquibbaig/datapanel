package appdata

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"time"

	"datapanel/internal/ai"
	"datapanel/internal/apperrors"
	"datapanel/internal/postgres"

	"github.com/google/uuid"
	_ "modernc.org/sqlite"
)

type Service struct {
	db *sql.DB
}

func NewService(path string) (*Service, error) {
	if strings.TrimSpace(path) == "" {
		return nil, apperrors.New(apperrors.CodeValidation, "app database path is required")
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return nil, apperrors.New(apperrors.CodeStorage, "could not create app data directory")
	}

	db, err := sql.Open("sqlite", path)
	if err != nil {
		return nil, apperrors.New(apperrors.CodeStorage, "could not open app database")
	}
	db.SetMaxOpenConns(1)

	service := &Service{db: db}
	if err := service.migrate(context.Background()); err != nil {
		_ = db.Close()
		return nil, err
	}
	return service, nil
}

func (s *Service) CloseAll() {
	if s == nil || s.db == nil {
		return
	}
	_ = s.db.Close()
}

func (s *Service) ListAIChatThreads(input ListAIChatThreadsRequest) ([]AIChatThread, error) {
	if s == nil || s.db == nil {
		return nil, apperrors.New(apperrors.CodeStorage, "app database is not ready")
	}

	rows, err := s.db.QueryContext(
		context.Background(),
		`SELECT id, connection_id, title, provider, model, prompt_tokens, completion_tokens, total_tokens, created_at, updated_at
		 FROM ai_chat_threads
		 WHERE connection_id = ?
		 ORDER BY updated_at DESC, rowid DESC`,
		normalizeConnectionID(input.ConnectionID),
	)
	if err != nil {
		return nil, apperrors.New(apperrors.CodeStorage, "could not load AI chat threads")
	}
	defer rows.Close()

	threads := []AIChatThread{}
	for rows.Next() {
		var thread AIChatThread
		if err := rows.Scan(
			&thread.ID,
			&thread.ConnectionID,
			&thread.Title,
			&thread.Provider,
			&thread.Model,
			&thread.PromptTokens,
			&thread.CompletionTokens,
			&thread.TotalTokens,
			&thread.CreatedAt,
			&thread.UpdatedAt,
		); err != nil {
			return nil, apperrors.New(apperrors.CodeStorage, "could not read AI chat thread")
		}
		thread.TokenUsage = ai.TokenUsage{
			PromptTokens:     thread.PromptTokens,
			CompletionTokens: thread.CompletionTokens,
			TotalTokens:      thread.TotalTokens,
		}
		threads = append(threads, thread)
	}
	if err := rows.Err(); err != nil {
		return nil, apperrors.New(apperrors.CodeStorage, "could not read AI chat threads")
	}
	return threads, nil
}

func (s *Service) CreateAIChatThread(input CreateAIChatThreadRequest) (AIChatThread, error) {
	if s == nil || s.db == nil {
		return AIChatThread{}, apperrors.New(apperrors.CodeStorage, "app database is not ready")
	}

	now := time.Now().UTC().Format(time.RFC3339Nano)
	thread := AIChatThread{
		ID:           uuid.NewString(),
		ConnectionID: normalizeConnectionID(input.ConnectionID),
		Title:        normalizeThreadTitle(input.Title),
		Provider:     normalizeLooseProvider(input.Provider),
		Model:        strings.TrimSpace(input.Model),
		CreatedAt:    now,
		UpdatedAt:    now,
	}
	if thread.Model == "" {
		thread.Model = defaultModel(thread.Provider)
	}

	_, err := s.db.ExecContext(
		context.Background(),
		`INSERT INTO ai_chat_threads (
			id, connection_id, title, provider, model, created_at, updated_at
		 ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
		thread.ID,
		thread.ConnectionID,
		thread.Title,
		thread.Provider,
		thread.Model,
		thread.CreatedAt,
		thread.UpdatedAt,
	)
	if err != nil {
		return AIChatThread{}, apperrors.New(apperrors.CodeStorage, "could not create AI chat thread")
	}
	return thread, nil
}

func (s *Service) UpdateAIChatThread(input UpdateAIChatThreadRequest) (AIChatThread, error) {
	if s == nil || s.db == nil {
		return AIChatThread{}, apperrors.New(apperrors.CodeStorage, "app database is not ready")
	}

	id := strings.TrimSpace(input.ID)
	if id == "" {
		return AIChatThread{}, apperrors.New(apperrors.CodeValidation, "AI chat thread is required")
	}

	now := time.Now().UTC().Format(time.RFC3339Nano)
	title := normalizeThreadTitle(input.Title)
	provider := normalizeLooseProvider(input.Provider)
	model := strings.TrimSpace(input.Model)
	if model == "" {
		model = defaultModel(provider)
	}

	row := s.db.QueryRowContext(
		context.Background(),
		`UPDATE ai_chat_threads
		 SET title = ?, provider = ?, model = ?, updated_at = ?
		 WHERE id = ?
		 RETURNING id, connection_id, title, provider, model, prompt_tokens, completion_tokens, total_tokens, created_at, updated_at`,
		title,
		provider,
		model,
		now,
		id,
	)

	var thread AIChatThread
	if err := row.Scan(
		&thread.ID,
		&thread.ConnectionID,
		&thread.Title,
		&thread.Provider,
		&thread.Model,
		&thread.PromptTokens,
		&thread.CompletionTokens,
		&thread.TotalTokens,
		&thread.CreatedAt,
		&thread.UpdatedAt,
	); err != nil {
		return AIChatThread{}, apperrors.New(apperrors.CodeStorage, "could not update AI chat thread")
	}
	thread.TokenUsage = ai.TokenUsage{
		PromptTokens:     thread.PromptTokens,
		CompletionTokens: thread.CompletionTokens,
		TotalTokens:      thread.TotalTokens,
	}
	return thread, nil
}

func (s *Service) DeleteAIChatThread(input DeleteAIChatThreadRequest) error {
	if s == nil || s.db == nil {
		return apperrors.New(apperrors.CodeStorage, "app database is not ready")
	}
	if strings.TrimSpace(input.ID) == "" {
		return apperrors.New(apperrors.CodeValidation, "AI chat thread is required")
	}
	_, err := s.db.ExecContext(context.Background(), `DELETE FROM ai_chat_threads WHERE id = ?`, strings.TrimSpace(input.ID))
	if err != nil {
		return apperrors.New(apperrors.CodeStorage, "could not delete AI chat thread")
	}
	return nil
}

func (s *Service) ListAIChatMessages(input ListAIChatMessagesRequest) ([]AIChatMessage, error) {
	if s == nil || s.db == nil {
		return nil, apperrors.New(apperrors.CodeStorage, "app database is not ready")
	}

	limit := input.Limit
	if limit <= 0 || limit > 200 {
		limit = 80
	}

	rows, err := s.db.QueryContext(
		context.Background(),
		`SELECT id, thread_id, connection_id, provider, model, role, content, response_json, created_at
		 FROM ai_chat_messages
		 WHERE thread_id = ?
		 ORDER BY created_at DESC, rowid DESC
		 LIMIT ?`,
		strings.TrimSpace(input.ThreadID),
		limit,
	)
	if err != nil {
		return nil, apperrors.New(apperrors.CodeStorage, "could not load AI chat messages")
	}
	defer rows.Close()

	messages := make([]AIChatMessage, 0, limit)
	for rows.Next() {
		message, err := scanAIChatMessage(rows)
		if err != nil {
			return nil, err
		}
		messages = append(messages, message)
	}
	if err := rows.Err(); err != nil {
		return nil, apperrors.New(apperrors.CodeStorage, "could not read AI chat messages")
	}

	for left, right := 0, len(messages)-1; left < right; left, right = left+1, right-1 {
		messages[left], messages[right] = messages[right], messages[left]
	}
	return messages, nil
}

func (s *Service) SaveAIChatMessage(input SaveAIChatMessageRequest) (AIChatMessage, error) {
	if s == nil || s.db == nil {
		return AIChatMessage{}, apperrors.New(apperrors.CodeStorage, "app database is not ready")
	}

	message, responseJSON, err := normalizeSaveMessage(input)
	if err != nil {
		return AIChatMessage{}, err
	}

	ctx := context.Background()
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return AIChatMessage{}, apperrors.New(apperrors.CodeStorage, "could not save AI chat message")
	}
	defer tx.Rollback()

	var existingResponseJSON string
	if err := tx.QueryRowContext(
		ctx,
		`SELECT response_json FROM ai_chat_messages WHERE id = ?`,
		message.ID,
	).Scan(&existingResponseJSON); err != nil && !errors.Is(err, sql.ErrNoRows) {
		return AIChatMessage{}, apperrors.New(apperrors.CodeStorage, "could not save AI chat message")
	}

	if _, err = tx.ExecContext(
		ctx,
		`INSERT INTO ai_chat_messages (
			id, thread_id, connection_id, provider, model, role, content, response_json, created_at
		 ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
		 ON CONFLICT(id) DO UPDATE SET
			thread_id = excluded.thread_id,
			connection_id = excluded.connection_id,
			provider = excluded.provider,
			model = excluded.model,
			role = excluded.role,
			content = excluded.content,
			response_json = excluded.response_json,
			created_at = excluded.created_at`,
		message.ID,
		message.ThreadID,
		message.ConnectionID,
		message.Provider,
		message.Model,
		message.Role,
		message.Content,
		responseJSON,
		message.CreatedAt,
	); err != nil {
		return AIChatMessage{}, apperrors.New(apperrors.CodeStorage, "could not save AI chat message")
	}

	tokenDelta := subtractTokenUsage(
		tokenUsageFromGenerateResponse(message.Response),
		tokenUsageFromResponseJSON(existingResponseJSON),
	)
	_, err = tx.ExecContext(
		ctx,
		`UPDATE ai_chat_threads SET updated_at = ? WHERE id = ?`,
		message.CreatedAt,
		message.ThreadID,
	)
	if err != nil {
		return AIChatMessage{}, apperrors.New(apperrors.CodeStorage, "could not save AI chat message")
	}
	if hasTokenUsage(tokenDelta) {
		_, err = tx.ExecContext(
			ctx,
			`UPDATE ai_chat_threads
			 SET prompt_tokens = max(0, prompt_tokens + ?),
				 completion_tokens = max(0, completion_tokens + ?),
				 total_tokens = max(0, total_tokens + ?)
			 WHERE id = ?`,
			tokenDelta.PromptTokens,
			tokenDelta.CompletionTokens,
			tokenDelta.TotalTokens,
			message.ThreadID,
		)
		if err != nil {
			return AIChatMessage{}, apperrors.New(apperrors.CodeStorage, "could not save AI chat message")
		}
	}
	if err := tx.Commit(); err != nil {
		return AIChatMessage{}, apperrors.New(apperrors.CodeStorage, "could not save AI chat message")
	}
	return message, nil
}

func (s *Service) ClearAIChatMessages(input ClearAIChatMessagesRequest) error {
	if s == nil || s.db == nil {
		return apperrors.New(apperrors.CodeStorage, "app database is not ready")
	}
	_, err := s.db.ExecContext(
		context.Background(),
		`DELETE FROM ai_chat_messages WHERE thread_id = ?`,
		strings.TrimSpace(input.ThreadID),
	)
	if err != nil {
		return apperrors.New(apperrors.CodeStorage, "could not clear AI chat messages")
	}
	_, _ = s.db.ExecContext(
		context.Background(),
		`UPDATE ai_chat_threads
		 SET prompt_tokens = 0, completion_tokens = 0, total_tokens = 0
		 WHERE id = ?`,
		strings.TrimSpace(input.ThreadID),
	)
	return nil
}

func (s *Service) ListQueryHistory(input ListQueryHistoryRequest) ([]QueryHistoryEntry, error) {
	if s == nil || s.db == nil {
		return nil, apperrors.New(apperrors.CodeStorage, "app database is not ready")
	}

	limit := input.Limit
	if limit <= 0 || limit > 200 {
		limit = 50
	}

	rows, err := s.db.QueryContext(
		context.Background(),
		`SELECT id, connection_id, sql_text, mode, duration_ms, executed_at, success, row_count, affected_rows, error_text
		 FROM query_history
		 WHERE connection_id = ?
		 ORDER BY executed_at DESC, rowid DESC
		 LIMIT ?`,
		normalizeConnectionID(input.ConnectionID),
		limit,
	)
	if err != nil {
		return nil, apperrors.New(apperrors.CodeStorage, "could not load query history")
	}
	defer rows.Close()

	history := make([]QueryHistoryEntry, 0, limit)
	for rows.Next() {
		var item QueryHistoryEntry
		if err := rows.Scan(
			&item.ID,
			&item.ConnectionID,
			&item.SQL,
			&item.Mode,
			&item.DurationMS,
			&item.ExecutedAt,
			&item.Success,
			&item.RowCount,
			&item.AffectedRows,
			&item.Error,
		); err != nil {
			return nil, apperrors.New(apperrors.CodeStorage, "could not read query history")
		}
		history = append(history, item)
	}
	if err := rows.Err(); err != nil {
		return nil, apperrors.New(apperrors.CodeStorage, "could not read query history")
	}
	return history, nil
}

func (s *Service) SaveQueryHistory(input SaveQueryHistoryRequest) (QueryHistoryEntry, error) {
	if s == nil || s.db == nil {
		return QueryHistoryEntry{}, apperrors.New(apperrors.CodeStorage, "app database is not ready")
	}

	item, err := normalizeQueryHistory(input)
	if err != nil {
		return QueryHistoryEntry{}, err
	}

	tx, err := s.db.BeginTx(context.Background(), nil)
	if err != nil {
		return QueryHistoryEntry{}, apperrors.New(apperrors.CodeStorage, "could not save query history")
	}
	defer tx.Rollback()

	if _, err := tx.ExecContext(
		context.Background(),
		`DELETE FROM query_history WHERE connection_id = ? AND sql_text = ?`,
		item.ConnectionID,
		item.SQL,
	); err != nil {
		return QueryHistoryEntry{}, apperrors.New(apperrors.CodeStorage, "could not save query history")
	}

	if _, err := tx.ExecContext(
		context.Background(),
		`INSERT INTO query_history (
			id, connection_id, sql_text, mode, duration_ms, executed_at, success, row_count, affected_rows, error_text
		 ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		item.ID,
		item.ConnectionID,
		item.SQL,
		item.Mode,
		item.DurationMS,
		item.ExecutedAt,
		item.Success,
		item.RowCount,
		item.AffectedRows,
		item.Error,
	); err != nil {
		return QueryHistoryEntry{}, apperrors.New(apperrors.CodeStorage, "could not save query history")
	}

	if _, err := tx.ExecContext(
		context.Background(),
		`DELETE FROM query_history
		 WHERE connection_id = ?
		   AND id NOT IN (
			 SELECT id FROM query_history
			 WHERE connection_id = ?
			 ORDER BY executed_at DESC, rowid DESC
			 LIMIT 50
		   )`,
		item.ConnectionID,
		item.ConnectionID,
	); err != nil {
		return QueryHistoryEntry{}, apperrors.New(apperrors.CodeStorage, "could not prune query history")
	}

	if err := tx.Commit(); err != nil {
		return QueryHistoryEntry{}, apperrors.New(apperrors.CodeStorage, "could not save query history")
	}
	return item, nil
}

func (s *Service) GetQueryWorkspaceDrafts(input GetQueryWorkspaceDraftsRequest) (QueryWorkspaceDraftState, error) {
	if s == nil || s.db == nil {
		return QueryWorkspaceDraftState{}, apperrors.New(apperrors.CodeStorage, "app database is not ready")
	}

	connectionID := normalizeConnectionID(input.ConnectionID)
	row := s.db.QueryRowContext(
		context.Background(),
		`SELECT connection_id, active_workspace_id, workspaces_json, updated_at
		 FROM query_workspace_drafts
		 WHERE connection_id = ?`,
		connectionID,
	)

	var state QueryWorkspaceDraftState
	var workspacesJSON string
	if err := row.Scan(
		&state.ConnectionID,
		&state.ActiveWorkspaceID,
		&workspacesJSON,
		&state.UpdatedAt,
	); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return QueryWorkspaceDraftState{ConnectionID: connectionID, Workspaces: []QueryWorkspaceDraft{}}, nil
		}
		return QueryWorkspaceDraftState{}, apperrors.New(apperrors.CodeStorage, "could not load query workspace drafts")
	}

	if strings.TrimSpace(workspacesJSON) != "" {
		if err := json.Unmarshal([]byte(workspacesJSON), &state.Workspaces); err != nil {
			return QueryWorkspaceDraftState{}, apperrors.New(apperrors.CodeStorage, "query workspace drafts are invalid")
		}
	}
	return normalizeQueryWorkspaceDraftState(state), nil
}

func (s *Service) SaveQueryWorkspaceDrafts(input SaveQueryWorkspaceDraftsRequest) (QueryWorkspaceDraftState, error) {
	if s == nil || s.db == nil {
		return QueryWorkspaceDraftState{}, apperrors.New(apperrors.CodeStorage, "app database is not ready")
	}

	state := normalizeQueryWorkspaceDraftState(QueryWorkspaceDraftState{
		ConnectionID:      input.ConnectionID,
		ActiveWorkspaceID: input.ActiveWorkspaceID,
		Workspaces:        input.Workspaces,
		UpdatedAt:         time.Now().UTC().Format(time.RFC3339Nano),
	})
	workspacesJSON, err := json.Marshal(state.Workspaces)
	if err != nil {
		return QueryWorkspaceDraftState{}, apperrors.New(apperrors.CodeStorage, "could not encode query workspace drafts")
	}

	_, err = s.db.ExecContext(
		context.Background(),
		`INSERT INTO query_workspace_drafts (
			connection_id, active_workspace_id, workspaces_json, updated_at
		 ) VALUES (?, ?, ?, ?)
		 ON CONFLICT(connection_id) DO UPDATE SET
			active_workspace_id = excluded.active_workspace_id,
			workspaces_json = excluded.workspaces_json,
			updated_at = excluded.updated_at`,
		state.ConnectionID,
		state.ActiveWorkspaceID,
		string(workspacesJSON),
		state.UpdatedAt,
	)
	if err != nil {
		return QueryWorkspaceDraftState{}, apperrors.New(apperrors.CodeStorage, "could not save query workspace drafts")
	}
	return state, nil
}

func (s *Service) GetSchemaSnapshot(input GetSchemaSnapshotRequest) (SchemaMetadataSnapshot, error) {
	if s == nil || s.db == nil {
		return SchemaMetadataSnapshot{}, apperrors.New(apperrors.CodeStorage, "app database is not ready")
	}

	connectionID := normalizeConnectionID(input.ConnectionID)
	row := s.db.QueryRowContext(
		context.Background(),
		`SELECT connection_id, fingerprint, snapshot_json, updated_at
		 FROM schema_snapshots
		 WHERE connection_id = ?`,
		connectionID,
	)

	var snapshot SchemaMetadataSnapshot
	var snapshotJSON string
	if err := row.Scan(
		&snapshot.ConnectionID,
		&snapshot.Fingerprint,
		&snapshotJSON,
		&snapshot.UpdatedAt,
	); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return emptySchemaSnapshot(connectionID), nil
		}
		return SchemaMetadataSnapshot{}, apperrors.New(apperrors.CodeStorage, "could not load schema snapshot")
	}

	if strings.TrimSpace(snapshotJSON) != "" {
		if err := json.Unmarshal([]byte(snapshotJSON), &snapshot); err != nil {
			return SchemaMetadataSnapshot{}, apperrors.New(apperrors.CodeStorage, "schema snapshot is invalid")
		}
	}
	snapshot.ConnectionID = connectionID
	return normalizeSchemaSnapshot(snapshot), nil
}

func (s *Service) SaveSchemaSnapshot(input SaveSchemaSnapshotRequest) (SchemaMetadataSnapshot, error) {
	if s == nil || s.db == nil {
		return SchemaMetadataSnapshot{}, apperrors.New(apperrors.CodeStorage, "app database is not ready")
	}

	snapshot := normalizeSchemaSnapshot(SchemaMetadataSnapshot{
		ConnectionID:   input.ConnectionID,
		Schemas:        input.Schemas,
		TablesBySchema: input.TablesBySchema,
		Fingerprint:    input.Fingerprint,
		UpdatedAt:      time.Now().UTC().Format(time.RFC3339Nano),
	})
	snapshotJSON, err := json.Marshal(snapshot)
	if err != nil {
		return SchemaMetadataSnapshot{}, apperrors.New(apperrors.CodeStorage, "could not encode schema snapshot")
	}

	_, err = s.db.ExecContext(
		context.Background(),
		`INSERT INTO schema_snapshots (
			connection_id, fingerprint, snapshot_json, updated_at
		 ) VALUES (?, ?, ?, ?)
		 ON CONFLICT(connection_id) DO UPDATE SET
			fingerprint = excluded.fingerprint,
			snapshot_json = excluded.snapshot_json,
			updated_at = excluded.updated_at`,
		snapshot.ConnectionID,
		snapshot.Fingerprint,
		string(snapshotJSON),
		snapshot.UpdatedAt,
	)
	if err != nil {
		return SchemaMetadataSnapshot{}, apperrors.New(apperrors.CodeStorage, "could not save schema snapshot")
	}
	return snapshot, nil
}

func (s *Service) migrate(ctx context.Context) error {
	statements := []string{
		`PRAGMA journal_mode = WAL`,
		`PRAGMA foreign_keys = ON`,
		`CREATE TABLE IF NOT EXISTS ai_chat_threads (
			id TEXT PRIMARY KEY,
			connection_id TEXT NOT NULL,
			title TEXT NOT NULL,
			provider TEXT NOT NULL,
			model TEXT NOT NULL,
			prompt_tokens INTEGER NOT NULL DEFAULT 0,
			completion_tokens INTEGER NOT NULL DEFAULT 0,
			total_tokens INTEGER NOT NULL DEFAULT 0,
			created_at TEXT NOT NULL,
			updated_at TEXT NOT NULL
		)`,
		`CREATE TABLE IF NOT EXISTS ai_chat_messages (
			id TEXT PRIMARY KEY,
			thread_id TEXT NOT NULL DEFAULT '',
			connection_id TEXT NOT NULL,
			provider TEXT NOT NULL,
			model TEXT NOT NULL DEFAULT '',
			role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
			content TEXT NOT NULL,
			response_json TEXT NOT NULL DEFAULT '',
			created_at TEXT NOT NULL,
			FOREIGN KEY(thread_id) REFERENCES ai_chat_threads(id) ON DELETE CASCADE
		)`,
		`ALTER TABLE ai_chat_threads ADD COLUMN prompt_tokens INTEGER NOT NULL DEFAULT 0`,
		`ALTER TABLE ai_chat_threads ADD COLUMN completion_tokens INTEGER NOT NULL DEFAULT 0`,
		`ALTER TABLE ai_chat_threads ADD COLUMN total_tokens INTEGER NOT NULL DEFAULT 0`,
		`ALTER TABLE ai_chat_messages ADD COLUMN thread_id TEXT NOT NULL DEFAULT ''`,
		`ALTER TABLE ai_chat_messages ADD COLUMN model TEXT NOT NULL DEFAULT ''`,
		`CREATE INDEX IF NOT EXISTS idx_ai_chat_threads_connection_updated
		 ON ai_chat_threads(connection_id, updated_at)`,
		`CREATE INDEX IF NOT EXISTS idx_ai_chat_messages_connection_created
		 ON ai_chat_messages(connection_id, created_at)`,
		`CREATE INDEX IF NOT EXISTS idx_ai_chat_messages_thread_created
		 ON ai_chat_messages(thread_id, created_at)`,
		`CREATE TABLE IF NOT EXISTS query_history (
			id TEXT PRIMARY KEY,
			connection_id TEXT NOT NULL,
			sql_text TEXT NOT NULL,
			mode TEXT NOT NULL CHECK (mode IN ('query', 'explain')),
			duration_ms INTEGER NOT NULL DEFAULT 0,
			executed_at TEXT NOT NULL,
			success INTEGER NOT NULL DEFAULT 0,
			row_count INTEGER NOT NULL DEFAULT 0,
			affected_rows INTEGER NOT NULL DEFAULT 0,
			error_text TEXT NOT NULL DEFAULT ''
		)`,
		`CREATE INDEX IF NOT EXISTS idx_query_history_connection_executed
		 ON query_history(connection_id, executed_at)`,
		`CREATE TABLE IF NOT EXISTS query_workspace_drafts (
			connection_id TEXT PRIMARY KEY,
			active_workspace_id TEXT NOT NULL DEFAULT '',
			workspaces_json TEXT NOT NULL DEFAULT '[]',
			updated_at TEXT NOT NULL
		)`,
		`CREATE TABLE IF NOT EXISTS schema_snapshots (
			connection_id TEXT PRIMARY KEY,
			fingerprint TEXT NOT NULL DEFAULT '',
			snapshot_json TEXT NOT NULL DEFAULT '{}',
			updated_at TEXT NOT NULL
		)`,
	}
	for _, statement := range statements {
		if _, err := s.db.ExecContext(ctx, statement); err != nil {
			if strings.HasPrefix(statement, "ALTER TABLE") && strings.Contains(err.Error(), "duplicate column") {
				continue
			}
			return apperrors.New(apperrors.CodeStorage, "could not initialize app database")
		}
	}
	return nil
}

func normalizeQueryHistory(input SaveQueryHistoryRequest) (QueryHistoryEntry, error) {
	sqlText := strings.TrimSpace(input.SQL)
	if sqlText == "" {
		return QueryHistoryEntry{}, apperrors.New(apperrors.CodeValidation, "query history SQL is required")
	}

	mode := strings.ToLower(strings.TrimSpace(input.Mode))
	if mode != "explain" {
		mode = "query"
	}

	id := strings.TrimSpace(input.ID)
	if id == "" {
		id = uuid.NewString()
	}

	executedAt := strings.TrimSpace(input.ExecutedAt)
	if executedAt == "" {
		executedAt = time.Now().UTC().Format(time.RFC3339Nano)
	}

	return QueryHistoryEntry{
		ID:           id,
		ConnectionID: normalizeConnectionID(input.ConnectionID),
		SQL:          sqlText,
		Mode:         mode,
		DurationMS:   maxInt64(0, input.DurationMS),
		ExecutedAt:   executedAt,
		Success:      input.Success,
		RowCount:     maxInt(0, input.RowCount),
		AffectedRows: maxInt64(0, input.AffectedRows),
		Error:        strings.TrimSpace(input.Error),
	}, nil
}

func normalizeQueryWorkspaceDraftState(state QueryWorkspaceDraftState) QueryWorkspaceDraftState {
	state.ConnectionID = normalizeConnectionID(state.ConnectionID)
	state.ActiveWorkspaceID = strings.TrimSpace(state.ActiveWorkspaceID)
	state.UpdatedAt = strings.TrimSpace(state.UpdatedAt)

	seen := map[string]bool{}
	workspaces := make([]QueryWorkspaceDraft, 0, minInt(3, len(state.Workspaces)))
	for _, workspace := range state.Workspaces {
		id := strings.TrimSpace(workspace.ID)
		if id == "" || seen[id] {
			id = uuid.NewString()
		}
		seen[id] = true

		title := strings.TrimSpace(workspace.Title)
		if title == "" {
			title = "Untitled query"
		}
		if len(title) > 80 {
			title = title[:80]
		}

		workspaces = append(workspaces, QueryWorkspaceDraft{
			ID:    id,
			Title: title,
			SQL:   workspace.SQL,
		})
		if len(workspaces) >= 3 {
			break
		}
	}
	state.Workspaces = workspaces

	activeWorkspaceExists := false
	for _, workspace := range state.Workspaces {
		if workspace.ID == state.ActiveWorkspaceID {
			activeWorkspaceExists = true
			break
		}
	}
	if !activeWorkspaceExists {
		if len(state.Workspaces) > 0 {
			state.ActiveWorkspaceID = state.Workspaces[0].ID
		} else {
			state.ActiveWorkspaceID = ""
		}
	}
	return state
}

func emptySchemaSnapshot(connectionID string) SchemaMetadataSnapshot {
	return SchemaMetadataSnapshot{
		ConnectionID:   normalizeConnectionID(connectionID),
		Schemas:        []postgres.SchemaSummary{},
		TablesBySchema: map[string][]postgres.TableSummary{},
	}
}

func normalizeSchemaSnapshot(snapshot SchemaMetadataSnapshot) SchemaMetadataSnapshot {
	snapshot.ConnectionID = normalizeConnectionID(snapshot.ConnectionID)
	snapshot.Fingerprint = strings.TrimSpace(snapshot.Fingerprint)
	snapshot.UpdatedAt = strings.TrimSpace(snapshot.UpdatedAt)
	if snapshot.Schemas == nil {
		snapshot.Schemas = []postgres.SchemaSummary{}
	}
	if snapshot.TablesBySchema == nil {
		snapshot.TablesBySchema = map[string][]postgres.TableSummary{}
	}
	for schema, tables := range snapshot.TablesBySchema {
		if tables == nil {
			snapshot.TablesBySchema[schema] = []postgres.TableSummary{}
		}
	}
	return snapshot
}

func maxInt(minimum int, value int) int {
	if value < minimum {
		return minimum
	}
	return value
}

func minInt(maximum int, value int) int {
	if value > maximum {
		return maximum
	}
	return value
}

func maxInt64(minimum int64, value int64) int64 {
	if value < minimum {
		return minimum
	}
	return value
}

type chatMessageScanner interface {
	Scan(dest ...any) error
}

func scanAIChatMessage(scanner chatMessageScanner) (AIChatMessage, error) {
	var message AIChatMessage
	var responseJSON string
	if err := scanner.Scan(
		&message.ID,
		&message.ThreadID,
		&message.ConnectionID,
		&message.Provider,
		&message.Model,
		&message.Role,
		&message.Content,
		&responseJSON,
		&message.CreatedAt,
	); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return AIChatMessage{}, apperrors.New(apperrors.CodeStorage, "AI chat message was not found")
		}
		return AIChatMessage{}, apperrors.New(apperrors.CodeStorage, "could not read AI chat message")
	}

	if strings.TrimSpace(responseJSON) != "" {
		var response ai.GenerateResponse
		if err := json.Unmarshal([]byte(responseJSON), &response); err == nil {
			message.Response = &response
		}
	}
	return message, nil
}

func tokenUsageFromGenerateResponse(response *ai.GenerateResponse) ai.TokenUsage {
	if response == nil {
		return ai.TokenUsage{}
	}
	return normalizeTokenUsage(response.TokenUsage)
}

func tokenUsageFromResponseJSON(responseJSON string) ai.TokenUsage {
	if strings.TrimSpace(responseJSON) == "" {
		return ai.TokenUsage{}
	}
	var response ai.GenerateResponse
	if err := json.Unmarshal([]byte(responseJSON), &response); err != nil {
		return ai.TokenUsage{}
	}
	return normalizeTokenUsage(response.TokenUsage)
}

func normalizeTokenUsage(usage ai.TokenUsage) ai.TokenUsage {
	if usage.PromptTokens < 0 {
		usage.PromptTokens = 0
	}
	if usage.CompletionTokens < 0 {
		usage.CompletionTokens = 0
	}
	if usage.TotalTokens < 0 {
		usage.TotalTokens = 0
	}
	if usage.TotalTokens == 0 {
		usage.TotalTokens = usage.PromptTokens + usage.CompletionTokens
	}
	return usage
}

func subtractTokenUsage(next ai.TokenUsage, previous ai.TokenUsage) ai.TokenUsage {
	return ai.TokenUsage{
		PromptTokens:     next.PromptTokens - previous.PromptTokens,
		CompletionTokens: next.CompletionTokens - previous.CompletionTokens,
		TotalTokens:      next.TotalTokens - previous.TotalTokens,
	}
}

func hasTokenUsage(usage ai.TokenUsage) bool {
	return usage.PromptTokens != 0 || usage.CompletionTokens != 0 || usage.TotalTokens != 0
}

func normalizeSaveMessage(input SaveAIChatMessageRequest) (AIChatMessage, string, error) {
	role := strings.ToLower(strings.TrimSpace(input.Role))
	if role != "user" && role != "assistant" {
		return AIChatMessage{}, "", apperrors.New(apperrors.CodeValidation, "AI chat role is invalid")
	}

	content := strings.TrimSpace(input.Content)
	if content == "" {
		return AIChatMessage{}, "", apperrors.New(apperrors.CodeValidation, "AI chat message is required")
	}

	id := strings.TrimSpace(input.ID)
	if id == "" {
		id = uuid.NewString()
	}
	threadID := strings.TrimSpace(input.ThreadID)
	if threadID == "" {
		return AIChatMessage{}, "", apperrors.New(apperrors.CodeValidation, "AI chat thread is required")
	}

	createdAt := strings.TrimSpace(input.CreatedAt)
	if createdAt == "" {
		createdAt = time.Now().UTC().Format(time.RFC3339Nano)
	}

	var responseJSON string
	if input.Response != nil {
		data, err := json.Marshal(input.Response)
		if err != nil {
			return AIChatMessage{}, "", apperrors.New(apperrors.CodeStorage, "could not encode AI response")
		}
		responseJSON = string(data)
	}
	provider := normalizeLooseProvider(input.Provider)
	model := strings.TrimSpace(input.Model)
	if model == "" {
		model = defaultModel(provider)
	}

	return AIChatMessage{
		ID:           id,
		ThreadID:     threadID,
		ConnectionID: normalizeConnectionID(input.ConnectionID),
		Provider:     provider,
		Model:        model,
		Role:         role,
		Content:      content,
		Response:     input.Response,
		CreatedAt:    createdAt,
	}, responseJSON, nil
}

func normalizeThreadTitle(title string) string {
	normalized := strings.TrimSpace(title)
	if normalized == "" {
		return "New chat"
	}
	if len(normalized) > 80 {
		return normalized[:80]
	}
	return normalized
}

func normalizeLooseProvider(provider string) string {
	normalized := strings.ToLower(strings.TrimSpace(provider))
	switch normalized {
	case "anthropic", "custom":
		return normalized
	default:
		return "openai"
	}
}

func defaultModel(provider string) string {
	if provider == "anthropic" {
		return "claude-3-5-haiku-latest"
	}
	return "gpt-5.5"
}

func normalizeConnectionID(connectionID string) string {
	normalized := strings.TrimSpace(connectionID)
	if normalized == "" {
		return "global"
	}
	return normalized
}
