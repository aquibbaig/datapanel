package fileexport

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"unicode"

	"datapanel/internal/apperrors"
	"datapanel/internal/settings"
)

type SettingsProvider interface {
	GetSettings() (settings.AppSettings, error)
}

type Service struct {
	settings SettingsProvider
}

type SaveExportRequest struct {
	Filename string `json:"filename"`
	Contents string `json:"contents"`
}

type SaveExportResult struct {
	Filename  string `json:"filename"`
	Directory string `json:"directory"`
	Path      string `json:"path"`
}

func NewService(settingsProvider SettingsProvider) *Service {
	return &Service{settings: settingsProvider}
}

func (s *Service) SaveExport(input SaveExportRequest) (SaveExportResult, error) {
	if s == nil || s.settings == nil {
		return SaveExportResult{}, apperrors.New(apperrors.CodeStorage, "export service is not configured")
	}

	appSettings, err := s.settings.GetSettings()
	if err != nil {
		return SaveExportResult{}, err
	}

	directory, err := resolveExportDirectory(appSettings.ExportDirectory)
	if err != nil {
		return SaveExportResult{}, err
	}
	filename := sanitizeFilename(input.Filename)
	if filename == "" {
		return SaveExportResult{}, apperrors.New(apperrors.CodeValidation, "export filename is invalid")
	}

	if err := os.MkdirAll(directory, 0o755); err != nil {
		return SaveExportResult{}, apperrors.New(apperrors.CodeStorage, "could not create export folder")
	}
	info, err := os.Stat(directory)
	if err != nil {
		return SaveExportResult{}, apperrors.New(apperrors.CodeStorage, "could not read export folder")
	}
	if !info.IsDir() {
		return SaveExportResult{}, apperrors.New(apperrors.CodeValidation, "export path is not a folder")
	}

	path, err := writeUniqueFile(directory, filename, []byte(input.Contents))
	if err != nil {
		return SaveExportResult{}, err
	}

	return SaveExportResult{
		Filename:  filepath.Base(path),
		Directory: directory,
		Path:      path,
	}, nil
}

func resolveExportDirectory(configured string) (string, error) {
	directory := strings.TrimSpace(configured)
	if directory == "" {
		home, err := os.UserHomeDir()
		if err != nil || strings.TrimSpace(home) == "" {
			return "", apperrors.New(apperrors.CodeStorage, "could not resolve Downloads folder")
		}
		directory = filepath.Join(home, "Downloads")
	} else if directory == "~" || strings.HasPrefix(directory, "~/") || strings.HasPrefix(directory, `~\`) {
		home, err := os.UserHomeDir()
		if err != nil || strings.TrimSpace(home) == "" {
			return "", apperrors.New(apperrors.CodeStorage, "could not resolve home folder")
		}
		if directory == "~" {
			directory = home
		} else {
			directory = filepath.Join(home, directory[2:])
		}
	} else if strings.HasPrefix(directory, "~") {
		return "", apperrors.New(apperrors.CodeValidation, "export folder cannot use another user's home shortcut")
	}

	absolute, err := filepath.Abs(filepath.Clean(directory))
	if err != nil {
		return "", apperrors.New(apperrors.CodeValidation, "export folder is invalid")
	}
	return absolute, nil
}

func sanitizeFilename(raw string) string {
	name := strings.TrimSpace(raw)
	parts := strings.FieldsFunc(name, func(r rune) bool {
		return r == '/' || r == '\\'
	})
	if len(parts) > 0 {
		name = parts[len(parts)-1]
	}

	name = strings.Map(func(r rune) rune {
		if unicode.IsControl(r) {
			return -1
		}
		switch r {
		case ':', '*', '?', '"', '<', '>', '|':
			return '-'
		default:
			return r
		}
	}, name)
	return strings.Trim(name, " .")
}

func writeUniqueFile(directory string, filename string, contents []byte) (string, error) {
	extension := filepath.Ext(filename)
	base := strings.TrimSuffix(filename, extension)
	if strings.TrimSpace(base) == "" {
		base = "datapanel-results"
	}

	for attempt := 0; attempt < 1000; attempt++ {
		candidateName := filename
		if attempt > 0 {
			candidateName = fmt.Sprintf("%s-%d%s", base, attempt, extension)
		}
		path := filepath.Join(directory, candidateName)
		file, err := os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o644)
		if errors.Is(err, os.ErrExist) {
			continue
		}
		if err != nil {
			return "", apperrors.New(apperrors.CodeStorage, "could not create export file")
		}
		if _, err := file.Write(contents); err != nil {
			_ = file.Close()
			_ = os.Remove(path)
			return "", apperrors.New(apperrors.CodeStorage, "could not write export file")
		}
		if err := file.Close(); err != nil {
			_ = os.Remove(path)
			return "", apperrors.New(apperrors.CodeStorage, "could not finish export file")
		}
		return path, nil
	}

	return "", apperrors.New(apperrors.CodeStorage, "could not find an available export filename")
}
