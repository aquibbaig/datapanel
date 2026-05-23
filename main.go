package main

import (
	"embed"
	"log"

	appcore "datapanel/internal/app"
	"datapanel/internal/connections"
	"datapanel/internal/database"
	"datapanel/internal/mysql"
	"datapanel/internal/postgres"
	"datapanel/internal/query"
	"datapanel/internal/settings"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
)

//go:embed all:frontend/dist
var assets embed.FS

func main() {
	paths, err := appcore.NewPaths("datapanel")
	if err != nil {
		log.Fatal(err)
	}

	settingsStore := settings.NewFileStore(paths.SettingsPath)
	settingsService := settings.NewService(settingsStore)

	profileStore := connections.NewFileProfileStore(paths.ConnectionsPath)
	var secretStore connections.SecretStore
	secretStore, err = connections.NewOSKeyringStore("datapanel")
	if err != nil {
		log.Printf("falling back to local session secrets: %v", err)
		secretStore = connections.NewMemorySecretStore()
	}

	postgresAdapter := postgres.NewAdapter()
	mysqlAdapter := mysql.NewAdapter()
	databaseRouter := database.NewRouter(map[string]database.Adapter{
		"postgres": postgresAdapter,
		"mysql":    mysqlAdapter,
	})
	connectionService := connections.NewService(profileStore, secretStore, databaseRouter)
	schemaService := postgres.NewSchemaService(databaseRouter)
	queryService := query.NewService(databaseRouter, settingsService)
	application := appcore.NewApplication(paths, databaseRouter)

	err = wails.Run(&options.App{
		Title:     "datapanel",
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
