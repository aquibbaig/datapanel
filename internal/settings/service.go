package settings

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
	settings := normalize(input)
	if err := s.store.Save(settings); err != nil {
		return AppSettings{}, err
	}
	return settings, nil
}
