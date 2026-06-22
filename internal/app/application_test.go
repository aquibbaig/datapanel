package app

import (
	"os"
	"path/filepath"
	"testing"
)

func TestNewPathsUsesPlatformCacheDirectory(t *testing.T) {
	cacheRoot, err := os.UserCacheDir()
	if err != nil {
		t.Fatal(err)
	}

	paths, err := NewPaths("datapanel-test")
	if err != nil {
		t.Fatal(err)
	}

	want := filepath.Join(cacheRoot, "datapanel-test")
	if paths.CacheDir != want {
		t.Fatalf("expected cache dir %q, got %q", want, paths.CacheDir)
	}
}
