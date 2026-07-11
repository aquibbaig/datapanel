package app

import (
	"context"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"

	wailsruntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

type PoolCloser interface {
	CloseAll()
}

type Paths struct {
	ConfigDir        string `json:"configDir"`
	CacheDir         string `json:"cacheDir"`
	AppDatabasePath  string `json:"appDatabasePath"`
	ConnectionsPath  string `json:"connectionsPath"`
	SettingsPath     string `json:"settingsPath"`
	SecretsVaultPath string `json:"secretsVaultPath"`
}

type MultiCloser []PoolCloser

func (closers MultiCloser) CloseAll() {
	for _, closer := range closers {
		if closer != nil {
			closer.CloseAll()
		}
	}
}

type Application struct {
	paths  Paths
	closer PoolCloser
	mu     sync.RWMutex
	ctx    context.Context
}

const AppActivatedEvent = "datapanel:app-activated"

func NewApplication(paths Paths, closer PoolCloser) *Application {
	return &Application{paths: paths, closer: closer}
}

func NewPaths(appName string) (Paths, error) {
	configRoot, err := os.UserConfigDir()
	if err != nil {
		return Paths{}, err
	}
	cacheRoot, err := os.UserCacheDir()
	if err != nil {
		return Paths{}, err
	}

	configDir := filepath.Join(configRoot, appName)
	cacheDir := filepath.Join(cacheRoot, appName)
	return Paths{
		ConfigDir:        configDir,
		CacheDir:         cacheDir,
		AppDatabasePath:  filepath.Join(configDir, "datapanel.sqlite3"),
		ConnectionsPath:  filepath.Join(configDir, "connections.json"),
		SettingsPath:     filepath.Join(configDir, "settings.conf"),
		SecretsVaultPath: filepath.Join(configDir, "secrets.vault.json"),
	}, nil
}

func LegacySettingsPath(configDir string) string {
	return filepath.Join(configDir, "settings.json")
}

func (a *Application) Startup(ctx context.Context) {
	a.mu.Lock()
	a.ctx = ctx
	a.mu.Unlock()
	a.HandleLaunchArgs(os.Args[1:])
}

func (a *Application) Shutdown(ctx context.Context) {
	_ = ctx
	a.closer.CloseAll()
}

func (a *Application) AppActivated() {
	a.mu.RLock()
	ctx := a.ctx
	a.mu.RUnlock()
	if ctx == nil {
		return
	}
	wailsruntime.EventsEmit(ctx, AppActivatedEvent)
}

func (a *Application) Hide() {
	a.mu.RLock()
	ctx := a.ctx
	a.mu.RUnlock()
	if ctx == nil {
		return
	}
	wailsruntime.Hide(ctx)
}

func (a *Application) Quit() {
	a.mu.RLock()
	ctx := a.ctx
	a.mu.RUnlock()
	if ctx == nil {
		return
	}
	wailsruntime.Quit(ctx)
}

type AICallbackEvent struct {
	Provider string `json:"provider"`
	Status   string `json:"status"`
	HasCode  bool   `json:"hasCode"`
	HasState bool   `json:"hasState"`
}

func (a *Application) HandleLaunchArgs(args []string) {
	for _, arg := range args {
		event, ok := sanitizeAICallback(arg)
		if !ok {
			continue
		}
		a.emitAICallback(event)
		return
	}
}

func (a *Application) emitAICallback(event AICallbackEvent) {
	a.mu.RLock()
	ctx := a.ctx
	a.mu.RUnlock()
	if ctx == nil {
		return
	}
	wailsruntime.EventsEmit(ctx, "datapanel:ai-callback", event)
}

func sanitizeAICallback(rawValue string) (AICallbackEvent, bool) {
	parsed, err := url.Parse(rawValue)
	if err != nil || parsed.Scheme != "datapanel" || parsed.Host != "ai-callback" {
		return AICallbackEvent{}, false
	}

	query := parsed.Query()
	provider := sanitizeProvider(query.Get("provider"))
	status := sanitizeStatus(query.Get("status"))
	hasCode := query.Get("code") != ""
	hasState := query.Get("state") != ""

	if query.Get("error") != "" {
		status = "error"
	} else if status == "" && hasCode {
		status = "received"
	} else if status == "" {
		status = "manual"
	}

	return AICallbackEvent{
		Provider: provider,
		Status:   status,
		HasCode:  hasCode,
		HasState: hasState,
	}, true
}

func sanitizeProvider(provider string) string {
	switch strings.ToLower(provider) {
	case "openai", "anthropic", "custom":
		return strings.ToLower(provider)
	default:
		return "unknown"
	}
}

func sanitizeStatus(status string) string {
	switch strings.ToLower(status) {
	case "received", "connected", "error", "manual":
		return strings.ToLower(status)
	default:
		return ""
	}
}
