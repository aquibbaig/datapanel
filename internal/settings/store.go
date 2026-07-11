package settings

import (
	"bufio"
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"

	"datapanel/internal/apperrors"
)

type Store interface {
	Path() string
	Load() (AppSettings, error)
	Save(settings AppSettings) error
}

type FileStore struct {
	path        string
	legacyPaths []string
	mu          sync.RWMutex
}

func NewFileStore(path string, legacyPaths ...string) *FileStore {
	return &FileStore{path: path, legacyPaths: legacyPaths}
}

func (s *FileStore) Path() string {
	return s.path
}

func (s *FileStore) Load() (AppSettings, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	data, err := s.readFile()
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
	if err := decodeSettings(data, &settings); err != nil {
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

	if err := os.WriteFile(s.path, formatSettingsConfig(normalize(settings)), 0o600); err != nil {
		return apperrors.New(apperrors.CodeStorage, "could not save settings")
	}
	return nil
}

func (s *FileStore) readFile() ([]byte, error) {
	data, err := os.ReadFile(s.path)
	if err == nil || !errors.Is(err, os.ErrNotExist) {
		return data, err
	}
	for _, legacyPath := range s.legacyPaths {
		data, legacyErr := os.ReadFile(legacyPath)
		if legacyErr == nil || !errors.Is(legacyErr, os.ErrNotExist) {
			return data, legacyErr
		}
	}
	return nil, err
}

func decodeSettings(data []byte, settings *AppSettings) error {
	if bytes.HasPrefix(bytes.TrimSpace(data), []byte("{")) {
		return json.Unmarshal(data, settings)
	}
	return parseSettingsConfig(data, settings)
}

func parseSettingsConfig(data []byte, settings *AppSettings) error {
	scanner := bufio.NewScanner(bytes.NewReader(data))
	for lineNumber := 1; scanner.Scan(); lineNumber++ {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		key, rawValue, ok := strings.Cut(line, "=")
		if !ok {
			return fmt.Errorf("line %d: expected key = value", lineNumber)
		}
		if err := applyConfigValue(settings, key, rawValue); err != nil {
			return fmt.Errorf("line %d: %w", lineNumber, err)
		}
	}
	return scanner.Err()
}

func applyConfigValue(settings *AppSettings, key string, rawValue string) error {
	value := strings.TrimSpace(rawValue)
	switch normalizeConfigKey(key) {
	case "theme":
		settings.Theme = value
	case "query-limit", "querylimit":
		parsed, err := strconv.Atoi(value)
		settings.QueryLimit = parsed
		return err
	case "query-timeout-seconds", "querytimeoutseconds":
		parsed, err := strconv.Atoi(value)
		settings.QueryTimeoutSeconds = parsed
		return err
	case "confirm-destructive-sql", "confirmdestructivesql":
		parsed, err := strconv.ParseBool(value)
		settings.ConfirmDestructiveSQL = parsed
		return err
	case "sidebar-width", "sidebarwidth":
		parsed, err := strconv.Atoi(value)
		settings.SidebarWidth = parsed
		return err
	case "inspector-width", "inspectorwidth":
		parsed, err := strconv.Atoi(value)
		settings.InspectorWidth = parsed
		return err
	case "auto-refresh-metadata", "autorefreshmetadata":
		parsed, err := strconv.ParseBool(value)
		settings.AutoRefreshMetadata = parsed
		return err
	case "export-directory", "exportdirectory":
		parsed, err := parseConfigString(value)
		settings.ExportDirectory = parsed
		return err
	case "chat-response-prompt", "chatresponseprompt":
		parsed, err := parseConfigString(value)
		settings.ChatResponsePrompt = parsed
		return err
	case "cursor-mode", "cursormode":
		settings.CursorMode = value
	case "vim-navigation-enabled", "vimnavigationenabled":
		parsed, err := strconv.ParseBool(value)
		settings.VimNavigationEnabled = parsed
		return err
	case "telemetry-enabled", "telemetryenabled":
		parsed, err := strconv.ParseBool(value)
		settings.TelemetryEnabled = parsed
		return err
	case "user-id", "userid":
		return nil
	default:
		return fmt.Errorf("unknown setting %q", strings.TrimSpace(key))
	}
	return nil
}

func normalizeConfigKey(key string) string {
	key = strings.TrimSpace(strings.ToLower(key))
	key = strings.ReplaceAll(key, "_", "-")
	return key
}

func parseConfigString(value string) (string, error) {
	if value == "" {
		return "", nil
	}
	unquoted, err := strconv.Unquote(value)
	if err == nil {
		return unquoted, nil
	}
	if strings.HasPrefix(value, `"`) || strings.HasPrefix(value, "`") {
		return "", err
	}
	return value, nil
}

func formatSettingsConfig(settings AppSettings) []byte {
	var builder strings.Builder
	builder.WriteString("# DataPanel settings\n")
	builder.WriteString("# Edit this file directly or use the app Settings panel.\n\n")
	writeConfigString(&builder, "theme", settings.Theme)
	writeConfigInt(&builder, "query-limit", settings.QueryLimit)
	writeConfigInt(&builder, "query-timeout-seconds", settings.QueryTimeoutSeconds)
	writeConfigBool(&builder, "confirm-destructive-sql", settings.ConfirmDestructiveSQL)
	writeConfigInt(&builder, "sidebar-width", settings.SidebarWidth)
	writeConfigInt(&builder, "inspector-width", settings.InspectorWidth)
	writeConfigBool(&builder, "auto-refresh-metadata", settings.AutoRefreshMetadata)
	writeConfigString(&builder, "export-directory", settings.ExportDirectory)
	writeConfigString(&builder, "chat-response-prompt", settings.ChatResponsePrompt)
	writeConfigString(&builder, "cursor-mode", settings.CursorMode)
	writeConfigBool(&builder, "vim-navigation-enabled", settings.VimNavigationEnabled)
	writeConfigBool(&builder, "telemetry-enabled", settings.TelemetryEnabled)
	return []byte(builder.String())
}

func writeConfigString(builder *strings.Builder, key string, value string) {
	fmt.Fprintf(builder, "%s = %s\n", key, quoteConfigString(value))
}

func writeConfigInt(builder *strings.Builder, key string, value int) {
	fmt.Fprintf(builder, "%s = %d\n", key, value)
}

func writeConfigBool(builder *strings.Builder, key string, value bool) {
	fmt.Fprintf(builder, "%s = %t\n", key, value)
}

func quoteConfigString(value string) string {
	if value == "" || strings.ContainsAny(value, " \t\r\n#=") {
		return strconv.Quote(value)
	}
	return value
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
	settings.ExportDirectory = strings.TrimSpace(settings.ExportDirectory)
	settings.ChatResponsePrompt = strings.TrimSpace(settings.ChatResponsePrompt)
	settings.UserID = strings.TrimSpace(settings.UserID)
	return settings
}
