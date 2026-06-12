package updater

import "testing"

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
