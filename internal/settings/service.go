package settings

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
	"time"

	"datapanel/internal/apperrors"

	"github.com/google/uuid"
)

type Service struct {
	store             Store
	telemetryCacheDir string
}

func NewService(store Store, cacheDir ...string) *Service {
	telemetryCacheDir := ""
	if len(cacheDir) > 0 {
		telemetryCacheDir = cacheDir[0]
	}
	return &Service{store: store, telemetryCacheDir: telemetryCacheDir}
}

func (s *Service) GetSettings() (AppSettings, error) {
	return s.store.Load()
}

func (s *Service) UpdateSettings(input AppSettings) (AppSettings, error) {
	normalizedInput := normalize(input)
	settings := normalizedInput
	current, err := s.store.Load()
	if err != nil {
		return AppSettings{}, err
	}

	settings.TelemetryInstallID = current.TelemetryInstallID
	if settings.TelemetryEnabled && settings.TelemetryInstallID == "" {
		settings.TelemetryInstallID = uuid.NewString()
	}

	if err := s.store.Save(settings); err != nil {
		return AppSettings{}, err
	}
	return settings, nil
}

func (s *Service) ShouldReportTelemetryFirstLaunch() (bool, error) {
	settings, err := s.store.Load()
	if err != nil {
		return false, err
	}
	if !settings.TelemetryEnabled || settings.TelemetryInstallID == "" {
		return false, nil
	}

	markerPath, err := s.telemetryFirstLaunchMarkerPath(settings.TelemetryInstallID)
	if err != nil {
		return false, err
	}

	_, err = os.Stat(markerPath)
	if errors.Is(err, os.ErrNotExist) {
		return true, nil
	}
	if err != nil {
		return false, apperrors.New(apperrors.CodeStorage, "could not read telemetry cache")
	}
	return false, nil
}

func (s *Service) MarkTelemetryFirstLaunchReported() error {
	settings, err := s.store.Load()
	if err != nil {
		return err
	}
	if !settings.TelemetryEnabled || settings.TelemetryInstallID == "" {
		return nil
	}

	markerPath, err := s.telemetryFirstLaunchMarkerPath(settings.TelemetryInstallID)
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(markerPath), 0o700); err != nil {
		return apperrors.New(apperrors.CodeStorage, "could not create telemetry cache")
	}
	if err := os.WriteFile(markerPath, []byte(time.Now().UTC().Format(time.RFC3339Nano)), 0o600); err != nil {
		return apperrors.New(apperrors.CodeStorage, "could not update telemetry cache")
	}
	return nil
}

func (s *Service) telemetryFirstLaunchMarkerPath(installID string) (string, error) {
	if strings.TrimSpace(s.telemetryCacheDir) == "" {
		return "", apperrors.New(apperrors.CodeStorage, "telemetry cache is not configured")
	}
	parsedInstallID, err := uuid.Parse(strings.TrimSpace(installID))
	if err != nil {
		return "", apperrors.New(apperrors.CodeValidation, "telemetry install id is invalid")
	}
	return filepath.Join(
		s.telemetryCacheDir,
		"telemetry",
		"install-first-launch-"+parsedInstallID.String()+".sent",
	), nil
}
