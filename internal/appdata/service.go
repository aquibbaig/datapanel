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
		`SELECT id, connection_id, title, provider, model, created_at, updated_at
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
			&thread.CreatedAt,
			&thread.UpdatedAt,
		); err != nil {
			return nil, apperrors.New(apperrors.CodeStorage, "could not read AI chat thread")
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
		 RETURNING id, connection_id, title, provider, model, created_at, updated_at`,
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
		&thread.CreatedAt,
		&thread.UpdatedAt,
	); err != nil {
		return AIChatThread{}, apperrors.New(apperrors.CodeStorage, "could not update AI chat thread")
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

	_, err = s.db.ExecContext(
		context.Background(),
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
	)
	if err != nil {
		return AIChatMessage{}, apperrors.New(apperrors.CodeStorage, "could not save AI chat message")
	}
	_, _ = s.db.ExecContext(
		context.Background(),
		`UPDATE ai_chat_threads SET updated_at = ? WHERE id = ?`,
		message.CreatedAt,
		message.ThreadID,
	)
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
	return nil
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
		`ALTER TABLE ai_chat_messages ADD COLUMN thread_id TEXT NOT NULL DEFAULT ''`,
		`ALTER TABLE ai_chat_messages ADD COLUMN model TEXT NOT NULL DEFAULT ''`,
		`CREATE INDEX IF NOT EXISTS idx_ai_chat_threads_connection_updated
		 ON ai_chat_threads(connection_id, updated_at)`,
		`CREATE INDEX IF NOT EXISTS idx_ai_chat_messages_connection_created
		 ON ai_chat_messages(connection_id, created_at)`,
		`CREATE INDEX IF NOT EXISTS idx_ai_chat_messages_thread_created
		 ON ai_chat_messages(thread_id, created_at)`,
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
	return "gpt-4.1-mini"
}

func normalizeConnectionID(connectionID string) string {
	normalized := strings.TrimSpace(connectionID)
	if normalized == "" {
		return "global"
	}
	return normalized
}
