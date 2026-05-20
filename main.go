package main

import (
	"embed"
	"log"

	appcore "sequel/internal/app"
	"sequel/internal/connections"
	"sequel/internal/postgres"
	"sequel/internal/query"
	"sequel/internal/settings"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
)

//go:embed all:frontend/dist
var assets embed.FS

func main() {
	paths, err := appcore.NewPaths("Sequel")
	if err != nil {
		log.Fatal(err)
	}

	settingsStore := settings.NewFileStore(paths.SettingsPath)
	settingsService := settings.NewService(settingsStore)

	profileStore := connections.NewFileProfileStore(paths.ConnectionsPath)
	var secretStore connections.SecretStore
	secretStore, err = connections.NewOSKeyringStore("Sequel")
	if err != nil {
		log.Printf("falling back to local session secrets: %v", err)
		secretStore = connections.NewMemorySecretStore()
	}

	postgresAdapter := postgres.NewAdapter()
	connectionService := connections.NewService(profileStore, secretStore, postgresAdapter)
	schemaService := postgres.NewSchemaService(postgresAdapter)
	queryService := query.NewService(postgresAdapter, settingsService)
	application := appcore.NewApplication(paths, postgresAdapter)

	err = wails.Run(&options.App{
		Title:     "Sequel",
		Width:     1440,
		Height:    920,
		MinWidth:  1040,
		MinHeight: 720,
		AssetServer: &assetserver.Options{
			Assets: assets,
		},
		BackgroundColour: &options.RGBA{R: 15, G: 16, B: 18, A: 1},
		OnStartup:        application.Startup,
		OnShutdown:       application.Shutdown,
		Bind: []interface{}{
			connectionService,
			schemaService,
			queryService,
			settingsService,
		},
	})
	if err != nil {
		log.Fatal(err)
	}
}
