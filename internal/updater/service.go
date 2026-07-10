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
	"strconv"
	"strings"
	"sync"
	"time"

	wailsruntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

var (
	CurrentVersion     = "0.1.0"
	CurrentReleaseHash = "dev"
	GitHubOwner        = "aquibbaig"
	GitHubRepo         = "datapanel"
)

type Service struct {
	statePath  string
	updatesDir string
	client     *http.Client
	mu         sync.RWMutex
	ctx        context.Context
}

func NewService(cacheDir string) *Service {
	return &Service{
		statePath:  filepath.Join(cacheDir, "release.json"),
		updatesDir: filepath.Join(cacheDir, "updates"),
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

func (s *Service) GetVersionInfo() (AppVersionInfo, error) {
	state, err := s.loadState()
	if err != nil {
		return AppVersionInfo{}, err
	}
	firstRunAfterUpdate := !sameVersion(state.CurrentVersion, CurrentVersion) ||
		strings.TrimSpace(state.CurrentReleaseHash) != strings.TrimSpace(CurrentReleaseHash)
	return AppVersionInfo{
		CurrentVersion:      canonicalCurrentVersion(),
		CurrentReleaseHash:  CurrentReleaseHash,
		LastCheckedAt:       state.LastCheckedAt,
		LastInstalledAt:     state.LastInstalledAt,
		FirstRunAfterUpdate: firstRunAfterUpdate,
	}, nil
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
	latestVersion := releaseVersion(release)
	updateAvailable := versionNewerThan(latestVersion, state.CurrentVersion) ||
		versionNewerThan(latestVersion, CurrentVersion)

	result := UpdateCheckResult{
		CurrentVersion:     state.CurrentVersion,
		CurrentReleaseHash: state.CurrentReleaseHash,
		LatestVersion:      displayReleaseVersion(release),
		LatestReleaseHash:  latestVersion,
		ReleaseName:        release.Name,
		ReleaseURL:         release.HTMLURL,
		PublishedAt:        release.PublishedAt,
		UpdateAvailable:    updateAvailable,
	}

	if asset != nil {
		result.AssetName = asset.Name
		result.AssetSize = asset.Size
		result.AssetDigest = assetDigest
		result.CanInstall = canInstallAsset(asset.Name, assetDigest)
	}

	switch {
	case !updateAvailable:
		result.Message = "DataPanel is up to date."
	case asset == nil:
		result.Message = fmt.Sprintf("A new release is available, but no %s installer asset was found.", runtime.GOOS)
	case assetDigest == "":
		result.Message = "A new release is available, but the release asset does not include a SHA-256 digest."
	case !platformInstallerAvailable():
		result.Message = platformInstallerUnavailableMessage()
	case !isPlatformInstallableAsset(asset.Name, runtime.GOOS, runtime.GOARCH):
		result.Message = "A new release is available, but the selected asset is not installable on this platform."
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

	if !platformInstallerAvailable() {
		return InstallUpdateResult{}, errors.New(platformInstallerUnavailableMessage())
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

	switch runtime.GOOS {
	case "darwin":
		if err := s.installDarwinUpdate(downloadPath); err != nil {
			return InstallUpdateResult{}, err
		}
	case "windows":
		if err := startWindowsInstallScript(os.Getpid(), downloadPath, s.updatesDir); err != nil {
			return InstallUpdateResult{}, err
		}
	case "linux":
		return InstallUpdateResult{}, errors.New(platformInstallerUnavailableMessage())
	default:
		return InstallUpdateResult{}, errors.New("automatic installation is not supported on this platform")
	}

	s.quit()

	return InstallUpdateResult{
		Restarting: true,
		Message:    installStartedMessage(),
	}, nil
}

func (s *Service) installDarwinUpdate(downloadPath string) error {
	currentApp, err := currentAppBundle()
	if err != nil {
		return err
	}

	extractDir := filepath.Join(s.updatesDir, "extract-"+time.Now().UTC().Format("20060102150405"))
	if err := unzip(downloadPath, extractDir); err != nil {
		return err
	}

	nextApp, err := findAppBundle(extractDir)
	if err != nil {
		return err
	}

	if err := startInstallScript(os.Getpid(), nextApp, currentApp, s.updatesDir); err != nil {
		return err
	}
	return nil
}

func (s *Service) quit() {
	s.mu.RLock()
	ctx := s.ctx
	s.mu.RUnlock()
	if ctx != nil {
		wailsruntime.Quit(ctx)
	}
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
	if !sameVersion(state.CurrentVersion, CurrentVersion) {
		state.CurrentVersion = canonicalCurrentVersion()
		changed = true
	}
	if strings.TrimSpace(state.CurrentReleaseHash) != strings.TrimSpace(CurrentReleaseHash) {
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
			CurrentVersion:     canonicalCurrentVersion(),
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
	return selectPlatformInstallableAsset(assets, runtime.GOOS, runtime.GOARCH)
}

func selectPlatformInstallableAsset(assets []githubAsset, goos string, goarch string) *githubAsset {
	var selected *githubAsset
	bestScore := 0
	for i := range assets {
		name := strings.ToLower(assets[i].Name)
		if !isPlatformInstallableAsset(name, goos, goarch) {
			continue
		}
		score := 1
		if strings.Contains(name, "datapanel") {
			score += 2
		}
		if platformNameMatches(name, goos) {
			score += 4
		}
		if platformArchMatches(name, goos, goarch) {
			score += 3
		}
		if goos == "windows" && strings.Contains(name, "setup") {
			score += 3
		}
		if goos == "linux" && strings.HasSuffix(name, ".deb") {
			score += 3
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

func canInstallAsset(assetName string, assetDigest string) bool {
	return assetDigest != "" &&
		isPlatformInstallableAsset(assetName, runtime.GOOS, runtime.GOARCH) &&
		platformInstallerAvailable()
}

func isPlatformInstallableAsset(assetName string, goos string, goarch string) bool {
	name := strings.ToLower(assetName)
	switch goos {
	case "darwin":
		return strings.HasSuffix(name, ".zip") &&
			(strings.Contains(name, "macos") || strings.Contains(name, "darwin"))
	case "windows":
		return strings.HasSuffix(name, ".exe") &&
			strings.Contains(name, "setup") &&
			platformArchMatches(name, goos, goarch)
	case "linux":
		return strings.HasSuffix(name, ".deb") &&
			platformArchMatches(name, goos, goarch)
	default:
		return false
	}
}

func platformNameMatches(name string, goos string) bool {
	switch goos {
	case "darwin":
		return strings.Contains(name, "macos") || strings.Contains(name, "darwin")
	case "windows":
		return strings.Contains(name, "windows") || strings.Contains(name, "win")
	case "linux":
		return strings.Contains(name, "linux")
	default:
		return false
	}
}

func platformArchMatches(name string, goos string, goarch string) bool {
	name = strings.ToLower(name)
	switch goos + "/" + goarch {
	case "darwin/amd64", "darwin/arm64":
		return true
	case "windows/amd64":
		return strings.Contains(name, "windows_x64") || strings.Contains(name, "x64") || strings.Contains(name, "amd64")
	case "windows/arm64":
		return strings.Contains(name, "windows_arm64") || strings.Contains(name, "arm64") || strings.Contains(name, "aarch64")
	case "linux/amd64":
		return strings.Contains(name, "linux_amd64") || strings.Contains(name, "amd64") || strings.Contains(name, "x86_64")
	case "linux/arm64":
		return strings.Contains(name, "linux_arm64") || strings.Contains(name, "arm64") || strings.Contains(name, "aarch64")
	default:
		return false
	}
}

func platformInstallerAvailable() bool {
	return platformInstallerAvailableFor(runtime.GOOS)
}

func platformInstallerAvailableFor(goos string) bool {
	return goos == "darwin" || goos == "windows"
}

func platformInstallerUnavailableMessage() string {
	switch runtime.GOOS {
	case "linux":
		return "A new release is available, but automatic Linux installation is disabled until packages can be verified with a trusted signature."
	case "darwin", "windows":
		return "A new release is available, but automatic installation is not available on this device."
	default:
		return "A new release is available, but automatic installation is not supported on this platform."
	}
}

func installStartedMessage() string {
	switch runtime.GOOS {
	case "darwin":
		return "Update downloaded. DataPanel will restart to finish installing."
	case "windows":
		return "Update downloaded. DataPanel will close and open the installer."
	case "linux":
		return "Update downloaded. DataPanel will close and ask for permission to install the package."
	default:
		return "Update downloaded."
	}
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

func canonicalCurrentVersion() string {
	if version := normalizedVersionTag(CurrentVersion); version != "" {
		return version
	}
	return strings.TrimSpace(CurrentVersion)
}

func displayReleaseVersion(release githubRelease) string {
	if version := releaseVersion(release); version != "" {
		return version
	}
	return strings.TrimSpace(release.TagName)
}

func releaseVersion(release githubRelease) string {
	return normalizedVersionTag(release.TagName)
}

func sameVersion(left string, right string) bool {
	normalizedLeft := normalizedVersionTag(left)
	normalizedRight := normalizedVersionTag(right)
	return normalizedLeft != "" && normalizedLeft == normalizedRight
}

func versionNewerThan(latest string, current string) bool {
	normalizedLatest := normalizedVersionTag(latest)
	normalizedCurrent := normalizedVersionTag(current)
	if normalizedLatest == "" || normalizedCurrent == "" {
		return false
	}
	return compareVersions(normalizedLatest, normalizedCurrent) > 0
}

func compareVersions(left string, right string) int {
	leftCore, leftPre := splitVersion(left)
	rightCore, rightPre := splitVersion(right)
	leftParts := strings.Split(leftCore, ".")
	rightParts := strings.Split(rightCore, ".")
	maxParts := len(leftParts)
	if len(rightParts) > maxParts {
		maxParts = len(rightParts)
	}
	for i := 0; i < maxParts; i++ {
		leftValue := versionPart(leftParts, i)
		rightValue := versionPart(rightParts, i)
		if leftValue > rightValue {
			return 1
		}
		if leftValue < rightValue {
			return -1
		}
	}
	switch {
	case leftPre == rightPre:
		return 0
	case leftPre == "":
		return 1
	case rightPre == "":
		return -1
	case leftPre > rightPre:
		return 1
	case leftPre < rightPre:
		return -1
	default:
		return 0
	}
}

func splitVersion(version string) (string, string) {
	version = strings.SplitN(version, "+", 2)[0]
	parts := strings.SplitN(version, "-", 2)
	if len(parts) == 1 {
		return parts[0], ""
	}
	return parts[0], parts[1]
}

func versionPart(parts []string, index int) int {
	if index >= len(parts) {
		return 0
	}
	value, err := strconv.Atoi(parts[index])
	if err != nil {
		return 0
	}
	return value
}

func normalizedVersionTag(value string) string {
	value = strings.TrimSpace(strings.ToLower(value))
	value = strings.TrimPrefix(value, "v")
	if value == "" || value[0] < '0' || value[0] > '9' {
		return ""
	}
	for _, char := range value {
		switch {
		case char >= '0' && char <= '9':
		case char >= 'a' && char <= 'z':
		case char == '.', char == '-', char == '+':
		default:
			return ""
		}
	}
	return value
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

func startWindowsInstallScript(pid int, installerPath string, cleanupDir string) error {
	scriptPath := filepath.Join(cleanupDir, "install-update.cmd")
	script := `@echo off
setlocal
set "pid=%~1"
set "installer=%~2"
set "cleanup_dir=%~3"

:wait
tasklist /FI "PID eq %pid%" 2>NUL | findstr /R /C:"%pid%" >NUL
if not errorlevel 1 (
  timeout /T 1 /NOBREAK >NUL
  goto wait
)

start "" /WAIT "%installer%"
rmdir /S /Q "%cleanup_dir%" >NUL 2>NUL
`
	if err := os.MkdirAll(filepath.Dir(scriptPath), 0o700); err != nil {
		return err
	}
	if err := os.WriteFile(scriptPath, []byte(script), 0o700); err != nil {
		return err
	}
	command := exec.Command("cmd", "/C", "start", "", scriptPath, fmt.Sprintf("%d", pid), installerPath, cleanupDir)
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
