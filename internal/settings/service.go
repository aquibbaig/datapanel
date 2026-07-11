package settings

import (
	"bytes"
	"context"
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"time"

	"datapanel/internal/apperrors"

	"github.com/google/uuid"
)

type Service struct {
	store        Store
	identityPath string
}

func NewService(store Store, cacheDir ...string) *Service {
	service := &Service{store: store}
	if len(cacheDir) > 0 && strings.TrimSpace(cacheDir[0]) != "" {
		service.identityPath = filepath.Join(cacheDir[0], "user-id")
	}
	return service
}

func (s *Service) GetSettings() (AppSettings, error) {
	settings, err := s.store.Load()
	if err != nil {
		return AppSettings{}, err
	}
	if settings.UserID != "" {
		_ = s.saveUserID(settings.UserID)
		return settings, nil
	}
	settings.UserID = s.loadUserID()
	return settings, nil
}

func (s *Service) WatchSettingsFile(ctx context.Context, interval time.Duration, onChange func()) {
	if onChange == nil {
		return
	}
	if interval <= 0 {
		interval = time.Second
	}
	last := s.settingsFileStamp()
	go func() {
		ticker := time.NewTicker(interval)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				next := s.settingsFileStamp()
				if next != last {
					last = next
					_ = s.SanitizeSettingsFile()
					last = s.settingsFileStamp()
					onChange()
				}
			}
		}
	}()
}

func (s *Service) OpenSettingsFile() error {
	path := s.store.Path()
	if _, err := os.Stat(path); errors.Is(err, os.ErrNotExist) {
		current, loadErr := s.store.Load()
		if loadErr != nil {
			return loadErr
		}
		if err := s.store.Save(current); err != nil {
			return err
		}
	} else if err != nil {
		return apperrors.New(apperrors.CodeStorage, "could not access settings file")
	} else {
		_ = s.SanitizeSettingsFile()
	}
	return openPath(path)
}

func (s *Service) SanitizeSettingsFile() error {
	settings, err := s.GetSettings()
	if err != nil {
		return err
	}
	next := formatSettingsConfig(normalize(settings))
	current, err := os.ReadFile(s.store.Path())
	if err == nil && bytes.Equal(current, next) {
		return nil
	}
	return s.store.Save(settings)
}

func (s *Service) UpdateSettings(input AppSettings) (AppSettings, error) {
	normalizedInput := normalize(input)
	settings := normalizedInput
	current, err := s.GetSettings()
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
	if settings.UserID != "" {
		if err := s.saveUserID(settings.UserID); err != nil {
			return AppSettings{}, err
		}
	}

	if err := s.store.Save(settings); err != nil {
		return AppSettings{}, err
	}
	return settings, nil
}

func (s *Service) loadUserID() string {
	if s.identityPath == "" {
		return ""
	}
	data, err := os.ReadFile(s.identityPath)
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(data))
}

func (s *Service) saveUserID(userID string) error {
	userID = strings.TrimSpace(userID)
	if userID == "" || s.identityPath == "" {
		return nil
	}
	parsedUserID, err := uuid.Parse(userID)
	if err != nil {
		return apperrors.New(apperrors.CodeValidation, "user id is invalid")
	}
	if err := os.MkdirAll(filepath.Dir(s.identityPath), 0o700); err != nil {
		return apperrors.New(apperrors.CodeStorage, "could not create cache directory")
	}
	if err := os.WriteFile(s.identityPath, []byte(parsedUserID.String()+"\n"), 0o600); err != nil {
		return apperrors.New(apperrors.CodeStorage, "could not save user id")
	}
	return nil
}

type fileStamp struct {
	exists  bool
	modUnix int64
	size    int64
}

func (s *Service) settingsFileStamp() fileStamp {
	info, err := os.Stat(s.store.Path())
	if err != nil {
		return fileStamp{}
	}
	return fileStamp{
		exists:  true,
		modUnix: info.ModTime().UnixNano(),
		size:    info.Size(),
	}
}

func openPath(path string) error {
	var command *exec.Cmd
	switch runtime.GOOS {
	case "darwin":
		command = exec.Command("open", "-e", path)
	case "windows":
		command = exec.Command("notepad.exe", path)
	default:
		command = exec.Command("xdg-open", path)
	}
	if err := command.Start(); err != nil {
		return apperrors.New(apperrors.CodeStorage, "could not open settings file")
	}
	if err := command.Process.Release(); err != nil {
		return apperrors.New(apperrors.CodeStorage, "could not open settings file")
	}
	return nil
}
