package app

import (
	"context"
	"os"
	"path/filepath"
)

type PoolCloser interface {
	CloseAll()
}

type Paths struct {
	ConfigDir       string `json:"configDir"`
	ConnectionsPath string `json:"connectionsPath"`
	SettingsPath    string `json:"settingsPath"`
}

type Application struct {
	paths  Paths
	closer PoolCloser
}

func NewApplication(paths Paths, closer PoolCloser) *Application {
	return &Application{paths: paths, closer: closer}
}

func NewPaths(appName string) (Paths, error) {
	configRoot, err := os.UserConfigDir()
	if err != nil {
		return Paths{}, err
	}

	configDir := filepath.Join(configRoot, appName)
	return Paths{
		ConfigDir:       configDir,
		ConnectionsPath: filepath.Join(configDir, "connections.json"),
		SettingsPath:    filepath.Join(configDir, "settings.json"),
	}, nil
}

func (a *Application) Startup(ctx context.Context) {
	_ = ctx
}

func (a *Application) Shutdown(ctx context.Context) {
	_ = ctx
	a.closer.CloseAll()
}
