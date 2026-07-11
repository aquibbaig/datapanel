package settings

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
)

func TestFileStoreLoadsDefaultsWhenMissing(t *testing.T) {
	store := NewFileStore(filepath.Join(t.TempDir(), "settings.json"))
	settings, err := store.Load()
	if err != nil {
		t.Fatalf("load defaults: %v", err)
	}
	if settings.QueryLimit != DefaultSettings().QueryLimit {
		t.Fatalf("expected default query limit, got %d", settings.QueryLimit)
	}
	if settings.CursorMode != DefaultSettings().CursorMode {
		t.Fatalf("expected default cursor mode, got %q", settings.CursorMode)
	}
	if settings.VimNavigationEnabled {
		t.Fatalf("expected vim navigation to default off")
	}
	if settings.TelemetryEnabled {
		t.Fatalf("expected telemetry to default off")
	}
	if settings.UserID != "" {
		t.Fatalf("expected user identifiers to default empty: %#v", settings)
	}
}

func TestFileStoreSavesAndNormalizesSettings(t *testing.T) {
	store := NewFileStore(filepath.Join(t.TempDir(), "settings.json"))
	input := AppSettings{
		Theme:                 "system",
		QueryLimit:            100,
		QueryTimeoutSeconds:   15,
		ConfirmDestructiveSQL: true,
		SidebarWidth:          260,
		InspectorWidth:        320,
		AutoRefreshMetadata:   true,
		ExportDirectory:       "  ~/exports  ",
	}

	if err := store.Save(input); err != nil {
		t.Fatalf("save settings: %v", err)
	}
	got, err := store.Load()
	if err != nil {
		t.Fatalf("load settings: %v", err)
	}
	if got.QueryLimit != input.QueryLimit || got.QueryTimeoutSeconds != input.QueryTimeoutSeconds {
		t.Fatalf("settings did not round trip: %#v", got)
	}
	if got.CursorMode != DefaultSettings().CursorMode {
		t.Fatalf("expected cursor mode to default, got %q", got.CursorMode)
	}
	if got.ExportDirectory != "~/exports" {
		t.Fatalf("expected export directory to be trimmed, got %q", got.ExportDirectory)
	}
	data, err := os.ReadFile(store.Path())
	if err != nil {
		t.Fatalf("read saved settings: %v", err)
	}
	if strings.Contains(string(data), "user-id") {
		t.Fatalf("settings config should not expose user id:\n%s", data)
	}
}

func TestFileStoreLoadsConfigSettings(t *testing.T) {
	settingsPath := filepath.Join(t.TempDir(), "settings.conf")
	if err := os.WriteFile(settingsPath, []byte(`
theme = dark
query-limit = 250
query-timeout-seconds = 45
confirm-destructive-sql = false
sidebar-width = 280
inspector-width = 340
auto-refresh-metadata = false
export-directory = "~/Data Exports"
chat-response-prompt = "Keep it short"
cursor-mode = pointer
vim-navigation-enabled = true
telemetry-enabled = true
`), 0o600); err != nil {
		t.Fatalf("write settings: %v", err)
	}

	got, err := NewFileStore(settingsPath).Load()
	if err != nil {
		t.Fatalf("load settings: %v", err)
	}
	if got.Theme != "dark" || got.QueryLimit != 250 || got.QueryTimeoutSeconds != 45 {
		t.Fatalf("did not load basic config values: %#v", got)
	}
	if got.ConfirmDestructiveSQL || got.AutoRefreshMetadata {
		t.Fatalf("did not load false boolean values: %#v", got)
	}
	if got.ExportDirectory != "~/Data Exports" || got.ChatResponsePrompt != "Keep it short" {
		t.Fatalf("did not load string values: %#v", got)
	}
	if got.CursorMode != "pointer" || !got.VimNavigationEnabled || !got.TelemetryEnabled {
		t.Fatalf("did not load editor/privacy values: %#v", got)
	}
}

func TestFileStoreIgnoresConfigUserID(t *testing.T) {
	settingsPath := filepath.Join(t.TempDir(), "settings.conf")
	if err := os.WriteFile(settingsPath, []byte(`
theme = dark
user-id = 17cef7e3-0e0f-4cf0-b0aa-869ad885c523
`), 0o600); err != nil {
		t.Fatalf("write settings: %v", err)
	}

	got, err := NewFileStore(settingsPath).Load()
	if err != nil {
		t.Fatalf("load settings: %v", err)
	}
	if got.UserID != "" {
		t.Fatalf("user id from editable config should be ignored, got %q", got.UserID)
	}
}

func TestServiceSanitizesConfigUserID(t *testing.T) {
	settingsPath := filepath.Join(t.TempDir(), "settings.conf")
	if err := os.WriteFile(settingsPath, []byte(`
theme = light
telemetry-enabled = true
user-id = 17cef7e3-0e0f-4cf0-b0aa-869ad885c523
`), 0o600); err != nil {
		t.Fatalf("write settings: %v", err)
	}

	if err := NewService(NewFileStore(settingsPath)).SanitizeSettingsFile(); err != nil {
		t.Fatalf("sanitize settings: %v", err)
	}
	data, err := os.ReadFile(settingsPath)
	if err != nil {
		t.Fatalf("read settings: %v", err)
	}
	if strings.Contains(string(data), "user-id") || strings.Contains(string(data), "17cef7e3") {
		t.Fatalf("settings config should not expose user id:\n%s", data)
	}
}

func TestFileStoreMigratesLegacyJSONPath(t *testing.T) {
	dir := t.TempDir()
	legacyPath := filepath.Join(dir, "settings.json")
	settingsPath := filepath.Join(dir, "settings.conf")
	if err := os.WriteFile(legacyPath, []byte(`{"theme":"dark","queryLimit":125}`), 0o600); err != nil {
		t.Fatalf("write legacy settings: %v", err)
	}

	store := NewFileStore(settingsPath, legacyPath)
	got, err := store.Load()
	if err != nil {
		t.Fatalf("load legacy settings: %v", err)
	}
	if got.Theme != "dark" || got.QueryLimit != 125 {
		t.Fatalf("did not load legacy settings: %#v", got)
	}
	if err := store.Save(got); err != nil {
		t.Fatalf("save migrated settings: %v", err)
	}
	if _, err := os.Stat(settingsPath); err != nil {
		t.Fatalf("expected migrated settings file: %v", err)
	}
}

func TestServiceStoresUserIDWhenProvided(t *testing.T) {
	dir := t.TempDir()
	cacheDir := filepath.Join(dir, "cache")
	service := NewService(
		NewFileStore(filepath.Join(dir, "settings.json")),
		cacheDir,
	)

	userID := uuid.NewString()
	got, err := service.UpdateSettings(AppSettings{
		Theme:                 "system",
		QueryLimit:            100,
		QueryTimeoutSeconds:   15,
		ConfirmDestructiveSQL: true,
		SidebarWidth:          260,
		InspectorWidth:        320,
		AutoRefreshMetadata:   true,
		TelemetryEnabled:      true,
		UserID:                userID,
	})
	if err != nil {
		t.Fatalf("update settings: %v", err)
	}
	if !got.TelemetryEnabled {
		t.Fatalf("expected telemetry to be enabled")
	}
	if got.UserID != userID {
		t.Fatalf("expected stored user id, got %q", got.UserID)
	}

	reloaded, err := NewService(NewFileStore(filepath.Join(dir, "settings.json")), cacheDir).GetSettings()
	if err != nil {
		t.Fatalf("reload settings: %v", err)
	}
	if reloaded.UserID != userID {
		t.Fatalf("expected hidden user id to reload, got %q", reloaded.UserID)
	}
	data, err := os.ReadFile(filepath.Join(dir, "settings.json"))
	if err != nil {
		t.Fatalf("read settings: %v", err)
	}
	if strings.Contains(string(data), "user-id") || strings.Contains(string(data), "userId") {
		t.Fatalf("settings file should not expose user id:\n%s", data)
	}
}

func TestServiceWatchesSettingsFile(t *testing.T) {
	path := filepath.Join(t.TempDir(), "settings.conf")
	store := NewFileStore(path)
	if err := store.Save(DefaultSettings()); err != nil {
		t.Fatalf("save initial settings: %v", err)
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	changed := make(chan struct{}, 1)
	service := NewService(store)
	service.WatchSettingsFile(ctx, 10*time.Millisecond, func() {
		select {
		case changed <- struct{}{}:
		default:
		}
	})

	updated := DefaultSettings()
	updated.Theme = "dark"
	if err := store.Save(updated); err != nil {
		t.Fatalf("save updated settings: %v", err)
	}

	select {
	case <-changed:
	case <-time.After(time.Second):
		t.Fatalf("expected settings file change event")
	}
}

func TestServiceLeavesUserIDEmptyOnLoad(t *testing.T) {
	dir := t.TempDir()
	store := NewFileStore(filepath.Join(dir, "settings.json"))
	service := NewService(store, filepath.Join(dir, "cache"))

	got, err := service.GetSettings()
	if err != nil {
		t.Fatalf("get settings: %v", err)
	}
	if got.TelemetryEnabled {
		t.Fatalf("expected telemetry diagnostics to default off")
	}
	if got.UserID != "" {
		t.Fatalf("expected user id to start empty, got %q", got.UserID)
	}

	saved, err := store.Load()
	if err != nil {
		t.Fatalf("load saved settings: %v", err)
	}
	if saved.UserID != "" {
		t.Fatalf("expected empty user id to persist, got %q", saved.UserID)
	}
}

func TestLegacyTelemetryInstallIDDoesNotBecomeUserID(t *testing.T) {
	dir := t.TempDir()
	settingsPath := filepath.Join(dir, "settings.json")
	if err := os.WriteFile(settingsPath, []byte(`{
  "theme": "light",
  "telemetryEnabled": true,
  "telemetryInstallId": "019f3643-be98-7ed5-8d86-8bc63cd14f02"
}`), 0o600); err != nil {
		t.Fatalf("write legacy settings: %v", err)
	}

	service := NewService(NewFileStore(settingsPath), filepath.Join(dir, "cache"))
	loaded, err := service.GetSettings()
	if err != nil {
		t.Fatalf("get settings: %v", err)
	}
	if !loaded.TelemetryEnabled {
		t.Fatalf("expected legacy telemetry setting to load")
	}
	if loaded.UserID != "" {
		t.Fatalf("legacy telemetryInstallId should not suppress install tracking, got user id %q", loaded.UserID)
	}

	userID := uuid.NewString()
	loaded.UserID = userID
	updated, err := service.UpdateSettings(loaded)
	if err != nil {
		t.Fatalf("update settings: %v", err)
	}
	if updated.UserID != userID {
		t.Fatalf("expected generated user id to be stored, got %q", updated.UserID)
	}
}

func TestServicePreservesUserID(t *testing.T) {
	dir := t.TempDir()
	service := NewService(
		NewFileStore(filepath.Join(dir, "settings.json")),
		filepath.Join(dir, "cache"),
	)

	userID := uuid.NewString()
	first, err := service.UpdateSettings(AppSettings{
		Theme:                 "system",
		QueryLimit:            100,
		QueryTimeoutSeconds:   15,
		ConfirmDestructiveSQL: true,
		SidebarWidth:          260,
		InspectorWidth:        320,
		AutoRefreshMetadata:   true,
		TelemetryEnabled:      true,
		UserID:                userID,
	})
	if err != nil {
		t.Fatalf("first update settings: %v", err)
	}

	second, err := service.UpdateSettings(AppSettings{
		Theme:                 "dark",
		QueryLimit:            250,
		QueryTimeoutSeconds:   20,
		ConfirmDestructiveSQL: true,
		SidebarWidth:          280,
		InspectorWidth:        340,
		AutoRefreshMetadata:   true,
		TelemetryEnabled:      true,
		UserID:                "client-supplied-id",
	})
	if err != nil {
		t.Fatalf("second update settings: %v", err)
	}
	if second.UserID != first.UserID {
		t.Fatalf("user id changed: first=%q second=%q", first.UserID, second.UserID)
	}

	third, err := service.UpdateSettings(AppSettings{
		Theme:                 "light",
		QueryLimit:            300,
		QueryTimeoutSeconds:   25,
		ConfirmDestructiveSQL: true,
		SidebarWidth:          300,
		InspectorWidth:        360,
		AutoRefreshMetadata:   true,
		TelemetryEnabled:      true,
		UserID:                "rotated-client-id",
	})
	if err != nil {
		t.Fatalf("third update settings: %v", err)
	}
	if third.UserID != first.UserID {
		t.Fatalf("user id changed after later save: %q", third.UserID)
	}
}
