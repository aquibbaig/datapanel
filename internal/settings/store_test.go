package settings

import (
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
	if settings.TelemetryInstallID != "" {
		t.Fatalf("expected telemetry identifiers to default empty: %#v", settings)
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

func TestServiceGeneratesTelemetryInstallIDWhenEnabled(t *testing.T) {
	dir := t.TempDir()
	service := NewService(
		NewFileStore(filepath.Join(dir, "settings.json")),
		filepath.Join(dir, "cache"),
	)

	got, err := service.UpdateSettings(AppSettings{
		Theme:                 "system",
		QueryLimit:            100,
		QueryTimeoutSeconds:   15,
		ConfirmDestructiveSQL: true,
		SidebarWidth:          260,
		InspectorWidth:        320,
		AutoRefreshMetadata:   true,
		TelemetryEnabled:      true,
	})
	if err != nil {
		t.Fatalf("update settings: %v", err)
	}
	if !got.TelemetryEnabled {
		t.Fatalf("expected telemetry to be enabled")
	}
	if _, err := uuid.Parse(got.TelemetryInstallID); err != nil {
		t.Fatalf("expected generated telemetry install id, got %q", got.TelemetryInstallID)
	}
}

func TestServicePreservesTelemetryInstallID(t *testing.T) {
	dir := t.TempDir()
	service := NewService(
		NewFileStore(filepath.Join(dir, "settings.json")),
		filepath.Join(dir, "cache"),
	)

	first, err := service.UpdateSettings(AppSettings{
		Theme:                 "system",
		QueryLimit:            100,
		QueryTimeoutSeconds:   15,
		ConfirmDestructiveSQL: true,
		SidebarWidth:          260,
		InspectorWidth:        320,
		AutoRefreshMetadata:   true,
		TelemetryEnabled:      true,
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
		TelemetryInstallID:    "client-supplied-id",
	})
	if err != nil {
		t.Fatalf("second update settings: %v", err)
	}
	if second.TelemetryInstallID != first.TelemetryInstallID {
		t.Fatalf("telemetry install id changed: first=%q second=%q", first.TelemetryInstallID, second.TelemetryInstallID)
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
		TelemetryInstallID:    "rotated-client-id",
	})
	if err != nil {
		t.Fatalf("third update settings: %v", err)
	}
	if third.TelemetryInstallID != first.TelemetryInstallID {
		t.Fatalf("telemetry install id changed after later save: %q", third.TelemetryInstallID)
	}
}

func TestServiceUsesTelemetryCacheMarkerForFirstLaunchReport(t *testing.T) {
	dir := t.TempDir()
	service := NewService(
		NewFileStore(filepath.Join(dir, "settings.json")),
		filepath.Join(dir, "cache"),
	)

	shouldReport, err := service.ShouldReportTelemetryFirstLaunch()
	if err != nil {
		t.Fatalf("should report before opt-in: %v", err)
	}
	if shouldReport {
		t.Fatalf("expected telemetry to stay quiet before opt-in")
	}

	if _, err := service.UpdateSettings(AppSettings{
		Theme:                 "system",
		QueryLimit:            100,
		QueryTimeoutSeconds:   15,
		ConfirmDestructiveSQL: true,
		SidebarWidth:          260,
		InspectorWidth:        320,
		AutoRefreshMetadata:   true,
		TelemetryEnabled:      true,
	}); err != nil {
		t.Fatalf("update settings: %v", err)
	}

	shouldReport, err = service.ShouldReportTelemetryFirstLaunch()
	if err != nil {
		t.Fatalf("should report after opt-in: %v", err)
	}
	if !shouldReport {
		t.Fatalf("expected first launch telemetry to report before marker exists")
	}

	if err := service.MarkTelemetryFirstLaunchReported(); err != nil {
		t.Fatalf("mark first launch reported: %v", err)
	}

	shouldReport, err = service.ShouldReportTelemetryFirstLaunch()
	if err != nil {
		t.Fatalf("should report after marker: %v", err)
	}
	if shouldReport {
		t.Fatalf("expected first launch telemetry to stay quiet after marker exists")
	}
}
