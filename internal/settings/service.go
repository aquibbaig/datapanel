package settings

import (
	"datapanel/internal/apperrors"

	"github.com/google/uuid"
)

type Service struct {
	store Store
}

func NewService(store Store, cacheDir ...string) *Service {
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

	settings.UserID = current.UserID
	if settings.UserID == "" && normalizedInput.UserID != "" {
		parsedUserID, err := uuid.Parse(normalizedInput.UserID)
		if err != nil {
			return AppSettings{}, apperrors.New(apperrors.CodeValidation, "user id is invalid")
		}
		settings.UserID = parsedUserID.String()
	}

	if err := s.store.Save(settings); err != nil {
		return AppSettings{}, err
	}
	return settings, nil
}
