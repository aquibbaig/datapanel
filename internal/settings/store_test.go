package settings

import (
	"path/filepath"
	"testing"
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
}
