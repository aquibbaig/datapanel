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

func TestSelectInstallableAssetPrefersMacOSZip(t *testing.T) {
	assets := []githubAsset{
		{Name: "Datapanel-Windows.zip", Digest: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"},
		{Name: "Datapanel-macOS.zip", Digest: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"},
	}

	asset := selectInstallableAsset(assets)
	if asset == nil {
		t.Fatal("expected asset")
	}
	if asset.Name != "Datapanel-macOS.zip" {
		t.Fatalf("expected macOS asset, got %q", asset.Name)
	}
}

func TestParseChecksumDigest(t *testing.T) {
	contents := "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa  other.zip\nbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb  Datapanel-macOS.zip\n"
	digest := parseChecksumDigest(contents, "Datapanel-macOS.zip")
	if digest != "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" {
		t.Fatalf("unexpected digest %q", digest)
	}
}

func TestReleaseHashFallsBackToTagForBranchTargets(t *testing.T) {
	got := releaseHash(githubRelease{TagName: "macos-abc1234", TargetCommit: "main"})
	if got != "macos-abc1234" {
		t.Fatalf("expected tag fallback, got %q", got)
	}

	got = releaseHash(githubRelease{TagName: "macos-abc1234", TargetCommit: "0123456789abcdef"})
	if got != "0123456789abcdef" {
		t.Fatalf("expected commit hash, got %q", got)
	}
}

func TestSameReleaseMatchesMacOSTagToFullHash(t *testing.T) {
	if !sameRelease("macos-1870672", "1870672f1925f8e03b6a7e9df3f7605e31e3922d") {
		t.Fatal("expected macOS short tag to match full commit hash")
	}
	if !sameRelease("1870672f1925f8e03b6a7e9df3f7605e31e3922d", "1870672") {
		t.Fatal("expected short commit hash to match full commit hash")
	}
	if sameRelease("macos-1870672", "1412182f1925f8e03b6a7e9df3f7605e31e3922d") {
		t.Fatal("expected different release hashes not to match")
	}
}

func TestEnsureStateUsesRunningBinaryReleaseHash(t *testing.T) {
	previousVersion := CurrentVersion
	previousHash := CurrentReleaseHash
	CurrentVersion = "0.1.0"
	CurrentReleaseHash = "1870672f1925f8e03b6a7e9df3f7605e31e3922d"
	t.Cleanup(func() {
		CurrentVersion = previousVersion
		CurrentReleaseHash = previousHash
	})

	configDir := t.TempDir()
	statePath := filepath.Join(configDir, "release.json")
	if err := os.WriteFile(statePath, []byte(`{
  "currentVersion": "macos-1412182",
  "currentReleaseHash": "macos-1412182",
  "lastCheckedAt": "2026-06-13T00:00:00Z"
}
`), 0o600); err != nil {
		t.Fatal(err)
	}

	service := NewService(configDir)
	state, err := service.ensureState()
	if err != nil {
		t.Fatal(err)
	}
	if state.CurrentReleaseHash != CurrentReleaseHash {
		t.Fatalf("expected state hash %q, got %q", CurrentReleaseHash, state.CurrentReleaseHash)
	}
}
