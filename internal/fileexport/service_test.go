package fileexport

import (
	"os"
	"path/filepath"
	"testing"

	"datapanel/internal/settings"
)

type testSettingsProvider struct {
	settings settings.AppSettings
}

func (p testSettingsProvider) GetSettings() (settings.AppSettings, error) {
	return p.settings, nil
}

func TestSaveExportUsesConfiguredDirectoryAndSanitizesFilename(t *testing.T) {
	directory := t.TempDir()
	service := NewService(testSettingsProvider{
		settings: settings.AppSettings{ExportDirectory: directory},
	})

	got, err := service.SaveExport(SaveExportRequest{
		Filename: "../nested/results.csv",
		Contents: "id,email\n1,ada@example.com\n",
	})
	if err != nil {
		t.Fatalf("save export: %v", err)
	}

	wantPath := filepath.Join(directory, "results.csv")
	if got.Path != wantPath {
		t.Fatalf("expected export at %q, got %q", wantPath, got.Path)
	}
	if got.Directory != directory {
		t.Fatalf("expected export directory %q, got %q", directory, got.Directory)
	}
	contents, err := os.ReadFile(got.Path)
	if err != nil {
		t.Fatalf("read export: %v", err)
	}
	if string(contents) != "id,email\n1,ada@example.com\n" {
		t.Fatalf("unexpected export contents: %q", string(contents))
	}
}

func TestSaveExportUsesDownloadsWhenDirectoryIsUnset(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)
	service := NewService(testSettingsProvider{
		settings: settings.AppSettings{},
	})

	got, err := service.SaveExport(SaveExportRequest{
		Filename: "results.json",
		Contents: "{}",
	})
	if err != nil {
		t.Fatalf("save export: %v", err)
	}

	wantPath := filepath.Join(home, "Downloads", "results.json")
	if got.Path != wantPath {
		t.Fatalf("expected export at %q, got %q", wantPath, got.Path)
	}
}

func TestSaveExportDoesNotOverwriteExistingFile(t *testing.T) {
	directory := t.TempDir()
	if err := os.WriteFile(filepath.Join(directory, "results.csv"), []byte("existing"), 0o644); err != nil {
		t.Fatalf("seed existing export: %v", err)
	}
	service := NewService(testSettingsProvider{
		settings: settings.AppSettings{ExportDirectory: directory},
	})

	got, err := service.SaveExport(SaveExportRequest{
		Filename: "results.csv",
		Contents: "new",
	})
	if err != nil {
		t.Fatalf("save export: %v", err)
	}

	wantPath := filepath.Join(directory, "results-1.csv")
	if got.Path != wantPath {
		t.Fatalf("expected export at %q, got %q", wantPath, got.Path)
	}
	contents, err := os.ReadFile(filepath.Join(directory, "results.csv"))
	if err != nil {
		t.Fatalf("read original export: %v", err)
	}
	if string(contents) != "existing" {
		t.Fatalf("existing export was overwritten: %q", string(contents))
	}
}
