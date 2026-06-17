package settings

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"sync"

	"datapanel/internal/apperrors"
)

type Store interface {
	Load() (AppSettings, error)
	Save(settings AppSettings) error
}

type FileStore struct {
	path string
	mu   sync.RWMutex
}

func NewFileStore(path string) *FileStore {
	return &FileStore{path: path}
}

func (s *FileStore) Load() (AppSettings, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	data, err := os.ReadFile(s.path)
	if errors.Is(err, os.ErrNotExist) {
		return DefaultSettings(), nil
	}
	if err != nil {
		return AppSettings{}, apperrors.New(apperrors.CodeStorage, "could not read settings")
	}
	if len(data) == 0 {
		return DefaultSettings(), nil
	}

	settings := DefaultSettings()
	if err := json.Unmarshal(data, &settings); err != nil {
		return AppSettings{}, apperrors.New(apperrors.CodeStorage, "settings file is invalid")
	}
	return normalize(settings), nil
}

func (s *FileStore) Save(settings AppSettings) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if err := os.MkdirAll(filepath.Dir(s.path), 0o700); err != nil {
		return apperrors.New(apperrors.CodeStorage, "could not create config directory")
	}

	data, err := json.MarshalIndent(normalize(settings), "", "  ")
	if err != nil {
		return apperrors.New(apperrors.CodeStorage, "could not encode settings")
	}
	if err := os.WriteFile(s.path, data, 0o600); err != nil {
		return apperrors.New(apperrors.CodeStorage, "could not save settings")
	}
	return nil
}

func normalize(settings AppSettings) AppSettings {
	defaults := DefaultSettings()
	if settings.Theme != "light" && settings.Theme != "dark" && settings.Theme != "system" {
		settings.Theme = defaults.Theme
	}
	if settings.QueryLimit <= 0 {
		settings.QueryLimit = defaults.QueryLimit
	}
	if settings.QueryTimeoutSeconds <= 0 {
		settings.QueryTimeoutSeconds = defaults.QueryTimeoutSeconds
	}
	if settings.SidebarWidth <= 0 {
		settings.SidebarWidth = defaults.SidebarWidth
	}
	if settings.InspectorWidth <= 0 {
		settings.InspectorWidth = defaults.InspectorWidth
	}
	if settings.CursorMode != "pointer" {
		settings.CursorMode = defaults.CursorMode
	}
	settings.ChatResponsePrompt = strings.TrimSpace(settings.ChatResponsePrompt)
	return settings
}
