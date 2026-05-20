package connections

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"sync"

	"sequel/internal/apperrors"
)

type ProfileStore interface {
	List() ([]ConnectionProfile, error)
	Find(id string) (ConnectionProfile, error)
	Save(profile ConnectionProfile) error
	Delete(id string) error
}

type FileProfileStore struct {
	path string
	mu   sync.RWMutex
}

func NewFileProfileStore(path string) *FileProfileStore {
	return &FileProfileStore{path: path}
}

func (s *FileProfileStore) List() ([]ConnectionProfile, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.read()
}

func (s *FileProfileStore) Find(id string) (ConnectionProfile, error) {
	profiles, err := s.List()
	if err != nil {
		return ConnectionProfile{}, err
	}
	for _, profile := range profiles {
		if profile.ID == id {
			return profile, nil
		}
	}
	return ConnectionProfile{}, apperrors.New(apperrors.CodeNotFound, "connection profile not found")
}

func (s *FileProfileStore) Save(profile ConnectionProfile) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	profiles, err := s.read()
	if err != nil {
		return err
	}

	replaced := false
	for index := range profiles {
		if profiles[index].ID == profile.ID {
			profiles[index] = profile
			replaced = true
			break
		}
	}
	if !replaced {
		profiles = append(profiles, profile)
	}

	return s.write(profiles)
}

func (s *FileProfileStore) Delete(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	profiles, err := s.read()
	if err != nil {
		return err
	}

	next := profiles[:0]
	for _, profile := range profiles {
		if profile.ID != id {
			next = append(next, profile)
		}
	}

	return s.write(next)
}

func (s *FileProfileStore) read() ([]ConnectionProfile, error) {
	data, err := os.ReadFile(s.path)
	if errors.Is(err, os.ErrNotExist) {
		return []ConnectionProfile{}, nil
	}
	if err != nil {
		return nil, apperrors.New(apperrors.CodeStorage, "could not read connection profiles")
	}
	if len(data) == 0 {
		return []ConnectionProfile{}, nil
	}

	var profiles []ConnectionProfile
	if err := json.Unmarshal(data, &profiles); err != nil {
		return nil, apperrors.New(apperrors.CodeStorage, "connection profiles file is invalid")
	}
	return profiles, nil
}

func (s *FileProfileStore) write(profiles []ConnectionProfile) error {
	if err := os.MkdirAll(filepath.Dir(s.path), 0o700); err != nil {
		return apperrors.New(apperrors.CodeStorage, "could not create config directory")
	}

	data, err := json.MarshalIndent(profiles, "", "  ")
	if err != nil {
		return apperrors.New(apperrors.CodeStorage, "could not encode connection profiles")
	}
	if err := os.WriteFile(s.path, data, 0o600); err != nil {
		return apperrors.New(apperrors.CodeStorage, "could not save connection profiles")
	}
	return nil
}
