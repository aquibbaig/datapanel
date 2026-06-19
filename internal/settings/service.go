package settings

import "github.com/google/uuid"

type Service struct {
	store Store
}

func NewService(store Store) *Service {
	return &Service{store: store}
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
	settings.TelemetryFirstLaunchReportedAt = current.TelemetryFirstLaunchReportedAt
	if settings.TelemetryEnabled && settings.TelemetryInstallID == "" {
		settings.TelemetryInstallID = uuid.NewString()
	}
	if settings.TelemetryEnabled &&
		settings.TelemetryFirstLaunchReportedAt == "" &&
		input.TelemetryFirstLaunchReportedAt != "" {
		settings.TelemetryFirstLaunchReportedAt = normalizedInput.TelemetryFirstLaunchReportedAt
	}

	if err := s.store.Save(settings); err != nil {
		return AppSettings{}, err
	}
	return settings, nil
}
