package updater

import (
	"archive/zip"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"time"

	wailsruntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

var (
	CurrentVersion     = "0.1.0"
	CurrentReleaseHash = "dev"
	GitHubOwner        = "aquibbaig"
	GitHubRepo         = "sequel"
)

type Service struct {
	statePath  string
	updatesDir string
	client     *http.Client
	mu         sync.RWMutex
	ctx        context.Context
}

func NewService(configDir string) *Service {
	return &Service{
		statePath:  filepath.Join(configDir, "release.json"),
		updatesDir: filepath.Join(configDir, "updates"),
		client: &http.Client{
			Timeout: 45 * time.Second,
		},
	}
}

func Startup(service *Service, ctx context.Context) {
	service.startup(ctx)
}

func (s *Service) startup(ctx context.Context) {
	s.mu.Lock()
	s.ctx = ctx
	s.mu.Unlock()
}

func (s *Service) GetReleaseState() (ReleaseState, error) {
	return s.loadState()
}

func (s *Service) CheckForUpdate() (UpdateCheckResult, error) {
	if isDevelopmentBuild() {
		return developmentUpdateResult(), nil
	}

	state, err := s.ensureState()
	if err != nil {
		return UpdateCheckResult{}, err
	}

	release, err := s.latestRelease()
	if err != nil {
		return UpdateCheckResult{}, err
	}

	asset := selectInstallableAsset(release.Assets)
	assetDigest := ""
	if asset != nil {
		assetDigest, _ = s.assetDigest(*asset, release.Assets)
	}
	latestHash := releaseHash(release)
	updateAvailable := strings.TrimSpace(latestHash) != "" &&
		!sameRelease(latestHash, state.CurrentReleaseHash) &&
		!sameRelease(latestHash, CurrentReleaseHash)

	result := UpdateCheckResult{
		CurrentVersion:     state.CurrentVersion,
		CurrentReleaseHash: state.CurrentReleaseHash,
		LatestVersion:      release.TagName,
		LatestReleaseHash:  latestHash,
		ReleaseName:        release.Name,
		ReleaseURL:         release.HTMLURL,
		PublishedAt:        release.PublishedAt,
		UpdateAvailable:    updateAvailable,
	}

	if asset != nil {
		result.AssetName = asset.Name
		result.AssetSize = asset.Size
		result.AssetDigest = assetDigest
		result.CanInstall = runtime.GOOS == "darwin" && strings.HasSuffix(strings.ToLower(asset.Name), ".zip") && assetDigest != ""
	}

	switch {
	case !updateAvailable:
		result.Message = "DataPanel is up to date."
	case asset == nil:
		result.Message = "A new release is available, but no macOS zip asset was found."
	case runtime.GOOS != "darwin":
		result.Message = "A new release is available, but automatic installation is currently supported on macOS only."
	case assetDigest == "":
		result.Message = "A new release is available, but the release asset does not include a SHA-256 digest."
	case !strings.HasSuffix(strings.ToLower(asset.Name), ".zip"):
		result.Message = "A new release is available, but the selected asset is not a zip archive."
	default:
		result.Message = "A new DataPanel update is available."
	}

	state.LastCheckedAt = time.Now().UTC().Format(time.RFC3339)
	_ = s.saveState(state)

	return result, nil
}

func (s *Service) InstallUpdate(input InstallUpdateRequest) (InstallUpdateResult, error) {
	if isDevelopmentBuild() {
		return InstallUpdateResult{
			Restarting: false,
			Message:    "Automatic updates are disabled in local dev.",
		}, nil
	}

	check, err := s.CheckForUpdate()
	if err != nil {
		return InstallUpdateResult{}, err
	}
	if !check.UpdateAvailable {
		return InstallUpdateResult{Restarting: false, Message: "DataPanel is already up to date."}, nil
	}
	if !check.CanInstall {
		return InstallUpdateResult{}, errors.New(check.Message)
	}

	release, err := s.latestRelease()
	if err != nil {
		return InstallUpdateResult{}, err
	}
	asset := selectInstallableAsset(release.Assets)
	if asset == nil {
		return InstallUpdateResult{}, errors.New("release asset was not found")
	}
	assetDigest, err := s.assetDigest(*asset, release.Assets)
	if err != nil {
		return InstallUpdateResult{}, err
	}
	if input.AssetName != "" && input.AssetName != asset.Name {
		return InstallUpdateResult{}, fmt.Errorf("requested asset %q is not available", input.AssetName)
	}
	if assetDigest == "" {
		return InstallUpdateResult{}, errors.New("release asset does not include a SHA-256 digest")
	}

	if runtime.GOOS != "darwin" {
		return InstallUpdateResult{}, errors.New("automatic installation is currently supported on macOS only")
	}

	currentApp, err := currentAppBundle()
	if err != nil {
		return InstallUpdateResult{}, err
	}
	if err := os.MkdirAll(s.updatesDir, 0o700); err != nil {
		return InstallUpdateResult{}, err
	}

	downloadPath := filepath.Join(s.updatesDir, sanitizeFilename(asset.Name))
	if err := s.downloadFile(asset.BrowserDownloadURL, downloadPath); err != nil {
		return InstallUpdateResult{}, err
	}
	if err := verifySHA256(downloadPath, assetDigest); err != nil {
		return InstallUpdateResult{}, err
	}

	extractDir := filepath.Join(s.updatesDir, "extract-"+time.Now().UTC().Format("20060102150405"))
	if err := unzip(downloadPath, extractDir); err != nil {
		return InstallUpdateResult{}, err
	}

	nextApp, err := findAppBundle(extractDir)
	if err != nil {
		return InstallUpdateResult{}, err
	}

	state := ReleaseState{
		CurrentVersion:     release.TagName,
		CurrentReleaseHash: check.LatestReleaseHash,
		LastCheckedAt:      time.Now().UTC().Format(time.RFC3339),
		LastInstalledAt:    time.Now().UTC().Format(time.RFC3339),
	}
	if err := s.saveState(state); err != nil {
		return InstallUpdateResult{}, err
	}

	if err := startInstallScript(os.Getpid(), nextApp, currentApp, s.updatesDir); err != nil {
		return InstallUpdateResult{}, err
	}

	s.mu.RLock()
	ctx := s.ctx
	s.mu.RUnlock()
	if ctx != nil {
		wailsruntime.Quit(ctx)
	}

	return InstallUpdateResult{
		Restarting: true,
		Message:    "Update downloaded. DataPanel will restart to finish installing.",
	}, nil
}

func isDevelopmentBuild() bool {
	return strings.EqualFold(strings.TrimSpace(CurrentReleaseHash), "dev")
}

func developmentUpdateResult() UpdateCheckResult {
	return UpdateCheckResult{
		CurrentVersion:     CurrentVersion,
		CurrentReleaseHash: CurrentReleaseHash,
		LatestVersion:      CurrentVersion,
		LatestReleaseHash:  CurrentReleaseHash,
		ReleaseName:        "DataPanel local dev",
		UpdateAvailable:    false,
		CanInstall:         false,
		Message:            "Automatic updates are disabled in local dev.",
	}
}

func (s *Service) ensureState() (ReleaseState, error) {
	state, err := s.loadState()
	if err != nil {
		return ReleaseState{}, err
	}
	changed := false
	if state.CurrentVersion != CurrentVersion {
		state.CurrentVersion = CurrentVersion
		changed = true
	}
	if !sameRelease(state.CurrentReleaseHash, CurrentReleaseHash) {
		state.CurrentReleaseHash = CurrentReleaseHash
		changed = true
	}
	if changed {
		if err := s.saveState(state); err != nil {
			return ReleaseState{}, err
		}
	}
	return state, nil
}

func (s *Service) loadState() (ReleaseState, error) {
	contents, err := os.ReadFile(s.statePath)
	if errors.Is(err, os.ErrNotExist) {
		return ReleaseState{
			CurrentVersion:     CurrentVersion,
			CurrentReleaseHash: CurrentReleaseHash,
		}, nil
	}
	if err != nil {
		return ReleaseState{}, err
	}
	var state ReleaseState
	if err := json.Unmarshal(contents, &state); err != nil {
		return ReleaseState{}, err
	}
	return state, nil
}

func (s *Service) saveState(state ReleaseState) error {
	if err := os.MkdirAll(filepath.Dir(s.statePath), 0o700); err != nil {
		return err
	}
	contents, err := json.MarshalIndent(state, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(s.statePath, append(contents, '\n'), 0o600)
}

func (s *Service) latestRelease() (githubRelease, error) {
	url := fmt.Sprintf("https://api.github.com/repos/%s/%s/releases/latest", GitHubOwner, GitHubRepo)
	request, err := http.NewRequest(http.MethodGet, url, nil)
	if err != nil {
		return githubRelease{}, err
	}
	request.Header.Set("Accept", "application/vnd.github+json")
	request.Header.Set("User-Agent", "datapanel-updater")

	response, err := s.client.Do(request)
	if err != nil {
		return githubRelease{}, err
	}
	defer response.Body.Close()

	if response.StatusCode == http.StatusNotFound {
		return githubRelease{}, errors.New("no GitHub release was found")
	}
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return githubRelease{}, fmt.Errorf("GitHub release check failed: %s", response.Status)
	}

	var release githubRelease
	if err := json.NewDecoder(response.Body).Decode(&release); err != nil {
		return githubRelease{}, err
	}
	return release, nil
}

func (s *Service) downloadFile(url string, destination string) error {
	request, err := http.NewRequest(http.MethodGet, url, nil)
	if err != nil {
		return err
	}
	request.Header.Set("User-Agent", "datapanel-updater")

	response, err := s.client.Do(request)
	if err != nil {
		return err
	}
	defer response.Body.Close()

	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return fmt.Errorf("download failed: %s", response.Status)
	}

	tempPath := destination + ".download"
	out, err := os.OpenFile(tempPath, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, 0o600)
	if err != nil {
		return err
	}
	_, copyErr := io.Copy(out, response.Body)
	closeErr := out.Close()
	if copyErr != nil {
		return copyErr
	}
	if closeErr != nil {
		return closeErr
	}
	return os.Rename(tempPath, destination)
}

func selectInstallableAsset(assets []githubAsset) *githubAsset {
	var selected *githubAsset
	bestScore := 0
	for i := range assets {
		name := strings.ToLower(assets[i].Name)
		if !strings.HasSuffix(name, ".zip") {
			continue
		}
		score := 1
		if strings.Contains(name, "datapanel") {
			score = 2
		}
		if strings.Contains(name, "macos") || strings.Contains(name, "darwin") {
			score = 3
		}
		if score > bestScore {
			selected = &assets[i]
			bestScore = score
		}
	}
	if selected == nil {
		return nil
	}
	return selected
}

func (s *Service) assetDigest(asset githubAsset, assets []githubAsset) (string, error) {
	if digest := normalizeDigest(asset.Digest); digest != "" {
		return digest, nil
	}
	checksumAsset := selectChecksumAsset(asset.Name, assets)
	if checksumAsset == nil {
		return "", nil
	}
	return s.downloadChecksumDigest(checksumAsset.BrowserDownloadURL, asset.Name)
}

func selectChecksumAsset(assetName string, assets []githubAsset) *githubAsset {
	normalizedAssetName := strings.ToLower(assetName)
	for i := range assets {
		name := strings.ToLower(assets[i].Name)
		if name == normalizedAssetName+".sha256" || name == normalizedAssetName+".sha256sum" {
			return &assets[i]
		}
	}
	for i := range assets {
		name := strings.ToLower(assets[i].Name)
		if strings.Contains(name, "sha256") || strings.Contains(name, "checksum") {
			return &assets[i]
		}
	}
	return nil
}

func (s *Service) downloadChecksumDigest(url string, assetName string) (string, error) {
	request, err := http.NewRequest(http.MethodGet, url, nil)
	if err != nil {
		return "", err
	}
	request.Header.Set("User-Agent", "datapanel-updater")

	response, err := s.client.Do(request)
	if err != nil {
		return "", err
	}
	defer response.Body.Close()

	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return "", fmt.Errorf("checksum download failed: %s", response.Status)
	}
	contents, err := io.ReadAll(io.LimitReader(response.Body, 64*1024))
	if err != nil {
		return "", err
	}
	return parseChecksumDigest(string(contents), assetName), nil
}

func parseChecksumDigest(contents string, assetName string) string {
	lines := strings.Split(contents, "\n")
	for _, line := range lines {
		if strings.Contains(line, assetName) {
			if digest := digestFromLine(line); digest != "" {
				return digest
			}
		}
	}
	for _, line := range lines {
		if digest := digestFromLine(line); digest != "" {
			return digest
		}
	}
	return ""
}

func digestFromLine(line string) string {
	fields := strings.Fields(line)
	if len(fields) == 0 {
		return ""
	}
	return normalizeDigest(fields[0])
}

func normalizeDigest(value string) string {
	value = strings.TrimSpace(strings.ToLower(value))
	value = strings.TrimPrefix(value, "sha256:")
	if len(value) != sha256.Size*2 {
		return ""
	}
	for _, char := range value {
		if !strings.ContainsRune("0123456789abcdef", char) {
			return ""
		}
	}
	return value
}

func normalizeHash(value string) string {
	return strings.TrimSpace(strings.ToLower(value))
}

func sameRelease(left string, right string) bool {
	normalizedLeft := normalizeHash(left)
	normalizedRight := normalizeHash(right)
	if normalizedLeft == "" || normalizedRight == "" {
		return false
	}
	if normalizedLeft == normalizedRight {
		return true
	}

	leftHash := releaseIdentifierHash(normalizedLeft)
	rightHash := releaseIdentifierHash(normalizedRight)
	if leftHash == "" || rightHash == "" {
		return false
	}
	return hashPrefixMatch(leftHash, rightHash)
}

func releaseIdentifierHash(value string) string {
	value = normalizeHash(value)
	for _, prefix := range []string{"macos-", "darwin-", "datapanel-macos-", "datapanel-darwin-"} {
		value = strings.TrimPrefix(value, prefix)
	}
	if looksLikeGitHash(value) {
		return value
	}
	return ""
}

func hashPrefixMatch(left string, right string) bool {
	if len(left) > len(right) {
		left, right = right, left
	}
	if len(left) < 7 {
		return false
	}
	return strings.HasPrefix(right, left)
}

func releaseHash(release githubRelease) string {
	target := strings.TrimSpace(release.TargetCommit)
	if looksLikeGitHash(target) {
		return target
	}
	return strings.TrimSpace(release.TagName)
}

func looksLikeGitHash(value string) bool {
	value = strings.TrimSpace(strings.ToLower(value))
	if len(value) < 7 || len(value) > 40 {
		return false
	}
	for _, char := range value {
		if !strings.ContainsRune("0123456789abcdef", char) {
			return false
		}
	}
	return true
}

func verifySHA256(path string, expected string) error {
	expected = normalizeDigest(expected)
	if expected == "" {
		return errors.New("expected SHA-256 digest is empty")
	}
	file, err := os.Open(path)
	if err != nil {
		return err
	}
	defer file.Close()

	hash := sha256.New()
	if _, err := io.Copy(hash, file); err != nil {
		return err
	}
	actual := hex.EncodeToString(hash.Sum(nil))
	if actual != expected {
		return fmt.Errorf("downloaded update hash mismatch: expected %s, got %s", expected, actual)
	}
	return nil
}

func unzip(source string, destination string) error {
	reader, err := zip.OpenReader(source)
	if err != nil {
		return err
	}
	defer reader.Close()

	cleanDestination, err := filepath.Abs(destination)
	if err != nil {
		return err
	}
	if err := os.MkdirAll(cleanDestination, 0o700); err != nil {
		return err
	}

	for _, file := range reader.File {
		target := filepath.Join(cleanDestination, file.Name)
		cleanTarget, err := filepath.Abs(target)
		if err != nil {
			return err
		}
		if cleanTarget != cleanDestination && !strings.HasPrefix(cleanTarget, cleanDestination+string(os.PathSeparator)) {
			return fmt.Errorf("zip entry escapes destination: %s", file.Name)
		}
		if file.FileInfo().IsDir() {
			if err := os.MkdirAll(cleanTarget, 0o755); err != nil {
				return err
			}
			continue
		}
		if err := os.MkdirAll(filepath.Dir(cleanTarget), 0o755); err != nil {
			return err
		}
		in, err := file.Open()
		if err != nil {
			return err
		}
		out, err := os.OpenFile(cleanTarget, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, file.FileInfo().Mode())
		if err != nil {
			_ = in.Close()
			return err
		}
		_, copyErr := io.Copy(out, in)
		closeInErr := in.Close()
		closeOutErr := out.Close()
		if copyErr != nil {
			return copyErr
		}
		if closeInErr != nil {
			return closeInErr
		}
		if closeOutErr != nil {
			return closeOutErr
		}
	}
	return nil
}

func currentAppBundle() (string, error) {
	executable, err := os.Executable()
	if err != nil {
		return "", err
	}
	current := filepath.Clean(executable)
	for {
		if strings.HasSuffix(current, ".app") {
			return current, nil
		}
		parent := filepath.Dir(current)
		if parent == current {
			break
		}
		current = parent
	}
	return "", errors.New("DataPanel is not running from a macOS .app bundle")
}

func findAppBundle(root string) (string, error) {
	var found string
	err := filepath.WalkDir(root, func(path string, entry os.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if found != "" {
			if entry.IsDir() {
				return filepath.SkipDir
			}
			return nil
		}
		if entry.IsDir() && strings.HasSuffix(entry.Name(), ".app") {
			if _, err := os.Stat(filepath.Join(path, "Contents", "MacOS")); err == nil {
				found = path
				return filepath.SkipDir
			}
		}
		return nil
	})
	if err != nil {
		return "", err
	}
	if found == "" {
		return "", errors.New("downloaded update did not contain a macOS app bundle")
	}
	return found, nil
}

func startInstallScript(pid int, sourceApp string, destinationApp string, cleanupDir string) error {
	scriptPath := filepath.Join(cleanupDir, "install-update.sh")
	script := `#!/bin/sh
set -eu
pid="$1"
source_app="$2"
destination_app="$3"
cleanup_dir="$4"
backup_app="${destination_app}.previous-update"

launch_destination() {
  if /usr/bin/open -n "$destination_app" >/dev/null 2>&1; then
    return 0
  fi
  executable="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleExecutable' "$destination_app/Contents/Info.plist" 2>/dev/null || true)"
  if [ -n "$executable" ] && [ -x "$destination_app/Contents/MacOS/$executable" ]; then
    nohup "$destination_app/Contents/MacOS/$executable" >/dev/null 2>&1 &
    return 0
  fi
  return 1
}

while kill -0 "$pid" >/dev/null 2>&1; do
  sleep 0.2
done

rm -rf "$backup_app" || true
if [ -d "$destination_app" ]; then
  if ! mv "$destination_app" "$backup_app"; then
    launch_destination || true
    exit 1
  fi
fi

if ! ditto "$source_app" "$destination_app"; then
  if [ -d "$backup_app" ]; then
    rm -rf "$destination_app"
    mv "$backup_app" "$destination_app"
  fi
  launch_destination || true
  exit 1
fi

xattr -dr com.apple.quarantine "$destination_app" >/dev/null 2>&1 || true
if ! launch_destination; then
  exit 1
fi
rm -rf "$backup_app"
rm -rf "$cleanup_dir"
`
	if err := os.MkdirAll(filepath.Dir(scriptPath), 0o700); err != nil {
		return err
	}
	if err := os.WriteFile(scriptPath, []byte(script), 0o700); err != nil {
		return err
	}
	command := exec.Command("/bin/sh", scriptPath, fmt.Sprintf("%d", pid), sourceApp, destinationApp, cleanupDir)
	return command.Start()
}

func sanitizeFilename(name string) string {
	name = filepath.Base(name)
	name = strings.Map(func(r rune) rune {
		switch {
		case r >= 'a' && r <= 'z':
			return r
		case r >= 'A' && r <= 'Z':
			return r
		case r >= '0' && r <= '9':
			return r
		case r == '.', r == '-', r == '_':
			return r
		default:
			return '-'
		}
	}, name)
	if name == "" || name == "." {
		return "datapanel-update.zip"
	}
	return name
}
