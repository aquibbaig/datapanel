package main

import (
	"context"
	"embed"
	"log"

	"datapanel/internal/ai"
	appcore "datapanel/internal/app"
	"datapanel/internal/appdata"
	"datapanel/internal/bigquery"
	"datapanel/internal/connections"
	"datapanel/internal/database"
	"datapanel/internal/mysql"
	"datapanel/internal/postgres"
	"datapanel/internal/query"
	"datapanel/internal/settings"
	"datapanel/internal/updater"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/menu"
	"github.com/wailsapp/wails/v2/pkg/menu/keys"
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
	settingsService := settings.NewService(settingsStore, paths.CacheDir)
	appDataService, err := appdata.NewService(paths.AppDatabasePath)
	if err != nil {
		log.Fatal(err)
	}

	profileStore := connections.NewFileProfileStore(paths.ConnectionsPath)
	var secretStore connections.SecretStore
	secretStorage := "keychain"
	secretStore, err = connections.NewOSKeyringStore("datapanel")
	if err != nil {
		log.Printf("falling back to local session secrets: %v", err)
		secretStore = connections.NewMemorySecretStore()
		secretStorage = "session"
	}

	postgresAdapter := postgres.NewAdapter()
	mysqlAdapter := mysql.NewAdapter()
	bigQueryAdapter := bigquery.NewAdapter()
	databaseRouter := database.NewRouter(map[string]database.Adapter{
		"postgres": postgresAdapter,
		"mysql":    mysqlAdapter,
		"bigquery": bigQueryAdapter,
	})
	connectionService := connections.NewService(profileStore, secretStore, databaseRouter)
	aiService := ai.NewService(secretStore, secretStorage)
	schemaService := postgres.NewSchemaService(databaseRouter)
	queryService := query.NewService(databaseRouter, settingsService)
	updateService := updater.NewService(paths.CacheDir)
	application := appcore.NewApplication(paths, appcore.MultiCloser{databaseRouter, appDataService})

	err = wails.Run(&options.App{
		Title:     "DataPanel",
		Width:     1440,
		Height:    920,
		MinWidth:  1040,
		MinHeight: 720,
		Menu:      applicationMenu(application),
		AssetServer: &assetserver.Options{
			Assets: assets,
		},
		BackgroundColour: &options.RGBA{R: 15, G: 16, B: 18, A: 1},
		OnStartup: func(ctx context.Context) {
			application.Startup(ctx)
			updater.Startup(updateService, ctx)
		},
		OnShutdown: application.Shutdown,
		SingleInstanceLock: &options.SingleInstanceLock{
			UniqueId: "com.datapanel.app",
			OnSecondInstanceLaunch: func(data options.SecondInstanceData) {
				application.HandleLaunchArgs(data.Args)
			},
		},
		Bind: []interface{}{
			connectionService,
			appDataService,
			aiService,
			schemaService,
			queryService,
			settingsService,
			updateService,
		},
	})
	if err != nil {
		log.Fatal(err)
	}
}

func applicationMenu(application *appcore.Application) *menu.Menu {
	appMenu := menu.NewMenu()
	appMenu.AddText("Settings...", keys.CmdOrCtrl(","), func(_ *menu.CallbackData) {
		application.OpenSettings()
	})
	appMenu.AddSeparator()
	appMenu.AddText("Hide DataPanel", keys.CmdOrCtrl("h"), func(_ *menu.CallbackData) {
		application.Hide()
	})
	appMenu.AddSeparator()
	appMenu.AddText("Quit DataPanel", keys.CmdOrCtrl("q"), func(_ *menu.CallbackData) {
		application.Quit()
	})

	return menu.NewMenuFromItems(
		menu.SubMenu("DataPanel", appMenu),
		menu.EditMenu(),
		menu.WindowMenu(),
	)
}
