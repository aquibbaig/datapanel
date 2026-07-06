package settings

import (
	"os"
	"path/filepath"
	"testing"

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
}

func TestServiceStoresUserIDWhenProvided(t *testing.T) {
	dir := t.TempDir()
	service := NewService(
		NewFileStore(filepath.Join(dir, "settings.json")),
		filepath.Join(dir, "cache"),
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
