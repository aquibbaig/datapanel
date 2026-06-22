package updater

import (
	"os"
	"path/filepath"
	"testing"
)

func TestNormalizeDigest(t *testing.T) {
	raw := "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
	got := normalizeDigest(raw)
	want := "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
	if got != want {
		t.Fatalf("expected %q, got %q", want, got)
	}

	if got := normalizeDigest("sha256:not-a-digest"); got != "" {
		t.Fatalf("expected invalid digest to normalize to empty string, got %q", got)
	}
}

func TestSelectPlatformInstallableAssetPrefersMacOSZip(t *testing.T) {
	assets := []githubAsset{
		{Name: "DataPanel-Windows.zip", Digest: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"},
		{Name: "DataPanel-macOS.zip", Digest: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"},
	}

	asset := selectPlatformInstallableAsset(assets, "darwin", "arm64")
	if asset == nil {
		t.Fatal("expected asset")
	}
	if asset.Name != "DataPanel-macOS.zip" {
		t.Fatalf("expected macOS asset, got %q", asset.Name)
	}
}

func TestSelectPlatformInstallableAssetPrefersWindowsInstaller(t *testing.T) {
	assets := []githubAsset{
		{Name: "DataPanel_Portable_0.2.0_windows_x64.zip"},
		{Name: "DataPanel_Setup_0.2.0_windows_arm64.exe"},
		{Name: "DataPanel_Setup_0.2.0_windows_x64.exe"},
	}

	asset := selectPlatformInstallableAsset(assets, "windows", "amd64")
	if asset == nil {
		t.Fatal("expected asset")
	}
	if asset.Name != "DataPanel_Setup_0.2.0_windows_x64.exe" {
		t.Fatalf("expected x64 setup asset, got %q", asset.Name)
	}
}

func TestSelectPlatformInstallableAssetPrefersLinuxDeb(t *testing.T) {
	assets := []githubAsset{
		{Name: "datapanel_0.2.0_linux_amd64.AppImage"},
		{Name: "datapanel_0.2.0_linux_amd64.deb"},
	}

	asset := selectPlatformInstallableAsset(assets, "linux", "amd64")
	if asset == nil {
		t.Fatal("expected asset")
	}
	if asset.Name != "datapanel_0.2.0_linux_amd64.deb" {
		t.Fatalf("expected linux deb asset, got %q", asset.Name)
	}
}

func TestParseChecksumDigest(t *testing.T) {
	contents := "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa  other.zip\nbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb  DataPanel-macOS.zip\n"
	digest := parseChecksumDigest(contents, "DataPanel-macOS.zip")
	if digest != "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" {
		t.Fatalf("unexpected digest %q", digest)
	}
}

func TestCheckForUpdateSkipsDevelopmentBuild(t *testing.T) {
	previousHash := CurrentReleaseHash
	CurrentReleaseHash = "dev"
	t.Cleanup(func() {
		CurrentReleaseHash = previousHash
	})

	cacheDir := t.TempDir()
	service := NewService(cacheDir)

	result, err := service.CheckForUpdate()
	if err != nil {
		t.Fatalf("expected dev update check to succeed, got %v", err)
	}
	if result.UpdateAvailable {
		t.Fatal("expected no update in development build")
	}
	if result.CanInstall {
		t.Fatal("expected install to be disabled in development build")
	}
	if _, err := os.Stat(filepath.Join(cacheDir, "release.json")); !os.IsNotExist(err) {
		t.Fatalf("expected dev update check not to write release state, got %v", err)
	}
}

func TestReleaseVersionNormalizesVersionTags(t *testing.T) {
	got := releaseVersion(githubRelease{TagName: "v0.2.0", TargetCommit: "ignored"})
	if got != "0.2.0" {
		t.Fatalf("expected normalized version, got %q", got)
	}

	got = releaseVersion(githubRelease{TagName: "macos-abc1234", TargetCommit: "ignored"})
	if got != "" {
		t.Fatalf("expected non-version tag to be ignored, got %q", got)
	}
}

func TestVersionNewerThanUsesNumericOrdering(t *testing.T) {
	if !versionNewerThan("v0.10.0", "0.2.0") {
		t.Fatal("expected 0.10.0 to be newer than 0.2.0")
	}
	if versionNewerThan("v0.2.0", "0.10.0") {
		t.Fatal("expected 0.2.0 not to be newer than 0.10.0")
	}
	if versionNewerThan("macos-abc1234", "0.1.0") {
		t.Fatal("expected commit-style macOS tag not to trigger a version update")
	}
}

func TestEnsureStateUsesRunningBinaryVersion(t *testing.T) {
	previousVersion := CurrentVersion
	previousHash := CurrentReleaseHash
	CurrentVersion = "0.1.0"
	CurrentReleaseHash = "0.1.0"
	t.Cleanup(func() {
		CurrentVersion = previousVersion
		CurrentReleaseHash = previousHash
	})

	cacheDir := t.TempDir()
	statePath := filepath.Join(cacheDir, "release.json")
	if err := os.WriteFile(statePath, []byte(`{
  "currentVersion": "0.0.9",
  "currentReleaseHash": "0.0.9",
  "lastCheckedAt": "2026-06-13T00:00:00Z"
}
`), 0o600); err != nil {
		t.Fatal(err)
	}

	service := NewService(cacheDir)
	state, err := service.ensureState()
	if err != nil {
		t.Fatal(err)
	}
	if state.CurrentVersion != CurrentVersion {
		t.Fatalf("expected state version %q, got %q", CurrentVersion, state.CurrentVersion)
	}
	if state.CurrentReleaseHash != CurrentVersion {
		t.Fatalf("expected legacy release id %q, got %q", CurrentVersion, state.CurrentReleaseHash)
	}
}

func TestSaveStateCreatesNestedCacheDirectory(t *testing.T) {
	cacheDir := filepath.Join(t.TempDir(), "local-cache", "datapanel")
	service := NewService(cacheDir)

	state := ReleaseState{
		CurrentVersion:     "1.2.3",
		CurrentReleaseHash: "1.2.3",
		LastCheckedAt:      "2026-06-22T00:00:00Z",
	}
	if err := service.saveState(state); err != nil {
		t.Fatal(err)
	}

	if _, err := os.Stat(filepath.Join(cacheDir, "release.json")); err != nil {
		t.Fatalf("expected release state to be written in cache dir, got %v", err)
	}
	if _, err := os.Stat(filepath.Join(cacheDir, "updates")); !os.IsNotExist(err) {
		t.Fatalf("expected updates directory to be created only when downloading updates, got %v", err)
	}
}
