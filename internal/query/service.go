package query

import (
	"context"
	"strings"
	"sync"
	"time"

	"sequel/internal/apperrors"
	"sequel/internal/settings"
)

type Executor interface {
	Execute(ctx context.Context, request QueryRequest) (QueryResult, error)
}

type SettingsProvider interface {
	GetSettings() (settings.AppSettings, error)
}

type Service struct {
	executor Executor
	settings SettingsProvider
	mu       sync.Mutex
	cancels  map[string]context.CancelFunc
	history  []QueryHistoryItem
}

func NewService(executor Executor, settings SettingsProvider) *Service {
	return &Service{
		executor: executor,
		settings: settings,
		cancels:  map[string]context.CancelFunc{},
		history:  []QueryHistoryItem{},
	}
}

func (s *Service) AnalyzeSQL(sql string) SQLAnalysis {
	return AnalyzeSQL(sql)
}

func (s *Service) ExecuteQuery(request QueryRequest) (QueryResult, error) {
	if strings.TrimSpace(request.ConnectionID) == "" {
		return QueryResult{}, apperrors.New(apperrors.CodeValidation, "connection id is required")
	}
	if strings.TrimSpace(request.SQL) == "" {
		return QueryResult{}, apperrors.New(apperrors.CodeValidation, "SQL is required")
	}

	appSettings, _ := s.settings.GetSettings()
	if request.MaxRows <= 0 {
		request.MaxRows = appSettings.QueryLimit
	}
	if request.TimeoutSeconds <= 0 {
		request.TimeoutSeconds = appSettings.QueryTimeoutSeconds
	}
	if request.RequestID == "" {
		request.RequestID = newQueryID()
	}

	analysis := AnalyzeSQL(request.SQL)
	if appSettings.ConfirmDestructiveSQL && analysis.Destructive && !request.ConfirmDestructive {
		return QueryResult{
			Notices: analysis.Warnings,
			Error:   "confirmation_required",
		}, nil
	}

	ctx, cancel := context.WithTimeout(context.Background(), time.Duration(request.TimeoutSeconds)*time.Second)
	s.registerCancel(request.RequestID, cancel)
	defer s.unregisterCancel(request.RequestID)

	result, err := s.executor.Execute(ctx, request)
	s.recordHistory(request, result, err == nil)
	if err != nil {
		return QueryResult{}, err
	}
	return result, nil
}

func (s *Service) CancelQuery(requestID string) error {
	if strings.TrimSpace(requestID) == "" {
		return apperrors.New(apperrors.CodeValidation, "request id is required")
	}

	s.mu.Lock()
	cancel := s.cancels[requestID]
	s.mu.Unlock()
	if cancel == nil {
		return apperrors.New(apperrors.CodeNotFound, "query is not running")
	}
	cancel()
	return nil
}

func (s *Service) ExplainQuery(request QueryRequest) (QueryResult, error) {
	if !strings.HasPrefix(strings.ToLower(strings.TrimSpace(request.SQL)), "explain") {
		request.SQL = "EXPLAIN " + request.SQL
	}
	return s.ExecuteQuery(request)
}

func (s *Service) GetQueryHistory() ([]QueryHistoryItem, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	history := make([]QueryHistoryItem, len(s.history))
	copy(history, s.history)
	return history, nil
}

func (s *Service) registerCancel(requestID string, cancel context.CancelFunc) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.cancels[requestID] = cancel
}

func (s *Service) unregisterCancel(requestID string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.cancels, requestID)
}

func (s *Service) recordHistory(request QueryRequest, result QueryResult, success bool) {
	s.mu.Lock()
	defer s.mu.Unlock()

	item := QueryHistoryItem{
		ID:           request.RequestID,
		ConnectionID: request.ConnectionID,
		SQL:          request.SQL,
		DurationMS:   result.DurationMS,
		ExecutedAt:   time.Now().UTC().Format(time.RFC3339),
		Success:      success,
	}
	s.history = append([]QueryHistoryItem{item}, s.history...)
	if len(s.history) > 50 {
		s.history = s.history[:50]
	}
}

func newQueryID() string {
	return time.Now().UTC().Format("20060102150405.000000000")
}
